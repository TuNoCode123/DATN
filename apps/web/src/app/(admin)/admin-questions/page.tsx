"use client";

import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Image, Music } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminQuestions } from "@/features/admin/hooks";
import type { AdminQuestionBankItem, SectionSkill, QuestionType } from "@/features/admin/types";

const skillStyles: Record<string, string> = {
  LISTENING: "bg-[#EEF2FF] text-[#4F46E5] hover:bg-[#EEF2FF] dark:bg-[#1E1B4B] dark:text-[#818CF8]",
  READING: "bg-[#F0FDFA] text-[#0D9488] hover:bg-[#F0FDFA] dark:bg-[#134E4A] dark:text-[#2DD4BF]",
  WRITING: "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400",
  SPEAKING: "bg-pink-100 text-pink-700 hover:bg-pink-100 dark:bg-pink-900/30 dark:text-pink-400",
};

const questionTypeLabels: Record<string, string> = {
  MULTIPLE_CHOICE: "MCQ",
  TRUE_FALSE_NOT_GIVEN: "TFNG",
  YES_NO_NOT_GIVEN: "YNNG",
  MATCHING_HEADINGS: "Headings",
  MATCHING_INFORMATION: "Info Match",
  MATCHING_FEATURES: "Features",
  MATCHING_SENTENCE_ENDINGS: "Sentence End",
  SENTENCE_COMPLETION: "Sentence",
  SUMMARY_COMPLETION: "Summary",
  NOTE_COMPLETION: "Note",
  TABLE_COMPLETION: "Table",
  FORM_COMPLETION: "Form",
  SHORT_ANSWER: "Short Answer",
  LABELLING: "Labelling",
};

export default function AdminQuestionsPage() {
  const [filters, setFilters] = useState<{ skill?: string; questionType?: string; examType?: string }>({});
  const { data: questionsData, isLoading } = useAdminQuestions(filters);
  const questions: AdminQuestionBankItem[] = questionsData?.data ?? questionsData ?? [];

  const columns: ColumnDef<AdminQuestionBankItem, unknown>[] = [
    { accessorKey: "questionNumber", header: "#", cell: ({ getValue }) => <span className="font-mono text-sm font-semibold text-primary">{getValue() as number}</span> },
    { accessorKey: "stem", header: "Question", cell: ({ getValue }) => <span className="text-sm line-clamp-2 max-w-[300px]">{(getValue() as string) || "—"}</span> },
    {
      id: "questionType", header: "Type",
      cell: ({ row }) => <Badge variant="outline" className="font-semibold">{questionTypeLabels[row.original.group?.questionType] ?? row.original.group?.questionType}</Badge>,
    },
    {
      id: "skill", header: "Skill",
      cell: ({ row }) => {
        const skill = row.original.group?.section?.skill;
        return skill ? <Badge className={skillStyles[skill] ?? ""}>{skill}</Badge> : "—";
      },
    },
    {
      id: "test", header: "Test",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.group?.section?.test?.title ?? "—"}</span>,
    },
    {
      id: "exam", header: "Exam",
      cell: ({ row }) => <Badge variant="outline" className="font-semibold">{row.original.group?.section?.test?.examType ?? "—"}</Badge>,
    },
    {
      id: "media", header: "Media",
      cell: ({ row }) => {
        const q = row.original;
        if (!q.imageUrl && !q.audioUrl) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-1.5" title={[q.imageUrl && `Image: ${q.imageUrl}`, q.audioUrl && `Audio: ${q.audioUrl}`].filter(Boolean).join('\n')}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {q.imageUrl && <Image className="h-3.5 w-3.5 text-indigo-500" />}
            {q.audioUrl && <Music className="h-3.5 w-3.5 text-amber-500" />}
          </div>
        );
      },
    },
    { accessorKey: "correctAnswer", header: "Answer", cell: ({ getValue }) => <span className="text-sm font-medium">{getValue() as string}</span> },
  ];

  const filterBar = (
    <div className="flex flex-wrap gap-2">
      <Select value={filters.skill ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, skill: v === "all" ? undefined : v }))}>
        <SelectTrigger className="w-[140px] border-0 bg-card shadow-sm h-10"><SelectValue placeholder="Skill" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Skills</SelectItem>
          {(["LISTENING", "READING", "WRITING", "SPEAKING"] as SectionSkill[]).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filters.questionType ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, questionType: v === "all" ? undefined : v }))}>
        <SelectTrigger className="w-[160px] border-0 bg-card shadow-sm h-10"><SelectValue placeholder="Type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          {(Object.entries(questionTypeLabels) as [QuestionType, string][]).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader title="Question Bank" description="Browse all questions across tests (read-only)" />
      <DataTable columns={columns} data={questions} searchKey="stem" searchPlaceholder="Search questions..." isLoading={isLoading} filterBar={filterBar} />
    </div>
  );
}
