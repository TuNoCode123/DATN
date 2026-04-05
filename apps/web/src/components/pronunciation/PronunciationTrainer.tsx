'use client';

import { cn } from '@/lib/utils';
import { usePronunciation } from '@/lib/pronunciation/use-pronunciation';
import { ScoreCard } from './ScoreCard';
import { Mic, Square, RotateCcw, Volume2, Loader2 } from 'lucide-react';
import type { PronunciationAssessment } from '@/lib/pronunciation/types';

interface PronunciationTrainerProps {
  targetSentence: string;
  language?: string;
  onComplete?: (assessment: PronunciationAssessment, spokenText: string) => void;
  attemptId?: string;
  questionId?: string;
}

export function PronunciationTrainer({
  targetSentence,
  language = 'en-US',
  onComplete,
  attemptId,
  questionId,
}: PronunciationTrainerProps) {
  const {
    spokenText,
    assessment,
    phase,
    error,
    isTtsLoading,
    isListening,
    elapsedSec,
    startListening,
    stopListening,
    retry,
    playTts,
  } = usePronunciation({
    targetSentence,
    language,
    onComplete,
    attemptId,
    questionId,
  });

  return (
    <div className="space-y-6">
      {/* Target sentence */}
      <div className="brutal-card p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold uppercase text-gray-500">
            Say this sentence
          </span>
          <button
            onClick={playTts}
            disabled={isTtsLoading}
            className="brutal-btn px-3 py-1.5 text-sm flex items-center gap-1.5 bg-white hover:bg-gray-50"
          >
            {isTtsLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
            Listen
          </button>
        </div>
        <p className="text-2xl font-bold leading-relaxed">{targetSentence}</p>
      </div>

      {/* Live transcript */}
      {(isListening || spokenText) && (
        <div className="brutal-card p-6">
          <span className="text-xs font-bold uppercase text-gray-500 mb-2 block">
            You said
          </span>
          <p
            className={cn(
              'text-xl font-mono min-h-[2rem]',
              phase === 'listening' ? 'text-gray-400' : 'text-gray-800',
            )}
          >
            {spokenText || (
              <span className="text-gray-300 animate-pulse">Listening...</span>
            )}
          </p>
          {isListening && (
            <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Recording... {elapsedSec}s
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        {phase === 'idle' && (
          <button
            onClick={startListening}
            className="brutal-btn-fill px-6 py-3 text-base flex items-center gap-2"
          >
            <Mic className="w-5 h-5" />
            Start Speaking
          </button>
        )}

        {phase === 'listening' && (
          <button
            onClick={stopListening}
            className="brutal-btn px-6 py-3 text-base flex items-center gap-2 bg-red-50 hover:bg-red-100 border-red-600 text-red-700"
          >
            <Square className="w-5 h-5" />
            Stop
          </button>
        )}

        {phase === 'assessing' && (
          <div className="brutal-btn px-6 py-3 text-base flex items-center gap-2 bg-gray-50 cursor-wait">
            <Loader2 className="w-5 h-5 animate-spin" />
            Analyzing...
          </div>
        )}

        {phase === 'done' && (
          <button
            onClick={retry}
            className="brutal-btn-fill px-6 py-3 text-base flex items-center gap-2"
          >
            <RotateCcw className="w-5 h-5" />
            Try Again
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="brutal-card p-4 bg-red-50 border-red-600 text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Assessment results */}
      {assessment && (
        <ScoreCard assessment={assessment} />
      )}
    </div>
  );
}
