/** A single word item from AWS Transcribe partial/final result */
export interface TranscribeWord {
  content: string;
  startTime: number;
  endTime: number;
  confidence: number;
  type: 'pronunciation' | 'punctuation';
}

/** A snapshot of one partial result from Transcribe */
export interface PartialSnapshot {
  resultId: string;
  timestamp: number;
  isPartial: boolean;
  transcript: string;
  words: TranscribeWord[];
  snapshotIndex: number;
}

/** Tracks a single word's evolution across partial results */
export interface TokenEvolution {
  token: string;
  positionIndex: number;
  firstSeenAt: number;
  lastSeenAt: number;
  stableSince: number | null;
  isStable: boolean;
  consecutiveCount: number;
  confidence: number;
  startTime: number;
  endTime: number;
  variants: string[];
  wasAutoCorrected: boolean;
}

/** Per-word scoring result */
export interface WordScore {
  word: string;
  targetWord: string | null;
  status: 'correct' | 'warning' | 'incorrect' | 'missing' | 'extra';
  confidence: number;
  startTime: number;
  endTime: number;
  pauseBefore: number;
  wasAutoCorrected: boolean;
  details: string;
}

/** Final assessment output */
export interface SpeakingAssessment {
  wordScores: WordScore[];
  pronunciationScore: number;
  fluencyScore: number;
  completenessScore: number;
  overallScore: number;
  spokenSentence: string;
  targetSentence: string;
  finalTranscript: string;
  totalDuration: number;
  pauseCount: number;
  totalPauseTime: number;
  autoCorrectionCount: number;
}

/** Word alignment pair */
export interface AlignedPair {
  spoken: string | null;
  target: string | null;
  type: 'match' | 'missing' | 'extra';
}
