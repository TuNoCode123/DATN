import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BedrockService } from '../bedrock/bedrock.service';
import type { DifficultyLevel } from '@prisma/client';
import type { TranscribeItem } from './pronunciation.gateway';

interface ScoreItem {
  score: number;
  status: 'master' | 'good' | 'fair' | 'poor';
}

interface WordComparison {
  target: string;
  spoken: string | null;
  correct: boolean;
  confidence: number | null;
  fluent: boolean;
}

export interface PronunciationAssessment {
  pronunciation: ScoreItem;
  accuracy: ScoreItem;
  fluency: ScoreItem;
  completeness: ScoreItem;
  overall: ScoreItem;
  wordComparison: WordComparison[];
  feedback: string;
}

const SYSTEM_PROMPT = `You are a pronunciation and language assessment engine. You receive a target sentence and detailed speech-to-text metadata from AWS Transcribe, including per-word confidence scores and timing data. Use this metadata to produce accurate, data-driven assessments. Return ONLY valid JSON — no markdown, no code fences.`;

@Injectable()
export class PronunciationService {
  private readonly logger = new Logger(PronunciationService.name);

  constructor(
    private prisma: PrismaService,
    private bedrock: BedrockService,
  ) {}

  async assess(
    target: string,
    spoken: string,
    items?: TranscribeItem[],
  ): Promise<PronunciationAssessment> {
    // If no items provided, fall back to text-only assessment
    if (!items || items.length === 0) {
      return this.assessFromText(target, spoken);
    }

    const prompt = `Assess pronunciation quality using AWS Transcribe metadata.

Target sentence: "${target}"
Transcribed text: "${spoken}"

Transcribe items (per-word metadata):
${JSON.stringify(items, null, 2)}

**Pronunciation** (0-100): Derive from per-word confidence scores. Higher confidence = clearer pronunciation. Average the confidence values of "pronunciation" type items and scale to 0-100. Words with confidence < 0.6 indicate poor pronunciation.

**Accuracy** (0-100): Compare each spoken word (item.content) against the target sentence words. Calculate the percentage of target words that were correctly spoken.

**Fluency** (0-100): Analyze timing gaps between consecutive words (gap = next item's startTime - current item's endTime). Natural speech has gaps < 0.3s. Penalize for:
- Long pauses (> 0.5s between words): -5 points per occurrence
- Very long pauses (> 1.0s): -10 points per occurrence
Start from 100 and subtract penalties.

**Completeness** (0-100): Count how many target words appear in the spoken items vs total target words. (spoken_words / target_words) * 100.

**Overall** (0-100): Weighted average — pronunciation 30%, accuracy 30%, fluency 20%, completeness 20%.

Status thresholds: master >= 90, good >= 70, fair >= 50, poor < 50.

For wordComparison, include per-word details:
- "confidence": the Transcribe confidence score for that word (0.0-1.0), or null if the word was missed
- "fluent": true if the word was spoken smoothly (confidence >= 0.85 AND no long pause before it), false otherwise

In "feedback", provide 2-3 sentences of constructive advice:
1. Mention any mispronounced or missed words.
2. Mention any words that lacked fluency (hesitation, low confidence, long pauses before them) even if they were technically correct — these are words the speaker should practice more.
3. Give a specific tip to improve.

Return ONLY this JSON structure:
{
  "pronunciation": { "score": <0-100>, "status": "<master|good|fair|poor>" },
  "accuracy": { "score": <0-100>, "status": "<master|good|fair|poor>" },
  "fluency": { "score": <0-100>, "status": "<master|good|fair|poor>" },
  "completeness": { "score": <0-100>, "status": "<master|good|fair|poor>" },
  "overall": { "score": <0-100>, "status": "<master|good|fair|poor>" },
  "wordComparison": [
    { "target": "word", "spoken": "word_or_null", "correct": true_or_false, "confidence": 0.0-1.0_or_null, "fluent": true_or_false }
  ],
  "feedback": "2-3 sentences covering mispronounced words, non-fluent words, and a tip."
}`;

    try {
      const response = await this.bedrock.messages.create({
        max_tokens: 2048,
        temperature: 0.1,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const text =
        response.content[0].type === 'text' ? response.content[0].text : '';

      const cleaned = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
      return JSON.parse(cleaned) as PronunciationAssessment;
    } catch (err) {
      this.logger.error(`Failed to get/parse assessment: ${err.message ?? err}`);
      return this.fallbackAssessment(target, spoken);
    }
  }

  /** Legacy text-only assessment (when items metadata is unavailable) */
  private async assessFromText(
    target: string,
    spoken: string,
  ): Promise<PronunciationAssessment> {
    const prompt = `Compare the spoken text to the target text and assess pronunciation quality.

Target: "${target}"
Spoken: "${spoken}"

Return ONLY valid JSON (no markdown, no code fences):
{
  "pronunciation": { "score": <0-100>, "status": "<master|good|fair|poor>" },
  "accuracy": { "score": <0-100>, "status": "<master|good|fair|poor>" },
  "fluency": { "score": <0-100>, "status": "<master|good|fair|poor>" },
  "completeness": { "score": <0-100>, "status": "<master|good|fair|poor>" },
  "overall": { "score": <0-100>, "status": "<master|good|fair|poor>" },
  "wordComparison": [
    { "target": "word", "spoken": "word_or_null", "correct": true_or_false, "confidence": null, "fluent": true_or_false }
  ],
  "feedback": "2-3 sentences covering mispronounced words, non-fluent words, and a tip."
}

Scoring rules:
- pronunciation: How clearly words were spoken (if STT transcribed correctly, pronunciation was good)
- accuracy: How closely spoken words match target words
- fluency: Natural flow without stutters or long pauses
- completeness: Percentage of target words that were spoken
- overall: Weighted average (pronunciation 30%, accuracy 30%, fluency 20%, completeness 20%)
- Status thresholds: master >= 90, good >= 70, fair >= 50, poor < 50
- wordComparison: One entry per target word. "spoken" is null if the word was missed. "confidence" is null for text-only assessment. "fluent" is false if the word seems hesitant or unclear based on transcription differences.
- feedback: Mention any mispronounced words AND any words that lacked fluency (even if correct). Give a specific improvement tip.`;

    try {
      const response = await this.bedrock.messages.create({
        max_tokens: 2048,
        temperature: 0.1,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const text =
        response.content[0].type === 'text' ? response.content[0].text : '';

      const cleaned = text.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
      return JSON.parse(cleaned) as PronunciationAssessment;
    } catch (err) {
      this.logger.error(`Failed to get/parse text-only assessment: ${err.message ?? err}`);
      return this.fallbackAssessment(target, spoken);
    }
  }

  async saveResult(
    attemptId: string,
    questionId: string,
    spoken: string,
    assessment: PronunciationAssessment,
  ) {
    const answer = await this.prisma.userAnswer.upsert({
      where: {
        attemptId_questionId: { attemptId, questionId },
      },
      create: {
        attemptId,
        questionId,
        answerText: JSON.stringify({ spoken, assessment }),
        isCorrect: assessment.overall.score >= 70,
      },
      update: {
        answerText: JSON.stringify({ spoken, assessment }),
        isCorrect: assessment.overall.score >= 70,
      },
    });

    await this.prisma.writingEvaluation.upsert({
      where: { answerId: answer.id },
      create: {
        answerId: answer.id,
        examType: 'PRONUNCIATION',
        grammarScore: assessment.pronunciation.score,
        vocabScore: assessment.accuracy.score,
        contentScore: assessment.fluency.score,
        overallScore: assessment.overall.score,
        feedback: assessment.feedback,
        modelUsed: 'bedrock:claude-3-haiku',
      },
      update: {
        grammarScore: assessment.pronunciation.score,
        vocabScore: assessment.accuracy.score,
        contentScore: assessment.fluency.score,
        overallScore: assessment.overall.score,
        feedback: assessment.feedback,
      },
    });

    return answer;
  }

  async generateSentences(
    topicName: string,
    difficulty: string,
    customRequirements?: string,
  ): Promise<string[]> {
    const difficultyGuide =
      difficulty === 'BEGINNER'
        ? 'Simple vocabulary, short sentences (5-10 words)'
        : difficulty === 'ADVANCED'
          ? 'Advanced vocabulary, complex structures (12-20 words)'
          : 'Moderate vocabulary, medium sentences (8-15 words)';

    const prompt = `Generate exactly 10 English sentences for pronunciation practice.

Topic: "${topicName}"
Difficulty: ${difficulty} — ${difficultyGuide}
${customRequirements ? `Additional requirements: ${customRequirements}` : ''}

Rules:
- Natural, conversational sentences people would actually say
- Varied sentence structures (questions, statements, commands)
- All related to the topic
- No numbering, no quotes around sentences

Return ONLY a JSON array of 10 strings, no other text:
["sentence one", "sentence two", ...]`;

    const response = await this.bedrock.messages.create({
      max_tokens: 2048,
      temperature: 0.8,
      system:
        'You are a language learning content creator. Generate natural English sentences for pronunciation practice. Return only valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      const cleaned = text
        .replace(/```json?\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      const sentences = JSON.parse(cleaned);
      if (Array.isArray(sentences) && sentences.length > 0) {
        return sentences.slice(0, 10);
      }
    } catch (err) {
      this.logger.error(`Failed to parse sentences: ${text}`);
    }

    // Fallback: return generic sentences
    return [
      `Let me tell you about ${topicName}.`,
      `This is a practice sentence about ${topicName}.`,
      `Can you say something about ${topicName}?`,
    ];
  }

  // ─── Session & History ──────────────────────────────────

  async createSession(
    userId: string,
    topicId: string,
    sentences: string[],
  ) {
    const topic = await this.prisma.pronunciationTopic.findUnique({
      where: { id: topicId },
    });
    if (!topic) throw new NotFoundException('Topic not found');

    return this.prisma.pronunciationSession.create({
      data: {
        userId,
        topicId,
        topicName: topic.name,
        difficulty: topic.difficulty,
        sentences,
      },
    });
  }

  async saveSessionResult(
    sessionId: string,
    sentenceIndex: number,
    targetSentence: string,
    spokenText: string,
    assessment: PronunciationAssessment,
  ) {
    const result = await this.prisma.pronunciationResult.upsert({
      where: {
        sessionId_sentenceIndex: { sessionId, sentenceIndex },
      },
      create: {
        sessionId,
        sentenceIndex,
        targetSentence,
        spokenText,
        overallScore: assessment.overall.score,
        pronunciationScore: assessment.pronunciation.score,
        accuracyScore: assessment.accuracy.score,
        fluencyScore: assessment.fluency.score,
        completenessScore: assessment.completeness.score,
        feedback: assessment.feedback,
        assessment: assessment as any,
      },
      update: {
        spokenText,
        overallScore: assessment.overall.score,
        pronunciationScore: assessment.pronunciation.score,
        accuracyScore: assessment.accuracy.score,
        fluencyScore: assessment.fluency.score,
        completenessScore: assessment.completeness.score,
        feedback: assessment.feedback,
        assessment: assessment as any,
      },
    });

    // Update session aggregates
    const allResults = await this.prisma.pronunciationResult.findMany({
      where: { sessionId },
    });
    const avg =
      allResults.reduce((sum, r) => sum + r.overallScore, 0) / allResults.length;

    await this.prisma.pronunciationSession.update({
      where: { id: sessionId },
      data: {
        totalDone: allResults.length,
        avgScore: Math.round(avg * 10) / 10,
      },
    });

    return result;
  }

  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this.prisma.pronunciationSession.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: { select: { results: true } },
        },
      }),
      this.prisma.pronunciationSession.count({ where: { userId } }),
    ]);

    return {
      data: sessions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSessionDetail(sessionId: string, userId: string) {
    const session = await this.prisma.pronunciationSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        results: { orderBy: { sentenceIndex: 'asc' } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  private fallbackAssessment(
    target: string,
    spoken: string,
  ): PronunciationAssessment {
    const targetWords = target.toLowerCase().split(/\s+/);
    const spokenWords = spoken.toLowerCase().split(/\s+/);

    const wordComparison: WordComparison[] = targetWords.map((tw) => {
      const found = spokenWords.includes(tw);
      return { target: tw, spoken: found ? tw : null, correct: found, confidence: null, fluent: found };
    });

    const correctCount = wordComparison.filter((w) => w.correct).length;
    const ratio = targetWords.length > 0 ? correctCount / targetWords.length : 0;
    const score = Math.round(ratio * 100);
    const status =
      score >= 90 ? 'master' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor';

    return {
      pronunciation: { score, status },
      accuracy: { score, status },
      fluency: { score, status },
      completeness: { score, status },
      overall: { score, status },
      wordComparison,
      feedback: 'Assessment generated from word matching (AI was unavailable).',
    };
  }
}
