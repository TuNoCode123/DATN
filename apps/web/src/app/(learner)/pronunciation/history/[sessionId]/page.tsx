'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ScoreCard } from '@/components/pronunciation/ScoreCard';
import type { PronunciationSessionDetail } from '@/lib/pronunciation/types';
import {
  ArrowLeft,
  Loader2,
  Calendar,
  BarChart3,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
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

export default function PronunciationSessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const { data: session, isLoading } = useQuery({
    queryKey: ['pronunciation-session', sessionId],
    queryFn: async () => {
      const res = await api.get(`/pronunciation/history/${sessionId}`);
      return res.data as PronunciationSessionDetail;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20 text-gray-500">
        <p className="font-bold">Session not found</p>
        <Link
          href="/pronunciation/history"
          className="text-sm text-primary hover:underline mt-2 inline-block"
        >
          Back to History
        </Link>
      </div>
    );
  }

  const resultMap = new Map(
    session.results.map((r) => [r.sentenceIndex, r]),
  );

  // Stats
  const completedResults = session.results;
  const avgScores = {
    overall: session.avgScore ?? 0,
    pronunciation:
      completedResults.length > 0
        ? completedResults.reduce((s, r) => s + r.pronunciationScore, 0) /
          completedResults.length
        : 0,
    accuracy:
      completedResults.length > 0
        ? completedResults.reduce((s, r) => s + r.accuracyScore, 0) /
          completedResults.length
        : 0,
    fluency:
      completedResults.length > 0
        ? completedResults.reduce((s, r) => s + r.fluencyScore, 0) /
          completedResults.length
        : 0,
    completeness:
      completedResults.length > 0
        ? completedResults.reduce((s, r) => s + r.completenessScore, 0) /
          completedResults.length
        : 0,
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/pronunciation/history"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to History
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-black">{session.topicName}</h1>
          <span
            className={cn(
              'px-2 py-0.5 text-xs font-bold border rounded-full',
              DIFFICULTY_COLORS[session.difficulty],
            )}
          >
            {session.difficulty.charAt(0) +
              session.difficulty.slice(1).toLowerCase()}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {formatDate(session.createdAt)}
          </span>
          <span className="flex items-center gap-1">
            <BarChart3 className="w-4 h-4" />
            {session.totalDone}/{session.sentences.length} completed
          </span>
        </div>
      </div>

      {/* Summary stats */}
      {completedResults.length > 0 && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Overall', value: avgScores.overall },
            { label: 'Pronunciation', value: avgScores.pronunciation },
            { label: 'Accuracy', value: avgScores.accuracy },
            { label: 'Fluency', value: avgScores.fluency },
            { label: 'Completeness', value: avgScores.completeness },
          ].map(({ label, value }) => (
            <div key={label} className="brutal-card p-3 text-center">
              <div className={cn('text-2xl font-black', scoreColor(value))}>
                {value.toFixed(0)}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
              <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full', scoreBg(value))}
                  style={{ width: `${value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sentence list */}
      <div className="space-y-2">
        <h2 className="text-sm font-bold text-gray-600 uppercase">
          Sentences
        </h2>
        {session.sentences.map((sentence, idx) => {
          const result = resultMap.get(idx);
          const isExpanded = expandedIndex === idx;

          return (
            <div key={idx} className="brutal-card overflow-hidden">
              <button
                onClick={() =>
                  setExpandedIndex(isExpanded ? null : idx)
                }
                className="w-full p-4 text-left flex items-start gap-3"
              >
                {/* Status icon */}
                <div className="shrink-0 mt-0.5">
                  {result ? (
                    result.overallScore >= 70 ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-amber-500" />
                    )
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400">
                      #{idx + 1}
                    </span>
                    <p className="text-sm font-semibold truncate">
                      {sentence}
                    </p>
                  </div>
                  {result && (
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span
                        className={cn('font-bold', scoreColor(result.overallScore))}
                      >
                        Score: {result.overallScore}
                      </span>
                      <span>P:{result.pronunciationScore}</span>
                      <span>A:{result.accuracyScore}</span>
                      <span>F:{result.fluencyScore}</span>
                      <span>C:{result.completenessScore}</span>
                    </div>
                  )}
                </div>

                {/* Expand icon */}
                {result && (
                  <div className="shrink-0">
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                )}
              </button>

              {/* Expanded detail */}
              {isExpanded && result && (
                <div className="px-4 pb-4 pt-0 border-t-2 border-black/10">
                  <div className="mt-4">
                    <ScoreCard assessment={result.assessment} />
                  </div>
                  <div className="mt-3 brutal-card p-3 bg-gray-50">
                    <span className="text-xs font-bold text-gray-500 block mb-1">
                      You said:
                    </span>
                    <p className="text-sm font-mono text-gray-700">
                      {result.spokenText || '(empty)'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
