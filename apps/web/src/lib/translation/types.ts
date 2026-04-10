export interface SentencePair {
  vietnamese: string;
  english: string;
}

export interface ScoreItem {
  score: number;
  status: 'master' | 'good' | 'fair' | 'poor';
}

export interface ErrorCorrection {
  wrong: string;
  correct: string;
  explanation: string;
}

export interface TranslationFeedback {
  corrections: ErrorCorrection[];
  tips: string[];
  summary: string;
}

export interface TranslationAssessment {
  accuracy: ScoreItem;
  grammar: ScoreItem;
  vocabulary: ScoreItem;
  naturalness: ScoreItem;
  overall: ScoreItem;
  suggestedTranslation: string;
  feedback: TranslationFeedback | string;
}

export interface TranslationSession {
  id: string;
  userId: string;
  topicId: string;
  topicName: string;
  difficulty: string;
  sentencePairs: SentencePair[];
  avgScore: number | null;
  totalDone: number;
  createdAt: string;
  updatedAt: string;
  _count?: { results: number };
}

export interface TranslationResult {
  id: string;
  sessionId: string;
  sentenceIndex: number;
  vietnameseSentence: string;
  referenceEnglish: string;
  userTranslation: string;
  overallScore: number;
  accuracyScore: number;
  grammarScore: number;
  vocabularyScore: number;
  naturalnessScore: number;
  suggestedTranslation: string | null;
  feedback: string;
  assessment: TranslationAssessment;
  createdAt: string;
}

export interface TranslationSessionDetail extends TranslationSession {
  results: TranslationResult[];
}
