export type ExamType =
  | "IELTS_ACADEMIC"
  | "IELTS_GENERAL"
  | "TOEIC_LR"
  | "TOEIC_SW"
  | "TOEIC_SPEAKING"
  | "TOEIC_WRITING"
  | "HSK_1"
  | "HSK_2"
  | "HSK_3"
  | "HSK_4"
  | "HSK_5"
  | "HSK_6";

export type ScoreField = "bandScore" | "scaledScore" | "scorePercent";

export interface ExamScoreFormat {
  field: ScoreField;
  min: number;
  max: number;
  step: number;
  label: string;
  unit: string;
}

const IELTS: ExamScoreFormat = { field: "bandScore", min: 0, max: 9, step: 0.5, label: "Band", unit: "" };
const TOEIC_LR: ExamScoreFormat = { field: "scaledScore", min: 10, max: 990, step: 5, label: "Score", unit: "" };
const TOEIC_SW: ExamScoreFormat = { field: "scaledScore", min: 0, max: 200, step: 10, label: "Score", unit: "" };
const TOEIC_SINGLE: ExamScoreFormat = { field: "scaledScore", min: 0, max: 200, step: 10, label: "Score", unit: "" };
const HSK: ExamScoreFormat = { field: "scorePercent", min: 0, max: 100, step: 1, label: "Score", unit: "%" };

export function getScoreFormat(examType: ExamType): ExamScoreFormat {
  switch (examType) {
    case "IELTS_ACADEMIC":
    case "IELTS_GENERAL":
      return IELTS;
    case "TOEIC_LR":
      return TOEIC_LR;
    case "TOEIC_SW":
      return TOEIC_SW;
    case "TOEIC_SPEAKING":
    case "TOEIC_WRITING":
      return TOEIC_SINGLE;
    case "HSK_1":
    case "HSK_2":
    case "HSK_3":
    case "HSK_4":
    case "HSK_5":
    case "HSK_6":
      return HSK;
  }
}

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  IELTS_ACADEMIC: "IELTS Academic",
  IELTS_GENERAL: "IELTS General",
  TOEIC_LR: "TOEIC Listening & Reading",
  TOEIC_SW: "TOEIC Speaking & Writing",
  TOEIC_SPEAKING: "TOEIC Speaking",
  TOEIC_WRITING: "TOEIC Writing",
  HSK_1: "HSK 1",
  HSK_2: "HSK 2",
  HSK_3: "HSK 3",
  HSK_4: "HSK 4",
  HSK_5: "HSK 5",
  HSK_6: "HSK 6",
};

export const EXAM_TYPE_GROUPS: { label: string; options: ExamType[] }[] = [
  { label: "IELTS", options: ["IELTS_ACADEMIC", "IELTS_GENERAL"] },
  { label: "TOEIC", options: ["TOEIC_LR", "TOEIC_SW", "TOEIC_SPEAKING", "TOEIC_WRITING"] },
  { label: "HSK", options: ["HSK_1", "HSK_2", "HSK_3", "HSK_4", "HSK_5", "HSK_6"] },
];

export function formatScore(examType: ExamType, value: number | null | undefined): string {
  if (value == null) return "—";
  const fmt = getScoreFormat(examType);
  if (fmt.step < 1) return `${value.toFixed(1)}${fmt.unit}`;
  return `${Math.round(value)}${fmt.unit}`;
}
