import { ExamType } from '@prisma/client';

export type ScoreField = 'bandScore' | 'scaledScore' | 'scorePercent';

export interface ExamScoreFormat {
  field: ScoreField;
  min: number;
  max: number;
  step: number;
  label: string;
}

const IELTS_FORMAT: ExamScoreFormat = {
  field: 'bandScore',
  min: 0,
  max: 9,
  step: 0.5,
  label: 'Band',
};

const TOEIC_LR_FORMAT: ExamScoreFormat = {
  field: 'scaledScore',
  min: 10,
  max: 990,
  step: 5,
  label: 'Score',
};

const TOEIC_SW_FORMAT: ExamScoreFormat = {
  field: 'scaledScore',
  min: 0,
  max: 200,
  step: 10,
  label: 'Score',
};

const TOEIC_SINGLE_SKILL_FORMAT: ExamScoreFormat = {
  field: 'scaledScore',
  min: 0,
  max: 200,
  step: 10,
  label: 'Score',
};

const HSK_FORMAT: ExamScoreFormat = {
  field: 'scorePercent',
  min: 0,
  max: 100,
  step: 1,
  label: 'Percent',
};

export function getScoreFormat(examType: ExamType): ExamScoreFormat {
  switch (examType) {
    case 'IELTS_ACADEMIC':
    case 'IELTS_GENERAL':
      return IELTS_FORMAT;
    case 'TOEIC_LR':
      return TOEIC_LR_FORMAT;
    case 'TOEIC_SW':
      return TOEIC_SW_FORMAT;
    case 'TOEIC_SPEAKING':
    case 'TOEIC_WRITING':
      return TOEIC_SINGLE_SKILL_FORMAT;
    case 'HSK_1':
    case 'HSK_2':
    case 'HSK_3':
    case 'HSK_4':
    case 'HSK_5':
    case 'HSK_6':
      return HSK_FORMAT;
    default:
      return HSK_FORMAT;
  }
}

export function validateTargetScore(examType: ExamType, value: number): boolean {
  const fmt = getScoreFormat(examType);
  if (Number.isNaN(value)) return false;
  if (value < fmt.min || value > fmt.max) return false;
  // Allow non-aligned values for percent (any 0-100 score), strict for IELTS
  if (fmt.step >= 0.5 && fmt.step < 1) {
    return Math.abs(value / fmt.step - Math.round(value / fmt.step)) < 1e-6;
  }
  return true;
}
