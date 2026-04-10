import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminCreditsApi } from '@/lib/admin-api';

interface CreditFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export function useAdminCredits(filters?: CreditFilters) {
  return useQuery({
    queryKey: ['admin-credits', filters],
    queryFn: () => adminCreditsApi.getAll(filters),
  });
}

export function useAdminUserTransactions(userId: string | null) {
  return useQuery({
    queryKey: ['admin-credit-transactions', userId],
    queryFn: () => adminCreditsApi.getTransactions(userId!),
    enabled: !!userId,
  });
}

export function useGrantCredits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { userId: string; amount: number }) =>
      adminCreditsApi.grant(data.userId, data.amount),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin-credits'] }),
  });
}

export function useDeductCredits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { userId: string; amount: number }) =>
      adminCreditsApi.deduct(data.userId, data.amount),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin-credits'] }),
  });
}
