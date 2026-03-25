"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminResults, useAdminResult } from "@/features/admin/hooks";
import type { AdminResult, AdminResultDetail } from "@/features/admin/types";
import { cn } from "@/lib/utils";
import { Eye, CheckCircle2, XCircle, Clock, Target, Award } from "lucide-react";

export default function AdminResultsPage() {
  const [filters, setFilters] = useState<{ testId?: string; status?: string }>({});
  const { data: resultsData, isLoading } = useAdminResults(filters);
  const results = resultsData?.data ?? resultsData ?? [];
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: detail } = useAdminResult(detailId ?? "") as { data: AdminResultDetail | undefined };

  const scoreColor = (score: number | null) => {
    if (!score) return "text-muted-foreground";
    if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
    if (score >= 60) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };
  const scoreBg = (score: number | null) => {
    if (!score) return "bg-muted";
    if (score >= 80) return "bg-emerald-100 dark:bg-emerald-900/30";
    if (score >= 60) return "bg-amber-100 dark:bg-amber-900/30";
    return "bg-red-100 dark:bg-red-900/30";
  };

  const columns: ColumnDef<AdminResult, unknown>[] = [
    {
      id: "student", header: "Student",
      cell: ({ row }) => <span className="font-semibold">{row.original.user?.displayName || row.original.user?.email || "—"}</span>,
    },
    {
      id: "test", header: "Test",
      cell: ({ row }) => <span className="text-sm">{row.original.test?.title || "—"}</span>,
    },
    {
      accessorKey: "scorePercent", header: "Score",
      cell: ({ row }) => {
        const score = row.original.scorePercent;
        return (
          <div className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-sm", scoreBg(score), scoreColor(score))}>
            {score != null ? `${Math.round(score)}%` : "—"}
          </div>
        );
      },
    },
    {
      accessorKey: "status", header: "Status",
      cell: ({ getValue }) => {
        const s = getValue() as string;
        return <Badge className={s === "SUBMITTED" ? "bg-[#EEF2FF] text-[#4F46E5] hover:bg-[#EEF2FF] dark:bg-[#1E1B4B] dark:text-[#818CF8]" : "bg-muted text-muted-foreground hover:bg-muted"}>{s}</Badge>;
      },
    },
    {
      accessorKey: "submittedAt", header: "Submitted",
      cell: ({ getValue }) => getValue() ? <span className="text-sm text-muted-foreground">{new Date(getValue() as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span> : "—",
    },
    {
      id: "actions", header: "",
      cell: ({ row }) => <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer hover:bg-secondary" onClick={() => setDetailId(row.original.id)}><Eye className="w-4 h-4" /></Button>,
    },
  ];

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader title="Test Results" description="Review student performance and scores" />
      <DataTable
        columns={columns} data={results} searchKey="id" searchPlaceholder="Search..." isLoading={isLoading}
        filterBar={
          <div className="flex gap-2">
            <Select value={filters.status ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "all" ? undefined : v }))}>
              <SelectTrigger className="w-[160px] border-0 bg-card shadow-sm h-10"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="SUBMITTED">Submitted</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="ABANDONED">Abandoned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <Sheet open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader><SheetTitle className="font-heading">Result Details</SheetTitle></SheetHeader>
          {detail && (
            <ScrollArea className="h-[calc(100vh-100px)] pr-4 mt-4">
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <Card className="border-0 bg-muted/50"><CardContent className="p-3 text-center"><Award className="w-5 h-5 mx-auto text-primary mb-1" /><p className={cn("text-2xl font-bold", scoreColor(detail.scorePercent))}>{detail.scorePercent != null ? `${Math.round(detail.scorePercent)}%` : "—"}</p><p className="text-[10px] text-muted-foreground font-medium">SCORE</p></CardContent></Card>
                  <Card className="border-0 bg-muted/50"><CardContent className="p-3 text-center"><Target className="w-5 h-5 mx-auto text-primary mb-1" /><p className="text-2xl font-bold">{detail.correctCount ?? 0}/{detail.totalQuestions ?? 0}</p><p className="text-[10px] text-muted-foreground font-medium">CORRECT</p></CardContent></Card>
                  <Card className="border-0 bg-muted/50"><CardContent className="p-3 text-center"><Clock className="w-5 h-5 mx-auto text-primary mb-1" /><p className="text-2xl font-bold">{detail.timeLimitMins ?? "—"}</p><p className="text-[10px] text-muted-foreground font-medium">MINUTES</p></CardContent></Card>
                </div>
                <div className="text-sm space-y-1.5 px-1">
                  <p><span className="text-muted-foreground">Student:</span> <strong>{detail.user?.displayName || detail.user?.email}</strong></p>
                  <p><span className="text-muted-foreground">Test:</span> <strong>{detail.test?.title}</strong></p>
                  <p><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className="ml-1 font-semibold">{detail.status}</Badge></p>
                </div>
                <Separator />
                <div className="space-y-3">
                  <h4 className="font-heading text-sm font-semibold">Question Breakdown</h4>
                  {detail.answers?.map((answer, idx) => (
                    <div key={answer.id} className={cn("p-3 rounded-xl border transition-colors", answer.isCorrect ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-950/30" : "border-red-200 bg-red-50/50 dark:border-red-800/50 dark:bg-red-950/30")}>
                      <div className="flex items-start gap-2.5">
                        {answer.isCorrect ? <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">Q{answer.question?.questionNumber ?? idx + 1}: {answer.question?.stem ?? "—"}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Your answer: <strong>{answer.answerText ?? "—"}</strong> · Correct: <strong className="text-foreground">{answer.question?.correctAnswer}</strong>
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
