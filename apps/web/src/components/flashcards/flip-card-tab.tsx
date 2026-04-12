'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion';
import {
  useRecordFlip,
  useCompleteStudy,
  type Flashcard,
} from '@/features/flashcards/use-flashcard-queries';
import {
  RotateCcw,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Volume2,
  ImageIcon,
  Sparkles,
} from 'lucide-react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { playSound, LOTTIE } from '@/lib/feedback';
import { useFeedback } from '@/components/feedback/feedback-overlay';

interface FlipCardTabProps {
  deckId: string;
  sessionId: string;
  cards: Flashcard[];
}

const GLASS =
  'bg-[#FFF8F0] border-2 border-slate-900 shadow-[4px_4px_0px_#1E293B]';

export default function FlipCardTab({
  deckId,
  sessionId,
  cards,
}: FlipCardTabProps) {
  const router = useRouter();
  const recordFlip = useRecordFlip();
  const completeStudy = useCompleteStudy();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [knownCards, setKnownCards] = useState<Set<string>>(new Set());
  const [unknownCards, setUnknownCards] = useState<Set<string>>(new Set());
  const [isComplete, setIsComplete] = useState(false);
  const touchStartX = useRef(0);
  const { show: showFeedback, overlay: feedbackOverlay } = useFeedback(900);

  const currentCard = cards[currentIndex];
  const progress =
    cards.length > 0
      ? ((knownCards.size + unknownCards.size) / cards.length) * 100
      : 0;

  const handleFlip = useCallback(() => setIsFlipped((f) => !f), []);

  const advance = useCallback(
    (next: number, dir: 1 | -1) => {
      if (next < 0 || next >= cards.length) return;
      setDirection(dir);
      setIsFlipped(false);
      setCurrentIndex(next);
    },
    [cards.length],
  );

  const goNext = useCallback(() => {
    if (currentIndex < cards.length - 1) advance(currentIndex + 1, 1);
  }, [currentIndex, cards.length, advance]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) advance(currentIndex - 1, -1);
  }, [currentIndex, advance]);

  const handleKnow = useCallback(() => {
    if (!sessionId || !cards[currentIndex]) return;
    const card = cards[currentIndex];
    setKnownCards((p) => {
      const s = new Set(p);
      s.add(card.id);
      return s;
    });
    setUnknownCards((p) => {
      const s = new Set(p);
      s.delete(card.id);
      return s;
    });
    recordFlip.mutate({ sessionId, flashcardId: card.id, known: true });
    showFeedback('correct');
    if (currentIndex < cards.length - 1) advance(currentIndex + 1, 1);
    else {
      completeStudy.mutate(sessionId);
      setIsComplete(true);
    }
  }, [sessionId, cards, currentIndex, advance, completeStudy, recordFlip, showFeedback]);

  const handleDontKnow = useCallback(() => {
    if (!sessionId || !cards[currentIndex]) return;
    const card = cards[currentIndex];
    setUnknownCards((p) => {
      const s = new Set(p);
      s.add(card.id);
      return s;
    });
    setKnownCards((p) => {
      const s = new Set(p);
      s.delete(card.id);
      return s;
    });
    recordFlip.mutate({ sessionId, flashcardId: card.id, known: false });
    showFeedback('wrong');
    if (currentIndex < cards.length - 1) advance(currentIndex + 1, 1);
    else {
      completeStudy.mutate(sessionId);
      setIsComplete(true);
    }
  }, [sessionId, cards, currentIndex, advance, completeStudy, recordFlip, showFeedback]);

  // Keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleFlip();
      }
      if (e.key === '1') handleKnow();
      if (e.key === '2') handleDontKnow();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [handleFlip, handleKnow, handleDontKnow, goNext, goPrev]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.changedTouches[0].screenX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 60) {
      if (diff > 0) goNext();
      else goPrev();
    }
  };

  // Confetti + victory sound on completion
  useEffect(() => {
    if (isComplete) {
      playSound('complete');
      import('canvas-confetti')
        .then((m) => {
          m.default({
            particleCount: 140,
            spread: 90,
            origin: { y: 0.55 },
            colors: ['#6366f1', '#a855f7', '#ec4899', '#10b981', '#f59e0b'],
          });
        })
        .catch(() => {});
    }
  }, [isComplete]);

  if (isComplete) {
    const knownPct =
      cards.length > 0 ? Math.round((knownCards.size / cards.length) * 100) : 0;
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 22 }}
          className={`${GLASS} rounded-3xl p-8 mb-8 relative overflow-hidden`}
        >
          <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-gradient-to-br from-amber-400/30 via-orange-400/20 to-rose-400/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-gradient-to-br from-indigo-400/20 to-violet-400/20 blur-3xl" />

          <motion.div
            initial={{ scale: 0, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.15 }}
            className="relative w-40 h-40 mx-auto mb-2"
          >
            <DotLottieReact src={LOTTIE.trophy} autoplay loop />
          </motion.div>

          <h2 className="relative text-3xl font-bold text-slate-900 mb-1 font-heading">
            Study Complete!
          </h2>
          <p className="relative text-slate-500 mb-6 text-sm">
            You&apos;ve reviewed all {cards.length} cards
          </p>

          <div className="relative flex justify-center gap-4 mb-6">
            <div className="px-5 py-3 rounded-2xl bg-emerald-50/80 backdrop-blur border border-emerald-200/60 text-center">
              <div className="text-3xl font-bold text-emerald-600 font-heading tabular-nums">
                {knownCards.size}
              </div>
              <div className="text-xs text-emerald-700 font-semibold">Known</div>
            </div>
            <div className="px-5 py-3 rounded-2xl bg-rose-50/80 backdrop-blur border border-rose-200/60 text-center">
              <div className="text-3xl font-bold text-rose-500 font-heading tabular-nums">
                {unknownCards.size}
              </div>
              <div className="text-xs text-rose-700 font-semibold">Review</div>
            </div>
          </div>

          <div className="relative">
            <div className="w-full h-3 bg-slate-200/60 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${knownPct}%` }}
                transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
                className="relative h-full bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500 rounded-full"
              >
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
              </motion.div>
            </div>
            <p className="text-xs text-slate-500 font-semibold mt-2 tabular-nums">
              {knownPct}% mastered
            </p>
          </div>
        </motion.div>

        <div className="flex justify-center gap-3">
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push(`/flashcards/${deckId}`)}
            className="px-6 py-3 rounded-2xl bg-white/80 backdrop-blur border border-white/80 ring-1 ring-slate-900/5 text-slate-700 font-semibold text-sm cursor-pointer"
          >
            Back to Deck
          </motion.button>
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setCurrentIndex(0);
              setIsFlipped(false);
              setKnownCards(new Set());
              setUnknownCards(new Set());
              setIsComplete(false);
            }}
            className="relative overflow-hidden px-6 py-3 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white font-semibold text-sm flex items-center gap-2 shadow-lg shadow-indigo-500/30 cursor-pointer"
          >
            <RotateCcw size={15} /> Study Again
          </motion.button>
        </div>

        {feedbackOverlay}

        <style jsx global>{`
          @keyframes shimmer {
            100% {
              transform: translateX(100%);
            }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto select-none">
      {/* Progress */}
      <div className="flex items-center justify-between mb-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF0DE] border-2 border-slate-900 shadow-[2px_2px_0px_#1E293B]">
          <Sparkles size={11} className="text-indigo-500" />
          <span className="text-xs text-slate-900 font-bold tabular-nums">
            {currentIndex + 1} / {cards.length}
          </span>
        </div>
        <span className="text-xs text-slate-600 font-semibold tabular-nums">
          {Math.round(progress)}% complete
        </span>
      </div>
      <div className="relative w-full h-3 bg-[#FFF0DE] border-2 border-slate-900 rounded-full overflow-hidden mb-10">
        <motion.div
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 rounded-full"
        >
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
        </motion.div>
      </div>

      {/* Card area */}
      <div className="flex items-center gap-2 sm:gap-4 mb-6">
        <NavButton onClick={goPrev} disabled={currentIndex <= 0}>
          <ChevronLeft size={20} />
        </NavButton>

        <div
          className="relative flex-1 aspect-[3/2]"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{ perspective: 1400 }}
        >
          <AnimatePresence mode="wait" custom={direction}>
            <ParallaxFlipCard
              key={currentCard?.id}
              card={currentCard}
              isFlipped={isFlipped}
              onFlip={handleFlip}
              direction={direction}
            />
          </AnimatePresence>
        </div>

        <NavButton
          onClick={goNext}
          disabled={currentIndex >= cards.length - 1}
        >
          <ChevronRight size={20} />
        </NavButton>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-1.5 mb-8 flex-wrap max-w-lg mx-auto">
        {cards.map((card, i) => (
          <button
            key={card.id}
            onClick={() =>
              i !== currentIndex && advance(i, i > currentIndex ? 1 : -1)
            }
            className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
              i === currentIndex
                ? 'w-8 bg-gradient-to-r from-indigo-500 to-violet-500 shadow-sm shadow-indigo-500/50'
                : knownCards.has(card.id)
                  ? 'w-2 bg-emerald-400'
                  : unknownCards.has(card.id)
                    ? 'w-2 bg-rose-400'
                    : 'w-2 bg-slate-300 hover:bg-slate-400'
            }`}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex justify-center gap-4">
        <ActionButton variant="dont-know" onClick={handleDontKnow}>
          <X size={18} strokeWidth={2.8} /> Don&apos;t Know
        </ActionButton>
        <ActionButton variant="know" onClick={handleKnow}>
          <Check size={18} strokeWidth={2.8} /> I Know
        </ActionButton>
      </div>

      <p className="text-center text-[10px] text-slate-400 mt-5 tracking-wide font-medium uppercase">
        Space flip · ← → navigate · 1 know · 2 don&apos;t know
      </p>

      {feedbackOverlay}

      <style jsx global>{`
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}

/* -------- Parallax 3D Flip Card -------- */
function ParallaxFlipCard({
  card,
  isFlipped,
  onFlip,
  direction,
}: {
  card?: Flashcard;
  isFlipped: boolean;
  onFlip: () => void;
  direction: 1 | -1;
}) {
  // Mouse-driven parallax
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const springCfg = { stiffness: 180, damping: 18, mass: 0.6 };
  const rotX = useSpring(useTransform(my, [-0.5, 0.5], [8, -8]), springCfg);
  const rotY = useSpring(useTransform(mx, [-0.5, 0.5], [-12, 12]), springCfg);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const handleMouseLeave = () => {
    mx.set(0);
    my.set(0);
  };

  if (!card) return null;

  return (
    <motion.div
      custom={direction}
      initial={{ opacity: 0, x: direction * 80, rotateY: 0 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -direction * 80 }}
      transition={{ type: 'spring', stiffness: 220, damping: 26 }}
      className="w-full h-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onFlip}
      style={{
        rotateX: rotX,
        rotateY: rotY,
        transformStyle: 'preserve-3d',
        cursor: 'pointer',
      }}
    >
      <motion.div
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 22, mass: 0.9 }}
        className="relative w-full h-full"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* FRONT */}
        <CardFace>
          <div className="absolute top-5 left-6 right-6 flex items-center justify-between">
            <span className="text-[10px] sm:text-xs text-indigo-500 uppercase tracking-[0.2em] font-bold">
              Term
            </span>
            {card.audioUrl && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  new Audio(card.audioUrl!).play().catch(() => {});
                }}
                className="w-8 h-8 rounded-xl bg-[#FFF0DE] border-2 border-slate-900 shadow-[2px_2px_0px_#1E293B] flex items-center justify-center text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                <Volume2 size={14} />
              </button>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <motion.h2
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="text-4xl sm:text-6xl font-bold text-slate-900 mb-4 leading-tight font-heading tracking-tight"
            >
              {card.word}
            </motion.h2>
            {card.ipa && (
              <p className="text-lg sm:text-xl text-slate-500 font-mono">
                {card.ipa}
              </p>
            )}
          </div>

          <motion.p
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 2.2, repeat: Infinity }}
            className="absolute bottom-5 left-0 right-0 text-center text-[11px] text-slate-400 font-medium uppercase tracking-wider"
          >
            Click to flip
          </motion.p>
        </CardFace>

        {/* BACK */}
        <CardFace back>
          <div className="absolute top-5 left-6 right-6">
            <span className="text-[10px] sm:text-xs text-violet-500 uppercase tracking-[0.2em] font-bold">
              Definition
            </span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 gap-4">
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-900 leading-snug font-heading">
              {card.meaning}
            </h2>
            {card.exampleSentence && (
              <p className="text-sm sm:text-base text-slate-500 italic leading-relaxed max-w-md">
                &ldquo;{card.exampleSentence}&rdquo;
              </p>
            )}

            {/* AI image placeholder */}
            {card.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.imageUrl}
                alt={card.word}
                className="w-24 h-24 rounded-2xl object-cover border border-white/80 shadow-md"
              />
            ) : (
              <div className="relative w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-100 via-violet-100 to-fuchsia-100 border border-white/80 flex items-center justify-center overflow-hidden">
                <ImageIcon size={22} className="text-violet-400" />
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
              </div>
            )}
          </div>
        </CardFace>
      </motion.div>
    </motion.div>
  );
}

function CardFace({
  children,
  back,
}: {
  children: React.ReactNode;
  back?: boolean;
}) {
  return (
    <div
      className="absolute inset-0 rounded-3xl overflow-hidden flex flex-col border-2 border-slate-900 shadow-[6px_6px_0px_#1E293B]"
      style={{
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        transform: back ? 'rotateY(180deg)' : undefined,
        backgroundColor: back ? '#FFF0DE' : '#FFF8F0',
      }}
    >
      <div className="relative flex-1 flex flex-col">{children}</div>
    </div>
  );
}

function NavButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.08, y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 w-12 h-12 rounded-2xl bg-[#FFF0DE] border-2 border-slate-900 shadow-[3px_3px_0px_#1E293B] flex items-center justify-center text-slate-700 hover:text-indigo-600 transition-colors disabled:opacity-0 disabled:pointer-events-none cursor-pointer"
    >
      {children}
    </motion.button>
  );
}

function ActionButton({
  variant,
  onClick,
  children,
}: {
  variant: 'know' | 'dont-know';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const isKnow = variant === 'know';
  return (
    <motion.button
      whileHover={{ y: -3, scale: 1.03 }}
      whileTap={{ scale: 0.9, y: 2 }}
      transition={{ type: 'spring', stiffness: 360, damping: 18 }}
      onClick={onClick}
      className={`relative overflow-hidden px-7 py-3.5 rounded-2xl font-bold text-sm flex items-center gap-2 cursor-pointer min-w-[160px] justify-center ${
        isKnow
          ? 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/40'
          : 'bg-gradient-to-br from-rose-400 via-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/40'
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-transparent" />
      <div className="relative flex items-center gap-2">{children}</div>
    </motion.button>
  );
}
