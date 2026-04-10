import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BedrockService } from '../bedrock/bedrock.service';
import { CreditsService } from '../credits/credits.service';
import { CreditReason } from '@prisma/client';
import type { DifficultyLevel } from '@prisma/client';

export interface SentencePair {
  vietnamese: string;
  english: string;
}

interface ScoreItem {
  score: number;
  status: 'master' | 'good' | 'fair' | 'poor';
}

interface ErrorCorrection {
  wrong: string;
  correct: string;
  explanation: string;
}

interface TranslationFeedback {
  corrections: ErrorCorrection[];
  tips: string[];
  summary: string;
}

export interface TranslationAssessment {
  accuracy: ScoreItem;
  grammar: ScoreItem;
  vocabulary: ScoreItem;
  naturalness: ScoreItem;
  overall: ScoreItem;
  suggestedTranslation: string;
  feedback: TranslationFeedback;
}

const SYSTEM_PROMPT = `You are a strict, professional Vietnamese-to-English translation assessor. You grade rigorously — most student translations should score 40-70, not 70-90. A score of 80+ means near-native quality with only trivial issues. A score of 90+ means virtually perfect. Do NOT inflate scores to be encouraging. Be honest and precise. Return ONLY valid JSON — no markdown, no code fences.`;

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(
    private prisma: PrismaService,
    private bedrock: BedrockService,
    private credits: CreditsService,
  ) {}

  async generateSentencePairs(
    userId: string,
    topicName: string,
    difficulty: string,
    customRequirements?: string,
  ): Promise<SentencePair[]> {
    const sufficient = await this.credits.hasSufficientCredits(userId, 3);
    if (!sufficient) {
      throw new BadRequestException('Insufficient credits (need 3)');
    }

    const difficultyGuide =
      difficulty === 'BEGINNER'
        ? 'Simple everyday phrases, short sentences (5-10 words). Use common vocabulary.'
        : difficulty === 'ADVANCED'
          ? 'Complex structures, idioms, formal/literary language (12-25 words).'
          : 'Moderate complexity, mix of common and intermediate vocabulary (8-15 words).';

    const prompt = `Generate exactly 10 Vietnamese sentences with their correct English translations for a translation practice exercise.

Topic: "${topicName}"
Difficulty: ${difficulty} — ${difficultyGuide}
${customRequirements ? `Additional requirements: ${customRequirements}` : ''}

Rules:
- Vietnamese sentences should be natural and commonly used
- English translations should be accurate and natural-sounding
- Varied sentence structures (questions, statements, commands, exclamations)
- All related to the topic
- For BEGINNER: use simple grammar and common words
- For INTERMEDIATE: include some compound sentences and less common vocabulary
- For ADVANCED: include idioms, complex grammar, and nuanced vocabulary

Return ONLY a JSON array of 10 objects:
[{"vietnamese": "Câu tiếng Việt", "english": "English sentence"}, ...]`;

    const response = await this.bedrock.messages.create({
      max_tokens: 4096,
      temperature: 0.8,
      system:
        'You are a bilingual Vietnamese-English language expert. Generate natural sentence pairs for translation practice. Return only valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    try {
      const cleaned = text
        .replace(/```json?\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      const pairs = JSON.parse(cleaned);
      if (Array.isArray(pairs) && pairs.length > 0) {
        await this.credits.deduct(
          userId,
          3,
          CreditReason.TRANSLATION_SESSION,
          undefined,
          { action: 'generate-pairs', topicName },
        );
        return pairs.slice(0, 10);
      }
    } catch (err) {
      this.logger.error(`Failed to parse sentence pairs: ${text}`);
    }

    // Fallback
    return [
      { vietnamese: 'Xin chào, bạn khỏe không?', english: 'Hello, how are you?' },
      { vietnamese: 'Tôi rất vui được gặp bạn.', english: 'I am very happy to meet you.' },
      { vietnamese: 'Hôm nay thời tiết đẹp quá.', english: 'The weather is so nice today.' },
    ];
  }

  async assess(
    userId: string,
    vietnamese: string,
    referenceEnglish: string,
    userTranslation: string,
  ): Promise<TranslationAssessment> {
    const sufficient = await this.credits.hasSufficientCredits(userId, 2);
    if (!sufficient) {
      throw new BadRequestException('Insufficient credits (need 2)');
    }

    const prompt = `Assess the quality of this Vietnamese-to-English translation.

Vietnamese (original): "${vietnamese}"
Reference English: "${referenceEnglish}"
User's translation: "${userTranslation}"

Score each category 0-100. Be STRICT — grade like an English professor, not an encouraging tutor.

**Scoring calibration** (follow this closely):
- 90-100: Near-perfect. Native-level quality, at most one trivial issue.
- 75-89: Good with minor flaws. Meaning is fully conveyed, 1-2 small grammar/word choice issues.
- 55-74: Acceptable but clearly flawed. Meaning is mostly there but with noticeable errors in grammar, vocabulary, or phrasing.
- 35-54: Poor. Multiple errors, awkward phrasing, meaning partially lost or distorted.
- 0-34: Very poor. Major meaning errors, broken grammar, barely comprehensible.

**Accuracy** (0-100): Does the translation convey the same meaning as the Vietnamese original?
- Missing a key idea/detail: -15 to -25 per omission
- Added information not in the original: -10 to -15
- Distorted meaning (says something different): -25 to -40
- Only give 80+ if ALL key ideas are preserved with correct nuance

**Grammar** (0-100): Is the English grammatically correct?
- Each distinct grammar error: -10 to -20 (e.g., wrong verb form, missing article, wrong preposition, SVA error)
- Structural error (e.g., "time to viewing" instead of "time viewing/time to view"): -15 to -20
- Run-on or fragmented sentence: -15
- Do NOT be lenient on grammar — every error counts

**Vocabulary** (0-100): How appropriate and precise is the word choice?
- Using a vague/imprecise word when a specific one exists: -10 to -15 per instance
- Using a word that changes the meaning subtly: -15 to -20
- Unnatural collocation (words that don't typically go together): -10 to -15
- Only give 80+ if word choices are precise and natural

**Naturalness** (0-100): Does it sound like natural English a native speaker would produce?
- Awkward but understandable phrasing: -10 to -15 per instance
- Literal/word-by-word translation feel: -20 to -30
- Unnatural word order: -15 to -20
- Only give 80+ if a native speaker would actually say it this way

**Overall** (0-100): Weighted average — accuracy 35%, grammar 25%, vocabulary 20%, naturalness 20%. Calculate it, do not round up generously.

Status thresholds: master >= 90, good >= 70, fair >= 50, poor < 50.

**suggestedTranslation**: Provide the best natural English translation (may differ from reference if you have a better one).

**feedback**: A structured object with:
- **corrections**: Array of specific errors found in the user's translation. Each correction has:
  - "wrong": the exact word/phrase the user wrote incorrectly
  - "correct": the correct word/phrase
  - "explanation": brief explanation of why it's wrong (grammar rule, word choice, etc.)
  List ALL errors: spelling mistakes, wrong words, grammar issues, missing articles, wrong prepositions, etc.
  If the translation is perfect, return an empty array.
- **tips**: Array of 2-3 actionable improvement tips. Each tip should be a concise sentence about a specific skill to practice (e.g., "Pay attention to article usage (a/an/the) before countable nouns.", "Use 'abroad' instead of 'oversea countries' for more natural phrasing.").
- **summary**: 1 sentence overall assessment of what the user did well or the main area to focus on.

Return ONLY this JSON:
{
  "accuracy": { "score": <0-100>, "status": "<master|good|fair|poor>" },
  "grammar": { "score": <0-100>, "status": "<master|good|fair|poor>" },
  "vocabulary": { "score": <0-100>, "status": "<master|good|fair|poor>" },
  "naturalness": { "score": <0-100>, "status": "<master|good|fair|poor>" },
  "overall": { "score": <0-100>, "status": "<master|good|fair|poor>" },
  "suggestedTranslation": "Best English translation here",
  "feedback": {
    "corrections": [
      { "wrong": "oversea contries", "correct": "overseas countries / abroad", "explanation": "Misspelling of 'countries' and 'overseas' is one word; 'abroad' is more natural." }
    ],
    "tips": [
      "Practice common travel vocabulary: passport, wallet, luggage.",
      "Use imperative form ('Be careful') instead of informal phrasing ('let careful')."
    ],
    "summary": "You captured the main idea well but need to work on spelling and natural phrasing."
  }
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
      const assessment = JSON.parse(cleaned) as TranslationAssessment;

      await this.credits.deduct(
        userId,
        2,
        CreditReason.AI_GRADING,
        undefined,
        { action: 'translation-assess' },
      );

      return assessment;
    } catch (err) {
      this.logger.error(`Failed to assess translation: ${err.message ?? err}`);
      return this.fallbackAssessment(referenceEnglish, userTranslation);
    }
  }

  // ─── Session & History ──────────────────────────────────

  async createSession(
    userId: string,
    topicId: string,
    sentencePairs: SentencePair[],
  ) {
    const topic = await this.prisma.translationTopic.findUnique({
      where: { id: topicId },
    });
    if (!topic) throw new NotFoundException('Topic not found');

    return this.prisma.translationSession.create({
      data: {
        userId,
        topicId,
        topicName: topic.name,
        difficulty: topic.difficulty,
        sentencePairs: sentencePairs as any,
      },
    });
  }

  async saveSessionResult(
    sessionId: string,
    sentenceIndex: number,
    vietnameseSentence: string,
    referenceEnglish: string,
    userTranslation: string,
    assessment: TranslationAssessment,
  ) {
    const result = await this.prisma.translationResult.upsert({
      where: {
        sessionId_sentenceIndex: { sessionId, sentenceIndex },
      },
      create: {
        sessionId,
        sentenceIndex,
        vietnameseSentence,
        referenceEnglish,
        userTranslation,
        overallScore: assessment.overall.score,
        accuracyScore: assessment.accuracy.score,
        grammarScore: assessment.grammar.score,
        vocabularyScore: assessment.vocabulary.score,
        naturalnessScore: assessment.naturalness.score,
        suggestedTranslation: assessment.suggestedTranslation,
        feedback: typeof assessment.feedback === 'string'
          ? assessment.feedback
          : assessment.feedback.summary,
        assessment: assessment as any,
      },
      update: {
        userTranslation,
        overallScore: assessment.overall.score,
        accuracyScore: assessment.accuracy.score,
        grammarScore: assessment.grammar.score,
        vocabularyScore: assessment.vocabulary.score,
        naturalnessScore: assessment.naturalness.score,
        suggestedTranslation: assessment.suggestedTranslation,
        feedback: typeof assessment.feedback === 'string'
          ? assessment.feedback
          : assessment.feedback.summary,
        assessment: assessment as any,
      },
    });

    // Update session aggregates
    const allResults = await this.prisma.translationResult.findMany({
      where: { sessionId },
    });
    const avg =
      allResults.reduce((sum, r) => sum + r.overallScore, 0) / allResults.length;

    await this.prisma.translationSession.update({
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
      this.prisma.translationSession.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: { select: { results: true } },
        },
      }),
      this.prisma.translationSession.count({ where: { userId } }),
    ]);

    return { data: sessions, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getSessionDetail(sessionId: string, userId: string) {
    const session = await this.prisma.translationSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        results: { orderBy: { sentenceIndex: 'asc' } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  private fallbackAssessment(
    reference: string,
    userTranslation: string,
  ): TranslationAssessment {
    const refWords = reference.toLowerCase().split(/\s+/);
    const userWords = userTranslation.toLowerCase().split(/\s+/);

    const matching = refWords.filter((w) => userWords.includes(w)).length;
    const ratio = refWords.length > 0 ? matching / refWords.length : 0;
    const score = Math.round(ratio * 100);
    const status =
      score >= 90 ? 'master' : score >= 70 ? 'good' : score >= 50 ? 'fair' : 'poor';

    return {
      accuracy: { score, status },
      grammar: { score: 70, status: 'good' },
      vocabulary: { score, status },
      naturalness: { score: 70, status: 'good' },
      overall: { score, status },
      suggestedTranslation: reference,
      feedback: {
        corrections: [],
        tips: ['AI assessment was unavailable. Compare your translation with the suggested version above.'],
        summary: 'Assessment generated from word matching (AI was unavailable).',
      },
    };
  }
}
