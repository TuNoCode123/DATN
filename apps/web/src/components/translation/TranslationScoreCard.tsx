'use client';

import { cn } from '@/lib/utils';
import { ScoreGauge } from './svg/ScoreGauge';
import { ConfettiAnimation } from './svg/ConfettiAnimation';
import { Lightbulb, Check, ArrowRight, Star, ThumbsUp, AlertTriangle, XCircle, PenLine, BookOpen } from 'lucide-react';
import type { TranslationAssessment, TranslationFeedback } from '@/lib/translation/types';

interface TranslationScoreCardProps {
  assessment: TranslationAssessment;
  userTranslation: string;
  referenceEnglish: string;
}

const STATUS_CONFIG = {
  master: { icon: Star, label: 'Master', color: 'text-emerald-600 bg-emerald-50 border-emerald-300' },
  good: { icon: ThumbsUp, label: 'Good', color: 'text-indigo-600 bg-indigo-50 border-indigo-300' },
  fair: { icon: AlertTriangle, label: 'Fair', color: 'text-amber-600 bg-amber-50 border-amber-300' },
  poor: { icon: XCircle, label: 'Poor', color: 'text-red-600 bg-red-50 border-red-300' },
};

const METRIC_COLORS: Record<string, { bar: string; bg: string }> = {
  accuracy: { bar: 'bg-gradient-to-r from-emerald-400 to-emerald-500', bg: 'bg-emerald-100' },
  grammar: { bar: 'bg-gradient-to-r from-indigo-400 to-indigo-500', bg: 'bg-indigo-100' },
  vocabulary: { bar: 'bg-gradient-to-r from-amber-400 to-orange-500', bg: 'bg-amber-100' },
  naturalness: { bar: 'bg-gradient-to-r from-pink-400 to-rose-500', bg: 'bg-pink-100' },
};

export function TranslationScoreCard({
  assessment,
  userTranslation,
  referenceEnglish,
}: TranslationScoreCardProps) {
  const isMaster = assessment.overall.status === 'master';
  const status = STATUS_CONFIG[assessment.overall.status];
  const StatusIcon = status.icon;

  const metrics = [
    { key: 'accuracy', label: 'Accuracy', data: assessment.accuracy },
    { key: 'grammar', label: 'Grammar', data: assessment.grammar },
    { key: 'vocabulary', label: 'Vocabulary', data: assessment.vocabulary },
    { key: 'naturalness', label: 'Naturalness', data: assessment.naturalness },
  ];

  return (
    <div className="space-y-5 relative">
      {/* Confetti for master score */}
      <div className="absolute inset-0 -top-10 z-10">
        <ConfettiAnimation trigger={isMaster} className="w-full h-48" />
      </div>

      {/* Overall score */}
      <div className="rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0_0_#1e293b] overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-amber-400 via-indigo-400 to-emerald-400" />
        <div className="p-6">
          <div className="flex items-center justify-center gap-6">
            <ScoreGauge
              score={assessment.overall.score}
              status={assessment.overall.status}
              label="Overall"
              size={150}
            />
            <div className="flex flex-col items-start gap-2">
              <div className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1 text-sm font-bold border-2 rounded-full',
                status.color,
              )}>
                <StatusIcon className="w-4 h-4" />
                {status.label}
              </div>
              <p className="text-sm text-gray-500 max-w-[200px]">
                {assessment.overall.score >= 90
                  ? 'Excellent translation!'
                  : assessment.overall.score >= 70
                    ? 'Great job, keep practicing!'
                    : assessment.overall.score >= 50
                      ? 'Good effort, room to improve.'
                      : 'Keep trying, you\'ll get better!'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map((m) => {
          const colors = METRIC_COLORS[m.key];
          return (
            <div
              key={m.key}
              className="rounded-xl border-2 border-black bg-white p-4 shadow-[3px_3px_0_0_#1e293b]"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase text-gray-500">{m.label}</span>
                <span className="text-sm font-black text-gray-800">{m.data.score}</span>
              </div>
              <div className={cn('h-2.5 rounded-full overflow-hidden', colors.bg)}>
                <div
                  className={cn('h-full rounded-full transition-all duration-1000 ease-out', colors.bar)}
                  style={{ width: `${m.data.score}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Suggested translation */}
      {assessment.suggestedTranslation && (
        <div className="rounded-2xl border-2 border-black bg-gradient-to-br from-indigo-50 to-blue-50 shadow-[4px_4px_0_0_#1e293b] p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
              <Check className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Suggested Translation
            </span>
          </div>

          {/* User's translation */}
          <div className="mb-3">
            <span className="text-[10px] font-bold uppercase text-gray-400">You wrote:</span>
            <p className="text-sm text-gray-600 mt-0.5 italic">&ldquo;{userTranslation}&rdquo;</p>
          </div>

          {/* Arrow */}
          <div className="flex justify-center my-2">
            <ArrowRight className="w-4 h-4 text-indigo-400 rotate-90" />
          </div>

          {/* Suggested */}
          <div>
            <span className="text-[10px] font-bold uppercase text-indigo-500">Better version:</span>
            <p className="text-base font-semibold text-indigo-900 mt-0.5">
              &ldquo;{assessment.suggestedTranslation}&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* Feedback */}
      {typeof assessment.feedback === 'string' ? (
        /* Legacy plain-text feedback */
        <div className="rounded-2xl border-2 border-black bg-gradient-to-br from-amber-50 to-yellow-50 shadow-[4px_4px_0_0_#1e293b] p-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Lightbulb className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                Improvement Tips
              </span>
              <p className="text-sm text-gray-700 mt-1.5 leading-relaxed">
                {assessment.feedback}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Structured feedback */
        <div className="space-y-4">
          {/* Error Corrections */}
          {assessment.feedback.corrections.length > 0 && (
            <div className="rounded-2xl border-2 border-black bg-gradient-to-br from-red-50 to-orange-50 shadow-[4px_4px_0_0_#1e293b] p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center">
                  <PenLine className="w-3.5 h-3.5 text-red-600" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-red-700">
                  Errors to Fix
                </span>
                <span className="text-[10px] font-bold bg-red-200 text-red-800 rounded-full px-2 py-0.5">
                  {assessment.feedback.corrections.length}
                </span>
              </div>
              <div className="space-y-3">
                {assessment.feedback.corrections.map((c, i) => (
                  <div key={i} className="bg-white/70 rounded-xl p-3 border border-red-200/60">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-sm line-through text-red-500 font-medium">{c.wrong}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-emerald-700 font-bold">{c.correct}</span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">{c.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tips */}
          {assessment.feedback.tips.length > 0 && (
            <div className="rounded-2xl border-2 border-black bg-gradient-to-br from-amber-50 to-yellow-50 shadow-[4px_4px_0_0_#1e293b] p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                  Improvement Tips
                </span>
              </div>
              <ul className="space-y-2">
                {assessment.feedback.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-700 leading-relaxed">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Summary */}
          {assessment.feedback.summary && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
              <p className="text-sm text-gray-600 italic">{assessment.feedback.summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
