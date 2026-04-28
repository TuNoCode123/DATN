"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import dayjs from "dayjs";
import { Target, Calendar, TrendingUp, Pencil } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { api } from "@/lib/api";
import { GoalModal, GoalDTO } from "@/components/goals/goal-modal";
import {
  ExamType,
  EXAM_TYPE_LABELS,
  formatScore,
  getScoreFormat,
} from "@/lib/exam-types";

interface GoalResponse {
  goal: GoalDTO | null;
  progress: {
    currentScore: number | null;
    currentScoreField: string;
    attemptCount: number;
    daysRemaining: number;
    percentToTarget: number;
  } | null;
}

interface HistoryAttempt {
  attemptId: string;
  testId: string;
  testTitle: string;
  submittedAt: string;
  score: number | null;
}

interface HistoryResponse {
  examType: ExamType | null;
  scoreField: string;
  attempts: HistoryAttempt[];
}

export default function GoalsPage() {
  const [modalOpen, setModalOpen] = useState(false);

  const { data: goalData, isLoading: goalLoading } = useQuery<GoalResponse>({
    queryKey: ["goals", "me"],
    queryFn: async () => (await api.get("/goals/me")).data,
  });

  const { data: history, isLoading: historyLoading } = useQuery<HistoryResponse>({
    queryKey: ["goals", "me", "history"],
    queryFn: async () => (await api.get("/goals/me/history")).data,
    enabled: Boolean(goalData?.goal),
  });

  const goal = goalData?.goal ?? null;
  const progress = goalData?.progress ?? null;

  if (goalLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-extrabold text-foreground mb-6">Your Learning Goal</h1>
        <div className="brutal-card p-10 text-center">
          <Target className="w-12 h-12 mx-auto text-slate-400 mb-4" />
          <p className="text-lg font-semibold text-foreground mb-2">No goal set yet</p>
          <p className="text-sm text-slate-500 mb-6">
            Pick a target score and date — we&apos;ll track your progress as you take tests.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="brutal-btn bg-foreground text-white px-6 py-2.5 text-sm cursor-pointer"
          >
            Set a goal
          </button>
        </div>
        <GoalModal open={modalOpen} onClose={() => setModalOpen(false)} initial={null} />
      </div>
    );
  }

  const fmt = getScoreFormat(goal.examType as ExamType);
  const examLabel = EXAM_TYPE_LABELS[goal.examType as ExamType];
  const targetLabel = formatScore(goal.examType as ExamType, goal.targetScore);
  const currentLabel = formatScore(goal.examType as ExamType, progress?.currentScore ?? null);
  const pct = Math.round(progress?.percentToTarget ?? 0);
  const days = progress?.daysRemaining ?? 0;

  const chartData = (history?.attempts ?? [])
    .filter((a) => a.score != null)
    .map((a) => ({
      date: dayjs(a.submittedAt).format("MMM D"),
      score: a.score as number,
      title: a.testTitle,
    }));

  const recentAttempts = (history?.attempts ?? []).slice().reverse().slice(0, 10);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-extrabold text-foreground">Your Learning Goal</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="brutal-btn bg-white text-foreground px-4 py-2 text-sm flex items-center gap-2 cursor-pointer"
        >
          <Pencil className="w-4 h-4" />
          Edit
        </button>
      </div>

      {/* Progress card */}
      <div className="brutal-card p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              <Target className="w-3.5 h-3.5" />
              Target
            </div>
            <div className="text-2xl font-extrabold text-foreground">
              {examLabel} {targetLabel}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              Best so far
            </div>
            <div className="text-2xl font-extrabold text-foreground">{currentLabel}</div>
            <div className="text-xs text-slate-500">
              over {progress?.attemptCount ?? 0} completed test
              {progress?.attemptCount === 1 ? "" : "s"}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
              <Calendar className="w-3.5 h-3.5" />
              Deadline
            </div>
            <div className="text-2xl font-extrabold text-foreground">
              {dayjs(goal.targetDate).format("MMM D, YYYY")}
            </div>
            <div className={`text-xs ${days < 0 ? "text-red-600" : "text-slate-500"}`}>
              {days >= 0
                ? `${days} day${days === 1 ? "" : "s"} remaining`
                : `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} past deadline`}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-1.5">
            <span>Progress to target</span>
            <span>{pct}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-slate-200 overflow-hidden border-2 border-border-strong">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Score history chart */}
      <div className="brutal-card p-6 mb-6">
        <h2 className="text-lg font-bold text-foreground mb-4">Score history</h2>
        {historyLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="text-center py-12 text-sm text-slate-500">
            No completed attempts yet for {examLabel}. Take a test to start tracking progress.
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  domain={[fmt.min, fmt.max]}
                  allowDecimals={fmt.step < 1}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "2px solid #0f172a" }}
                  formatter={(value) => [
                    formatScore(goal.examType as ExamType, Number(value)),
                    "Score",
                  ]}
                />
                <ReferenceLine
                  y={goal.targetScore}
                  stroke="#22C55E"
                  strokeDasharray="4 4"
                  label={{ value: "Target", position: "right", fontSize: 11, fill: "#22C55E" }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#0f172a"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#0f172a" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Recent attempts */}
      <div className="brutal-card p-6">
        <h2 className="text-lg font-bold text-foreground mb-4">Recent attempts</h2>
        {recentAttempts.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-500">No attempts yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2.5 pr-4">Test</th>
                  <th className="py-2.5 pr-4">Score</th>
                  <th className="py-2.5 pr-4">Submitted</th>
                  <th className="py-2.5 text-right">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {recentAttempts.map((a) => (
                  <tr key={a.attemptId} className="border-b border-slate-100">
                    <td className="py-3 pr-4 font-medium text-foreground">{a.testTitle}</td>
                    <td className="py-3 pr-4 font-bold text-foreground">
                      {formatScore(goal.examType as ExamType, a.score)}
                    </td>
                    <td className="py-3 pr-4 text-slate-500">
                      {dayjs(a.submittedAt).format("MMM D, YYYY")}
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/tests/${a.testId}/result?attemptId=${a.attemptId}`}
                        className="text-primary font-semibold hover:underline text-xs"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <GoalModal open={modalOpen} onClose={() => setModalOpen(false)} initial={goal} />
    </div>
  );
}
