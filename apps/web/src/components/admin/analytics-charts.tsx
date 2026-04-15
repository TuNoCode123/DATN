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
  AreaChart,
  Area,
} from "recharts";

const chartTooltipStyle = {
  borderRadius: "10px",
  border: "none",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  fontSize: "12px",
};

interface Point {
  label: string;
  value: number;
}

interface AnalyticsChartsProps {
  userGrowth: Point[] | undefined;
  ugLoading: boolean;
  testActivity: Point[] | undefined;
  taLoading: boolean;
  distribution: Point[] | undefined;
  distLoading: boolean;
}

export default function AnalyticsCharts({
  userGrowth,
  ugLoading,
  testActivity,
  taLoading,
  distribution,
  distLoading,
}: AnalyticsChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
  );
}
