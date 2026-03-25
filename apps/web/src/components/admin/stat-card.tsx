"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; isPositive: boolean };
  isLoading?: boolean;
  color?: "indigo" | "teal" | "amber" | "emerald";
}

const colorMap = {
  indigo: { bg: "bg-[#EEF2FF]", icon: "text-[#4F46E5]", ring: "ring-[#4F46E5]/10" },
  teal: { bg: "bg-[#F0FDFA]", icon: "text-[#0D9488]", ring: "ring-[#0D9488]/10" },
  amber: { bg: "bg-amber-50", icon: "text-amber-600", ring: "ring-amber-600/10" },
  emerald: { bg: "bg-emerald-50", icon: "text-emerald-600", ring: "ring-emerald-600/10" },
};

const darkColorMap = {
  indigo: { bg: "dark:bg-[#1E1B4B]/30", icon: "dark:text-[#818CF8]" },
  teal: { bg: "dark:bg-[#134E4A]/30", icon: "dark:text-[#2DD4BF]" },
  amber: { bg: "dark:bg-amber-900/20", icon: "dark:text-amber-400" },
  emerald: { bg: "dark:bg-emerald-900/20", icon: "dark:text-emerald-400" },
};

export function StatCard({ title, value, icon: Icon, trend, isLoading, color = "indigo" }: StatCardProps) {
  const c = colorMap[color];
  const dc = darkColorMap[color];

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-11 w-11 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[13px] text-muted-foreground font-medium">{title}</p>
            <p className="font-heading text-2xl font-bold tracking-tight">{value}</p>
            {trend && (
              <div className={cn(
                "flex items-center gap-1 text-xs font-semibold",
                trend.isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
              )}>
                {trend.isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                <span>{trend.value}% from last month</span>
              </div>
            )}
          </div>
          <div className={cn("flex items-center justify-center w-11 h-11 rounded-xl ring-1", c.bg, c.ring, dc.bg)}>
            <Icon className={cn("w-5 h-5", c.icon, dc.icon)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
