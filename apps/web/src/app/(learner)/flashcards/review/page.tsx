'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStartReview, useRateCard, useReviewStats } from '@/features/flashcards/use-flashcard-queries';
import { ArrowLeft, Brain, Flame, BookOpen, Trophy, Star, RotateCcw, Check } from 'lucide-react';

const QUALITY_OPTIONS = [
  { value: 0, label: 'Blackout', bg: 'bg-red-500' },
  { value: 1, label: 'Wrong', bg: 'bg-red-400' },
  { value: 2, label: 'Hard', bg: 'bg-orange-400' },
  { value: 3, label: 'Ok', bg: 'bg-amber-400' },
  { value: 4, label: 'Good', bg: 'bg-emerald-400' },
  { value: 5, label: 'Easy', bg: 'bg-emerald-500' },
];

type Phase = 'stats' | 'review' | 'complete';

export default function ReviewPage() {
  const router = useRouter();
  const { data: stats } = useReviewStats();
  const startReview = useStartReview();
  const rateCard = useRateCard();

  const [phase, setPhase] = useState<Phase>('stats');
  const [sessionId, setSessionId] = useState('');
  const [cards, setCards] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const handleStartReview = () => {
    startReview.mutate(undefined, {
      onSuccess: (data) => {
        if (!data.session) return;
        setSessionId(data.session.id); setCards(data.cards); setPhase('review');
      },
    });
  };

  const handleRate = (quality: number) => {
    const card = cards[currentIndex];
    if (!card) return;
    rateCard.mutate({ sessionId, flashcardId: card.flashcard.id, quality }, {
      onSuccess: () => {
        setReviewedCount((c) => c + 1);
        if (currentIndex < cards.length - 1) { setCurrentIndex(currentIndex + 1); setIsFlipped(false); }
        else setPhase('complete');
      },
    });
  };

  const currentCard = cards[currentIndex]?.flashcard;

  // ─── Stats ──────────────────────────────────────────────
  if (phase === 'stats') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button onClick={() => router.push('/flashcards')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 font-medium cursor-pointer text-sm">
          <ArrowLeft size={16} /> Back to Decks
        </button>

        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-violet-100 rounded-xl border-2 border-border-strong flex items-center justify-center mx-auto mb-4 shadow-[3px_3px_0px_var(--shadow-brutal)]">
            <Brain size={24} className="text-violet-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Spaced Repetition Review</h1>
          <p className="text-muted-foreground mt-1 text-sm">Review due cards to strengthen your memory</p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard icon={<BookOpen size={16} />} label="Total" value={stats.totalCards} iconBg="bg-blue-100" iconColor="text-blue-600" />
            <StatCard icon={<Brain size={16} />} label="Due" value={stats.dueToday} iconBg="bg-violet-100" iconColor="text-violet-600" />
            <StatCard icon={<Star size={16} />} label="Learned" value={stats.learnedCards} iconBg="bg-amber-100" iconColor="text-amber-600" />
            <StatCard icon={<Trophy size={16} />} label="Mastered" value={stats.masteredCards} iconBg="bg-emerald-100" iconColor="text-emerald-600" />
          </div>
        )}

        {stats && stats.streakDays > 0 && (
          <div className="brutal-card !shadow-[3px_3px_0px_var(--shadow-brutal)] p-4 mb-6 flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-lg border-2 border-border-strong flex items-center justify-center">
              <Flame size={18} className="text-amber-500" />
            </div>
            <div>
              <p className="font-bold text-foreground text-sm">{stats.streakDays} day streak!</p>
              <p className="text-xs text-muted-foreground">Keep reviewing to maintain it</p>
            </div>
          </div>
        )}

        {stats && stats.reviewsByDay.length > 0 && (
          <div className="brutal-card !shadow-[3px_3px_0px_var(--shadow-brutal)] p-5 mb-6">
            <h3 className="text-xs font-bold text-foreground mb-3 uppercase tracking-wider">Recent Activity</h3>
            <div className="flex items-end gap-1.5 h-20">
              {stats.reviewsByDay.map((day) => {
                const max = Math.max(...stats.reviewsByDay.map((d) => d.count));
                const h = max > 0 ? (day.count / max) * 100 : 0;
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-primary rounded-t border border-border-strong" style={{ height: `${h}%`, minHeight: '4px' }} />
                    <span className="text-[9px] text-muted-foreground font-medium">{day.date.slice(-2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button onClick={handleStartReview} disabled={startReview.isPending || (stats?.dueToday === 0)}
          className="brutal-btn-fill w-full py-3 text-sm disabled:opacity-50">
          {startReview.isPending ? 'Loading...' : stats?.dueToday === 0 ? 'All caught up! No cards due' : `Review ${stats?.dueToday || ''} Due Cards`}
        </button>
      </div>
    );
  }

  // ─── Complete ───────────────────────────────────────────
  if (phase === 'complete') {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="brutal-card p-8">
          <div className="w-16 h-16 bg-emerald-100 rounded-xl border-2 border-border-strong flex items-center justify-center mx-auto mb-5 shadow-[3px_3px_0px_var(--shadow-brutal)]">
            <Check size={28} className="text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-1 font-heading">Review Complete!</h2>
          <p className="text-muted-foreground mb-6 text-sm">You reviewed {reviewedCount} cards</p>
          <div className="flex justify-center gap-3">
            <button onClick={() => router.push('/flashcards')} className="brutal-btn bg-white text-foreground px-5 py-2.5 text-sm">Back to Decks</button>
            <button onClick={() => { setPhase('stats'); setCurrentIndex(0); setReviewedCount(0); }} className="brutal-btn-fill px-5 py-2.5 text-sm flex items-center gap-2">
              <RotateCcw size={14} /> Review More
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Review ─────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 select-none">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => setPhase('stats')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground font-medium cursor-pointer text-sm">
          <ArrowLeft size={16} /> Exit
        </button>
        <span className="text-sm text-foreground font-bold tabular-nums">{currentIndex + 1} / {cards.length}</span>
      </div>

      <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden border-2 border-border mb-10">
        <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${((currentIndex) / cards.length) * 100}%` }} />
      </div>

      {/* Card */}
      <div className="flashcard-perspective flashcard-hover w-full aspect-[3/2] cursor-pointer mb-8" onClick={() => setIsFlipped(!isFlipped)}>
        <div className={`flashcard-inner relative w-full h-full ${isFlipped ? 'flipped' : ''}`}>
          <div className="flashcard-face absolute inset-0 bg-white rounded-2xl border-[2.5px] border-border-strong flex flex-col items-center justify-center p-6 sm:p-10 shadow-[4px_4px_0px_var(--shadow-brutal)]">
            <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-[0.2em] font-bold mb-5">Term</span>
            <h2 className="text-3xl sm:text-5xl font-bold text-foreground mb-3 text-center font-heading">{currentCard?.word}</h2>
            {currentCard?.ipa && <p className="text-base sm:text-lg text-muted-foreground">{currentCard.ipa}</p>}
            <p className="text-[11px] text-muted-foreground/50 mt-auto pt-4 font-medium">Click to reveal answer</p>
          </div>
          <div className="flashcard-face flashcard-back absolute inset-0 bg-violet-50 rounded-2xl border-[2.5px] border-border-strong flex flex-col items-center justify-center p-6 sm:p-10 shadow-[4px_4px_0px_var(--shadow-brutal)]">
            <span className="text-[10px] sm:text-xs text-violet-600 uppercase tracking-[0.2em] font-bold mb-5">Definition</span>
            <h2 className="text-xl sm:text-3xl font-semibold text-foreground text-center leading-snug mb-4 font-heading">{currentCard?.meaning}</h2>
            {currentCard?.exampleSentence && <p className="text-sm sm:text-base text-muted-foreground italic text-center leading-relaxed max-w-md">&ldquo;{currentCard.exampleSentence}&rdquo;</p>}
          </div>
        </div>
      </div>

      {/* Rating */}
      {isFlipped && (
        <div>
          <p className="text-xs text-muted-foreground text-center mb-3 font-bold uppercase tracking-wider">How well did you remember?</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {QUALITY_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => handleRate(opt.value)} disabled={rateCard.isPending}
                className={`flex flex-col items-center gap-0.5 p-2.5 rounded-xl border-[2.5px] border-border-strong text-white shadow-[3px_3px_0px_var(--shadow-brutal)] hover:shadow-[4px_4px_0px_var(--shadow-brutal)] hover:-translate-y-[1px] active:shadow-[1px_1px_0px_var(--shadow-brutal)] active:translate-y-[1px] transition-all cursor-pointer disabled:opacity-50 ${opt.bg}`}>
                <span className="text-sm font-bold">{opt.value}</span>
                <span className="text-[9px] leading-tight font-bold">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, iconBg, iconColor }: { icon: React.ReactNode; label: string; value: number; iconBg: string; iconColor: string }) {
  return (
    <div className="brutal-card !shadow-[3px_3px_0px_var(--shadow-brutal)] p-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-7 h-7 rounded-lg border-2 border-border-strong flex items-center justify-center ${iconBg} ${iconColor}`}>{icon}</div>
        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground font-heading">{value}</p>
    </div>
  );
}
