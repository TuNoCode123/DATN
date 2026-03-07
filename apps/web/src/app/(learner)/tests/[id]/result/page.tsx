"use client";

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Spin } from "antd";
import { api } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────
interface QuestionFromAPI {
  id: string;
  questionNumber: number;
  orderIndex: number;
  stem: string | null;
  correctAnswer: string;
  explanation: string | null;
  mcqOptions: any;
}
interface QuestionGroupFromAPI {
  id: string;
  questionType: string;
  orderIndex: number;
  questions: QuestionFromAPI[];
}
interface SectionFromAPI {
  id: string;
  title: string;
  skill: string;
  orderIndex: number;
  questionGroups: QuestionGroupFromAPI[];
}
interface AnswerFromAPI {
  id: string;
  questionId: string;
  answerText: string | null;
  isCorrect: boolean | null;
}
interface AttemptResultFromAPI {
  id: string;
  mode: string;
  status: string;
  startedAt: string;
  submittedAt: string;
  totalQuestions: number;
  correctCount: number;
  scorePercent: number;
  test: { id: string; title: string };
  sections: { sectionId: string; section: SectionFromAPI }[];
  answers: AnswerFromAPI[];
}

// ─── Helpers ─────────────────────────────────────────────
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function getQuestionTypeLabel(type: string): string {
  const map: Record<string, string> = {
    MULTIPLE_CHOICE: "Multiple Choice",
    NOTE_FORM_COMPLETION: "Note/Form Completion",
    TABLE_COMPLETION: "Table Completion",
    SUMMARY_COMPLETION: "Summary Completion",
    MATCHING: "Matching",
  };
  return map[type] || type;
}

// ─── Sub-components ──────────────────────────────────────
function QuestionNumberBadge({
  num,
  status,
}: {
  num: number;
  status: "correct" | "wrong" | "skipped";
}) {
  const base =
    "inline-flex items-center justify-center rounded-full font-semibold text-xs shrink-0";
  const style: Record<string, string> = {
    correct: "border-2 border-green-500 text-green-600 bg-green-50",
    wrong: "border-2 border-red-400 text-red-500 bg-red-50",
    skipped: "border-2 border-gray-300 text-gray-500 bg-white",
  };
  return (
    <span className={`${base} ${style[status]}`} style={{ width: 24, height: 24 }}>
      {num}
    </span>
  );
}

// ─── Main ────────────────────────────────────────────────
function ResultContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const testId = params.id as string;
  const attemptId = searchParams.get("attemptId");

  const { data: attempt, isLoading } = useQuery({
    queryKey: ["result", attemptId],
    queryFn: async () => {
      if (!attemptId) throw new Error("No attemptId");
      const { data } = await api.get(`/attempts/${attemptId}/result`);
      return data as AttemptResultFromAPI;
    },
    enabled: !!attemptId,
  });

  if (isLoading || !attempt) {
    return (
      <div className="flex justify-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  // Build lookup maps
  const answerMap: Record<string, AnswerFromAPI> = {};
  attempt.answers.forEach((a) => {
    answerMap[a.questionId] = a;
  });

  const sections = attempt.sections
    .map((as) => as.section)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const allQuestions = sections.flatMap((s) =>
    s.questionGroups.flatMap((g) => g.questions),
  );

  // Stats
  const total = attempt.totalQuestions;
  const correct = attempt.correctCount;
  const answered = attempt.answers.filter((a) => a.answerText?.trim()).length;
  const wrong = answered - correct;
  const skipped = total - answered;

  const timeSpent = attempt.submittedAt
    ? Math.floor(
        (new Date(attempt.submittedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000,
      )
    : 0;

  const accuracyPct =
    answered > 0 ? ((correct / answered) * 100).toFixed(1) + "%" : "0.0%";

  // Group analysis data
  interface AnalysisRow {
    sectionTitle: string;
    type: string;
    questions: QuestionFromAPI[];
  }
  const analysisRows: AnalysisRow[] = [];
  sections.forEach((s) =>
    s.questionGroups.forEach((g) =>
      analysisRows.push({
        sectionTitle: s.title,
        type: `[${s.skill === "LISTENING" ? "Listening" : "Reading"}] ${getQuestionTypeLabel(g.questionType)}`,
        questions: g.questions.sort((a, b) => a.orderIndex - b.orderIndex),
      }),
    ),
  );

  function getStatus(q: QuestionFromAPI): "correct" | "wrong" | "skipped" {
    const ans = answerMap[q.id];
    if (!ans || !ans.answerText?.trim()) return "skipped";
    return ans.isCorrect ? "correct" : "wrong";
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4">
      {/* Title */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h1 className="text-xl font-bold text-gray-900">
          Kết quả luyện tập: {attempt.test.title}
        </h1>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => router.push(`/tests/${testId}`)}
          className="px-4 py-1.5 rounded font-medium text-gray-700 border border-gray-400 bg-white hover:bg-gray-50 text-sm"
        >
          Quay về trang đề thi
        </button>
      </div>

      {/* Summary cards */}
      <div className="flex gap-3 mb-8">
        {/* Score info */}
        <div className="rounded border border-gray-200 bg-white px-5 py-4 flex flex-col gap-3" style={{ minWidth: 210 }}>
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-gray-600 text-sm">Kết quả làm bài</span>
            <span className="font-bold text-gray-900 ml-auto">
              {correct}/{total}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-gray-600 text-sm leading-tight">
              Độ chính xác
              <br />
              <span className="text-xs text-gray-400">(#đúng/#tổng)</span>
            </span>
            <span className="font-bold text-gray-900 ml-auto">{accuracyPct}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-gray-600 text-sm">Thời gian hoàn thành</span>
            <span className="font-bold text-gray-900 ml-auto">{formatTime(timeSpent)}</span>
          </div>
        </div>

        {/* Correct */}
        <div className="flex-1 rounded border border-gray-200 bg-white flex flex-col items-center justify-center py-5 gap-1">
          <div className="w-10 h-10 rounded-full border-2 border-green-500 flex items-center justify-center mb-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span className="text-green-600 font-medium text-sm">Trả lời đúng</span>
          <span className="text-3xl font-bold text-gray-900">{correct}</span>
          <span className="text-gray-400 text-xs">câu hỏi</span>
        </div>

        {/* Wrong */}
        <div className="flex-1 rounded border border-gray-200 bg-white flex flex-col items-center justify-center py-5 gap-1">
          <div className="w-10 h-10 rounded-full border-2 border-red-500 flex items-center justify-center mb-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <span className="text-red-500 font-medium text-sm">Trả lời sai</span>
          <span className="text-3xl font-bold text-gray-900">{wrong}</span>
          <span className="text-gray-400 text-xs">câu hỏi</span>
        </div>

        {/* Skipped */}
        <div className="flex-1 rounded border border-gray-200 bg-white flex flex-col items-center justify-center py-5 gap-1">
          <div className="w-10 h-10 rounded-full border-2 border-gray-400 flex items-center justify-center mb-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <span className="text-gray-500 font-medium text-sm">Bỏ qua</span>
          <span className="text-3xl font-bold text-gray-900">{skipped}</span>
          <span className="text-gray-400 text-xs">câu hỏi</span>
        </div>
      </div>

      {/* Analysis table */}
      <h2 className="text-lg font-bold text-gray-900 mb-3">Phân tích chi tiết</h2>
      <div className="border border-gray-200 rounded overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-700 w-48">Phân loại câu hỏi</th>
              <th className="text-center px-3 py-3 font-medium text-gray-700 w-24">Số câu đúng</th>
              <th className="text-center px-3 py-3 font-medium text-gray-700 w-20">Số câu sai</th>
              <th className="text-center px-3 py-3 font-medium text-gray-700 w-24">Số câu bỏ qua</th>
              <th className="text-center px-3 py-3 font-medium text-gray-700 w-28">Độ chính xác</th>
              <th className="text-left px-3 py-3 font-medium text-gray-700">Danh sách câu hỏi</th>
            </tr>
          </thead>
          <tbody>
            {analysisRows.map((row, idx) => {
              const stats = { correct: 0, wrong: 0, skipped: 0 };
              row.questions.forEach((q) => {
                stats[getStatus(q)]++;
              });
              const rowAnswered = stats.correct + stats.wrong;
              const acc = rowAnswered > 0 ? ((stats.correct / rowAnswered) * 100).toFixed(2) + "%" : "0.00%";

              return (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="px-4 py-3 text-gray-800 text-sm">{row.type}</td>
                  <td className="text-center px-3 py-3 text-gray-700">{stats.correct}</td>
                  <td className="text-center px-3 py-3 text-gray-700">{stats.wrong}</td>
                  <td className="text-center px-3 py-3 text-gray-700">{stats.skipped}</td>
                  <td className="text-center px-3 py-3 text-gray-700">{acc}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.questions.map((q) => (
                        <QuestionNumberBadge key={q.id} num={q.questionNumber} status={getStatus(q)} />
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
            {/* Total row */}
            <tr className="bg-gray-50 font-medium">
              <td className="px-4 py-3 text-gray-800">Total</td>
              <td className="text-center px-3 py-3 text-gray-700">{correct}</td>
              <td className="text-center px-3 py-3 text-gray-700">{wrong}</td>
              <td className="text-center px-3 py-3 text-gray-700">{skipped}</td>
              <td className="text-center px-3 py-3 text-gray-700">{accuracyPct}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Answer Review */}
      <div className="mb-4">
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <span className="font-bold text-gray-900" style={{ fontSize: 15 }}>
            Đáp án
          </span>
        </div>

        {sections.map((section) => (
          <div key={section.id} className="mb-6">
            <h4 className="font-bold text-gray-900 mb-3" style={{ fontSize: 15 }}>
              {section.title}
            </h4>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {section.questionGroups
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .flatMap((g) => g.questions.sort((a, b) => a.orderIndex - b.orderIndex))
                .map((q) => {
                  const ans = answerMap[q.id];
                  const status = getStatus(q);
                  const userAnswer = ans?.answerText || "";

                  return (
                    <div key={q.id} className="flex items-start gap-2 text-sm">
                      <span
                        className="inline-flex items-center justify-center rounded-full bg-blue-600 text-white font-bold shrink-0"
                        style={{ width: 22, height: 22, fontSize: 11 }}
                      >
                        {q.questionNumber}
                      </span>
                      <span className="flex items-center gap-1 flex-wrap min-w-0">
                        <span className="font-medium text-gray-900 mr-0.5">
                          {q.correctAnswer}:
                        </span>
                        {status === "skipped" ? (
                          <span className="text-gray-500">chưa trả lời</span>
                        ) : status === "correct" ? (
                          <>
                            <span className="text-green-700">{userAnswer}</span>
                            <svg className="text-green-500 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </>
                        ) : (
                          <>
                            <span className="text-red-500 line-through">{userAnswer}</span>
                            <svg className="text-red-500 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Đang tải...</div>}>
      <ResultContent />
    </Suspense>
  );
}
