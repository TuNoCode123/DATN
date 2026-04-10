'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  useRecordFlip,
  useCompleteStudy,
  type Flashcard,
} from '@/features/flashcards/use-flashcard-queries';
import { ArrowLeft, RotateCcw, Check, X, ChevronLeft, ChevronRight, Trophy } from 'lucide-react';

type AnimPhase = 'idle' | 'exit-left' | 'exit-right' | 'enter-from-left' | 'enter-from-right';

interface FlipCardTabProps {
  deckId: string;
  sessionId: string;
  cards: Flashcard[];
}

export default function FlipCardTab({ deckId, sessionId, cards }: FlipCardTabProps) {
  const router = useRouter();
  const recordFlip = useRecordFlip();
  const completeStudy = useCompleteStudy();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCards, setKnownCards] = useState<Set<string>>(new Set());
  const [unknownCards, setUnknownCards] = useState<Set<string>>(new Set());
  const [isComplete, setIsComplete] = useState(false);
  const [animPhase, setAnimPhase] = useState<AnimPhase>('idle');
  const isAnimating = animPhase !== 'idle';
  const touchStartX = useRef(0);

  const currentCard = cards[displayIndex];
  const progress = cards.length > 0 ? ((knownCards.size + unknownCards.size) / cards.length) * 100 : 0;

  const animateToCard = useCallback((nextIndex: number, direction: 'left' | 'right') => {
    if (isAnimating || nextIndex < 0 || nextIndex >= cards.length || nextIndex === currentIndex) return;
    setAnimPhase(direction === 'left' ? 'exit-left' : 'exit-right');
    setTimeout(() => {
      setDisplayIndex(nextIndex); setCurrentIndex(nextIndex); setIsFlipped(false);
      setAnimPhase(direction === 'left' ? 'enter-from-right' : 'enter-from-left');
      setTimeout(() => setAnimPhase('idle'), 350);
    }, 300);
  }, [isAnimating, cards.length, currentIndex]);

  const handleFlip = useCallback(() => { if (!isAnimating) setIsFlipped((f) => !f); }, [isAnimating]);

  const goNext = useCallback(() => {
    if (!isAnimating && currentIndex < cards.length - 1) animateToCard(currentIndex + 1, 'left');
  }, [currentIndex, cards.length, isAnimating, animateToCard]);

  const goPrev = useCallback(() => {
    if (!isAnimating && currentIndex > 0) animateToCard(currentIndex - 1, 'right');
  }, [currentIndex, isAnimating, animateToCard]);

  const handleKnow = useCallback(() => {
    if (!sessionId || !cards[currentIndex] || isAnimating) return;
    const card = cards[currentIndex];
    setKnownCards((p) => { const s = new Set(p); s.add(card.id); return s; });
    setUnknownCards((p) => { const s = new Set(p); s.delete(card.id); return s; });
    recordFlip.mutate({ sessionId, flashcardId: card.id, known: true });
    if (currentIndex < cards.length - 1) animateToCard(currentIndex + 1, 'left');
    else { completeStudy.mutate(sessionId); setIsComplete(true); }
  }, [sessionId, cards, currentIndex, isAnimating, animateToCard, completeStudy, recordFlip]);

  const handleDontKnow = useCallback(() => {
    if (!sessionId || !cards[currentIndex] || isAnimating) return;
    const card = cards[currentIndex];
    setUnknownCards((p) => { const s = new Set(p); s.add(card.id); return s; });
    setKnownCards((p) => { const s = new Set(p); s.delete(card.id); return s; });
    recordFlip.mutate({ sessionId, flashcardId: card.id, known: false });
    if (currentIndex < cards.length - 1) animateToCard(currentIndex + 1, 'left');
    else { completeStudy.mutate(sessionId); setIsComplete(true); }
  }, [sessionId, cards, currentIndex, isAnimating, animateToCard, completeStudy, recordFlip]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleFlip(); }
      if (e.key === '1') handleKnow(); if (e.key === '2') handleDontKnow();
      if (e.key === 'ArrowRight') goNext(); if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [handleFlip, handleKnow, handleDontKnow, goNext, goPrev]);

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.changedTouches[0].screenX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].screenX;
    if (Math.abs(diff) > 60) { if (diff > 0) { goNext(); } else { goPrev(); } }
  };

  const slideClass = ({ 'exit-left': 'card-slide-exit-left', 'exit-right': 'card-slide-exit-right', 'enter-from-left': 'card-slide-enter-from-left', 'enter-from-right': 'card-slide-enter-from-right' } as Record<string, string>)[animPhase] || '';

  if (isComplete) {
    const knownPct = cards.length > 0 ? Math.round((knownCards.size / cards.length) * 100) : 0;
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="brutal-card p-8 mb-8">
          <div className="w-16 h-16 bg-amber-100 rounded-xl border-2 border-border-strong flex items-center justify-center mx-auto mb-5 shadow-[3px_3px_0px_var(--shadow-brutal)]">
            <Trophy size={28} className="text-amber-500" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-1 font-heading">Study Complete!</h2>
          <p className="text-muted-foreground mb-6 text-sm">You&apos;ve reviewed all {cards.length} cards</p>
          <div className="flex justify-center gap-4 mb-6">
            <div className="brutal-card !shadow-[3px_3px_0px_var(--shadow-brutal)] px-5 py-3 text-center">
              <div className="text-2xl font-bold text-emerald-600 font-heading">{knownCards.size}</div>
              <div className="text-xs text-muted-foreground font-medium">Known</div>
            </div>
            <div className="brutal-card !shadow-[3px_3px_0px_var(--shadow-brutal)] px-5 py-3 text-center">
              <div className="text-2xl font-bold text-red-500 font-heading">{unknownCards.size}</div>
              <div className="text-xs text-muted-foreground font-medium">Review</div>
            </div>
          </div>
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden border-2 border-border mb-1">
            <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${knownPct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground font-medium">{knownPct}% mastered</p>
        </div>
        <div className="flex justify-center gap-3">
          <button onClick={() => router.push(`/flashcards/${deckId}`)} className="brutal-btn bg-white text-foreground px-5 py-2.5 text-sm">Back to Deck</button>
          <button onClick={() => { setCurrentIndex(0); setDisplayIndex(0); setIsFlipped(false); setKnownCards(new Set()); setUnknownCards(new Set()); setIsComplete(false); setAnimPhase('idle'); }} className="brutal-btn-fill px-5 py-2.5 text-sm flex items-center gap-2">
            <RotateCcw size={14} /> Study Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto select-none">
      {/* Progress */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-foreground font-bold tabular-nums">{currentIndex + 1} / {cards.length}</span>
      </div>
      <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden border-2 border-border mb-10">
        <div className="h-full bg-primary rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
      </div>

      {/* Card area */}
      <div className="flex items-center gap-2 sm:gap-4 mb-6">
        <button onClick={goPrev} disabled={currentIndex <= 0 || isAnimating}
          className="shrink-0 w-11 h-11 rounded-xl border-[2.5px] border-border-strong bg-white flex items-center justify-center text-muted-foreground hover:text-foreground active:translate-y-[2px] transition-all shadow-[3px_3px_0px_var(--shadow-brutal)] active:shadow-[1px_1px_0px_var(--shadow-brutal)] disabled:opacity-0 disabled:pointer-events-none cursor-pointer">
          <ChevronLeft size={20} />
        </button>

        <div className="relative flex-1 aspect-[3/2]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div className={slideClass} style={{ width: '100%', height: '100%' }}>
            <div className="flashcard-perspective flashcard-hover w-full h-full cursor-pointer" onClick={handleFlip}>
              <div className={`flashcard-inner relative w-full h-full ${isFlipped ? 'flipped' : ''}`}>
                {/* Front */}
                <div className="flashcard-face absolute inset-0 bg-white rounded-2xl border-[2.5px] border-border-strong flex flex-col items-center justify-center p-6 sm:p-10">
                  <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-[0.2em] font-bold mb-5">Term</span>
                  <h2 className="text-3xl sm:text-5xl font-bold text-foreground mb-3 text-center leading-tight font-heading">{currentCard?.word}</h2>
                  {currentCard?.ipa && <p className="text-base sm:text-lg text-muted-foreground">{currentCard.ipa}</p>}
                  <p className="text-[11px] text-muted-foreground/50 mt-auto pt-4 font-medium">Click or press Space to flip</p>
                </div>
                {/* Back */}
                <div className="flashcard-face flashcard-back absolute inset-0 bg-emerald-50 rounded-2xl border-[2.5px] border-border-strong flex flex-col items-center justify-center p-6 sm:p-10">
                  <span className="text-[10px] sm:text-xs text-emerald-600 uppercase tracking-[0.2em] font-bold mb-5">Definition</span>
                  <h2 className="text-xl sm:text-3xl font-semibold text-foreground text-center leading-snug mb-4 font-heading">{currentCard?.meaning}</h2>
                  {currentCard?.exampleSentence && <p className="text-sm sm:text-base text-muted-foreground italic text-center leading-relaxed max-w-md">&ldquo;{currentCard.exampleSentence}&rdquo;</p>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <button onClick={goNext} disabled={currentIndex >= cards.length - 1 || isAnimating}
          className="shrink-0 w-11 h-11 rounded-xl border-[2.5px] border-border-strong bg-white flex items-center justify-center text-muted-foreground hover:text-foreground active:translate-y-[2px] transition-all shadow-[3px_3px_0px_var(--shadow-brutal)] active:shadow-[1px_1px_0px_var(--shadow-brutal)] disabled:opacity-0 disabled:pointer-events-none cursor-pointer">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-1.5 mb-8">
        {cards.map((card, i) => (
          <button key={card.id} onClick={() => !isAnimating && i !== currentIndex && animateToCard(i, i > currentIndex ? 'left' : 'right')}
            className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
              i === currentIndex ? 'w-7 bg-foreground'
              : knownCards.has(card.id) ? 'w-2 bg-emerald-400'
              : unknownCards.has(card.id) ? 'w-2 bg-red-400'
              : 'w-2 bg-border hover:bg-muted-foreground'
            }`} />
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex justify-center gap-4">
        <button onClick={handleDontKnow} disabled={isAnimating} className="brutal-btn bg-white text-red-500 px-6 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50">
          <X size={16} strokeWidth={2.5} /> Don&apos;t Know
        </button>
        <button onClick={handleKnow} disabled={isAnimating} className="brutal-btn-fill px-6 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50">
          <Check size={16} strokeWidth={2.5} /> I Know
        </button>
      </div>

      <p className="text-center text-[10px] text-muted-foreground/50 mt-5 tracking-wide font-medium uppercase">
        Space flip &middot; &larr; &rarr; navigate &middot; 1 know &middot; 2 don&apos;t know
      </p>
    </div>
  );
}
