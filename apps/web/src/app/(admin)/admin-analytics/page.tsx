"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useUserGrowthChart,
  useTestActivityChart,
  useScoreDistribution,
} from "@/features/admin/hooks";
import { cn } from "@/lib/utils";

const AnalyticsCharts = dynamic(
  () => import("@/components/admin/analytics-charts"),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-[340px] w-full rounded-lg" />
        <Skeleton className="h-[340px] w-full rounded-lg" />
        <Skeleton className="h-[340px] w-full rounded-lg" />
      </div>
    ),
  },
);

const presets = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "1 year", value: "1y" },
];

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState("1y");
  const { data: userGrowth, isLoading: ugLoading } = useUserGrowthChart();
  const { data: testActivity, isLoading: taLoading } = useTestActivityChart();
  const { data: distribution, isLoading: distLoading } = useScoreDistribution();

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader title="Analytics" description="Learning insights and performance trends">
        <div className="flex gap-1 p-1 bg-card shadow-sm rounded-lg">
          {presets.map((p) => (
            <Button
              key={p.value}
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 px-3 text-xs font-medium cursor-pointer rounded-md",
                range === p.value
                  ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setRange(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </PageHeader>

      <AnalyticsCharts
        userGrowth={userGrowth}
        ugLoading={ugLoading}
        testActivity={testActivity}
        taLoading={taLoading}
        distribution={distribution}
        distLoading={distLoading}
      />
    </div>
  );
}
