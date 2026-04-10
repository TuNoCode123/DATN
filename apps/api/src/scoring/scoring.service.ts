import { Injectable } from '@nestjs/common';

export type Skill = 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING';
export type ExamType =
  | 'IELTS_ACADEMIC'
  | 'IELTS_GENERAL'
  | 'TOEIC_LR'
  | 'TOEIC_SW'
  | 'TOEIC_SPEAKING'
  | 'TOEIC_WRITING'
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

// ─── TOEIC SW Level-Based Scoring ───────────────────────────────────────────
// Per-part scores on 0-5 scale, matched against level rules to produce 0-200 scaled score.

export interface ToeicSwWritingParts {
  /** WRITE_SENTENCES individual scores (0-5 each, typically 5 questions) */
  part1Scores: number[];
  /** RESPOND_WRITTEN_REQUEST individual scores (0-5 each, typically 2 questions) */
  part2Scores: number[];
  /** WRITE_OPINION_ESSAY score (0-5) */
  part3Score: number;
}

export interface ToeicSwSpeakingParts {
  /** READ_ALOUD + DESCRIBE_PICTURE individual scores (0-5 each) */
  part12Scores: number[];
  /** RESPOND_TO_QUESTIONS + PROPOSE_SOLUTION individual scores (0-5 each) */
  part34Scores: number[];
  /** EXPRESS_OPINION score (0-5) */
  part5Score: number;
}

export interface ToeicSwLevelResult {
  level: number;
  scaledScore: number;
  reason: string;
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
    const isToeicLR = examType === 'TOEIC_LR';
    const isToeicSW = examType === 'TOEIC_SW' || examType === 'TOEIC_SPEAKING' || examType === 'TOEIC_WRITING';
    const isHsk = examType.startsWith('HSK_');

    if (isIelts) {
      return this.calculateIeltsAttemptScores(examType as ExamType, sections);
    }
    if (isToeicLR) {
      return this.calculateToeicAttemptScores(sections);
    }
    if (isToeicSW) {
      return this.calculateToeicSwAttemptScores(sections);
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

  /**
   * TOEIC Speaking & Writing scoring using level-based rules.
   * Converts per-part AI scores (0-5) into levels (1-9) and scaled scores (0-200).
   */
  private calculateToeicSwAttemptScores(
    sections: SectionResult[],
  ): AttemptScoreResult {
    const sectionScores: Record<string, ToeicSectionScore> = {};
    let totalScaled = 0;

    for (const s of sections) {
      const key = s.skill.toLowerCase();
      // Fallback: simple percentage-based scaling when part-level data is unavailable
      const percentage = s.writingScore ?? (s.total > 0 ? (s.correct / s.total) * 100 : 0);
      const scaled = Math.round((percentage / 100) * 200);
      sectionScores[key] = { correct: s.correct, total: s.total, scaled };
      totalScaled += scaled;
    }

    return {
      bandScore: null,
      scaledScore: totalScaled,
      sectionScores,
    };
  }

  /**
   * Convert a 0-100 AI score to a 0-5 TOEIC SW scale.
   */
  static aiScoreTo5Scale(score: number): number {
    if (score <= 0) return 0;
    if (score >= 90) return 5;
    if (score >= 70) return 4;
    if (score >= 50) return 3;
    if (score >= 30) return 2;
    if (score >= 10) return 1;
    return 0;
  }

  /**
   * Calculate TOEIC Writing level and scaled score from per-part scores (0-5).
   */
  calculateToeicWritingLevel(parts: ToeicSwWritingParts): ToeicSwLevelResult {
    const { part1Scores, part2Scores, part3Score } = parts;

    // Handle empty/no-answer case
    if (part1Scores.length === 0 && part2Scores.length === 0 && part3Score === 0) {
      return { level: 1, scaledScore: 0, reason: 'No answers provided' };
    }

    const p3 = part3Score;
    const p2 = part2Scores.sort((a, b) => b - a); // descending
    const p1 = part1Scores;

    // Helper functions
    const mostly = (scores: number[], val: number) =>
      scores.length > 0 && scores.filter(s => s === val).length > scores.length / 2;
    const almostAll = (scores: number[], val: number) =>
      scores.length > 0 && scores.filter(s => s === val).length >= scores.length * 0.8;
    const allAre = (scores: number[], val: number) =>
      scores.length > 0 && scores.every(s => s === val);
    const mixOf = (scores: number[], a: number, b: number) =>
      scores.length > 0 &&
      scores.every(s => s === a || s === b) &&
      scores.some(s => s === a) &&
      scores.some(s => s === b);
    const mostlyOrHigher = (scores: number[], val: number) =>
      scores.length > 0 && scores.filter(s => s >= val).length > scores.length / 2;
    const p2Matches = (...pairs: [number, number][]) =>
      p2.length >= 2 && pairs.some(([a, b]) => p2[0] >= a && p2[1] >= b);

    // Level 9: Part3=5, Part2=(4,4)|(4,3), Part1=all or almost all 3
    if (p3 >= 5 && p2Matches([4, 3]) && (allAre(p1, 3) || almostAll(p1, 3))) {
      return { level: 9, scaledScore: 200, reason: 'Top level: Part3=5, Part2≥(4,3), Part1≈all 3' };
    }

    // Level 8: Part3=4, Part2=(4,4)|(4,3), Part1=almost all 3
    if (p3 >= 4 && p2Matches([4, 3]) && almostAll(p1, 3)) {
      const score = p2[0] >= 4 && p2[1] >= 4 ? 190 : 170;
      return { level: 8, scaledScore: score, reason: `Part3=4, Part2=(${p2[0]},${p2[1]}), Part1≈all 3` };
    }

    // Level 7: Part3=3|4, Part2=(4,4)|(4,3)|(3,3), Part1=mostly 2
    if (p3 >= 3 && p2Matches([3, 3]) && mostlyOrHigher(p1, 2)) {
      const score = p3 >= 4 ? 160 : p2Matches([4, 3]) ? 150 : 140;
      return { level: 7, scaledScore: score, reason: `Part3=${p3}, Part2=(${p2[0]},${p2[1]}), Part1 mostly≥2` };
    }

    // Level 6: Part3=3, Part2=(3,2)|(2,2), Part1=mostly 2
    if (p3 >= 3 && p2Matches([2, 2]) && mostly(p1, 2)) {
      const score = p2Matches([3, 2]) ? 130 : 110;
      return { level: 6, scaledScore: score, reason: `Part3=3, Part2=(${p2[0]},${p2[1]}), Part1 mostly 2` };
    }

    // Level 5: Part3=2, Part2=(3,2)|(2,2), Part1=mostly 2
    if (p3 >= 2 && p2Matches([2, 2]) && mostly(p1, 2)) {
      const score = p2Matches([3, 2]) ? 100 : 90;
      return { level: 5, scaledScore: score, reason: `Part3=2, Part2=(${p2[0]},${p2[1]}), Part1 mostly 2` };
    }

    // Level 4: Part3=2, Part2=(2,1)|(1,1), Part1=mix of 1 and 2
    if (p3 >= 2 && (mixOf(p1, 1, 2) || mostlyOrHigher(p1, 1))) {
      const score = mixOf(p1, 1, 2) ? 80 : 70;
      return { level: 4, scaledScore: score, reason: `Part3=2, Part1 mix of 1&2` };
    }

    // Level 3: Part3=1, Part2=(2,1)|(1,1), Part1=most are 1
    if (p3 >= 1 && mostly(p1, 1)) {
      const score = p2.length >= 2 && p2[0] >= 2 ? 60 : 50;
      return { level: 3, scaledScore: score, reason: `Part3=1, Part1 mostly 1` };
    }

    // Level 2: Part3=1, Part2=(2,1)|(1,1), Part1=mostly 1
    if (p3 >= 1) {
      return { level: 2, scaledScore: 40, reason: `Part3=1, low Part1/Part2 scores` };
    }

    // Level 1: Any part has no answer or completely wrong
    const score = part1Scores.some(s => s > 0) || part2Scores.some(s => s > 0) ? 30 : 0;
    return { level: 1, scaledScore: score, reason: 'Part3=0 or no valid answers' };
  }

  /**
   * Calculate TOEIC Speaking level and scaled score from per-part scores (0-5).
   */
  calculateToeicSpeakingLevel(parts: ToeicSwSpeakingParts): ToeicSwLevelResult {
    const { part12Scores, part34Scores, part5Score } = parts;

    // Handle empty/no-answer case
    if (part12Scores.length === 0 && part34Scores.length === 0 && part5Score === 0) {
      return { level: 1, scaledScore: 0, reason: 'No answers provided' };
    }

    const p5 = part5Score;
    const p34 = part34Scores;
    const p12 = part12Scores;

    // Helper functions
    const mostly = (scores: number[], val: number) =>
      scores.length > 0 && scores.filter(s => s === val).length > scores.length / 2;
    const almostAll = (scores: number[], val: number) =>
      scores.length > 0 && scores.filter(s => s >= val).length >= scores.length * 0.8;
    const allOrAlmostAll = (scores: number[], val: number) =>
      scores.length > 0 && scores.filter(s => s >= val).length >= scores.length * 0.8;
    const mixOf = (scores: number[], a: number, b: number) =>
      scores.length > 0 &&
      scores.every(s => s === a || s === b) &&
      scores.some(s => s === a) &&
      scores.some(s => s === b);
    const mostlyOrHigher = (scores: number[], val: number) =>
      scores.length > 0 && scores.filter(s => s >= val).length > scores.length / 2;
    const moreThanHalf = (scores: number[], val: number) =>
      scores.length > 0 && scores.filter(s => s >= val).length > scores.length / 2;
    const allGte = (scores: number[], val: number) =>
      scores.length > 0 && scores.every(s => s >= val);

    // Level 8 (190-200): Part5=5, Part3+4=all/almost all 3, Part1+2=all/almost all 3
    if (p5 >= 5 && allOrAlmostAll(p34, 3) && allOrAlmostAll(p12, 3)) {
      const score = p34.every(s => s >= 3) && p12.every(s => s >= 3) ? 200 : 190;
      return { level: 8, scaledScore: score, reason: `Part5=5, Part3+4≈all≥3, Part1+2≈all≥3` };
    }

    // Level 7 (160-180): Part5=4, Part3+4=more than half are 3, Part1+2=all/almost all 3
    if (p5 >= 4 && moreThanHalf(p34, 3) && allOrAlmostAll(p12, 3)) {
      const score = p34.filter(s => s >= 3).length === p34.length ? 180 : 160;
      return { level: 7, scaledScore: score, reason: `Part5=4, Part3+4 mostly≥3, Part1+2≈all≥3` };
    }

    // Level 6 (130-150): Part5=3, Part3+4=all≥2, Part1+2=mostly 3
    if (p5 >= 3 && allGte(p34, 2) && mostly(p12, 3)) {
      const score = p34.every(s => s >= 3) ? 150 : mostly(p12, 3) ? 140 : 130;
      return { level: 6, scaledScore: score, reason: `Part5=3, Part3+4 all≥2, Part1+2 mostly 3` };
    }

    // Level 5 (110-120): Part5=3, Part3+4=mostly 2 (some 1 or 3), Part1+2=mostly 2
    if (p5 >= 3 && mostlyOrHigher(p34, 2) && mostlyOrHigher(p12, 2)) {
      const score = p34.filter(s => s >= 3).length > 0 ? 120 : 110;
      return { level: 5, scaledScore: score, reason: `Part5=3, Part3+4 mostly≥2, Part1+2 mostly≥2` };
    }

    // Level 4 (80-100): Part5=2|3, Part3+4=mix of 1 and 2, Part1+2=mix of 1 and 2
    if (p5 >= 2 && mostlyOrHigher(p12, 1)) {
      const score = p5 >= 3 ? 100 : mostlyOrHigher(p34, 2) ? 90 : 80;
      return { level: 4, scaledScore: score, reason: `Part5=${p5}, Part3+4/Part1+2 mix of 1&2` };
    }

    // Level 3 (60-70): Part5=2, Part3+4=mostly 1, Part1+2=mix of 1 and 2
    if (p5 >= 2 && mostlyOrHigher(p12, 1)) {
      const score = mixOf(p12, 1, 2) ? 70 : 60;
      return { level: 3, scaledScore: score, reason: `Part5=2, Part3+4 mostly 1, Part1+2 mix` };
    }

    // Level 2 (40-50): Part5=1|2, Part3+4=mostly 1 or no answer, Part1+2=mostly 1
    if (p5 >= 1) {
      const score = p5 >= 2 ? 50 : 40;
      return { level: 2, scaledScore: score, reason: `Part5=${p5}, low Part3+4/Part1+2 scores` };
    }

    // Level 1 (0-30): No answer or wrong answer in all parts
    const score = p12.some(s => s > 0) || p34.some(s => s > 0) ? 30 : 0;
    return { level: 1, scaledScore: score, reason: 'No valid answers or all wrong' };
  }

  /**
   * Calculate TOEIC SW scores using level-based scoring from per-part data.
   */
  calculateToeicSwFromParts(
    writingParts: ToeicSwWritingParts | null,
    speakingParts: ToeicSwSpeakingParts | null,
  ): AttemptScoreResult {
    const sectionScores: Record<string, ToeicSectionScore & { level?: number; reason?: string }> = {};
    let totalScaled = 0;

    if (writingParts) {
      const result = this.calculateToeicWritingLevel(writingParts);
      const total = writingParts.part1Scores.length + writingParts.part2Scores.length + (writingParts.part3Score >= 0 ? 1 : 0);
      sectionScores['writing'] = {
        correct: 0,
        total,
        scaled: result.scaledScore,
        level: result.level,
        reason: result.reason,
      };
      totalScaled += result.scaledScore;
    }

    if (speakingParts) {
      const result = this.calculateToeicSpeakingLevel(speakingParts);
      const total = speakingParts.part12Scores.length + speakingParts.part34Scores.length + (speakingParts.part5Score >= 0 ? 1 : 0);
      sectionScores['speaking'] = {
        correct: 0,
        total,
        scaled: result.scaledScore,
        level: result.level,
        reason: result.reason,
      };
      totalScaled += result.scaledScore;
    }

    return {
      bandScore: null,
      scaledScore: totalScaled,
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
