import { Injectable } from '@nestjs/common';
import { LiveExamQuestionType } from '@prisma/client';
import {
  AnswerPayload,
  QuestionPayload,
  gradeAnswer,
} from './live-exam-question-types';

export interface ScoreInput {
  isCorrect: boolean;
  answeredMs: number | null;
  perQuestionSec: number;
  basePoints: number;
}

export interface GradeAndScoreInput {
  type: LiveExamQuestionType;
  payload: QuestionPayload;
  answer: AnswerPayload | null;
  answeredMs: number | null;
  perQuestionSec: number;
  basePoints: number;
}

export interface GradeAndScoreResult {
  isCorrect: boolean;
  awardedPoints: number;
}

/**
 * Time-weighted scoring.
 *
 * awardedPoints = isCorrect
 *   ? round( basePoints * (0.5 + 0.5 * (1 - answeredMs / perQuestionMs)) )
 *   : 0
 *
 * - Instant correct         → full basePoints
 * - Correct at final ms     → half basePoints
 * - Wrong or timeout        → 0
 * - Negative answeredMs (clock skew) is clamped to 0 so the curve caps
 *   at basePoints rather than overshooting.
 */
@Injectable()
export class LiveExamScoringService {
  /**
   * Pure score: assumes `isCorrect` already determined elsewhere. Used
   * for the legacy MCQ code path and in unit tests.
   */
  score(input: ScoreInput): number {
    if (!input.isCorrect) return 0;
    if (input.answeredMs === null || input.answeredMs === undefined) return 0;

    const perQuestionMs = input.perQuestionSec * 1000;
    if (perQuestionMs <= 0) return 0;

    const ratio = Math.max(0, Math.min(1, input.answeredMs / perQuestionMs));
    const weight = 0.5 + 0.5 * (1 - ratio);
    return Math.round(input.basePoints * weight);
  }

  /**
   * One-shot grade + time-weighted score for any question type. The
   * gateway calls this on each `exam.answer` submission so all the
   * per-type logic lives in one place.
   */
  gradeAndScore(input: GradeAndScoreInput): GradeAndScoreResult {
    const { isCorrect } = gradeAnswer(input.type, input.payload, input.answer);
    const awardedPoints = this.score({
      isCorrect,
      answeredMs: input.answeredMs,
      perQuestionSec: input.perQuestionSec,
      basePoints: input.basePoints,
    });
    return { isCorrect, awardedPoints };
  }
}
