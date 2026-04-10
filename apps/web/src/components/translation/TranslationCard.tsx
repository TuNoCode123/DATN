'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ProgressRing } from './svg/ProgressRing';
import { Send, Loader2 } from 'lucide-react';

interface TranslationCardProps {
  vietnamese: string;
  sentenceIndex: number;
  totalSentences: number;
  onSubmit: (translation: string) => void;
  isSubmitting: boolean;
  disabled?: boolean;
  initialValue?: string;
}

export function TranslationCard({
  vietnamese,
  sentenceIndex,
  totalSentences,
  onSubmit,
  isSubmitting,
  disabled,
  initialValue = '',
}: TranslationCardProps) {
  const [value, setValue] = useState(initialValue);
  const progress = ((sentenceIndex + 1) / totalSentences) * 100;

  function handleSubmit() {
    if (value.trim() && !isSubmitting && !disabled) {
      onSubmit(value.trim());
    }
  }

  return (
    <div className="space-y-5">
      {/* Vietnamese sentence card */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-black bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 shadow-[4px_4px_0_0_#1e293b]">
        {/* Decorative top accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-red-400 to-amber-400" />

        <div className="p-6 pt-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {/* SVG quotation mark */}
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="14" fill="#F59E0B" opacity="0.15" />
                <text x="14" y="20" textAnchor="middle" fontSize="18" fontWeight="bold" fill="#D97706">
                  &#8220;
                </text>
              </svg>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700/70">
                Translate this sentence
              </span>
            </div>
            <ProgressRing progress={progress} size={44} strokeWidth={3}>
              <span className="text-[10px] font-black text-gray-600">
                {sentenceIndex + 1}/{totalSentences}
              </span>
            </ProgressRing>
          </div>

          <p className="text-2xl font-bold leading-relaxed text-gray-900 pl-1">
            {vietnamese}
          </p>

          {/* Decorative bottom element */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-amber-200/60">
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
              <rect width="16" height="12" rx="2" fill="#EF4444" opacity="0.8" />
              <polygon
                points="8,2 9,4.5 11.5,4.5 9.5,6 10.2,8.5 8,7 5.8,8.5 6.5,6 4.5,4.5 7,4.5"
                fill="#F59E0B"
              />
            </svg>
            <span className="text-[10px] font-semibold text-amber-600/60 uppercase tracking-wide">
              Vietnamese → English
            </span>
          </div>
        </div>
      </div>

      {/* English input card */}
      <div className="rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0_0_#1e293b] overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-400 via-blue-400 to-indigo-400" />

        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="10" fill="#6366F1" opacity="0.12" />
              <text x="10" y="14" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#4F46E5">
                En
              </text>
            </svg>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600/70">
              Your English translation
            </span>
          </div>

          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Type your English translation here..."
            rows={3}
            disabled={disabled || isSubmitting}
            className={cn(
              'w-full px-4 py-3 text-lg rounded-xl border-2 transition-all duration-200 resize-none',
              'focus:outline-none focus:ring-0',
              disabled
                ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                : 'border-gray-200 bg-gray-50/50 text-gray-900 focus:border-indigo-400 focus:bg-white focus:shadow-[0_0_0_3px_rgba(99,102,241,0.1)]',
            )}
          />

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-gray-400">
              {value.length > 0 ? `${value.split(/\s+/).filter(Boolean).length} words` : 'Press Enter to submit'}
            </span>

            <button
              onClick={handleSubmit}
              disabled={!value.trim() || isSubmitting || disabled}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200',
                'border-2 border-black shadow-[3px_3px_0_0_#1e293b]',
                !value.trim() || isSubmitting || disabled
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none border-gray-300'
                  : 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0_0_#1e293b] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0_0_#1e293b]',
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
