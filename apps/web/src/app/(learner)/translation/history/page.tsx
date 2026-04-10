'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ProgressRing } from '@/components/translation/svg/ProgressRing';
import { EmptyState } from '@/components/translation/svg/EmptyState';
import Link from 'next/link';
import { ArrowLeft, Loader2, ChevronRight, Calendar } from 'lucide-react';
import type { TranslationSession } from '@/lib/translation/types';

const STATUS_COLORS: Record<string, string> = {
  master: 'text-emerald-600',
  good: 'text-indigo-600',
  fair: 'text-amber-600',
  poor: 'text-red-600',
};

function getStatus(score: number | null) {
  if (score === null) return 'fair';
  if (score >= 90) return 'master';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}

export default function TranslationHistoryPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['translation-history', page],
    queryFn: () =>
      api
        .get('/translation/history', { params: { page, limit: 20 } })
        .then((r) => r.data as { data: TranslationSession[]; total: number; totalPages: number }),
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/translation"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Practice
        </Link>
        <h1 className="text-3xl font-black bg-gradient-to-r from-amber-600 to-indigo-600 bg-clip-text text-transparent">
          Translation History
        </h1>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : !data || data.data.length === 0 ? (
        <div className="flex flex-col items-center py-12">
          <EmptyState className="w-48 h-40" />
          <p className="font-bold text-gray-500 mt-2">No sessions yet</p>
          <p className="text-sm text-gray-400">Complete a translation practice to see results here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.data.map((session) => {
            const status = getStatus(session.avgScore);
            const progress = session.sentencePairs
              ? (session.totalDone / session.sentencePairs.length) * 100
              : 0;

            return (
              <Link
                key={session.id}
                href={`/translation/history/${session.id}`}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-2xl border-2 border-black bg-white',
                  'shadow-[3px_3px_0_0_#1e293b] transition-all duration-200',
                  'hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_0_#1e293b]',
                )}
              >
                <ProgressRing
                  progress={session.avgScore ?? 0}
                  size={52}
                  strokeWidth={4}
                >
                  <span className={cn('text-xs font-black', STATUS_COLORS[status])}>
                    {session.avgScore !== null ? Math.round(session.avgScore) : '—'}
                  </span>
                </ProgressRing>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold truncate">{session.topicName}</h3>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-600 rounded-full border border-gray-200">
                      {session.difficulty.charAt(0) + session.difficulty.slice(1).toLowerCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(session.createdAt).toLocaleDateString()}
                    </span>
                    <span>
                      {session.totalDone}/{session.sentencePairs?.length || '?'} sentences
                    </span>
                  </div>
                  {/* Mini progress bar */}
                  <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-indigo-500 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              </Link>
            );
          })}

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              {Array.from({ length: data.totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i + 1)}
                  className={cn(
                    'w-8 h-8 rounded-lg text-sm font-bold border-2 transition-all',
                    page === i + 1
                      ? 'border-black bg-indigo-500 text-white shadow-[2px_2px_0_0_#1e293b]'
                      : 'border-gray-200 text-gray-500 hover:border-gray-400',
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
