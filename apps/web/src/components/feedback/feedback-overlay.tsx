'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { LOTTIE, pickCorrectLottie, playSound } from '@/lib/feedback';

export type FeedbackKind = 'correct' | 'wrong' | 'victory';

interface FeedbackOverlayProps {
  kind: FeedbackKind | null;
  message?: string;
  subMessage?: string;
  autoHideMs?: number;
  playSounds?: boolean;
  onClose?: () => void;
}

export function FeedbackOverlay({
  kind,
  message,
  subMessage,
  autoHideMs = 1400,
  playSounds: enableSounds = true,
  onClose,
}: FeedbackOverlayProps) {
  const src = useMemo(() => {
    if (kind === 'correct') return pickCorrectLottie();
    if (kind === 'wrong') return LOTTIE.wrong;
    if (kind === 'victory') return LOTTIE.trophy;
    return null;
  }, [kind]);

  useEffect(() => {
    if (!kind) return;
    if (enableSounds) {
      if (kind === 'correct') playSound('correct');
      else if (kind === 'wrong') playSound('wrong');
      else if (kind === 'victory') playSound('complete');
    }

    if (autoHideMs > 0 && kind !== 'victory') {
      const t = setTimeout(() => onClose?.(), autoHideMs);
      return () => clearTimeout(t);
    }
  }, [kind, autoHideMs, onClose, enableSounds]);

  return (
    <AnimatePresence>
      {kind && src && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[9998] flex items-center justify-center pointer-events-none"
        >
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] pointer-events-auto" onClick={onClose} />
          <motion.div
            initial={{ scale: 0.7, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 20 }}
            className="relative z-10 flex flex-col items-center"
          >
            <div className="w-56 h-56 sm:w-72 sm:h-72">
              <DotLottieReact src={src} autoplay loop={kind === 'victory'} />
            </div>
            {message && (
              <div className="mt-2 px-6 py-3 rounded-2xl bg-[#FFF8F0] border-[2.5px] border-slate-900 shadow-[4px_4px_0px_#1E293B] text-center">
                <p className="text-lg font-black font-heading text-slate-900">{message}</p>
                {subMessage && (
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">{subMessage}</p>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function useFeedback(
  defaultAutoHide = 1400,
  options: { playSounds?: boolean } = {},
) {
  const [state, setState] = useState<{
    kind: FeedbackKind | null;
    message?: string;
    subMessage?: string;
  }>({ kind: null });

  const show = (kind: FeedbackKind, message?: string, subMessage?: string) =>
    setState({ kind, message, subMessage });
  const hide = () => setState({ kind: null });

  const overlay = (
    <FeedbackOverlay
      kind={state.kind}
      message={state.message}
      subMessage={state.subMessage}
      autoHideMs={defaultAutoHide}
      playSounds={options.playSounds ?? true}
      onClose={hide}
    />
  );

  return { show, hide, overlay };
}
