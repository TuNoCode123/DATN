'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  useStartAiStudy,
  useCompletePractice,
  type AiStudyData,
  type SessionQuestion,
  type AnswerResult,
} from '@/features/flashcards/use-flashcard-queries';
import type { PronunciationAssessment } from '@/lib/pronunciation/types';
import ListenSpeakStep from './ai-study-steps/listen-speak-step';
import QuestionStep from './ai-study-steps/question-step';
import SentenceStep from './ai-study-steps/sentence-step';
import { Headphones, BrainCircuit, BookOpen, RotateCcw, Sparkles, Coins } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────

type ActivityType = 'listen' | 'question' | 'sentence';

interface Activity {
  id: string;
  type: ActivityType;
  cardId: string;
  questionIndex?: number; // for 'question' type — index into the questions array
}

interface ActivityResult {
  activityId: string;
  type: ActivityType;
  cardId: string;
  pronunciationScore?: number | null;
  questionCorrect?: boolean | null;
  confidence?: number;
}

const ACTIVITY_META: Record<ActivityType, { label: string; icon: typeof Headphones; color: string; pulseClass: string; bgGradient: string }> = {
  listen: { label: 'Listen & Speak', icon: Headphones, color: 'indigo', pulseClass: 'step-pulse-indigo', bgGradient: 'from-indigo-500 to-violet-500' },
  question: { label: 'Quiz', icon: BrainCircuit, color: 'amber', pulseClass: 'step-pulse-amber', bgGradient: 'from-amber-400 to-orange-500' },
  sentence: { label: 'Sentence', icon: BookOpen, color: 'emerald', pulseClass: 'step-pulse-emerald', bgGradient: 'from-emerald-400 to-teal-500' },
};

// ─── Shuffle helper ─────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Build activity queue ───────────────────────────────

function buildActivityQueue(
  cards: AiStudyData['cards'],
  questions: SessionQuestion[],
): Activity[] {
  const activities: Activity[] = [];

  // For each card: 1 listen activity + 1 sentence activity
  cards.forEach((card) => {
    activities.push({ id: `listen-${card.id}`, type: 'listen', cardId: card.id });
    activities.push({ id: `sentence-${card.id}`, type: 'sentence', cardId: card.id });
  });

  // For each question: 1 quiz activity (can be multiple per card)
  questions.forEach((q, i) => {
    activities.push({ id: `question-${q.id}`, type: 'question', cardId: q.flashcardId, questionIndex: i });
  });

  return shuffle(activities);
}

// ─── Current Activity Badge ─────────────────────────────

function ActivityBadge({ type, word, index, total }: { type: ActivityType; word: string; index: number; total: number }) {
  const meta = ACTIVITY_META[type];
  const Icon = meta.icon;

  const colorText: Record<string, string> = {
    indigo: 'text-indigo-600',
    amber: 'text-amber-600',
    emerald: 'text-emerald-600',
  };

  return (
    <div className="flex items-center justify-between mb-6 slide-up-in">
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${meta.bgGradient} flex items-center justify-center text-white shadow-sm ${meta.pulseClass}`}>
          <Icon size={18} />
        </div>
        <div>
          <span className={`text-[10px] uppercase tracking-[0.2em] font-bold ${colorText[meta.color] || 'text-gray-500'} block`}>
            {meta.label}
          </span>
          <span className="text-sm font-bold text-foreground">{word}</span>
        </div>
      </div>
      {/* Mini progress pills */}
      <div className="flex items-center gap-1">
        {Array.from({ length: Math.min(total, 8) }, (_, i) => {
          const isCurrent = i === index;
          const isDone = i < index;
          return (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                isCurrent ? 'w-4 bg-gradient-to-r from-indigo-500 to-violet-500' : isDone ? 'w-1.5 bg-indigo-300' : 'w-1.5 bg-gray-200'
              }`}
            />
          );
        })}
        {total > 8 && <span className="text-[9px] text-muted-foreground ml-0.5">+{total - 8}</span>}
      </div>
    </div>
  );
}

// ─── Completion Screen ──────────────────────────────────

function CompletionScreen({
  results,
  totalCards,
  totalActivities,
  deckId,
  onRestart,
}: {
  results: ActivityResult[];
  totalCards: number;
  totalActivities: number;
  deckId: string;
  onRestart: () => void;
}) {
  const router = useRouter();

  const pronScores = results.filter((r) => r.type === 'listen' && r.pronunciationScore != null).map((r) => r.pronunciationScore!);
  const avgPronunciation = pronScores.length > 0 ? Math.round(pronScores.reduce((a, b) => a + b, 0) / pronScores.length) : null;

  const quizResults = results.filter((r) => r.type === 'question' && r.questionCorrect != null);
  const quizCorrect = quizResults.filter((r) => r.questionCorrect).length;
  const quizTotal = quizResults.length;
  const quizPct = quizTotal > 0 ? Math.round((quizCorrect / quizTotal) * 100) : 0;

  const sentenceResults = results.filter((r) => r.type === 'sentence' && r.confidence != null);
  const avgConfidence = sentenceResults.length > 0
    ? (sentenceResults.reduce((a, r) => a + (r.confidence || 0), 0) / sentenceResults.length).toFixed(1)
    : '0';

  const overallScore = useMemo(() => {
    let score = 0;
    let count = 0;
    if (avgPronunciation !== null) { score += avgPronunciation; count++; }
    if (quizTotal > 0) { score += quizPct; count++; }
    return count > 0 ? Math.round(score / count) : 0;
  }, [avgPronunciation, quizPct, quizTotal]);

  const showConfetti = overallScore >= 80;
  const r = 50;
  const circ = 2 * Math.PI * r;
  const offset = circ - (overallScore / 100) * circ;
  const ringColor = overallScore >= 80 ? '#10b981' : overallScore >= 50 ? '#f59e0b' : '#f43f5e';

  const getMessage = () => {
    if (overallScore >= 90) return 'Outstanding!';
    if (overallScore >= 80) return 'Excellent Work!';
    if (overallScore >= 60) return 'Good Progress!';
    if (overallScore >= 40) return 'Keep Going!';
    return 'Practice Makes Perfect!';
  };

  return (
    <div className="max-w-md mx-auto text-center py-8">
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
          {Array.from({ length: 30 }, (_, i) => (
            <div
              key={i}
              className="absolute top-0 confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 1}s`,
                width: 5 + Math.random() * 6,
                height: 5 + Math.random() * 6,
                backgroundColor: ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#3b82f6'][i % 5],
                borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              }}
            />
          ))}
        </div>
      )}

      {/* Score ring */}
      <div className="relative w-32 h-32 mx-auto mb-6 slide-up-in">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 108 108">
          <circle cx="54" cy="54" r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
          <circle
            cx="54" cy="54" r={r} fill="none"
            stroke={ringColor}
            strokeWidth="7" strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            className="score-ring-animate"
            style={{ ['--ring-circumference' as string]: circ, ['--ring-offset' as string]: offset } as React.CSSProperties}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-foreground font-heading">{overallScore}</span>
          <span className="text-[10px] text-muted-foreground font-semibold uppercase">Score</span>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-foreground mb-1 font-heading slide-up-in" style={{ animationDelay: '100ms' }}>
        {getMessage()}
      </h2>
      <p className="text-sm text-muted-foreground mb-8 slide-up-in" style={{ animationDelay: '150ms' }}>
        Completed {totalActivities} activities across {totalCards} cards
      </p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8 stagger-in">
        {avgPronunciation !== null && (
          <div className="brutal-card !shadow-[3px_3px_0px_var(--shadow-brutal)] p-4 slide-up-in">
            <Headphones size={18} className="text-indigo-500 mx-auto mb-2" />
            <div className="text-xl font-bold text-foreground font-heading">{avgPronunciation}</div>
            <div className="text-[10px] text-muted-foreground font-semibold uppercase">Pronunciation</div>
          </div>
        )}
        <div className="brutal-card !shadow-[3px_3px_0px_var(--shadow-brutal)] p-4 slide-up-in" style={{ animationDelay: '80ms' }}>
          <BrainCircuit size={18} className="text-amber-500 mx-auto mb-2" />
          <div className="text-xl font-bold text-foreground font-heading">{quizCorrect}/{quizTotal}</div>
          <div className="text-[10px] text-muted-foreground font-semibold uppercase">Quiz Score</div>
        </div>
        <div className="brutal-card !shadow-[3px_3px_0px_var(--shadow-brutal)] p-4 slide-up-in" style={{ animationDelay: '160ms' }}>
          <Sparkles size={18} className="text-emerald-500 mx-auto mb-2" />
          <div className="text-xl font-bold text-foreground font-heading">{avgConfidence}/3</div>
          <div className="text-[10px] text-muted-foreground font-semibold uppercase">Confidence</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-3">
        <button onClick={() => router.push(`/flashcards/${deckId}`)} className="brutal-btn bg-white text-foreground px-5 py-2.5 text-sm">
          Back to Deck
        </button>
        <button onClick={onRestart} className="brutal-btn-fill px-5 py-2.5 text-sm flex items-center gap-2">
          <RotateCcw size={14} /> Study Again
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────

interface StudyWithAiTabProps {
  deckId: string;
}

export default function StudyWithAiTab({ deckId }: StudyWithAiTabProps) {
  const startAiStudy = useStartAiStudy();
  const completePractice = useCompletePractice();

  const [data, setData] = useState<AiStudyData | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [results, setResults] = useState<ActivityResult[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSession = useCallback(() => {
    setError(null);
    startAiStudy.mutate(
      { deckId },
      {
        onSuccess: (d) => {
          setData(d);
          const queue = buildActivityQueue(d.cards, d.questions);
          setActivities(queue);
          setCurrentIdx(0);
          setResults([]);
          setIsComplete(false);
        },
        onError: (e: any) => setError(e?.response?.data?.message || 'Failed to start AI study'),
      },
    );
  }, [deckId, startAiStudy]);

  const currentActivity = activities[currentIdx];
  const currentCard = data?.cards.find((c) => c.id === currentActivity?.cardId);
  const totalActivities = activities.length;
  const progressPct = totalActivities > 0 ? (currentIdx / totalActivities) * 100 : 0;

  const advance = useCallback(() => {
    if (currentIdx < totalActivities - 1) {
      setCurrentIdx((i) => i + 1);
    } else {
      if (data?.session.id) completePractice.mutate(data.session.id);
      setIsComplete(true);
    }
  }, [currentIdx, totalActivities, data, completePractice]);

  const handlePronunciationComplete = useCallback((assessment: PronunciationAssessment | null) => {
    setResults((prev) => [...prev, {
      activityId: currentActivity.id,
      type: 'listen',
      cardId: currentActivity.cardId,
      pronunciationScore: assessment?.overall.score ?? null,
    }]);
    advance();
  }, [currentActivity, advance]);

  const handleQuestionComplete = useCallback((result: AnswerResult | null) => {
    setResults((prev) => [...prev, {
      activityId: currentActivity.id,
      type: 'question',
      cardId: currentActivity.cardId,
      questionCorrect: result?.isCorrect ?? null,
    }]);
    advance();
  }, [currentActivity, advance]);

  const handleSentenceComplete = useCallback((confidence: number) => {
    setResults((prev) => [...prev, {
      activityId: currentActivity.id,
      type: 'sentence',
      cardId: currentActivity.cardId,
      confidence,
    }]);
    advance();
  }, [currentActivity, advance]);

  // ─── Start screen ───────────────────────────────────

  if (!data && !startAiStudy.isPending) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-2xl border-[2.5px] border-border-strong flex items-center justify-center mx-auto mb-6 shadow-[4px_4px_0px_var(--shadow-brutal)]">
          <Sparkles size={32} className="text-white" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2 font-heading">Study with AI</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
          Pronunciation, AI quizzes, and contextual sentences — all shuffled for maximum learning
        </p>

        <div className="brutal-card p-4 mb-6 inline-flex items-center gap-2">
          <Coins size={16} className="text-amber-500" />
          <span className="text-sm text-muted-foreground">
            Estimated cost: <strong className="text-foreground">~3-8 credits</strong> per card
          </span>
        </div>

        {error && (
          <div className="brutal-card !border-red-300 !bg-red-50 p-3 mb-4 text-sm text-red-600">{error}</div>
        )}

        <div>
          <button onClick={startSession} className="brutal-btn-fill px-8 py-3 text-sm flex items-center gap-2 mx-auto">
            <Sparkles size={16} /> Start AI Study
          </button>
        </div>
      </div>
    );
  }

  // ─── Loading ────────────────────────────────────────

  if (startAiStudy.isPending || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="relative w-16 h-16 mb-4">
          <div className="absolute inset-0 rounded-full border-4 border-indigo-200" />
          <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">Generating AI questions...</p>
        <p className="text-xs text-muted-foreground/60 mt-1">This may take a moment</p>
      </div>
    );
  }

  // ─── Completion ─────────────────────────────────────

  if (isComplete) {
    return (
      <CompletionScreen
        results={results}
        totalCards={data.cards.length}
        totalActivities={totalActivities}
        deckId={deckId}
        onRestart={startSession}
      />
    );
  }

  if (!currentActivity || !currentCard) return null;

  // Find question for quiz activities
  const currentQuestion = currentActivity.type === 'question' && currentActivity.questionIndex != null
    ? data.questions[currentActivity.questionIndex]
    : null;

  return (
    <div className="max-w-2xl mx-auto select-none">
      {/* Progress header */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white bg-gradient-to-r from-indigo-500 to-violet-500 px-2.5 py-1 rounded-lg tabular-nums">
            {currentIdx + 1}/{totalActivities}
          </span>
          <span className="text-xs text-muted-foreground font-medium">
            {data.cards.length} words
          </span>
        </div>
        <span className="text-xs text-muted-foreground font-medium tabular-nums">
          {Math.round(progressPct)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative w-full h-2 bg-gray-100 rounded-full overflow-hidden border border-gray-200 mb-6">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500"
          style={{ width: `${progressPct}%` }}
        />
        <div className="absolute inset-0 shimmer-bar rounded-full" />
      </div>

      {/* Activity badge */}
      <ActivityBadge type={currentActivity.type} word={currentCard.word} index={currentIdx} total={totalActivities} />

      {/* Activity content */}
      <div key={currentActivity.id} className="min-h-[400px] flex flex-col justify-start">
        {currentActivity.type === 'listen' && (
          <ListenSpeakStep
            word={currentCard.word}
            ipa={currentCard.ipa}
            onComplete={handlePronunciationComplete}
            onSkip={() => handlePronunciationComplete(null)}
          />
        )}

        {currentActivity.type === 'question' && currentQuestion && (
          <QuestionStep
            sessionId={data.session.id}
            question={currentQuestion}
            word={currentCard.word}
            onComplete={handleQuestionComplete}
            onSkip={() => handleQuestionComplete(null)}
          />
        )}

        {currentActivity.type === 'question' && !currentQuestion && (
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">No question available for this word</p>
            <button onClick={advance} className="brutal-btn-fill px-5 py-2 text-sm">Continue</button>
          </div>
        )}

        {currentActivity.type === 'sentence' && (
          <SentenceStep
            word={currentCard.word}
            sentence={currentCard.exampleSentence || `The word "${currentCard.word}" means: ${currentCard.meaning}.`}
            onComplete={handleSentenceComplete}
          />
        )}
      </div>
    </div>
  );
}
