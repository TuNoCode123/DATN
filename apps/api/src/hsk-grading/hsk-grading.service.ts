import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BedrockService } from '../bedrock/bedrock.service';
import { HSK_WRITING_SYSTEM_PROMPT } from './prompts/writing-system-prompt';
import { gradeSentenceReorder } from './sentence-reorder';

interface HskWritingMeta {
  type: string;
  hskLevel: number;
  keywords?: string[];
  minChars?: number;
  maxChars?: number;
  imageAlt?: string;
  charSet?: string;
}

@Injectable()
export class HskGradingService {
  private readonly logger = new Logger(HskGradingService.name);
  /** Tracks recent re-grading triggers to avoid spamming the AI service */
  private readonly regradeCooldowns = new Map<string, number>();
  private static readonly REGRADE_COOLDOWN_MS = 60_000; // 1 minute

  constructor(
    private prisma: PrismaService,
    private bedrock: BedrockService,
  ) {}

  /** Grade a sentence reorder question deterministically */
  gradeSentenceReorder(
    userAnswer: string | null,
    question: { correctAnswer: string; metadata: { fragments: string[] } },
  ) {
    return gradeSentenceReorder(userAnswer, question);
  }

  /** Queue async grading for writing answers after test submission */
  async queueWritingGrading(
    attemptId: string,
    answerIds: string[],
  ): Promise<void> {
    for (const answerId of answerIds) {
      this.gradeWritingAnswer(answerId).catch(async (err) => {
        this.logger.error(`Failed to grade answer ${answerId}:`, err);
        // Create a failed evaluation so the frontend knows grading failed
        await this.prisma.writingEvaluation.create({
          data: {
            answerId,
            examType: 'GRADING_FAILED',
            hskLevel: 0,
            grammarScore: 0,
            vocabScore: 0,
            contentScore: 0,
            overallScore: -1,
            feedback: `AI grading failed: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again later.`,
            modelUsed: 'error',
          },
        }).catch((dbErr) => {
          this.logger.error(`Failed to save error evaluation for ${answerId}:`, dbErr);
        });
      });
    }
  }

  async gradeWritingAnswer(answerId: string) {
    // Remove any previous failed evaluation so we can retry
    await this.prisma.writingEvaluation.deleteMany({
      where: { answerId, overallScore: -1 },
    });

    const answer = await this.prisma.userAnswer.findUniqueOrThrow({
      where: { id: answerId },
      include: {
        question: {
          include: { group: { include: { section: true } } },
        },
      },
    });

    const meta = answer.question.metadata as unknown as HskWritingMeta;
    const prompt = this.buildPrompt(
      answer.question,
      meta,
      answer.answerText || '',
    );

    const response = await this.bedrock.messages.create({
      max_tokens: 1024,
      system: HSK_WRITING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawText =
      response.content[0].type === 'text' ? response.content[0].text : '';

    const text = rawText.trim();

    // Extract JSON from possible markdown code fences
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : text;

    interface GradingResult {
      grammarScore: number;
      vocabScore: number;
      contentScore: number;
      overallScore: number;
      feedback: string;
      vocabAnalysis: Record<string, unknown> | null;
      grammarErrors: Record<string, unknown>[] | null;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      this.logger.error(`Failed to parse AI response for answer ${answerId}: ${text.slice(0, 500)}`);
      throw new Error('AI returned invalid JSON');
    }

    // Validate required fields exist and are numbers
    const requiredScores = ['grammarScore', 'vocabScore', 'contentScore', 'overallScore'] as const;
    for (const key of requiredScores) {
      if (typeof parsed[key] !== 'number') {
        this.logger.error(`AI response missing or invalid field "${key}" for answer ${answerId}. Got: ${JSON.stringify(parsed).slice(0, 500)}`);
        throw new Error(`AI response missing required field: ${key}`);
      }
    }
    if (typeof parsed.feedback !== 'string') {
      parsed.feedback = '';
    }

    const result: GradingResult = {
      grammarScore: parsed.grammarScore as number,
      vocabScore: parsed.vocabScore as number,
      contentScore: parsed.contentScore as number,
      overallScore: parsed.overallScore as number,
      feedback: parsed.feedback as string,
      vocabAnalysis: (parsed.vocabAnalysis as Record<string, unknown>) ?? null,
      grammarErrors: (parsed.grammarErrors as Record<string, unknown>[]) ?? null,
    };

    // Save evaluation
    const evaluation = await this.prisma.writingEvaluation.create({
      data: {
        answerId,
        examType: 'HSK_' + meta.hskLevel,
        hskLevel: meta.hskLevel,
        grammarScore: result.grammarScore,
        vocabScore: result.vocabScore,
        contentScore: result.contentScore,
        overallScore: result.overallScore,
        feedback: result.feedback,
        vocabAnalysis: (result.vocabAnalysis ?? undefined) as Prisma.InputJsonValue,
        grammarErrors: result.grammarErrors
          ? (result.grammarErrors as unknown as Prisma.InputJsonValue)
          : undefined,
        modelUsed: 'bedrock:claude-3.5-haiku',
      },
    });

    // Update answer's isCorrect based on overall score
    await this.prisma.userAnswer.update({
      where: { id: answerId },
      data: { isCorrect: result.overallScore >= 60 },
    });

    return evaluation;
  }

  /** Get writing evaluations for an attempt, re-triggering grading for any ungraded answers */
  async getWritingEvaluations(attemptId: string) {
    // Find all writing answers for this attempt
    const writingAnswers = await this.prisma.userAnswer.findMany({
      where: {
        attemptId,
        question: {
          group: {
            questionType: { in: ['KEYWORD_COMPOSITION', 'PICTURE_COMPOSITION'] },
          },
        },
      },
      include: {
        evaluation: { select: { id: true, overallScore: true } },
      },
    });

    // Re-trigger grading for answers that have no evaluation or failed grading
    const ungradedIds = writingAnswers
      .filter((a) => !a.evaluation || a.evaluation.overallScore === -1)
      .map((a) => a.id);

    if (ungradedIds.length > 0) {
      const lastTrigger = this.regradeCooldowns.get(attemptId) || 0;
      if (Date.now() - lastTrigger > HskGradingService.REGRADE_COOLDOWN_MS) {
        this.regradeCooldowns.set(attemptId, Date.now());
        this.logger.log(
          `Re-triggering grading for ${ungradedIds.length} ungraded writing answer(s) in attempt ${attemptId}`,
        );
        this.queueWritingGrading(attemptId, ungradedIds).catch((err) =>
          this.logger.error('Failed to re-queue writing grading', err),
        );
      }
    }

    return this.prisma.writingEvaluation.findMany({
      where: { answer: { attemptId } },
      include: {
        answer: {
          include: {
            question: {
              include: { group: true },
            },
          },
        },
      },
    });
  }

  private buildPrompt(
    question: { stem: string | null; group: { questionType: string } },
    meta: HskWritingMeta,
    answer: string,
  ): string {
    let prompt = `## HSK Level: ${meta.hskLevel}\n\n`;

    if (question.group.questionType === 'KEYWORD_COMPOSITION') {
      prompt += `## Prompt\n${question.stem}\n\n`;
      prompt += `## Required Keywords\n${(meta.keywords || []).join('、')}\n\n`;
    } else {
      prompt += `## Prompt\n${question.stem}\n\n`;
      if (meta.imageAlt) prompt += `## Image Description\n${meta.imageAlt}\n\n`;
    }

    prompt += `## Limits\nMin: ${meta.minChars || 60}, Max: ${meta.maxChars || 100}\n\n`;
    prompt += `## Student's Answer (${answer?.length || 0} characters)\n${answer || '(empty)'}\n`;

    return prompt;
  }
}
