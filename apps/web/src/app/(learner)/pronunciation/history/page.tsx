'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import type { PronunciationSession } from '@/lib/pronunciation/types';
import {
  ArrowLeft,
  Loader2,
  Mic,
  Calendar,
  BarChart3,
  ChevronRight,
} from 'lucide-react';

const DIFFICULTY_COLORS: Record<string, string> = {
  BEGINNER: 'bg-green-100 text-green-800 border-green-500',
  INTERMEDIATE: 'bg-yellow-100 text-yellow-800 border-yellow-500',
  ADVANCED: 'bg-red-100 text-red-800 border-red-500',
};

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-500';
  return 'text-red-500';
}

function scoreBg(score: number): string {
  if (score >= 90) return 'bg-green-500';
  if (score >= 70) return 'bg-blue-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PronunciationHistoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['pronunciation-history'],
    queryFn: async () => {
      const res = await api.get('/pronunciation/history');
      return res.data as {
        data: PronunciationSession[];
        total: number;
        page: number;
        totalPages: number;
      };
    },
  });

  const sessions = data?.data ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/pronunciation"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-1"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Practice
          </Link>
          <h1 className="text-3xl font-black">Practice History</h1>
          <p className="text-gray-600 text-sm mt-1">
            Review your past pronunciation sessions
          </p>
        </div>
        {data && (
          <div className="text-right">
            <div className="text-2xl font-black">{data.total}</div>
            <div className="text-xs text-gray-500">Total Sessions</div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <Mic className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-bold">No sessions yet</p>
          <p className="text-sm mt-1">
            Complete a pronunciation practice to see your history.
          </p>
          <Link
            href="/pronunciation"
            className="brutal-btn-fill px-5 py-2.5 text-sm mt-4 inline-block"
          >
            Start Practicing
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const done = session.totalDone;
            const total = session.sentences.length;
            const progress = total > 0 ? (done / total) * 100 : 0;
            const avg = session.avgScore;

            return (
              <Link
                key={session.id}
                href={`/pronunciation/history/${session.id}`}
                className="brutal-card p-5 block hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_0_#1e293b] transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-black truncate">
                        {session.topicName}
                      </h3>
                      <span
                        className={cn(
                          'px-2 py-0.5 text-xs font-bold border rounded-full shrink-0',
                          DIFFICULTY_COLORS[session.difficulty],
                        )}
                      >
                        {session.difficulty.charAt(0) +
                          session.difficulty.slice(1).toLowerCase()}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(session.createdAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <BarChart3 className="w-3.5 h-3.5" />
                        {done}/{total} sentences
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3 h-1.5 bg-gray-200 border border-black/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {avg !== null ? (
                      <div className="text-center">
                        <div
                          className={cn(
                            'text-2xl font-black',
                            scoreColor(avg),
                          )}
                        >
                          {avg.toFixed(0)}
                        </div>
                        <div className="text-xs text-gray-500">avg</div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="text-2xl font-black text-gray-300">
                          --
                        </div>
                        <div className="text-xs text-gray-400">no data</div>
                      </div>
                    )}
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
