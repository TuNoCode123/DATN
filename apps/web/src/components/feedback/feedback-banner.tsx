'use client';

import { useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { LOTTIE, pickCorrectLottie } from '@/lib/feedback';

interface FeedbackBannerProps {
  /** null hides the banner. */
  kind: 'correct' | 'wrong' | null;
  /** Stable key that flips each time a new reveal happens (e.g. question id). */
  revealKey?: string | number;
  message?: string;
  subMessage?: string;
  size?: number;
  className?: string;
}

/**
 * Inline Lottie banner meant to sit above a question card during the
 * reveal phase. For "correct", a random animation is picked per
 * revealKey so each question gets one of celebrate/thumbs-up.
 */
export function FeedbackBanner({
  kind,
  revealKey,
  message,
  subMessage,
  size = 120,
  className = '',
}: FeedbackBannerProps) {
  const lastKeyRef = useRef<string | number | undefined>(undefined);
  const lastSrcRef = useRef<string>('');

  const src = useMemo(() => {
    if (kind === 'wrong') return LOTTIE.wrong;
    if (kind !== 'correct') return '';
    if (revealKey !== undefined && revealKey === lastKeyRef.current && lastSrcRef.current) {
      return lastSrcRef.current;
    }
    const picked = pickCorrectLottie();
    lastKeyRef.current = revealKey;
    lastSrcRef.current = picked;
    return picked;
  }, [kind, revealKey]);

  const label =
    message ?? (kind === 'correct' ? 'Correct!' : kind === 'wrong' ? 'Wrong' : '');
  const bgClass =
    kind === 'correct'
      ? 'bg-gradient-to-r from-emerald-100 via-lime-50 to-emerald-100'
      : 'bg-gradient-to-r from-rose-100 via-pink-50 to-rose-100';
  const textClass =
    kind === 'correct' ? 'text-emerald-700' : 'text-rose-700';

  return (
    <AnimatePresence mode="wait">
      {kind && src && (
        <motion.div
          key={`${kind}-${revealKey ?? 'x'}`}
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className={`flex items-center justify-center gap-4 rounded-2xl border-[3px] border-black shadow-[4px_4px_0_0_#000] px-5 py-3 mb-4 ${bgClass} ${className}`}
        >
          <div style={{ width: size, height: size }} className="shrink-0">
            <DotLottieReact src={src} autoplay loop={false} />
          </div>
          <div className="text-left">
            <p className={`text-xl sm:text-2xl font-black font-heading ${textClass}`}>
              {label}
            </p>
            {subMessage && (
              <p className="text-xs font-semibold text-slate-600 mt-0.5">{subMessage}</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
