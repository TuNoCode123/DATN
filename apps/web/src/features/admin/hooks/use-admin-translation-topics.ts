'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface TopicFilters {
  search?: string;
  difficulty?: string;
  isPublished?: boolean;
  page?: number;
  limit?: number;
}

export function useAdminTranslationTopics(filters: TopicFilters = {}) {
  return useQuery({
    queryKey: ['admin-translation-topics', filters],
    queryFn: () =>
      api
        .get('/admin/translation-topics', { params: filters })
        .then((r) => r.data),
  });
}

export function useCreateTranslationTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      difficulty?: string;
      tags?: string[];
      isPublished?: boolean;
    }) => api.post('/admin/translation-topics', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-translation-topics'] }),
  });
}

export function useUpdateTranslationTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      api.patch(`/admin/translation-topics/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-translation-topics'] }),
  });
}

export function useToggleTranslationTopicPublish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.patch(`/admin/translation-topics/${id}/publish`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-translation-topics'] }),
  });
}

export function useDeleteTranslationTopic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/admin/translation-topics/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-translation-topics'] }),
  });
}
