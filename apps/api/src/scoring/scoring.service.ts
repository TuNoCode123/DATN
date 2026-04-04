import { Injectable } from '@nestjs/common';

export type Skill = 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING';
export type ExamType =
  | 'IELTS_ACADEMIC'
  | 'IELTS_GENERAL'
  | 'TOEIC_LR'
  | 'TOEIC_SW'
  | 'HSK_1'
  | 'HSK_2'
  | 'HSK_3'
  | 'HSK_4'
  | 'HSK_5'
  | 'HSK_6';

export interface SectionResult {
  skill: Skill;
  correct: number;
  total: number;
  writingScore?: number;
}

interface HskScoreResult {
  scaledScore: number;
  sectionScores: Record<string, number>;
  passed: boolean;
}

interface IeltsSectionScore {
  correct: number;
  total: number;
  band: number;
}

interface ToeicSectionScore {
  correct: number;
  total: number;
  scaled: number;
}

interface AttemptScoreResult {
  bandScore: number | null;
  scaledScore: number | null;
  sectionScores: Record<string, IeltsSectionScore | ToeicSectionScore>;
}

// ─── IELTS Conversion Tables ──────────────────────────────────────────────────
// Based on official Cambridge IELTS band score conversion tables.
// Format: [minRaw, maxRaw, band]
// Ranges are inclusive on both ends.

const IELTS_LISTENING_TABLE: [number, number, number][] = [
  [39, 40, 9.0],
  [37, 38, 8.5],
  [35, 36, 8.0],
  [33, 34, 7.5],
  [30, 32, 7.0],
  [27, 29, 6.5],
  [23, 26, 6.0],
  [20, 22, 5.5],
  [16, 19, 5.0],
  [13, 15, 4.5],
  [10, 12, 4.0],
  [6, 9, 3.5],
  [4, 5, 3.0],
  [3, 3, 2.5],
  [2, 2, 2.0],
  [1, 1, 1.0],
];

const IELTS_ACADEMIC_READING_TABLE: [number, number, number][] = [
  [40, 40, 9.0],
  [39, 39, 8.5],
  [35, 38, 8.0],
  [33, 34, 7.5],
  [30, 32, 7.0],
  [27, 29, 6.5],
  [23, 26, 6.0],
  [19, 22, 5.5],
  [15, 18, 5.0],
  [13, 14, 4.5],
  [10, 12, 4.0],
  [8, 9, 3.5],
  [6, 7, 3.0],
  [4, 5, 2.5],
  [3, 3, 2.0],
  [1, 2, 1.0],
];

const IELTS_GENERAL_READING_TABLE: [number, number, number][] = [
  [40, 40, 9.0],
  [39, 39, 8.5],
  [38, 38, 8.0],
  [36, 37, 7.5],
  [34, 35, 7.0],
  [32, 33, 6.5],
  [30, 31, 6.0],
  [27, 29, 5.5],
  [23, 26, 5.0],
  [19, 22, 4.5],
  [15, 18, 4.0],
  [12, 14, 3.5],
  [9, 11, 3.0],
  [6, 8, 2.5],
  [3, 5, 2.0],
  [1, 2, 1.0],
];

// ─── TOEIC Conversion Tables ──────────────────────────────────────────────────
// Based on ETS TOEIC score conversion. Simplified linear interpolation between
// known anchor points. Real ETS tables are proprietary and vary by test form;
// these are representative approximations used in practice materials.
// Format: [rawScore, scaledScore]

const TOEIC_LISTENING_ANCHORS: [number, number][] = [
  [0, 5],
  [5, 30],
  [10, 55],
  [15, 85],
  [20, 115],
  [25, 145],
  [30, 175],
  [35, 205],
  [40, 230],
  [45, 255],
  [50, 275],
  [55, 300],
  [60, 325],
  [65, 345],
  [70, 365],
  [75, 385],
  [80, 405],
  [85, 425],
  [90, 450],
  [95, 475],
  [100, 495],
];

const TOEIC_READING_ANCHORS: [number, number][] = [
  [0, 5],
  [5, 25],
  [10, 50],
  [15, 75],
  [20, 105],
  [25, 130],
  [30, 155],
  [35, 180],
  [40, 210],
  [45, 235],
  [50, 260],
  [55, 285],
  [60, 310],
  [65, 335],
  [70, 355],
  [75, 375],
  [80, 395],
  [85, 420],
  [90, 445],
  [95, 470],
  [100, 495],
];

@Injectable()
export class ScoringService {
  /**
   * Convert IELTS raw score to band score.
   * @param skill - LISTENING or READING
   * @param rawScore - Number of correct answers (0-40)
   * @param examType - IELTS_ACADEMIC or IELTS_GENERAL (affects Reading only)
   */
  getIeltsBandScore(
    skill: string,
    rawScore: number,
    examType: string = 'IELTS_ACADEMIC',
  ): number {
    if (rawScore <= 0) return 0;
    if (rawScore > 40) rawScore = 40;

    let table: [number, number, number][];

    if (skill === 'LISTENING') {
      table = IELTS_LISTENING_TABLE;
    } else if (skill === 'READING') {
      table =
        examType === 'IELTS_GENERAL'
          ? IELTS_GENERAL_READING_TABLE
          : IELTS_ACADEMIC_READING_TABLE;
    } else {
      // Writing/Speaking don't use raw score conversion
      return 0;
    }

    for (const [min, max, band] of table) {
      if (rawScore >= min && rawScore <= max) {
        return band;
      }
    }

    return 0;
  }

  /**
   * Calculate IELTS overall band score from individual skill bands.
   * Averages the bands and rounds to nearest 0.5.
   */
  calculateIeltsOverallBand(skillBands: number[]): number {
    if (skillBands.length === 0) return 0;
    const avg = skillBands.reduce((a, b) => a + b, 0) / skillBands.length;
    return Math.round(avg * 2) / 2;
  }

  /**
   * Convert TOEIC raw score to scaled score using linear interpolation.
   * @param skill - LISTENING or READING
   * @param rawScore - Number of correct answers (0-100)
   */
  getToeicScaledScore(skill: string, rawScore: number): number {
    if (rawScore <= 0) return 5;
    if (rawScore >= 100) return 495;

    const anchors =
      skill === 'LISTENING' ? TOEIC_LISTENING_ANCHORS : TOEIC_READING_ANCHORS;

    // Find the two anchor points to interpolate between
    for (let i = 0; i < anchors.length - 1; i++) {
      const [rawLo, scaledLo] = anchors[i];
      const [rawHi, scaledHi] = anchors[i + 1];

      if (rawScore >= rawLo && rawScore <= rawHi) {
        if (rawLo === rawHi) return scaledLo;
        const ratio = (rawScore - rawLo) / (rawHi - rawLo);
        const interpolated = scaledLo + ratio * (scaledHi - scaledLo);
        // Round to nearest 5
        return Math.round(interpolated / 5) * 5;
      }
    }

    return 5;
  }

  /**
   * Calculate TOEIC total score from listening and reading scaled scores.
   */
  calculateToeicTotalScore(
    listeningScaled: number,
    readingScaled: number,
  ): number {
    return listeningScaled + readingScaled;
  }

  /**
   * Calculate all scores for an attempt based on exam type and per-section results.
   */
  calculateAttemptScores(
    examType: string,
    sections: SectionResult[],
  ): AttemptScoreResult {
    const isIelts =
      examType === 'IELTS_ACADEMIC' || examType === 'IELTS_GENERAL';
    const isToeic = examType === 'TOEIC_LR' || examType === 'TOEIC_SW';
    const isHsk = examType.startsWith('HSK_');

    if (isIelts) {
      return this.calculateIeltsAttemptScores(examType as ExamType, sections);
    }
    if (isToeic) {
      return this.calculateToeicAttemptScores(sections);
    }
    if (isHsk) {
      const hskResult = this.calculateHskScores(sections, examType as ExamType);
      return {
        bandScore: null,
        scaledScore: hskResult.scaledScore,
        sectionScores: Object.fromEntries(
          Object.entries(hskResult.sectionScores).map(([k, v]) => [
            k.toLowerCase(),
            { correct: 0, total: 0, scaled: v },
          ]),
        ),
      };
    }

    // Fallback
    return { bandScore: null, scaledScore: null, sectionScores: {} };
  }

  private calculateIeltsAttemptScores(
    examType: ExamType,
    sections: SectionResult[],
  ): AttemptScoreResult {
    const sectionScores: Record<string, IeltsSectionScore> = {};
    const skillBands: number[] = [];

    // Aggregate by skill (in case multiple sections per skill)
    const bySkill = new Map<string, { correct: number; total: number }>();
    for (const s of sections) {
      const key = s.skill.toLowerCase();
      const existing = bySkill.get(key) || { correct: 0, total: 0 };
      existing.correct += s.correct;
      existing.total += s.total;
      bySkill.set(key, existing);
    }

    for (const [skill, { correct, total }] of bySkill) {
      const band = this.getIeltsBandScore(skill.toUpperCase(), correct, examType);
      sectionScores[skill] = { correct, total, band };
      if (band > 0) skillBands.push(band);
    }

    const bandScore =
      skillBands.length > 0
        ? this.calculateIeltsOverallBand(skillBands)
        : 0;

    return {
      bandScore,
      scaledScore: null,
      sectionScores,
    };
  }

  private calculateToeicAttemptScores(
    sections: SectionResult[],
  ): AttemptScoreResult {
    const sectionScores: Record<string, ToeicSectionScore> = {};
    let totalScaled = 0;

    // Aggregate by skill
    const bySkill = new Map<string, { correct: number; total: number }>();
    for (const s of sections) {
      const key = s.skill.toLowerCase();
      const existing = bySkill.get(key) || { correct: 0, total: 0 };
      existing.correct += s.correct;
      existing.total += s.total;
      bySkill.set(key, existing);
    }

    for (const [skill, { correct, total }] of bySkill) {
      const scaled = this.getToeicScaledScore(skill.toUpperCase(), correct);
      sectionScores[skill] = { correct, total, scaled };
      totalScaled += scaled;
    }

    return {
      bandScore: null,
      scaledScore: totalScaled,
      sectionScores,
    };
  }

  /**
   * Calculate HSK scores. Each skill is scaled to 0–100.
   * HSK 1-2: 200 total (Listening + Reading). HSK 3-6: 300 total (+ Writing).
   * Pass at 60% of total.
   */
  calculateHskScores(
    sectionResults: SectionResult[],
    examType: ExamType,
  ): HskScoreResult {
    const hskLevel = parseInt(examType.replace('HSK_', ''));
    const hasWriting = hskLevel >= 3;
    const sectionScores: Record<string, number> = {};

    for (const section of sectionResults) {
      if (section.skill === 'WRITING') {
        sectionScores['WRITING'] = section.writingScore ?? 0;
      } else {
        sectionScores[section.skill] =
          section.total > 0
            ? Math.round((section.correct / section.total) * 100)
            : 0;
      }
    }

    const totalMax = hasWriting ? 300 : 200;
    const passScore = totalMax * 0.6;
    const scaledScore = Object.values(sectionScores).reduce(
      (sum, s) => sum + s,
      0,
    );

    return {
      scaledScore,
      sectionScores,
      passed: scaledScore >= passScore,
    };
  }
}
