'use client';

import { useState, useEffect } from 'react';
import { Volume2, Mic, MicOff, ChevronRight, Star, BookOpen, Sparkles } from 'lucide-react';
import { usePronunciation } from '@/lib/pronunciation/use-pronunciation';

interface SentenceStepProps {
  word: string;
  sentence: string;
  onComplete: (confidence: number) => void;
}

function TypewriterText({ text, word }: { text: string; word: string }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        setDone(true);
        clearInterval(timer);
      }
    }, 25);
    return () => clearInterval(timer);
  }, [text]);

  const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = displayed.split(regex);

  return (
    <span className={done ? '' : 'typewriter-cursor'}>
      {parts.map((part, i) =>
        part.toLowerCase() === word.toLowerCase() ? (
          <span
            key={i}
            className="relative inline-block font-black text-emerald-700"
          >
            <span className="relative z-10">{part}</span>
            <span className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-r from-emerald-200 to-teal-200 rounded-sm -z-0 opacity-60" />
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

const CONFIDENCE_LABELS = [
  { level: 1, label: 'Still learning', emoji: '~', color: 'from-rose-400 to-pink-500', ring: 'ring-rose-200' },
  { level: 2, label: 'Getting there', emoji: '~', color: 'from-amber-400 to-yellow-500', ring: 'ring-amber-200' },
  { level: 3, label: 'Nailed it!', emoji: '~', color: 'from-emerald-400 to-teal-500', ring: 'ring-emerald-200' },
];

export default function SentenceStep({ word, sentence, onComplete }: SentenceStepProps) {
  const [confidence, setConfidence] = useState(0);
  const [showPronunciation, setShowPronunciation] = useState(false);
  const [pronDone, setPronDone] = useState(false);

  const {
    phase,
    assessment,
    spokenText,
    isTtsLoading,
    startListening,
    stopListening,
    playTts,
  } = usePronunciation({
    targetSentence: sentence,
    language: 'en-US',
    onComplete: () => setPronDone(true),
  });

  const isListening = phase === 'listening';
  const isAssessing = phase === 'assessing';

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto">
      {/* Sentence card */}
      <div className="w-full rounded-2xl border-[2.5px] border-border-strong overflow-hidden mb-6 shadow-[4px_4px_0px_var(--shadow-brutal)] slide-up-in">
        {/* Gradient header */}
        <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-6 py-3 flex items-center gap-2">
          <BookOpen size={16} className="text-white/80" />
          <span className="text-xs text-white/90 font-bold uppercase tracking-wider">Example in context</span>
        </div>
        {/* Sentence body */}
        <div className="bg-gradient-to-br from-white via-white to-emerald-50/30 px-6 sm:px-8 py-8">
          <p className="text-lg sm:text-xl leading-relaxed text-foreground text-center font-semibold">
            &ldquo;<TypewriterText text={sentence} word={word} />&rdquo;
          </p>
        </div>
      </div>

      {/* Pronunciation section */}
      {!showPronunciation && !pronDone && (
        <button
          onClick={() => setShowPronunciation(true)}
          className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl border-[2.5px] border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold text-sm mb-6 hover:bg-emerald-100 hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_rgba(16,185,129,0.2)] transition-all cursor-pointer slide-up-in"
          style={{ animationDelay: '200ms' }}
        >
          <Mic size={15} /> Practice reading aloud
        </button>
      )}

      {showPronunciation && !pronDone && (
        <div className="flex items-center gap-3 mb-6 slide-up-in">
          <button
            onClick={playTts}
            disabled={isTtsLoading || isListening}
            className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white flex items-center justify-center border-[2.5px] border-emerald-600/20 shadow-[2px_2px_0px_rgba(16,185,129,0.3)] active:shadow-[1px_1px_0px_rgba(16,185,129,0.3)] active:translate-y-[1px] transition-all disabled:opacity-40 cursor-pointer"
          >
            <Volume2 size={17} />
          </button>
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={isAssessing}
            className={`w-12 h-12 rounded-xl flex items-center justify-center border-[2.5px] shadow-[2px_2px_0px_var(--shadow-brutal)] active:shadow-[1px_1px_0px_var(--shadow-brutal)] active:translate-y-[1px] transition-all cursor-pointer ${
              isListening ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white border-red-600/20 mic-pulse' : 'bg-white text-emerald-600 border-border-strong'
            }`}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          {isAssessing && (
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      )}

      {/* Spoken text display */}
      {pronDone && spokenText && (
        <div className="w-full rounded-xl border-[2.5px] border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-teal-50/80 px-5 py-3.5 mb-3 shadow-[2px_2px_0px_rgba(16,185,129,0.12)] slide-up-in">
          <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-emerald-500 mb-1.5">You said</p>
          <p className="text-sm font-bold text-foreground leading-relaxed">&ldquo;{spokenText}&rdquo;</p>
        </div>
      )}

      {/* Pronunciation result */}
      {pronDone && assessment && (
        <div className="w-full rounded-xl border-[2.5px] border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50/50 px-5 py-3.5 mb-6 flex items-center gap-3.5 shadow-[3px_3px_0px_rgba(16,185,129,0.15)] slide-up-in">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 ${
            assessment.overall.score >= 80
              ? 'bg-gradient-to-br from-emerald-400 to-teal-500'
              : assessment.overall.score >= 50
              ? 'bg-gradient-to-br from-amber-400 to-yellow-500'
              : 'bg-gradient-to-br from-rose-400 to-pink-500'
          }`}>
            {assessment.overall.score}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">
              {assessment.overall.score >= 80 ? 'Great reading!' : assessment.overall.score >= 50 ? 'Good try!' : 'Keep practicing!'}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{assessment.feedback}</p>
          </div>
        </div>
      )}

      {/* Confidence rating */}
      <div className="w-full rounded-2xl border-[2.5px] border-border-strong bg-white p-5 mb-6 shadow-[3px_3px_0px_var(--shadow-brutal)] slide-up-in" style={{ animationDelay: '150ms' }}>
        <p className="text-sm text-foreground font-bold mb-4 text-center flex items-center justify-center gap-2">
          <Sparkles size={14} className="text-amber-500" />
          How well do you know this word?
        </p>
        <div className="flex justify-center gap-3">
          {CONFIDENCE_LABELS.map(({ level, label, color }) => (
            <button
              key={level}
              onClick={() => setConfidence(level)}
              className={`flex flex-col items-center gap-2 px-4 py-3 rounded-xl border-[2.5px] transition-all cursor-pointer ${
                confidence === level
                  ? 'border-amber-400 bg-amber-50 shadow-[2px_2px_0px_rgba(251,191,36,0.3)] scale-105'
                  : 'border-border bg-gray-50/50 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Star
                size={24}
                className={confidence >= level ? 'text-amber-400' : 'text-gray-300'}
                fill={confidence >= level ? 'currentColor' : 'none'}
                strokeWidth={2}
              />
              <span className={`text-[10px] font-bold uppercase tracking-wider ${
                confidence === level ? 'text-amber-700' : 'text-muted-foreground'
              }`}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Next button */}
      <button
        onClick={() => onComplete(confidence || 1)}
        className="brutal-btn-fill px-7 py-2.5 text-sm flex items-center gap-2"
      >
        Continue <ChevronRight size={14} />
      </button>
    </div>
  );
}
