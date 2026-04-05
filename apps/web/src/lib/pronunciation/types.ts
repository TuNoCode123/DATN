export interface TranscribeItem {
  content: string;
  confidence: number;
  startTime: number;
  endTime: number;
  type: 'pronunciation' | 'punctuation';
}

export interface ScoreItem {
  score: number;
  status: 'master' | 'good' | 'fair' | 'poor';
}

export interface WordComparison {
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

export type PronunciationPhase = 'idle' | 'listening' | 'assessing' | 'done';

export interface PronunciationSession {
  id: string;
  userId: string;
  topicId: string;
  topicName: string;
  difficulty: string;
  sentences: string[];
  avgScore: number | null;
  totalDone: number;
  createdAt: string;
  updatedAt: string;
  _count?: { results: number };
}

export interface PronunciationResult {
  id: string;
  sessionId: string;
  sentenceIndex: number;
  targetSentence: string;
  spokenText: string;
  overallScore: number;
  pronunciationScore: number;
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  feedback: string;
  assessment: PronunciationAssessment;
  createdAt: string;
}

export interface PronunciationSessionDetail extends PronunciationSession {
  results: PronunciationResult[];
}
