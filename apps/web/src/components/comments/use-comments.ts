import {
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CommentsResponse } from './types';

// ─── Queries ──────────────────────────────────────────────

export function useComments(
  testId: string,
  sort: 'newest' | 'oldest' = 'newest',
  enabled = true,
) {
  return useInfiniteQuery<CommentsResponse>({
    queryKey: ['comments', testId, sort],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get(`/tests/${testId}/comments`, {
        params: { page: pageParam, limit: 10, sort },
      });
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil(lastPage.total / lastPage.limit);
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
    },
    refetchInterval: 30000,
    enabled,
  });
}

export function useBlogComments(
  slug: string,
  sort: 'newest' | 'oldest' = 'newest',
  enabled = true,
) {
  return useInfiniteQuery<CommentsResponse>({
    queryKey: ['blog-comments', slug, sort],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get(`/blog/${slug}/comments`, {
        params: { page: pageParam, limit: 10, sort },
      });
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil(lastPage.total / lastPage.limit);
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
    },
    refetchInterval: 30000,
    enabled,
  });
}

export function useReplies(commentId: string, enabled: boolean) {
  return useInfiniteQuery<CommentsResponse>({
    queryKey: ['replies', commentId],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get(`/comments/${commentId}/replies`, {
        params: { page: pageParam, limit: 10 },
      });
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil(lastPage.total / lastPage.limit);
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
    },
    enabled,
  });
}

// ─── Mutations ────────────────────────────────────────────

export function useCreateComment(testId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { body: string; parentId?: string }) => {
      const { data } = await api.post(`/tests/${testId}/comments`, params);
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['comments', testId] });
      if (variables.parentId) {
        qc.invalidateQueries({ queryKey: ['replies', variables.parentId] });
      }
    },
  });
}

export function useCreateBlogComment(slug: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { body: string; parentId?: string }) => {
      const { data } = await api.post(`/blog/${slug}/comments`, params);
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['blog-comments', slug] });
      if (variables.parentId) {
        qc.invalidateQueries({ queryKey: ['replies', variables.parentId] });
      }
    },
  });
}

export function useUpdateComment(invalidateKey: string[]) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { commentId: string; body: string }) => {
      const { data } = await api.patch(`/comments/${params.commentId}`, {
        body: params.body,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidateKey });
    },
  });
}

export function useDeleteComment(invalidateKey: string[]) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (commentId: string) => {
      await api.delete(`/comments/${commentId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidateKey });
    },
  });
}

export function useLikeComment(invalidateKey: string[]) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { commentId: string; liked: boolean }) => {
      if (params.liked) {
        await api.delete(`/comments/${params.commentId}/like`);
      } else {
        await api.post(`/comments/${params.commentId}/like`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidateKey });
    },
  });
}

export function useReportComment(invalidateKey: string[]) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: { commentId: string; reason: string }) => {
      await api.post(`/comments/${params.commentId}/report`, {
        reason: params.reason,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidateKey });
    },
  });
}
