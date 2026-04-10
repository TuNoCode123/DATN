'use client';

import { useState, useEffect, useRef } from 'react';
import { Volume2, Mic, MicOff, SkipForward, ChevronRight, RefreshCw } from 'lucide-react';
import { usePronunciation } from '@/lib/pronunciation/use-pronunciation';
import type { PronunciationAssessment } from '@/lib/pronunciation/types';

interface ListenSpeakStepProps {
  word: string;
  ipa?: string;
  onComplete: (assessment: PronunciationAssessment | null) => void;
  onSkip: () => void;
}

function ScoreRing({ score, label, color, delay }: { score: number; label: string; color: string; delay: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const colorMap: Record<string, string> = {
    indigo: '#818cf8',
    emerald: '#34d399',
    amber: '#fbbf24',
    rose: '#fb7185',
  };
  const stroke = colorMap[color] || colorMap.indigo;
  const bgMap: Record<string, string> = {
    indigo: 'rgba(129,140,248,0.1)',
    emerald: 'rgba(52,211,153,0.1)',
    amber: 'rgba(251,191,36,0.1)',
    rose: 'rgba(251,113,133,0.1)',
  };

  return (
    <div className="flex flex-col items-center gap-1.5 slide-up-in" style={{ animationDelay: `${delay}ms` }}>
      <div className="relative w-[62px] h-[62px]" style={{ background: bgMap[color], borderRadius: '50%' }}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 60 60">
          <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="4.5" />
          <circle
            cx="30" cy="30" r={r} fill="none"
            stroke={stroke} strokeWidth="4.5" strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={mounted ? offset : circ}
            style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">
          {mounted ? score : 0}
        </span>
      </div>
      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

export default function ListenSpeakStep({ word, ipa, onComplete, onSkip }: ListenSpeakStepProps) {
  const [showScores, setShowScores] = useState(false);
  const savedAssessment = useRef<PronunciationAssessment | null>(null);

  const {
    phase,
    assessment,
    spokenText,
    isTtsLoading,
    startListening,
    stopListening,
    playTts,
    retry,
  } = usePronunciation({
    targetSentence: word,
    language: 'en-US',
    onComplete: (a) => {
      savedAssessment.current = a;
      setShowScores(true);
    },
  });

  const isIdle = phase === 'idle';
  const isListening = phase === 'listening';
  const isAssessing = phase === 'assessing';
  const isDone = phase === 'done';

  return (
    <div className="flex flex-col items-center">
      {/* Hero card */}
      <div className="w-full max-w-md rounded-2xl border-[2.5px] border-border-strong bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-8 mb-8 shadow-[4px_4px_0px_var(--shadow-brutal)] slide-up-in">
        <div className="text-center">
          <h2 className="text-4xl sm:text-5xl font-black font-heading gradient-text-indigo mb-2 leading-tight">
            {word}
          </h2>
          {ipa && (
            <p className="text-base text-indigo-400 font-medium mb-6">{ipa}</p>
          )}

          {/* Buttons row */}
          <div className="flex items-center justify-center gap-5">
            {/* TTS */}
            <button
              onClick={playTts}
              disabled={isTtsLoading || isListening}
              className="relative group w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center border-[2.5px] border-indigo-700/30 shadow-[3px_3px_0px_rgba(99,102,241,0.3)] active:shadow-[1px_1px_0px_rgba(99,102,241,0.3)] active:translate-y-[2px] transition-all disabled:opacity-40 cursor-pointer"
            >
              <Volume2 size={22} />
              {isTtsLoading && (
                <>
                  <span className="absolute inset-0 rounded-2xl border-2 border-indigo-300/60 sound-wave" />
                  <span className="absolute inset-0 rounded-2xl border-2 border-indigo-300/40 sound-wave sound-wave-delay-1" />
                </>
              )}
            </button>

            {/* Divider */}
            <div className="w-px h-10 bg-border" />

            {/* Mic */}
            {!isDone && (
              <button
                onClick={isListening ? stopListening : startListening}
                disabled={isAssessing}
                className={`relative w-16 h-16 rounded-2xl flex items-center justify-center border-[2.5px] shadow-[3px_3px_0px_var(--shadow-brutal)] active:shadow-[1px_1px_0px_var(--shadow-brutal)] active:translate-y-[2px] transition-all cursor-pointer ${
                  isListening
                    ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white border-red-700/30 mic-pulse'
                    : 'bg-white text-indigo-600 border-border-strong hover:bg-indigo-50'
                } ${isAssessing ? 'opacity-40' : ''}`}
              >
                {isListening ? <MicOff size={24} /> : <Mic size={24} />}
                {isAssessing && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80">
                    <div className="w-7 h-7 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Status text */}
      {isIdle && !isDone && !showScores && (
        <p className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          Tap the mic to pronounce the word
        </p>
      )}
      {isListening && (
        <p className="text-sm text-red-500 font-semibold mb-4 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          Recording... tap to stop
        </p>
      )}
      {isAssessing && (
        <p className="text-sm text-indigo-500 font-medium mb-4">
          Analyzing pronunciation...
        </p>
      )}

      {/* Spoken text display */}
      {showScores && spokenText && (
        <div className="w-full max-w-md mb-4 slide-up-in">
          <div className="rounded-xl border-[2.5px] border-indigo-200 bg-gradient-to-r from-indigo-50/80 to-violet-50/80 px-5 py-3.5 shadow-[2px_2px_0px_rgba(99,102,241,0.15)]">
            <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-indigo-400 mb-1.5">You said</p>
            <p className="text-base font-bold text-foreground leading-relaxed">&ldquo;{spokenText}&rdquo;</p>
          </div>
        </div>
      )}

      {/* Score display */}
      {showScores && assessment && (
        <div className="w-full max-w-md slide-up-in">
          {/* Overall banner */}
          <div className={`rounded-2xl border-[2.5px] p-5 mb-4 ${
            assessment.overall.score >= 80
              ? 'border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50'
              : assessment.overall.score >= 50
              ? 'border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50'
              : 'border-rose-300 bg-gradient-to-r from-rose-50 to-pink-50'
          } shadow-[3px_3px_0px_var(--shadow-brutal)]`}>
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 60 60">
                  <circle cx="30" cy="30" r={24} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="5" />
                  <circle
                    cx="30" cy="30" r={24} fill="none"
                    stroke={assessment.overall.score >= 80 ? '#10b981' : assessment.overall.score >= 50 ? '#f59e0b' : '#f43f5e'}
                    strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 24}
                    strokeDashoffset={2 * Math.PI * 24 - (assessment.overall.score / 100) * 2 * Math.PI * 24}
                    className="score-ring-animate"
                    style={{
                      ['--ring-circumference' as string]: 2 * Math.PI * 24,
                      ['--ring-offset' as string]: 2 * Math.PI * 24 - (assessment.overall.score / 100) * 2 * Math.PI * 24,
                    } as React.CSSProperties}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-lg font-black text-foreground">
                  {assessment.overall.score}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-foreground font-heading text-base">
                  {assessment.overall.score >= 80 ? 'Excellent!' : assessment.overall.score >= 50 ? 'Good effort!' : 'Keep practicing!'}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{assessment.feedback}</p>
              </div>
            </div>
          </div>

          {/* Sub-scores */}
          <div className="flex justify-between px-2 mb-6 stagger-in">
            <ScoreRing score={assessment.pronunciation.score} label="Pronun." color="indigo" delay={0} />
            <ScoreRing score={assessment.accuracy.score} label="Accuracy" color="emerald" delay={100} />
            <ScoreRing score={assessment.fluency.score} label="Fluency" color="amber" delay={200} />
            <ScoreRing score={assessment.completeness.score} label="Complete" color="rose" delay={300} />
          </div>

          {/* Actions */}
          <div className="flex justify-center gap-3">
            <button
              onClick={() => { retry(); setShowScores(false); savedAssessment.current = null; }}
              className="brutal-btn bg-white text-foreground px-5 py-2.5 text-sm flex items-center gap-2"
            >
              <RefreshCw size={13} /> Retry
            </button>
            <button
              onClick={() => onComplete(savedAssessment.current)}
              className="brutal-btn-fill px-6 py-2.5 text-sm flex items-center gap-2"
            >
              Continue <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Skip */}
      {!showScores && (
        <button
          onClick={onSkip}
          className="mt-3 text-xs text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <SkipForward size={11} /> Skip
        </button>
      )}
    </div>
  );
}
