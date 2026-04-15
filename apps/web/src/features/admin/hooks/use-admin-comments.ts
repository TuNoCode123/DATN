import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminCommentsApi } from '@/lib/admin-api';

export function useAdminCommentQueue(
  page = 1,
  limit = 20,
  filters?: { status?: string; search?: string },
) {
  return useQuery({
    queryKey: ['admin', 'comments', 'queue', page, limit, filters],
    queryFn: () =>
      adminCommentsApi.getQueue({
        page,
        limit,
        status: filters?.status,
        search: filters?.search,
      }),
  });
}

export function useApproveComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminCommentsApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'comments'] });
    },
  });
}

export function useRejectComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminCommentsApi.reject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'comments'] });
    },
  });
}

export function useAdminDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminCommentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'comments'] });
    },
  });
}
