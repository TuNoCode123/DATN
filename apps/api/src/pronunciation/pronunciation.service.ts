import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BedrockService } from '../bedrock/bedrock.service';

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

@Injectable()
export class PronunciationService {
  private readonly logger = new Logger(PronunciationService.name);

  constructor(
    private prisma: PrismaService,
    private bedrock: BedrockService,
  ) {}

  // ─── Deterministic word alignment & scoring ────────────────

  /** Strip punctuation and lowercase for comparison */
  private normalize(word: string): string {
    return word.toLowerCase().replace(/[^a-z0-9']/g, '');
  }

  /** Levenshtein edit distance between two strings */
  private editDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
    return dp[m][n];
  }

  /**
   * Similarity-aware substitution score.
   * Similar words (like "county"→"country") get a mild penalty so they
   * stay aligned. Completely different words (like "we"→"free") get a
   * heavy penalty so the algorithm prefers gaps instead.
   */
  private substitutionScore(a: string, b: string): number {
    if (a === b) return 3; // exact match
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 3;
    const similarity = 1 - this.editDistance(a, b) / maxLen;
    // similarity >= 0.5 → words are close (e.g., "fair"/"far", "county"/"country")
    // similarity < 0.5  → words are unrelated (e.g., "we"/"free", "celebrate"/"slip")
    if (similarity >= 0.5) return 0; // mild penalty, prefer substitution over 2 gaps
    return -5; // heavy penalty, prefer gaps over forced substitution
  }

  /**
   * Needleman-Wunsch global sequence alignment with similarity-aware scoring.
   * Aligns spoken words to target words, handling insertions,
   * deletions, and substitutions properly.
   *
   * Returns an array of length targetWords.length where each entry
   * is the index into spokenWords that aligns with that target word,
   * or null if the target word was missed (gap).
   */
  private alignWords(
    targetWords: string[],
    spokenWords: string[],
  ): (number | null)[] {
    const m = targetWords.length;
    const n = spokenWords.length;
    const normTarget = targetWords.map((w) => this.normalize(w));
    const normSpoken = spokenWords.map((w) => this.normalize(w));

    const GAP = -2;

    // Pre-compute substitution scores for all pairs
    const subScores: number[][] = Array.from({ length: m }, (_, i) =>
      Array.from({ length: n }, (_, j) =>
        this.substitutionScore(normTarget[i], normSpoken[j]),
      ),
    );

    // Build DP table
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      new Array(n + 1).fill(0),
    );
    for (let i = 1; i <= m; i++) dp[i][0] = dp[i - 1][0] + GAP;
    for (let j = 1; j <= n; j++) dp[0][j] = dp[0][j - 1] + GAP;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.max(
          dp[i - 1][j - 1] + subScores[i - 1][j - 1], // match / substitution
          dp[i - 1][j] + GAP, // gap in spoken (target word missed)
          dp[i][j - 1] + GAP, // gap in target (extra spoken word)
        );
      }
    }

    // Backtrack to find alignment
    const alignment: (number | null)[] = new Array(m).fill(null);
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      const sub = subScores[i - 1][j - 1];
      if (dp[i][j] === dp[i - 1][j - 1] + sub) {
        // Only align if it was a match or a similar-word substitution (not a forced bad sub)
        alignment[i - 1] = j - 1;
        i--;
        j--;
      } else if (dp[i][j] === dp[i - 1][j] + GAP) {
        // Gap in spoken — target word was missed
        i--;
      } else {
        // Gap in target — extra spoken word (skip)
        j--;
      }
    }
    // Remaining i > 0 means those target words are unmatched (null)

    return alignment;
  }

  /**
   * Build WordComparison[] deterministically from alignment + Transcribe items.
   */
  private buildWordComparison(
    target: string,
    spoken: string,
    items?: TranscribeItem[],
  ): WordComparison[] {
    const targetWords = target.split(/\s+/).filter((w) => w.length > 0);
    const spokenWords = spoken.split(/\s+/).filter((w) => w.length > 0);

    // Build confidence & timing maps from Transcribe items (pronunciation type only)
    const confidenceMap = new Map<number, number>();
    const timingMap = new Map<number, { start: number; end: number }>();
    if (items) {
      let wordIdx = 0;
      for (const item of items) {
        if (item.type === 'pronunciation') {
          confidenceMap.set(wordIdx, item.confidence);
          timingMap.set(wordIdx, {
            start: item.startTime,
            end: item.endTime,
          });
          wordIdx++;
        }
      }
    }

    const alignment = this.alignWords(targetWords, spokenWords);

    return targetWords.map((tw, idx) => {
      const spokenIdx = alignment[idx];
      const matched = spokenIdx !== null;
      const spokenWord = matched ? spokenWords[spokenIdx] : null;
      const isCorrect =
        matched && this.normalize(tw) === this.normalize(spokenWord!);

      // Confidence from Transcribe item at the aligned spoken index
      const confidence =
        matched && spokenIdx !== null
          ? (confidenceMap.get(spokenIdx) ?? null)
          : null;

      // Fluency: correct + high confidence + no long pause before the word
      let fluent = isCorrect;
      if (isCorrect && confidence !== null) {
        fluent = confidence >= 0.85;
        if (fluent && spokenIdx !== null && spokenIdx > 0) {
          const prev = timingMap.get(spokenIdx - 1);
          const curr = timingMap.get(spokenIdx);
          if (prev && curr) {
            const gap = curr.start - prev.end;
            if (gap > 0.5) fluent = false;
          }
        }
      }

      return {
        target: tw,
        spoken: spokenWord,
        correct: isCorrect,
        confidence,
        fluent,
      };
    });
  }

  /**
   * Compute scores deterministically from word comparison + Transcribe items.
   */
  private computeScores(
    wordComparison: WordComparison[],
    items?: TranscribeItem[],
  ): {
    pronunciation: ScoreItem;
    accuracy: ScoreItem;
    fluency: ScoreItem;
    completeness: ScoreItem;
    overall: ScoreItem;
  } {
    const total = wordComparison.length || 1;
    const correctWords = wordComparison.filter((w) => w.correct);
    const matchedWords = wordComparison.filter((w) => w.spoken !== null);

    // Accuracy: % of target words spoken correctly
    const accuracyScore = Math.round((correctWords.length / total) * 100);

    // Completeness: % of target words that had any spoken match (correct or not)
    const completenessScore = Math.round((matchedWords.length / total) * 100);

    // Pronunciation: average confidence of matched words (from Transcribe)
    let pronunciationScore: number;
    const confidences = wordComparison
      .filter((w) => w.confidence !== null)
      .map((w) => w.confidence!);
    if (confidences.length > 0) {
      pronunciationScore = Math.round(
        (confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100,
      );
    } else {
      // No Transcribe data — use accuracy as proxy
      pronunciationScore = accuracyScore;
    }

    // Fluency: start at 100, penalize for pauses between words
    let fluencyScore = 100;
    if (items && items.length > 1) {
      const pronItems = items.filter((it) => it.type === 'pronunciation');
      for (let i = 1; i < pronItems.length; i++) {
        const gap = pronItems[i].startTime - pronItems[i - 1].endTime;
        if (gap > 1.0) fluencyScore -= 10;
        else if (gap > 0.5) fluencyScore -= 5;
      }
      fluencyScore = Math.max(0, fluencyScore);
    } else {
      // No timing data — estimate from fluent ratio
      const fluentCount = wordComparison.filter((w) => w.fluent).length;
      fluencyScore = Math.round((fluentCount / total) * 100);
    }

    // Overall: weighted average
    const overallScore = Math.round(
      pronunciationScore * 0.3 +
        accuracyScore * 0.3 +
        fluencyScore * 0.2 +
        completenessScore * 0.2,
    );

    const toStatus = (s: number) =>
      s >= 90 ? 'master' : s >= 70 ? 'good' : s >= 50 ? 'fair' : 'poor';

    return {
      pronunciation: {
        score: pronunciationScore,
        status: toStatus(pronunciationScore),
      },
      accuracy: { score: accuracyScore, status: toStatus(accuracyScore) },
      fluency: { score: fluencyScore, status: toStatus(fluencyScore) },
      completeness: {
        score: completenessScore,
        status: toStatus(completenessScore),
      },
      overall: { score: overallScore, status: toStatus(overallScore) },
    };
  }

  /**
   * Generate feedback text using AI. Falls back to a simple string on error.
   */
  private async generateFeedback(
    target: string,
    spoken: string,
    wordComparison: WordComparison[],
  ): Promise<string> {
    const missed = wordComparison
      .filter((w) => w.spoken === null)
      .map((w) => w.target);
    const wrong = wordComparison
      .filter((w) => w.spoken !== null && !w.correct)
      .map((w) => `"${w.target}" (you said "${w.spoken}")`);
    const notFluent = wordComparison
      .filter((w) => w.correct && !w.fluent)
      .map((w) => `"${w.target}"`);

    const prompt = `Give 2-3 sentences of constructive pronunciation feedback.

Target: "${target}"
Spoken: "${spoken}"

${wrong.length > 0 ? `Mispronounced/wrong words: ${wrong.join(', ')}` : 'No mispronounced words.'}
${missed.length > 0 ? `Missed words: ${missed.join(', ')}` : 'No missed words.'}
${notFluent.length > 0 ? `Words lacking fluency (hesitation/low confidence): ${notFluent.join(', ')}` : ''}

Instructions:
1. Mention specific mispronounced or missed words.
2. If any words lacked fluency, mention them.
3. Give one specific tip to improve.
Return ONLY the feedback text, no JSON, no markdown.`;

    try {
      const response = await this.bedrock.messages.create({
        max_tokens: 512,
        temperature: 0.3,
        system:
          'You are a helpful pronunciation coach. Give concise, encouraging feedback.',
        messages: [{ role: 'user', content: prompt }],
      });
      const text =
        response.content[0].type === 'text' ? response.content[0].text : '';
      return text.trim();
    } catch {
      // Fallback: build a simple feedback string
      const parts: string[] = [];
      if (wrong.length > 0)
        parts.push(`You mispronounced: ${wrong.join(', ')}.`);
      if (missed.length > 0)
        parts.push(
          `You missed ${missed.length} word${missed.length > 1 ? 's' : ''}.`,
        );
      if (notFluent.length > 0)
        parts.push(`Practice fluency on: ${notFluent.join(', ')}.`);
      if (parts.length === 0) parts.push('Good job! Keep practicing.');
      return parts.join(' ');
    }
  }

  // ─── Main assess entry point ───────────────────────────────

  async assess(
    target: string,
    spoken: string,
    items?: TranscribeItem[],
  ): Promise<PronunciationAssessment> {
    // Step 1: Deterministic word alignment
    const wordComparison = this.buildWordComparison(target, spoken, items);

    // Step 2: Deterministic scoring
    const scores = this.computeScores(wordComparison, items);

    // Step 3: AI-generated feedback (non-critical, fallback available)
    const feedback = await this.generateFeedback(
      target,
      spoken,
      wordComparison,
    );

    return { ...scores, wordComparison, feedback };
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

  // fallbackAssessment removed — assess() now uses deterministic alignment for all cases
}
