import { Injectable } from '@nestjs/common';

export interface SM2Input {
  quality: number; // 0-5
  repetitions: number;
  easeFactor: number;
  interval: number; // days
}

export interface SM2Output {
  repetitions: number;
  easeFactor: number;
  interval: number;
  nextReviewAt: Date;
}

@Injectable()
export class SrsService {
  calculate(input: SM2Input): SM2Output {
    const { quality, repetitions, easeFactor, interval } = input;

    let newRepetitions: number;
    let newInterval: number;
    let newEaseFactor: number;

    if (quality < 3) {
      // Failed: reset
      newRepetitions = 0;
      newInterval = 1;
      newEaseFactor = easeFactor;
    } else {
      // Passed
      newRepetitions = repetitions + 1;
      if (newRepetitions === 1) {
        newInterval = 1;
      } else if (newRepetitions === 2) {
        newInterval = 6;
      } else {
        newInterval = Math.round(interval * easeFactor);
      }
      // Update ease factor
      newEaseFactor =
        easeFactor +
        (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      newEaseFactor = Math.max(1.3, newEaseFactor);
    }

    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + newInterval);

    return {
      repetitions: newRepetitions,
      easeFactor: newEaseFactor,
      interval: newInterval,
      nextReviewAt,
    };
  }
}
