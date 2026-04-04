// ── Enums matching Prisma schema ────────────────────────

export type UserRole = 'ADMIN' | 'STUDENT';

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

export type SectionSkill = 'LISTENING' | 'READING' | 'WRITING' | 'SPEAKING';

export type QuestionType =
  | 'MULTIPLE_CHOICE'
  | 'TRUE_FALSE_NOT_GIVEN'
  | 'YES_NO_NOT_GIVEN'
  | 'MATCHING_HEADINGS'
  | 'MATCHING_INFORMATION'
  | 'MATCHING_FEATURES'
  | 'MATCHING_SENTENCE_ENDINGS'
  | 'SENTENCE_COMPLETION'
  | 'SUMMARY_COMPLETION'
  | 'NOTE_COMPLETION'
  | 'TABLE_COMPLETION'
  | 'FORM_COMPLETION'
  | 'SHORT_ANSWER'
  | 'LABELLING'
  | 'READ_ALOUD'
  | 'DESCRIBE_PICTURE'
  | 'RESPOND_TO_QUESTIONS'
  | 'PROPOSE_SOLUTION'
  | 'EXPRESS_OPINION'
  | 'WRITE_SENTENCES'
  | 'RESPOND_WRITTEN_REQUEST'
  | 'WRITE_OPINION_ESSAY'
  | 'SENTENCE_REORDER'
  | 'KEYWORD_COMPOSITION'
  | 'PICTURE_COMPOSITION';

export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED';

export type AttemptMode = 'PRACTICE' | 'FULL_TEST';

// ── Users ───────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { attempts: number; comments?: number };
}

// ── Tags ────────────────────────────────────────────────

export interface AdminTag {
  id: string;
  name: string;
  slug: string;
  _count?: { tests: number };
}

// ── Tests (hierarchical) ────────────────────────────────

export interface AdminPassage {
  id: string;
  sectionId: string;
  title: string | null;
  contentHtml: string;
  imageUrl: string | null;
  audioUrl: string | null;
  imageLayout: string | null;
  orderIndex: number;
}

export interface AdminQuestion {
  id: string;
  groupId: string;
  questionNumber: number;
  orderIndex: number;
  stem: string | null;
  options: { label: string; text: string }[] | null;
  correctAnswer: string;
  explanation: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  imageLayout: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AdminQuestionGroup {
  id: string;
  sectionId: string;
  passageId: string | null;
  questionType: QuestionType;
  orderIndex: number;
  instructions: string | null;
  matchingOptions: { label: string; text: string }[] | null;
  audioUrl: string | null;
  imageUrl: string | null;
  questions: AdminQuestion[];
}

export interface AdminTestSection {
  id: string;
  testId: string;
  title: string;
  skill: SectionSkill;
  orderIndex: number;
  instructions: string | null;
  audioUrl: string | null;
  durationMins: number | null;
  questionCount: number;
  passages: AdminPassage[];
  questionGroups: AdminQuestionGroup[];
}

export interface AdminTest {
  id: string;
  title: string;
  examType: ExamType;
  durationMins: number;
  isPublished: boolean;
  description: string | null;
  sectionCount: number;
  questionCount: number;
  attemptCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  sections?: AdminTestSection[];
  tags?: { testId: string; tagId: string; tag: AdminTag }[];
  _count?: { attempts: number };
  hasAttempts?: boolean;
}

// ── Question Bank (flat view with context) ──────────────

export interface AdminQuestionBankItem {
  id: string;
  questionNumber: number;
  stem: string | null;
  options: { label: string; text: string }[] | null;
  correctAnswer: string;
  explanation: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  group: {
    id: string;
    questionType: QuestionType;
    section: {
      id: string;
      title: string;
      skill: SectionSkill;
      test: {
        id: string;
        title: string;
        examType: ExamType;
      };
    };
  };
}

// ── Results ─────────────────────────────────────────────

export interface AdminResult {
  id: string;
  userId: string;
  testId: string;
  mode: AttemptMode;
  status: AttemptStatus;
  timeLimitMins: number | null;
  startedAt: string;
  submittedAt: string | null;
  totalQuestions: number | null;
  correctCount: number | null;
  scorePercent: number | null;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  test: {
    id: string;
    title: string;
    examType: ExamType;
  };
}

export interface AdminResultDetail extends AdminResult {
  answers: {
    id: string;
    answerText: string | null;
    isCorrect: boolean | null;
    question: {
      id: string;
      questionNumber: number;
      stem: string | null;
      correctAnswer: string;
      options: { label: string; text: string }[] | null;
      group: {
        questionType: QuestionType;
        section: { title: string; skill: SectionSkill };
      };
    };
  }[];
}

// ── Analytics ───────────────────────────────────────────

export interface DashboardStats {
  totalUsers: number;
  totalTests: number;
  publishedTests: number;
  totalAttempts: number;
  avgScore: number;
}

export interface ActivityItem {
  type: 'USER_REGISTERED' | 'TEST_SUBMITTED';
  description: string;
  timestamp: string;
}

export interface ChartDataPoint {
  label: string;
  value: number;
}

// ── Validation ──────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  totalQuestions: number;
  sectionCount: number;
  warnings: string[];
}

// ── Paginated response ──────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
