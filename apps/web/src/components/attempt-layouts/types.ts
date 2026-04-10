export interface QuestionFromAPI {
  id: string;
  questionNumber: number;
  orderIndex: number;
  stem: string | null;
  options: unknown;
  imageUrl?: string | null;
  audioUrl?: string | null;
  transcript?: string | null;
  imageLayout?: string | null;
  imageSize?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface QuestionGroupFromAPI {
  id: string;
  passageId: string | null;
  questionType: string;
  orderIndex: number;
  instructions: string | null;
  matchingOptions: unknown;
  audioUrl?: string | null;
  imageUrl?: string | null;
  imageSize?: string | null;
  questions: QuestionFromAPI[];
}

export interface PassageFromAPI {
  id: string;
  title: string | null;
  contentHtml: string;
  imageUrl?: string | null;
  audioUrl?: string | null;
  transcript?: string | null;
  imageLayout?: string | null;
  imageSize?: string | null;
  images?: Array<{ url: string; layout?: string; size?: string }> | null;
  orderIndex: number;
}

export interface SectionFromAPI {
  id: string;
  title: string;
  skill: string;
  orderIndex: number;
  questionCount: number;
  instructions?: string | null;
  audioUrl?: string | null;
  passages?: PassageFromAPI[];
  questionGroups: QuestionGroupFromAPI[];
}

export interface LayoutProps {
  section: SectionFromAPI;
  answers: Record<string, string>;
  onAnswer: (questionId: string, answer: string) => void;
  highlightEnabled?: boolean;
  attemptId?: string;
}
