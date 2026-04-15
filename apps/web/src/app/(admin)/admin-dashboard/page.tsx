"use client";

import dynamic from "next/dynamic";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDashboardStats,
  useUserGrowthChart,
  useTestActivityChart,
  useRecentActivity,
} from "@/features/admin/hooks";
import { Users, FileText, ClipboardList, TrendingUp } from "lucide-react";

const DashboardCharts = dynamic(
  () => import("@/components/admin/dashboard-charts"),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <Skeleton className="h-[320px] w-full rounded-lg" />
        <Skeleton className="h-[320px] w-full rounded-lg" />
      </div>
    ),
  },
);

export default function AdminDashboardPage() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: userGrowth, isLoading: userGrowthLoading } = useUserGrowthChart();
  const { data: testActivity, isLoading: testActivityLoading } = useTestActivityChart();
  const { data: activity, isLoading: activityLoading } = useRecentActivity();

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader title="Dashboard" description="Welcome back! Here's your platform overview." />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Students"
          value={stats?.totalUsers ?? 0}
          icon={Users}
          trend={{ value: 12, isPositive: true }}
          isLoading={statsLoading}
          color="indigo"
        />
        <StatCard
          title="Published Tests"
          value={stats?.publishedTests ?? 0}
          icon={FileText}
          trend={{ value: 8, isPositive: true }}
          isLoading={statsLoading}
          color="teal"
        />
        <StatCard
          title="Tests Completed"
          value={stats?.totalAttempts ?? 0}
          icon={ClipboardList}
          trend={{ value: 24, isPositive: true }}
          isLoading={statsLoading}
          color="amber"
        />
        <StatCard
          title="Average Score"
          value={stats ? `${stats.avgScore}%` : "0%"}
          icon={TrendingUp}
          trend={{ value: 3, isPositive: true }}
          isLoading={statsLoading}
          color="emerald"
        />
      </div>

      {/* Charts row */}
      <DashboardCharts
        userGrowth={userGrowth}
        userGrowthLoading={userGrowthLoading}
        testActivity={testActivity}
        testActivityLoading={testActivityLoading}
      />

      {/* Recent Activity */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-sm font-semibold">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {activity?.map((item, index) => (
                <div key={index} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-secondary/40 transition-colors cursor-pointer">
                  <Avatar className="h-9 w-9 mt-0.5 ring-2 ring-primary/10">
                    <AvatarImage src={`https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(item.description.split(' ')[0])}&backgroundColor=EEF2FF&textColor=4F46E5`} />
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-semibold">
                      {item.description.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">{item.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(item.timestamp).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] shrink-0 font-semibold ${
                      item.type === "USER_REGISTERED"
                        ? "bg-[#EEF2FF] text-[#4F46E5] dark:bg-[#1E1B4B] dark:text-[#818CF8]"
                        : "bg-[#F0FDFA] text-[#0D9488] dark:bg-[#134E4A] dark:text-[#2DD4BF]"
                    }`}
                  >
                    {item.type === "USER_REGISTERED" ? "New Student" : "Test Completed"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
