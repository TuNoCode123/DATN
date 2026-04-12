import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminCommentsApi } from '@/lib/admin-api';

export function useAdminCommentQueue(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['admin', 'comments', 'queue', page, limit],
    queryFn: () => adminCommentsApi.getQueue({ page, limit }),
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
