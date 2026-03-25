'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  BarChart3,
  Trophy,
  Flame,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

interface AttemptFromAPI {
  id: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'ABANDONED';
  mode: 'FULL_TEST' | 'PRACTICE';
  scorePercent: number | null;
  correctCount: number | null;
  totalQuestions: number | null;
  startedAt: string;
  submittedAt: string | null;
  timeLimitMins: number | null;
  test: {
    id: string;
    title: string;
    examType: string;
    questionCount: number;
  };
}

const EXAM_TYPE_LABELS: Record<string, string> = {
  IELTS_ACADEMIC: 'IELTS Academic',
  IELTS_GENERAL: 'IELTS General',
  TOEIC_LR: 'TOEIC',
  TOEIC_SW: 'TOEIC SW',
  HSK_1: 'HSK 1', HSK_2: 'HSK 2', HSK_3: 'HSK 3',
  HSK_4: 'HSK 4', HSK_5: 'HSK 5', HSK_6: 'HSK 6',
  TOPIK_I: 'TOPIK I', TOPIK_II: 'TOPIK II',
  JLPT_N5: 'JLPT N5', JLPT_N4: 'JLPT N4', JLPT_N3: 'JLPT N3',
  JLPT_N2: 'JLPT N2', JLPT_N1: 'JLPT N1',
  DIGITAL_SAT: 'Digital SAT',
  ACT: 'ACT',
  THPTQG: 'THPTQG',
};

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-500';
  return 'text-red-500';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-400';
  return 'bg-red-400';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  const { data: attempts, isLoading } = useQuery<AttemptFromAPI[]>({
    queryKey: ['my-attempts'],
    queryFn: async () => {
      const { data } = await api.get('/attempts');
      return data;
    },
  });

  const submitted = (attempts || []).filter((a) => a.status === 'SUBMITTED');
  const inProgress = (attempts || []).filter((a) => a.status === 'IN_PROGRESS');

  const avgScore =
    submitted.length > 0
      ? submitted.reduce((sum, a) => sum + (a.scorePercent ?? 0), 0) / submitted.length
      : 0;

  const bestScore =
    submitted.length > 0
      ? Math.max(...submitted.map((a) => a.scorePercent ?? 0))
      : 0;

  const byType: Record<string, { count: number; totalScore: number }> = {};
  for (const a of submitted) {
    const type = a.test.examType;
    if (!byType[type]) byType[type] = { count: 0, totalScore: 0 };
    byType[type].count++;
    byType[type].totalScore += a.scorePercent ?? 0;
  }
  const typeBreakdown = Object.entries(byType)
    .map(([type, { count, totalScore }]) => ({
      type,
      label: EXAM_TYPE_LABELS[type] || type,
      count,
      avgScore: totalScore / count,
    }))
    .sort((a, b) => b.count - a.count);

  const recent = [...submitted]
    .sort((a, b) => new Date(b.submittedAt!).getTime() - new Date(a.submittedAt!).getTime())
    .slice(0, 10);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-foreground">
          Hello, {user?.displayName || user?.email || 'there'}!
        </h1>
        <p className="text-slate-500 mt-1">Track your learning progress</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              icon={<CheckCircle2 className="w-6 h-6 text-emerald-500" />}
              label="Completed"
              value={submitted.length}
              bg="bg-emerald-50"
              border="border-emerald-200"
            />
            <StatCard
              icon={<Clock className="w-6 h-6 text-amber-500" />}
              label="In Progress"
              value={inProgress.length}
              bg="bg-amber-50"
              border="border-amber-200"
            />
            <StatCard
              icon={<BarChart3 className="w-6 h-6 text-blue-500" />}
              label="Average Score"
              value={submitted.length > 0 ? `${avgScore.toFixed(1)}%` : '--'}
              bg="bg-blue-50"
              border="border-blue-200"
            />
            <StatCard
              icon={<Trophy className="w-6 h-6 text-amber-500" />}
              label="Best Score"
              value={submitted.length > 0 ? `${bestScore.toFixed(1)}%` : '--'}
              bg="bg-amber-50"
              border="border-amber-200"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Score breakdown by exam type */}
            <div className="md:col-span-1 brutal-card p-5">
              <h2 className="font-bold text-foreground mb-4 flex items-center gap-2 text-sm">
                <Flame className="w-5 h-5 text-red-500" /> By Exam Type
              </h2>
              {typeBreakdown.length === 0 ? (
                <p className="text-sm text-slate-400">No data yet</p>
              ) : (
                <div className="space-y-4">
                  {typeBreakdown.map(({ type, label, count, avgScore: avg }) => (
                    <div key={type}>
                      <div className="flex justify-between text-xs text-slate-600 mb-1.5">
                        <span className="font-semibold">{label}</span>
                        <span>{count} tests &middot; {avg.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5">
                        <div
                          className={`${scoreBg(avg)} rounded-full h-2.5 transition-all`}
                          style={{ width: `${Math.round(avg)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* In-progress attempts */}
            <div className="md:col-span-2 brutal-card p-5">
              <h2 className="font-bold text-foreground mb-4 flex items-center gap-2 text-sm">
                <Clock className="w-5 h-5 text-amber-500" /> In Progress
              </h2>
              {inProgress.length === 0 ? (
                <div className="text-sm text-slate-400 py-4 text-center">
                  No tests in progress.{' '}
                  <Link href="/tests" className="text-primary font-semibold hover:underline cursor-pointer">
                    Start a new one
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {inProgress.slice(0, 5).map((a) => (
                    <Link
                      key={a.id}
                      href={`/tests/${a.test.id}/attempt?attemptId=${a.id}`}
                      className="flex items-center justify-between px-4 py-3 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground leading-tight">{a.test.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Started {formatDate(a.startedAt)} &middot; {a.mode === 'FULL_TEST' ? 'Full Test' : 'Practice'}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-amber-500" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent completed attempts */}
          <div className="brutal-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-foreground flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Recent Results
              </h2>
              <Link href="/tests" className="text-xs text-primary font-semibold hover:underline cursor-pointer">
                Browse more tests
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="text-sm text-slate-400 py-8 text-center">
                No completed tests yet.{' '}
                <Link href="/tests" className="text-primary font-semibold hover:underline cursor-pointer">
                  Take your first test
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b-2 border-slate-100">
                      <th className="text-left py-3 pr-4 font-semibold">Test</th>
                      <th className="text-left py-3 pr-4 font-semibold">Type</th>
                      <th className="text-left py-3 pr-4 font-semibold">Mode</th>
                      <th className="text-right py-3 pr-4 font-semibold">Score</th>
                      <th className="text-right py-3 pr-4 font-semibold">Date</th>
                      <th className="py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {recent.map((a) => {
                      const score = a.scorePercent ?? 0;
                      return (
                        <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 pr-4">
                            <span className="font-semibold text-foreground line-clamp-1">{a.test.title}</span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                              {EXAM_TYPE_LABELS[a.test.examType] || a.test.examType}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                              a.mode === 'FULL_TEST'
                                ? 'bg-primary/10 text-primary border border-primary/20'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {a.mode === 'FULL_TEST' ? 'Full Test' : 'Practice'}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className={`font-bold text-base ${scoreColor(score)}`}>
                                {score.toFixed(1)}%
                              </span>
                              <span className="text-xs text-slate-400">
                                {a.correctCount}/{a.totalQuestions}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-right text-slate-500 text-xs whitespace-nowrap">
                            {a.submittedAt ? formatDate(a.submittedAt) : '--'}
                          </td>
                          <td className="py-3">
                            <Link
                              href={`/tests/${a.test.id}/result?attemptId=${a.id}`}
                              className="text-xs text-primary font-semibold hover:underline whitespace-nowrap cursor-pointer"
                            >
                              Details
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  bg,
  border,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  bg: string;
  border: string;
}) {
  return (
    <div className={`${bg} rounded-2xl p-5 border-2 ${border}`}>
      <div className="mb-3">{icon}</div>
      <div className="text-2xl font-extrabold text-foreground">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5 font-medium">{label}</div>
    </div>
  );
}
