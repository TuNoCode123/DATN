import { useQuery } from '@tanstack/react-query';
import { adminAnalyticsApi } from '@/lib/admin-api';
import type { DashboardStats, ActivityItem, ChartDataPoint } from '../types';

export function useDashboardStats() {
  return useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => adminAnalyticsApi.getStats(),
  });
}

export function useUserGrowthChart() {
  return useQuery<ChartDataPoint[]>({
    queryKey: ['user-growth-chart'],
    queryFn: () => adminAnalyticsApi.getUserGrowth(),
  });
}

export function useTestActivityChart() {
  return useQuery<ChartDataPoint[]>({
    queryKey: ['test-activity-chart'],
    queryFn: () => adminAnalyticsApi.getTestActivity(),
  });
}

export function useRecentActivity() {
  return useQuery<ActivityItem[]>({
    queryKey: ['recent-activity'],
    queryFn: () => adminAnalyticsApi.getRecentActivity(),
  });
}

export function useScoreDistribution() {
  return useQuery<ChartDataPoint[]>({
    queryKey: ['score-distribution'],
    queryFn: () => adminAnalyticsApi.getScoreDistribution(),
  });
}
