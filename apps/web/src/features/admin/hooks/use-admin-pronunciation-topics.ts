import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminPronunciationTopicsApi } from '@/lib/admin-api';

interface TopicFilters {
  search?: string;
  difficulty?: string;
  isPublished?: boolean;
}

export function useAdminPronunciationTopics(filters?: TopicFilters) {
  return useQuery({
    queryKey: ['admin-pronunciation-topics', filters],
    queryFn: () => adminPronunciationTopicsApi.getAll(filters),
  });
}

export function useCreatePronunciationTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      difficulty?: string;
      tags?: string[];
      isPublished?: boolean;
    }) => adminPronunciationTopicsApi.create(data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin-pronunciation-topics'] }),
  });
}

export function useUpdatePronunciationTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; partial: Record<string, unknown> }) =>
      adminPronunciationTopicsApi.update(data.id, data.partial),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin-pronunciation-topics'] }),
  });
}

export function useTogglePronunciationTopicPublish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      adminPronunciationTopicsApi.togglePublish(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin-pronunciation-topics'] }),
  });
}

export function useDeletePronunciationTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminPronunciationTopicsApi.delete(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin-pronunciation-topics'] }),
  });
}
