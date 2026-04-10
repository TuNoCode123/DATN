import { Injectable, Logger } from '@nestjs/common';
import { Prisma, QuestionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BedrockService } from '../bedrock/bedrock.service';
import {
  ScoringService,
  SectionResult,
  Skill,
  ToeicSwWritingParts,
  ToeicSwSpeakingParts,
} from '../scoring/scoring.service';
import {
  TOEIC_SW_WRITING_SYSTEM_PROMPT,
  buildWritingPrompt,
} from './prompts/writing-system-prompt';
import { fetchImageAsBase64 } from './utils/fetch-image';

const TOEIC_WRITING_TYPES: QuestionType[] = [
  'WRITE_SENTENCES',
  'RESPOND_WRITTEN_REQUEST',
  'WRITE_OPINION_ESSAY',
];

const TOEIC_SPEAKING_TYPES: QuestionType[] = [
  'READ_ALOUD',
  'DESCRIBE_PICTURE',
  'RESPOND_TO_QUESTIONS',
  'PROPOSE_SOLUTION',
  'EXPRESS_OPINION',
];

@Injectable()
export class ToeicSwGradingService {
  private readonly logger = new Logger(ToeicSwGradingService.name);
  private readonly regradeCooldowns = new Map<string, number>();
  private static readonly REGRADE_COOLDOWN_MS = 60_000;

  constructor(
    private prisma: PrismaService,
    private bedrock: BedrockService,
    private scoringService: ScoringService,
  ) {}

  /** Queue async grading for TOEIC writing answers */
  async queueWritingGrading(
    attemptId: string,
    answerIds: string[],
  ): Promise<void> {
    for (const answerId of answerIds) {
      this.gradeWritingAnswer(answerId).catch(async (err) => {
        this.logger.error(`Failed to grade answer ${answerId}:`, err);
        await this.prisma.writingEvaluation
          .upsert({
            where: { answerId },
            create: {
              answerId,
              examType: 'TOEIC_SW',
              grammarScore: 0,
              vocabScore: 0,
              contentScore: 0,
              overallScore: -1,
              feedback: `AI grading failed: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again later.`,
              modelUsed: 'error',
            },
            update: {
              overallScore: -1,
              feedback: `AI grading failed: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again later.`,
              modelUsed: 'error',
            },
          })
          .catch((dbErr) => {
            this.logger.error(
              `Failed to save error evaluation for ${answerId}:`,
              dbErr,
            );
          });
      });
    }
  }

  async gradeWritingAnswer(answerId: string) {
    // Remove any previous failed evaluation
    await this.prisma.writingEvaluation.deleteMany({
      where: { answerId, overallScore: -1 },
    });

    const answer = await this.prisma.userAnswer.findUniqueOrThrow({
      where: { id: answerId },
      include: {
        question: {
          include: { group: { include: { section: { include: { test: { select: { examType: true } } } } } } },
        },
      },
    });

    const answerExamType = answer.question.group.section.test.examType;

    const questionType = answer.question.group.questionType;
    const meta =
      (answer.question.metadata as Record<string, unknown>) || {};

    const promptResult = buildWritingPrompt(
      questionType,
      answer.question.stem,
      meta,
      answer.answerText || '',
    );

    // Build message content — include image for WRITE_SENTENCES
    let messageContent: string | { type: string; [key: string]: unknown }[];
    const imageUrl = answer.question.imageUrl || answer.question.group.imageUrl;

    if (promptResult.needsImage && imageUrl) {
      try {
        const { base64, mediaType } = await fetchImageAsBase64(imageUrl);
        messageContent = [
          {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: mediaType, data: base64 },
          },
          { type: 'text' as const, text: promptResult.text },
        ];
        this.logger.log(`Including image in AI grading for answer ${answerId}`);
      } catch (err) {
        this.logger.warn(
          `Failed to fetch image for answer ${answerId}, grading without image: ${err instanceof Error ? err.message : err}`,
        );
        messageContent = promptResult.text;
      }
    } else {
      messageContent = promptResult.text;
    }

    const response = await this.bedrock.messages.create({
      max_tokens: 1024,
      system: TOEIC_SW_WRITING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: messageContent as any }],
    });

    const rawText =
      response.content[0].type === 'text' ? response.content[0].text : '';
    const text = rawText.trim();

    // Extract JSON from possible markdown code fences
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : text;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      this.logger.warn(
        `AI returned non-JSON for answer ${answerId}, using fallback score. Response: ${text.slice(0, 300)}`,
      );
      // Fallback: AI refused to return JSON (e.g. gibberish input) — assign minimum scores
      parsed = {
        grammarScore: 0,
        vocabScore: 0,
        contentScore: 0,
        overallScore: 0,
        feedback: text.slice(0, 500) || 'The response could not be graded. Please provide a valid answer.',
        grammarErrors: null,
        vocabAnalysis: null,
      };
    }

    // Validate required fields — fill missing with 0
    const requiredScores = [
      'grammarScore',
      'vocabScore',
      'contentScore',
      'overallScore',
    ] as const;
    for (const key of requiredScores) {
      if (typeof parsed[key] !== 'number') {
        parsed[key] = 0;
      }
    }
    if (typeof parsed.feedback !== 'string') {
      parsed.feedback = '';
    }

    const evalData = {
      examType: answerExamType,
      grammarScore: parsed.grammarScore as number,
      vocabScore: parsed.vocabScore as number,
      contentScore: parsed.contentScore as number,
      overallScore: parsed.overallScore as number,
      feedback: parsed.feedback as string,
      vocabAnalysis: parsed.vocabAnalysis
        ? (parsed.vocabAnalysis as Prisma.InputJsonValue)
        : undefined,
      grammarErrors: parsed.grammarErrors
        ? (parsed.grammarErrors as unknown as Prisma.InputJsonValue)
        : undefined,
      modelUsed: 'bedrock:claude-3.5-haiku',
    };

    const evaluation = await this.prisma.writingEvaluation.upsert({
      where: { answerId },
      create: { answerId, ...evalData },
      update: evalData,
    });

    // Update answer
    await this.prisma.userAnswer.update({
      where: { id: answerId },
      data: { isCorrect: (parsed.overallScore as number) >= 60 },
    });

    return evaluation;
  }

  /** Get writing evaluations for a TOEIC_SW attempt */
  async getWritingEvaluations(attemptId: string) {
    const writingAnswers = await this.prisma.userAnswer.findMany({
      where: {
        attemptId,
        question: {
          group: {
            questionType: { in: TOEIC_WRITING_TYPES },
          },
        },
      },
      include: {
        evaluation: { select: { id: true, overallScore: true } },
      },
    });

    // Re-trigger for ungraded answers with cooldown
    const ungradedIds = writingAnswers
      .filter(
        (a: { evaluation?: { overallScore: number } | null }) =>
          !a.evaluation || a.evaluation.overallScore === -1,
      )
      .map((a) => a.id);

    if (ungradedIds.length > 0) {
      const lastTrigger = this.regradeCooldowns.get(attemptId) || 0;
      if (
        Date.now() - lastTrigger >
        ToeicSwGradingService.REGRADE_COOLDOWN_MS
      ) {
        this.regradeCooldowns.set(attemptId, Date.now());
        this.logger.log(
          `Re-triggering grading for ${ungradedIds.length} ungraded TOEIC writing answer(s)`,
        );
        this.queueWritingGrading(attemptId, ungradedIds).catch((err) =>
          this.logger.error('Failed to re-queue TOEIC writing grading', err),
        );
      }
    }

    const evaluations = await this.prisma.writingEvaluation.findMany({
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

    // Recalculate attempt scores when all evaluations are complete
    const allDone =
      evaluations.length >= writingAnswers.length &&
      writingAnswers.length > 0 &&
      evaluations.every((e) => e.overallScore >= 0);
    if (allDone) {
      await this.recalculateAttemptScores(attemptId, evaluations);
    }

    return {
      evaluations,
      totalExpected: writingAnswers.length,
      allDone,
    };
  }

  /** Recalculate and update UserAttempt scores using level-based scoring */
  private async recalculateAttemptScores(
    attemptId: string,
    evaluations: { overallScore: number; answer: { question: { group: { questionType: string } } } }[],
  ) {
    const attempt = await this.prisma.userAttempt.findUnique({
      where: { id: attemptId },
      include: {
        test: true,
        sections: true,
      },
    });
    if (!attempt) return;

    // Collect per-question-type scores from writing evaluations
    const writingByType = new Map<string, number[]>();
    for (const ev of evaluations) {
      const qType = ev.answer.question.group.questionType;
      if (!writingByType.has(qType)) writingByType.set(qType, []);
      writingByType.get(qType)!.push(ev.overallScore);
    }

    // Collect speaking scores from evaluations (graded via WebSocket or AI)
    const speakingAnswers = await this.prisma.userAnswer.findMany({
      where: {
        attemptId,
        question: { group: { questionType: { in: TOEIC_SPEAKING_TYPES } } },
      },
      include: {
        evaluation: { select: { overallScore: true } },
        question: { include: { group: { select: { questionType: true } } } },
      },
    });
    const speakingByType = new Map<string, number[]>();
    for (const sa of speakingAnswers) {
      if (sa.evaluation && sa.evaluation.overallScore >= 0) {
        const qType = sa.question.group.questionType;
        if (!speakingByType.has(qType)) speakingByType.set(qType, []);
        speakingByType.get(qType)!.push(sa.evaluation.overallScore);
      }
    }

    const to5 = ScoringService.aiScoreTo5Scale;

    // Build writing parts (Part1=WRITE_SENTENCES, Part2=RESPOND_WRITTEN_REQUEST, Part3=WRITE_OPINION_ESSAY)
    let writingParts: ToeicSwWritingParts | null = null;
    const hasWriting = writingByType.size > 0;
    if (hasWriting) {
      writingParts = {
        part1Scores: (writingByType.get('WRITE_SENTENCES') || []).map(to5),
        part2Scores: (writingByType.get('RESPOND_WRITTEN_REQUEST') || []).map(to5),
        part3Score: to5((writingByType.get('WRITE_OPINION_ESSAY') || [0])[0] || 0),
      };
    }

    // Build speaking parts (Part1+2=READ_ALOUD+DESCRIBE_PICTURE, Part3+4=RESPOND_TO_QUESTIONS+PROPOSE_SOLUTION, Part5=EXPRESS_OPINION)
    let speakingParts: ToeicSwSpeakingParts | null = null;
    const hasSpeaking = speakingByType.size > 0;
    if (hasSpeaking) {
      speakingParts = {
        part12Scores: [
          ...(speakingByType.get('READ_ALOUD') || []).map(to5),
          ...(speakingByType.get('DESCRIBE_PICTURE') || []).map(to5),
        ],
        part34Scores: [
          ...(speakingByType.get('RESPOND_TO_QUESTIONS') || []).map(to5),
          ...(speakingByType.get('PROPOSE_SOLUTION') || []).map(to5),
        ],
        part5Score: to5((speakingByType.get('EXPRESS_OPINION') || [0])[0] || 0),
      };
    }

    const examScores = this.scoringService.calculateToeicSwFromParts(
      writingParts,
      speakingParts,
    );

    await this.prisma.userAttempt.update({
      where: { id: attemptId },
      data: {
        scaledScore: examScores.scaledScore,
        sectionScores: examScores.sectionScores
          ? (examScores.sectionScores as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });

    this.logger.log(
      `Recalculated scores for attempt ${attemptId}: scaledScore=${examScores.scaledScore}`,
    );
  }
}
