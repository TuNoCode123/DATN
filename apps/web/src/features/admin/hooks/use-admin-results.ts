import { useQuery } from '@tanstack/react-query';
import { adminResultsApi } from '@/lib/admin-api';
import type { AttemptStatus } from '../types';

interface ResultFilters {
  search?: string;
  testId?: string;
  status?: string;
}

export function useAdminResults(filters?: ResultFilters) {
  return useQuery({
    queryKey: ['admin-results', filters],
    queryFn: () =>
      adminResultsApi.getAll({
        search: filters?.search,
        testId: filters?.testId,
        status: filters?.status as AttemptStatus | undefined,
      }),
  });
}

export function useAdminResult(id: string) {
  return useQuery({
    queryKey: ['admin-result', id],
    queryFn: () => adminResultsApi.getById(id),
    enabled: !!id,
  });
}
