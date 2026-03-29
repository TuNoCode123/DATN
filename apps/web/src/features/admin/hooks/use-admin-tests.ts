import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminTestsApi,
  adminSectionsApi,
  adminPassagesApi,
  adminGroupsApi,
  adminQuestionsApi,
} from '@/lib/admin-api';
import type { ExamType, SectionSkill } from '../types';

interface TestFilters {
  search?: string;
  examType?: string;
}

export function useAdminTests(filters?: TestFilters) {
  return useQuery({
    queryKey: ['admin-tests', filters],
    queryFn: () =>
      adminTestsApi.getAll({
        search: filters?.search,
        examType: filters?.examType as ExamType | undefined,
      }),
  });
}

export function useAdminTest(id: string) {
  return useQuery({
    queryKey: ['admin-test', id],
    queryFn: () => adminTestsApi.getById(id),
    enabled: !!id && id !== 'new',
  });
}

export function useCreateTest() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: Record<string, any>) => adminTestsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tests'] }),
  });
}

export function useCreateFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { examType: ExamType; skill?: SectionSkill }) =>
      adminTestsApi.createFromTemplate(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tests'] }),
  });
}

export function useUpdateTest() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: { id: string; payload: Record<string, any> }) =>
      adminTestsApi.update(data.id, data.payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-tests'] });
      qc.invalidateQueries({ queryKey: ['admin-test', vars.id] });
    },
  });
}

export function useSyncTest() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: { id: string; payload: Record<string, any> }) =>
      adminTestsApi.sync(data.id, data.payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-tests'] });
      qc.invalidateQueries({ queryKey: ['admin-test', vars.id] });
      qc.invalidateQueries({ queryKey: ['admin-test-validate', vars.id] });
    },
  });
}

export function useUpdateTestMetadata() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: { id: string; payload: Record<string, any> }) =>
      adminTestsApi.updateMetadata(data.id, data.payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-tests'] });
      qc.invalidateQueries({ queryKey: ['admin-test', vars.id] });
    },
  });
}

export function useDeleteTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminTestsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tests'] }),
  });
}

export function useToggleTestPublish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminTestsApi.togglePublish(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tests'] }),
  });
}

export function useDuplicateTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminTestsApi.duplicate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tests'] }),
  });
}

export function useValidateTest(id: string) {
  return useQuery({
    queryKey: ['admin-test-validate', id],
    queryFn: () => adminTestsApi.validate(id),
    enabled: !!id && id !== 'new',
  });
}

export function useAddMissingSections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (testId: string) => adminTestsApi.addMissingSections(testId),
    onSuccess: (_, testId) => {
      qc.invalidateQueries({ queryKey: ['admin-test', testId] });
      qc.invalidateQueries({ queryKey: ['admin-test-validate', testId] });
    },
  });
}

// ── Section mutations ───────────────────────────────────

export function useCreateSection() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: { testId: string; payload: Record<string, any> }) =>
      adminSectionsApi.create(data.testId, data.payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-test', vars.testId] });
    },
  });
}

export function useUpdateSection() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: { testId: string; id: string; payload: Record<string, any> }) =>
      adminSectionsApi.update(data.testId, data.id, data.payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-test', vars.testId] });
    },
  });
}

export function useDeleteSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { testId: string; id: string }) =>
      adminSectionsApi.delete(data.testId, data.id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-test', vars.testId] });
    },
  });
}

// ── Passage mutations ───────────────────────────────────

export function useCreatePassage() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: { sectionId: string; testId: string; payload: Record<string, any> }) =>
      adminPassagesApi.create(data.sectionId, data.payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-test', vars.testId] });
    },
  });
}

export function useUpdatePassage() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: { id: string; testId: string; payload: Record<string, any> }) =>
      adminPassagesApi.update(data.id, data.payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-test', vars.testId] });
    },
  });
}

// ── Group mutations ─────────────────────────────────────

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: { sectionId: string; testId: string; payload: Record<string, any> }) =>
      adminGroupsApi.create(data.sectionId, data.payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-test', vars.testId] });
    },
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: { id: string; testId: string; payload: Record<string, any> }) =>
      adminGroupsApi.update(data.id, data.payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-test', vars.testId] });
    },
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; testId: string }) =>
      adminGroupsApi.delete(data.id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-test', vars.testId] });
    },
  });
}

// ── Question mutations ──────────────────────────────────

export function useCreateQuestions() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: { groupId: string; testId: string; questions: Record<string, any>[] }) =>
      adminQuestionsApi.create(data.groupId, data.questions),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-test', vars.testId] });
    },
  });
}

export function useUpdateQuestion() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (data: { id: string; testId: string; payload: Record<string, any> }) =>
      adminQuestionsApi.update(data.id, data.payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-test', vars.testId] });
    },
  });
}

export function useDeleteQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; testId: string }) =>
      adminQuestionsApi.delete(data.id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-test', vars.testId] });
    },
  });
}

export function useRenumberQuestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (testId: string) => adminQuestionsApi.renumber(testId),
    onSuccess: (_, testId) => {
      qc.invalidateQueries({ queryKey: ['admin-test', testId] });
    },
  });
}
