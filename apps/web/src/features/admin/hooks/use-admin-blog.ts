import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminBlogApi,
  type AdminBlogListParams,
  type AdminBlogPostInput,
} from '@/lib/admin-api';

export function useAdminBlogPosts(params?: AdminBlogListParams) {
  return useQuery({
    queryKey: ['admin-blog', params],
    queryFn: () => adminBlogApi.getAll(params),
  });
}

export function useAdminBlogPost(id: string | undefined) {
  return useQuery({
    queryKey: ['admin-blog', id],
    queryFn: () => adminBlogApi.getById(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AdminBlogPostInput) => adminBlogApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-blog'] }),
  });
}

export function useUpdateBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; data: Partial<AdminBlogPostInput> }) =>
      adminBlogApi.update(args.id, args.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-blog'] }),
  });
}

export function useToggleBlogPublish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminBlogApi.togglePublish(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-blog'] }),
  });
}

export function useDeleteBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminBlogApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-blog'] }),
  });
}
