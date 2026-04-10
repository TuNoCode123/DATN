'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ScoreGauge } from '@/components/translation/svg/ScoreGauge';
import Link from 'next/link';
import { ArrowLeft, Loader2, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import type { TranslationSessionDetail, TranslationResult } from '@/lib/translation/types';
import { useState } from 'react';

function getStatus(score: number): 'master' | 'good' | 'fair' | 'poor' {
  if (score >= 90) return 'master';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}

function ResultCard({ result, index }: { result: TranslationResult; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const status = getStatus(result.overallScore);

  const STATUS_BG = {
    master: 'bg-emerald-50 border-emerald-300',
    good: 'bg-indigo-50 border-indigo-300',
    fair: 'bg-amber-50 border-amber-300',
    poor: 'bg-red-50 border-red-300',
  };

  return (
    <div className={cn(
      'rounded-2xl border-2 border-black bg-white shadow-[3px_3px_0_0_#1e293b] overflow-hidden transition-all',
    )}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className={cn(
          'w-10 h-10 rounded-xl border-2 flex items-center justify-center font-black text-sm',
          STATUS_BG[status],
        )}>
          {Math.round(result.overallScore)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{result.vietnameseSentence}</p>
          <p className="text-xs text-gray-500 truncate mt-0.5">
            Your answer: &ldquo;{result.userTranslation}&rdquo;
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
          {/* Scores */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Accuracy', score: result.accuracyScore },
              { label: 'Grammar', score: result.grammarScore },
              { label: 'Vocabulary', score: result.vocabularyScore },
              { label: 'Naturalness', score: result.naturalnessScore },
            ].map((m) => (
              <div key={m.label} className="text-center">
                <div className="text-lg font-black text-gray-800">{Math.round(m.score)}</div>
                <div className="text-[10px] font-bold uppercase text-gray-400">{m.label}</div>
              </div>
            ))}
          </div>

          {/* Comparison */}
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px]">🇻🇳</span>
              </span>
              <div>
                <span className="text-[10px] font-bold uppercase text-gray-400">Vietnamese</span>
                <p className="text-gray-700">{result.vietnameseSentence}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <X className="w-3 h-3 text-gray-500" />
              </span>
              <div>
                <span className="text-[10px] font-bold uppercase text-gray-400">Your answer</span>
                <p className="text-gray-600 italic">{result.userTranslation}</p>
              </div>
            </div>
            {result.suggestedTranslation && (
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-emerald-600" />
                </span>
                <div>
                  <span className="text-[10px] font-bold uppercase text-emerald-600">Suggested</span>
                  <p className="text-emerald-800 font-semibold">{result.suggestedTranslation}</p>
                </div>
              </div>
            )}
          </div>

          {/* Feedback */}
          {result.feedback && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3 border border-gray-100">
              {result.feedback}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function TranslationSessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const { data: session, isLoading } = useQuery({
    queryKey: ['translation-session', sessionId],
    queryFn: () =>
      api
        .get(`/translation/history/${sessionId}`)
        .then((r) => r.data as TranslationSessionDetail),
    enabled: !!sessionId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center">
        <p className="text-gray-500">Session not found.</p>
      </div>
    );
  }

  const status = session.avgScore !== null ? getStatus(session.avgScore) : 'fair';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href="/translation/history"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to History
        </Link>
        <h1 className="text-2xl font-black">{session.topicName}</h1>
        <p className="text-sm text-gray-500">
          {new Date(session.createdAt).toLocaleDateString()} · {session.difficulty.charAt(0) + session.difficulty.slice(1).toLowerCase()}
        </p>
      </div>

      {/* Overall score */}
      {session.avgScore !== null && (
        <div className="flex justify-center">
          <ScoreGauge
            score={Math.round(session.avgScore)}
            status={status}
            label="Average Score"
            size={160}
          />
        </div>
      )}

      {/* Results */}
      <div className="space-y-3">
        {session.results.map((result, i) => (
          <ResultCard key={result.id} result={result} index={i} />
        ))}
      </div>
    </div>
  );
}
