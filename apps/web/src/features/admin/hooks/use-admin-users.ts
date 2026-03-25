import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminUsersApi } from '@/lib/admin-api';
import type { UserRole } from '../types';

interface UserFilters {
  search?: string;
  role?: string;
  status?: string;
}

export function useAdminUsers(filters?: UserFilters) {
  return useQuery({
    queryKey: ['admin-users', filters],
    queryFn: () =>
      adminUsersApi.getAll({
        search: filters?.search,
        role: filters?.role as UserRole | undefined,
        isActive:
          filters?.status === 'active'
            ? true
            : filters?.status === 'disabled'
              ? false
              : undefined,
      }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: { id: string; partial: { displayName?: string; role?: UserRole } }) =>
      adminUsersApi.update(data.id, data.partial),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}

export function useToggleUserStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => adminUsersApi.toggleStatus(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });
}
