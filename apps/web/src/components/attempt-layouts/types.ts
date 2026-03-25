export interface QuestionFromAPI {
  id: string;
  questionNumber: number;
  orderIndex: number;
  stem: string | null;
  options: unknown;
  imageUrl?: string | null;
  audioUrl?: string | null;
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
  questions: QuestionFromAPI[];
}

export interface PassageFromAPI {
  id: string;
  title: string | null;
  contentHtml: string;
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
}
