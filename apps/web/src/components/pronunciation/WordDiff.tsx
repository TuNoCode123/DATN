'use client';

import { cn } from '@/lib/utils';
import type { WordComparison } from '@/lib/pronunciation/types';

interface WordDiffProps {
  words: WordComparison[];
}

function getWordStyle(w: WordComparison) {
  if (!w.correct) {
    return 'bg-red-100 text-red-800 line-through shadow-[2px_2px_0_0_#991b1b]';
  }
  if (!w.fluent) {
    return 'bg-amber-100 text-amber-800 shadow-[2px_2px_0_0_#92400e]';
  }
  return 'bg-green-100 text-green-800 shadow-[2px_2px_0_0_#166534]';
}

function getSubLabel(w: WordComparison) {
  if (!w.spoken) return 'missed';
  if (!w.correct) return w.spoken;
  if (!w.fluent) return 'not fluent';
  return w.spoken;
}

export function WordDiff({ words }: WordDiffProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {words.map((w, i) => (
        <div key={i} className="text-center">
          <div
            className={cn(
              'px-2.5 py-1.5 text-lg font-mono border-2 border-black rounded-lg transition-colors',
              getWordStyle(w),
            )}
          >
            {w.target}
          </div>
          <div className="text-xs text-gray-500 mt-1 font-mono">
            {getSubLabel(w)}
          </div>
        </div>
      ))}
    </div>
  );
}
