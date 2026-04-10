'use client';

import { cn } from '@/lib/utils';
import type { PronunciationAssessment, ScoreItem } from '@/lib/pronunciation/types';
import { WordDiff } from './WordDiff';

const STATUS_STYLES: Record<string, string> = {
  master: 'bg-green-100 text-green-800 border-green-600',
  good: 'bg-blue-100 text-blue-800 border-blue-600',
  fair: 'bg-yellow-100 text-yellow-800 border-yellow-600',
  poor: 'bg-red-100 text-red-800 border-red-600',
};

function StatusBadge({ item }: { item: ScoreItem }) {
  return (
    <span
      className={cn(
        'px-2 py-0.5 text-xs font-bold border-2 border-black rounded-full uppercase',
        STATUS_STYLES[item.status],
      )}
    >
      {item.status}
    </span>
  );
}

function ScoreBar({ label, item }: { label: string; item: ScoreItem }) {
  return (
    <div className="brutal-card p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase font-bold text-gray-600">{label}</span>
        <StatusBadge item={item} />
      </div>
      <div className="flex items-center gap-2">
        <div className="text-2xl font-black">{item.score}</div>
        <div className="flex-1 h-2.5 bg-gray-200 border border-black rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              item.score >= 90
                ? 'bg-green-500'
                : item.score >= 70
                  ? 'bg-blue-500'
                  : item.score >= 50
                    ? 'bg-yellow-500'
                    : 'bg-red-500',
            )}
            style={{ width: `${item.score}%` }}
          />
        </div>
      </div>
    </div>
  );
}

interface ScoreCardProps {
  assessment: PronunciationAssessment;
}

export function ScoreCard({ assessment }: ScoreCardProps) {
  const metrics: { label: string; key: keyof PronunciationAssessment }[] = [
    { label: 'Pronunciation', key: 'pronunciation' },
    { label: 'Accuracy', key: 'accuracy' },
    { label: 'Fluency', key: 'fluency' },
    { label: 'Completeness', key: 'completeness' },
  ];

  return (
    <div className="brutal-card p-6 space-y-5">
      {/* Overall score */}
      <div className="text-center space-y-2">
        <div className="text-5xl font-black">{assessment.overall.score}</div>
        <StatusBadge item={assessment.overall} />
      </div>

      {/* Individual metrics */}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map(({ label, key }) => (
          <ScoreBar
            key={key}
            label={label}
            item={assessment[key] as ScoreItem}
          />
        ))}
      </div>

      {/* Word comparison */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-bold text-gray-600">Word Comparison</h4>
          <div className="flex gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-green-200 border border-black" /> correct</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-200 border border-black" /> not fluent</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-200 border border-black" /> wrong</span>
          </div>
        </div>
        <WordDiff words={assessment.wordComparison} />
      </div>

      {/* Feedback */}
      <div className="brutal-card p-3 bg-blue-50 border-blue-300">
        <p className="text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: assessment.feedback }} />
      </div>
    </div>
  );
}
