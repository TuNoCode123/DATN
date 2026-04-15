"use client";

import { ChartCard } from "@/components/admin/chart-card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  AreaChart,
} from "recharts";

const chartTooltipStyle = {
  borderRadius: "10px",
  border: "none",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  fontSize: "12px",
};

interface DashboardChartsProps {
  userGrowth: { label: string; value: number }[] | undefined;
  userGrowthLoading: boolean;
  testActivity: { label: string; value: number }[] | undefined;
  testActivityLoading: boolean;
}

export default function DashboardCharts({
  userGrowth,
  userGrowthLoading,
  testActivity,
  testActivityLoading,
}: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
      <ChartCard title="Student Growth" isLoading={userGrowthLoading}>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={userGrowth ?? []}>
            <defs>
              <linearGradient id="userGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={chartTooltipStyle} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#4F46E5"
              strokeWidth={2.5}
              fill="url(#userGrowthGrad)"
              name="Students"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Test Activity" isLoading={testActivityLoading}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={testActivity ?? []}>
            <defs>
              <linearGradient id="testBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0D9488" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#0D9488" stopOpacity={0.5} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={chartTooltipStyle} />
            <Bar dataKey="value" fill="url(#testBarGrad)" radius={[6, 6, 0, 0]} name="Attempts" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
