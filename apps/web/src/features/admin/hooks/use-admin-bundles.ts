import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminBundlesApi } from '@/lib/admin-api';
import type { ExamType } from '../types';

export function useAdminBundles(filters?: { examType?: ExamType; search?: string }) {
  return useQuery({
    queryKey: ['admin-bundles', filters],
    queryFn: () => adminBundlesApi.getAll({ examType: filters?.examType, search: filters?.search }),
  });
}

export function useAdminBundle(id: string) {
  return useQuery({
    queryKey: ['admin-bundle', id],
    queryFn: () => adminBundlesApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: adminBundlesApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-bundles'] }),
  });
}

export function useUpdateBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof adminBundlesApi.update>[1] }) =>
      adminBundlesApi.update(id, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-bundles'] });
      qc.invalidateQueries({ queryKey: ['admin-bundle', vars.id] });
    },
  });
}

export function useToggleBundlePublish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminBundlesApi.togglePublish(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-bundles'] }),
  });
}

export function useDeleteBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminBundlesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-bundles'] }),
  });
}
