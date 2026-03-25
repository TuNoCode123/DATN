"use client";

import { useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { ChartCard } from "@/components/admin/chart-card";
import { Button } from "@/components/ui/button";
import {
  useUserGrowthChart,
  useTestActivityChart,
  useScoreDistribution,
} from "@/features/admin/hooks";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
} from "recharts";

const presets = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "1 year", value: "1y" },
];

const chartTooltipStyle = {
  borderRadius: "10px",
  border: "none",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  fontSize: "12px",
};

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* User Growth */}
        <ChartCard title="User Growth" isLoading={ugLoading}>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={userGrowth ?? []}>
              <defs>
                <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Area type="monotone" dataKey="value" stroke="#4F46E5" strokeWidth={2.5} fill="url(#growthGrad)" name="Total Users" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Test Activity */}
        <ChartCard title="Test Activity" isLoading={taLoading}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={testActivity ?? []}>
              <defs>
                <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0D9488" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#0D9488" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="value" fill="url(#actGrad)" radius={[6, 6, 0, 0]} name="Attempts" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Score Distribution */}
        <ChartCard title="Score Distribution" isLoading={distLoading}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={distribution ?? []}>
              <defs>
                <linearGradient id="distGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="value" fill="url(#distGrad)" radius={[6, 6, 0, 0]} name="Students" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
