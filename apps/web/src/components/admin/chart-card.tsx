"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  isLoading?: boolean;
  className?: string;
  action?: React.ReactNode;
}

export function ChartCard({ title, children, isLoading, className, action }: ChartCardProps) {
  return (
    <Card className={`border-0 shadow-sm ${className ?? ""}`}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="font-heading text-sm font-semibold text-foreground">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-[220px] w-full rounded-lg" />
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
