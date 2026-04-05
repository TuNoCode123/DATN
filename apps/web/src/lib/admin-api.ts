import { api } from './api';
import type {
  ExamType,
  SectionSkill,
  QuestionType,
  AttemptStatus,
  UserRole,
} from '../features/admin/types';

// ── Users ──────────────────────────────────────────────

export interface AdminUsersParams {
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export const adminUsersApi = {
  getAll: (params?: AdminUsersParams) =>
    api.get('/admin/users', { params }).then((r) => r.data),
  getById: (id: string) =>
    api.get(`/admin/users/${id}`).then((r) => r.data),
  update: (id: string, data: { displayName?: string; role?: UserRole }) =>
    api.patch(`/admin/users/${id}`, data).then((r) => r.data),
  toggleStatus: (id: string) =>
    api.patch(`/admin/users/${id}/toggle-status`).then((r) => r.data),
};

// ── Tags ───────────────────────────────────────────────

export const adminTagsApi = {
  getAll: () => api.get('/admin/tags').then((r) => r.data),
  create: (data: { name: string }) =>
    api.post('/admin/tags', data).then((r) => r.data),
  update: (id: string, data: { name: string }) =>
    api.patch(`/admin/tags/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    api.delete(`/admin/tags/${id}`).then((r) => r.data),
};

// ── Tests ──────────────────────────────────────────────

export interface AdminTestsParams {
  examType?: ExamType;
  isPublished?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export const adminTestsApi = {
  getAll: (params?: AdminTestsParams) =>
    api.get('/admin/tests', { params }).then((r) => r.data),
  getById: (id: string) =>
    api.get(`/admin/tests/${id}`).then((r) => r.data),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create: (data: Record<string, any>) =>
    api.post('/admin/tests', data).then((r) => r.data),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (id: string, data: Record<string, any>) =>
    api.put(`/admin/tests/${id}`, data).then((r) => r.data),
  updateMetadata: (id: string, data: {
    title?: string;
    examType?: ExamType;
    durationMins?: number;
    description?: string;
    tagIds?: string[];
  }) =>
    api.patch(`/admin/tests/${id}`, data).then((r) => r.data),
  togglePublish: (id: string) =>
    api.patch(`/admin/tests/${id}/publish`).then((r) => r.data),
  duplicate: (id: string) =>
    api.post(`/admin/tests/${id}/duplicate`).then((r) => r.data),
  recount: (id: string) =>
    api.post(`/admin/tests/${id}/recount`).then((r) => r.data),
  createFromTemplate: (data: { examType: ExamType; skill?: SectionSkill }) =>
    api.post('/admin/tests/from-template', data).then((r) => r.data),
  validate: (id: string) =>
    api.get(`/admin/tests/${id}/validate`).then((r) => r.data),
  addMissingSections: (id: string) =>
    api.post(`/admin/tests/${id}/add-missing-sections`).then((r) => r.data),
  delete: (id: string) =>
    api.delete(`/admin/tests/${id}`).then((r) => r.data),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sync: (id: string, data: Record<string, any>) =>
    api.put(`/admin/tests/${id}/sync`, data).then((r) => r.data),
};

// ── Sections ──────────────────────────────────────────

export const adminSectionsApi = {
  create: (testId: string, data: {
    title: string;
    skill: SectionSkill;
    instructions?: string;
    audioUrl?: string;
    durationMins?: number;
  }) =>
    api.post(`/admin/tests/${testId}/sections`, data).then((r) => r.data),
  get: (testId: string, id: string) =>
    api.get(`/admin/tests/${testId}/sections/${id}`).then((r) => r.data),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (testId: string, id: string, data: Record<string, any>) =>
    api.patch(`/admin/tests/${testId}/sections/${id}`, data).then((r) => r.data),
  delete: (testId: string, id: string) =>
    api.delete(`/admin/tests/${testId}/sections/${id}`).then((r) => r.data),
  reorder: (testId: string, order: string[]) =>
    api.post(`/admin/tests/${testId}/sections/reorder`, { order }).then((r) => r.data),
};

// ── Passages ──────────────────────────────────────────

export const adminPassagesApi = {
  create: (sectionId: string, data: { title?: string; contentHtml: string }) =>
    api.post(`/admin/sections/${sectionId}/passages`, data).then((r) => r.data),
  update: (id: string, data: { title?: string; contentHtml?: string }) =>
    api.patch(`/admin/passages/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    api.delete(`/admin/passages/${id}`).then((r) => r.data),
};

// ── Question Groups ───────────────────────────────────

export const adminGroupsApi = {
  create: (sectionId: string, data: {
    questionType: QuestionType;
    instructions?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    matchingOptions?: any;
    audioUrl?: string;
    imageUrl?: string;
  }) =>
    api.post(`/admin/sections/${sectionId}/groups`, data).then((r) => r.data),
  get: (id: string) =>
    api.get(`/admin/groups/${id}`).then((r) => r.data),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (id: string, data: Record<string, any>) =>
    api.patch(`/admin/groups/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    api.delete(`/admin/groups/${id}`).then((r) => r.data),
  reorder: (sectionId: string, order: string[]) =>
    api.post(`/admin/sections/${sectionId}/groups/reorder`, { order }).then((r) => r.data),
};

// ── Questions ─────────────────────────────────────────

export const adminQuestionsApi = {
  // Question bank (read-only list)
  getAll: (params?: {
    skill?: SectionSkill;
    questionType?: QuestionType;
    examType?: ExamType;
    search?: string;
    page?: number;
    limit?: number;
  }) =>
    api.get('/admin/questions', { params }).then((r) => r.data),

  // CRUD
  create: (groupId: string, questions: {
    stem?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options?: any;
    correctAnswer: string;
    explanation?: string;
    imageUrl?: string;
    audioUrl?: string;
  }[]) =>
    api.post(`/admin/groups/${groupId}/questions`, { questions }).then((r) => r.data),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (id: string, data: Record<string, any>) =>
    api.patch(`/admin/questions/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    api.delete(`/admin/questions/${id}`).then((r) => r.data),
  bulkDelete: (ids: string[]) =>
    api.post('/admin/questions/bulk-delete', { ids }).then((r) => r.data),
  reorder: (groupId: string, order: string[]) =>
    api.post(`/admin/groups/${groupId}/questions/reorder`, { order }).then((r) => r.data),
  renumber: (testId: string) =>
    api.post(`/admin/tests/${testId}/renumber`).then((r) => r.data),
};

// ── Results ────────────────────────────────────────────

export interface AdminResultsParams {
  testId?: string;
  userId?: string;
  status?: AttemptStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export const adminResultsApi = {
  getAll: (params?: AdminResultsParams) =>
    api.get('/admin/results', { params }).then((r) => r.data),
  getById: (id: string) =>
    api.get(`/admin/results/${id}`).then((r) => r.data),
};

// ── Upload ────────────────────────────────────────────

export const adminUploadApi = {
  presign: (fileName: string, contentType: string) =>
    api
      .post<{ uploadUrl: string; fileUrl: string; key: string; maxSizeMB: number }>(
        '/admin/upload/presign',
        { fileName, contentType },
      )
      .then((r) => r.data),
  delete: (key: string) =>
    api.delete(`/admin/upload/${key}`).then((r) => r.data),
};

// ── Analytics ──────────────────────────────────────────

export const adminAnalyticsApi = {
  getStats: () =>
    api.get('/admin/analytics/stats').then((r) => r.data),
  getUserGrowth: () =>
    api.get('/admin/analytics/user-growth').then((r) => r.data),
  getTestActivity: () =>
    api.get('/admin/analytics/test-activity').then((r) => r.data),
  getScoreDistribution: () =>
    api.get('/admin/analytics/score-distribution').then((r) => r.data),
  getRecentActivity: () =>
    api.get('/admin/analytics/recent-activity').then((r) => r.data),
};

// ── Pronunciation Topics ──────────────────────────────

export const adminPronunciationTopicsApi = {
  getAll: (params?: {
    search?: string;
    difficulty?: string;
    isPublished?: boolean;
    page?: number;
    limit?: number;
  }) =>
    api.get('/admin/pronunciation-topics', { params }).then((r) => r.data),
  getById: (id: string) =>
    api.get(`/admin/pronunciation-topics/${id}`).then((r) => r.data),
  create: (data: {
    name: string;
    description?: string;
    difficulty?: string;
    tags?: string[];
    isPublished?: boolean;
  }) => api.post('/admin/pronunciation-topics', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/admin/pronunciation-topics/${id}`, data).then((r) => r.data),
  togglePublish: (id: string) =>
    api
      .patch(`/admin/pronunciation-topics/${id}/publish`)
      .then((r) => r.data),
  delete: (id: string) =>
    api.delete(`/admin/pronunciation-topics/${id}`).then((r) => r.data),
};

// ── Credits (Admin) ───────────────────────────────────

export const adminCreditsApi = {
  getAll: (params?: { search?: string; page?: number; limit?: number }) =>
    api.get('/admin/credits', { params }).then((r) => r.data),
  getTransactions: (
    userId: string,
    params?: { page?: number; limit?: number },
  ) =>
    api
      .get(`/admin/credits/${userId}/transactions`, { params })
      .then((r) => r.data),
  grant: (userId: string, amount: number) =>
    api.post(`/admin/credits/${userId}/grant`, { amount }).then((r) => r.data),
  deduct: (userId: string, amount: number) =>
    api
      .post(`/admin/credits/${userId}/deduct`, { amount })
      .then((r) => r.data),
};
