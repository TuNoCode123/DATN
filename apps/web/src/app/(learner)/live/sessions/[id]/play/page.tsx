'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App } from 'antd';
import { Clock, Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  connectLiveExamSocket,
  disconnectLiveExamSocket,
} from '@/lib/live-exam-socket';
import { useQuizSounds } from '@/lib/use-quiz-sounds';
import type { Socket } from 'socket.io-client';
import {
  AnswerPayload,
  DispatchPayload,
  LiveExamQuestionType,
  RevealPayload,
} from '@/lib/live-exam-types';
import {
  LiveQuestionView,
  QuestionEnvelope,
} from '@/components/live-exam/live-question-view';

type Phase =
  | 'WAITING'
  | 'OPEN'
  | 'ANSWERED'
  | 'LOCKED'
  | 'INTERSTITIAL'
  | 'ENDED';

type LeaderboardRow = {
  rank: number;
  userId: string;
  displayName: string;
  score: number;
};

// Play streak.mp3 instead of correct.mp3 on every Nth consecutive correct answer.
const STREAK_THRESHOLD = 3;

// 40 particles + ticks:120 → cheap on mobile. Reduced-motion aware.
const fireCelebration = () =>
  confetti({
    particleCount: 40,
    spread: 60,
    startVelocity: 35,
    origin: { y: 0.7 },
    scalar: 0.8,
    ticks: 120,
    disableForReducedMotion: true,
  });

/**
 * Player play page. Receives typed question envelopes from the server
 * and delegates rendering to LiveQuestionView which dispatches on
 * question.type. The page owns:
 *   - phase state machine
 *   - visual countdown
 *   - submission logic (routes answer payloads to `exam.answer`)
 *   - reveal/interstitial/final-result rendering
 */
export default function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = use(params);
  const router = useRouter();
  const { message } = App.useApp();

  const [phase, setPhase] = useState<Phase>('WAITING');
  const [question, setQuestion] = useState<QuestionEnvelope | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [dispatchedAt, setDispatchedAt] = useState(0);
  const [perQuestionSec, setPerQuestionSec] = useState(20);
  const [remainingMs, setRemainingMs] = useState(0);
  const [myAnswer, setMyAnswer] = useState<AnswerPayload | null>(null);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);

  const [interstitial, setInterstitial] = useState<{
    top10: LeaderboardRow[];
    yourRank: number | null;
    yourPrevRank: number | null;
    yourDelta: number;
    yourScore: number;
    yourAwardedPoints: number;
    yourIsCorrect: boolean;
    interstitialSec: number;
  } | null>(null);

  const [finalResult, setFinalResult] = useState<{
    finalScore: number | null;
    finalRank: number | null;
    correctCount: number;
    wrongCount: number;
  } | null>(null);

  const { play: playSound } = useQuizSounds();
  // Ref (not state) → updating the streak shouldn't re-render the component.
  const streakRef = useRef(0);
  // Timestamp of the last LOCKED transition. Used to guarantee the
  // reveal (correct/wrong highlight) stays on-screen long enough to
  // read before we swap to the leaderboard interstitial — the server
  // often fires questionLocked and leaderboard.reveal back-to-back.
  const lockedAtRef = useRef(0);
  // Pending interstitial timer so we can clear it on unmount / new q.
  const interstitialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const endedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Minimum ms to keep the LOCKED reveal visible before showing the
  // leaderboard interstitial.
  const MIN_REVEAL_MS = 2200;
  // How long to hold on the "Exam finished!" screen before redirecting
  // to the results page — long enough for the complete sound to land.
  const ENDED_HOLD_MS = 2500;

  useEffect(() => {
    const s: Socket = connectLiveExamSocket();

    // If player refreshed mid-exam, re-emit lobby.join — server re-routes.
    s.emit('lobby.join', { sessionId });

    const onStarted = (p: { totalQuestions: number }) => {
      setTotalQuestions(p.totalQuestions);
    };
    const onQuestion = (p: {
      index: number;
      question: {
        id: string;
        type: LiveExamQuestionType;
        prompt: string;
        dispatch: DispatchPayload;
      };
      dispatchedAt: number;
      perQuestionSec: number;
      totalQuestions: number;
      phase: 'OPEN' | 'LOCKED' | 'INTERSTITIAL';
    }) => {
      // Cancel any pending interstitial swap from the previous round.
      if (interstitialTimerRef.current) {
        clearTimeout(interstitialTimerRef.current);
        interstitialTimerRef.current = null;
      }
      setPhase(p.phase === 'OPEN' ? 'OPEN' : 'LOCKED');
      setQuestion(p.question);
      setQuestionIndex(p.index);
      setTotalQuestions(p.totalQuestions);
      setDispatchedAt(p.dispatchedAt);
      setPerQuestionSec(p.perQuestionSec);
      setMyAnswer(null);
      setReveal(null);
      setExplanation(null);
      setInterstitial(null);
    };
    const onAck = () => setPhase('ANSWERED');
    const onAnswerError = (p: { code: string; message?: string }) => {
      if (p.code !== 'ALREADY_ANSWERED') {
        message.warning(`Answer rejected: ${p.message ?? p.code}`);
      }
    };
    const onLocked = (p: {
      index: number;
      reveal: RevealPayload;
      explanation: string | null;
    }) => {
      lockedAtRef.current = Date.now();
      setPhase('LOCKED');
      setReveal(p.reveal);
      setExplanation(p.explanation);
    };
    const onReveal = (p: typeof interstitial) => {
      if (!p) return;

      // Immediate end-of-question feedback: correct/wrong sound + confetti
      // fire RIGHT NOW, while the reveal highlighting is still on screen.
      // The leaderboard swap happens later (see setTimeout below) with its
      // own distinct sound.
      if (p.yourIsCorrect) {
        const next = streakRef.current + 1;
        streakRef.current = next;
        const onStreak = next > 0 && next % STREAK_THRESHOLD === 0;
        playSound(onStreak ? 'streak' : 'correct');
        fireCelebration();
      } else {
        streakRef.current = 0;
        playSound('wrong');
      }

      // Hold the LOCKED reveal (correct/wrong highlighting) on screen
      // for at least MIN_REVEAL_MS before swapping to the leaderboard.
      // If the reveal arrived before questionLocked for any reason,
      // lockedAtRef.current is 0 and elapsed is huge → delay becomes 0.
      const elapsed = lockedAtRef.current
        ? Date.now() - lockedAtRef.current
        : MIN_REVEAL_MS;
      const delay = Math.max(0, MIN_REVEAL_MS - elapsed);

      if (interstitialTimerRef.current) {
        clearTimeout(interstitialTimerRef.current);
      }
      interstitialTimerRef.current = setTimeout(() => {
        interstitialTimerRef.current = null;
        setPhase('INTERSTITIAL');
        setInterstitial(p);
        playSound('leaderboard');
      }, delay);
    };
    const onEnded = (p: { yourResult?: typeof finalResult }) => {
      setPhase('ENDED');
      if (p.yourResult) setFinalResult(p.yourResult);
      playSound('complete');
      if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
      endedTimerRef.current = setTimeout(
        () => router.push(`/live/sessions/${sessionId}/result`),
        ENDED_HOLD_MS,
      );
    };

    s.on('exam.started', onStarted);
    s.on('exam.question', onQuestion);
    s.on('exam.answerAck', onAck);
    s.on('exam.answerError', onAnswerError);
    s.on('exam.questionLocked', onLocked);
    s.on('leaderboard.reveal', onReveal);
    s.on('exam.ended', onEnded);

    return () => {
      s.off('exam.started', onStarted);
      s.off('exam.question', onQuestion);
      s.off('exam.answerAck', onAck);
      s.off('exam.answerError', onAnswerError);
      s.off('exam.questionLocked', onLocked);
      s.off('leaderboard.reveal', onReveal);
      s.off('exam.ended', onEnded);
      if (interstitialTimerRef.current) {
        clearTimeout(interstitialTimerRef.current);
        interstitialTimerRef.current = null;
      }
      if (endedTimerRef.current) {
        clearTimeout(endedTimerRef.current);
        endedTimerRef.current = null;
      }
      disconnectLiveExamSocket();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Visual countdown
  useEffect(() => {
    if (phase !== 'OPEN' && phase !== 'ANSWERED') return;
    const tick = () => {
      const elapsed = Date.now() - dispatchedAt;
      setRemainingMs(Math.max(0, perQuestionSec * 1000 - elapsed));
    };
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [phase, dispatchedAt, perQuestionSec]);

  const submitAnswer = (answer: AnswerPayload) => {
    if (phase !== 'OPEN' || !question) return;
    // Fire click sound first so it feels instant.
    playSound('click');
    setMyAnswer(answer);
    const s = connectLiveExamSocket();
    s.emit('exam.answer', {
      sessionId,
      questionId: question.id,
      answer,
    });
  };

  // ── Render ──

  if (phase === 'WAITING') {
    return (
      <div className="max-w-xl mx-auto brutal-card p-8 text-center">
        <h1 className="text-2xl font-extrabold mb-2">Hold on…</h1>
        <p className="text-neutral-600">Waiting for the next question.</p>
      </div>
    );
  }

  if (phase === 'ENDED') {
    return (
      <div className="max-w-xl mx-auto brutal-card p-8 text-center">
        <Trophy className="w-12 h-12 mx-auto text-yellow-500 mb-2" />
        <h1 className="text-2xl font-extrabold mb-1">Exam finished!</h1>
        {finalResult && (
          <p className="text-neutral-700">
            Final score:{' '}
            <span className="font-extrabold">
              {finalResult.finalScore ?? 0}
            </span>{' '}
            · Rank{' '}
            <span className="font-extrabold">
              #{finalResult.finalRank ?? '—'}
            </span>
          </p>
        )}
        <p className="text-sm text-neutral-500 mt-2">Loading results…</p>
      </div>
    );
  }

  if (phase === 'INTERSTITIAL' && interstitial) {
    return <InterstitialView reveal={interstitial} />;
  }

  if (!question) return <p>Loading…</p>;
  const sec = Math.ceil(remainingMs / 1000);

  const timePct = Math.max(
    0,
    Math.min(100, (remainingMs / (perQuestionSec * 1000)) * 100),
  );
  const isUrgent = sec <= 5;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-black text-white rounded-full border-[3px] border-black shadow-[3px_3px_0_0_rgba(0,0,0,0.25)]">
          <span className="text-[11px] uppercase tracking-widest font-black opacity-80">
            Question
          </span>
          <span className="text-sm font-black">
            {questionIndex + 1}
            <span className="opacity-60"> / {totalQuestions || '?'}</span>
          </span>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-[3px] border-black font-black text-sm shadow-[3px_3px_0_0_#000] ${
            isUrgent
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-white text-black'
          }`}
        >
          <Clock className="w-4 h-4" strokeWidth={3} />
          {sec}s
        </div>
      </div>

      <div className="h-3 bg-white border-[3px] border-black rounded-full mb-5 overflow-hidden shadow-[3px_3px_0_0_#000]">
        <div
          className={`h-full transition-all duration-300 ${
            isUrgent
              ? 'bg-gradient-to-r from-red-500 to-rose-500'
              : 'bg-gradient-to-r from-emerald-400 to-lime-400'
          }`}
          style={{ width: `${timePct}%` }}
        />
      </div>

      <div
        className="relative mb-5 rounded-2xl border-[3px] border-black bg-gradient-to-br from-white to-amber-50 p-7"
        style={{ boxShadow: '6px 6px 0 0 #000' }}
      >
        <div className="inline-block mb-3 px-3 py-1 bg-black text-white text-[10px] font-black uppercase tracking-[0.18em] rounded-full">
          {question.type.replace('_', ' ')}
        </div>
        <h2
          className="font-black leading-[1.15] text-neutral-900 break-words"
          style={{ fontSize: 'clamp(1.35rem, 4.5vw, 2rem)' }}
        >
          {question.prompt}
        </h2>
      </div>

      <LiveQuestionView
        key={question.id /* remount on new question to reset local state */}
        question={question}
        phase={phase === 'OPEN' ? 'OPEN' : phase === 'ANSWERED' ? 'ANSWERED' : 'LOCKED'}
        myAnswer={myAnswer}
        reveal={reveal}
        onSubmit={submitAnswer}
      />

      {phase === 'ANSWERED' && (
        <div
          className="mt-5 rounded-2xl border-[3px] border-black bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-500 px-5 py-4 text-white"
          style={{ boxShadow: '6px 6px 0 0 #000' }}
        >
          <div className="flex items-center justify-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
            </span>
            <span className="font-black uppercase tracking-[0.15em] text-sm">
              Locked in
            </span>
            <span className="font-bold text-sm opacity-90">
              — waiting for others ({sec}s)
            </span>
          </div>
        </div>
      )}

      {phase === 'LOCKED' && explanation && (
        <div className="brutal-card p-4 mt-4 bg-yellow-50">
          <div className="text-xs font-bold uppercase mb-1">Explanation</div>
          <p className="text-sm">{explanation}</p>
        </div>
      )}
    </div>
  );
}

function InterstitialView({
  reveal,
}: {
  reveal: {
    top10: LeaderboardRow[];
    yourRank: number | null;
    yourPrevRank: number | null;
    yourDelta: number;
    yourScore: number;
    yourAwardedPoints: number;
    yourIsCorrect: boolean;
    interstitialSec: number;
  };
}) {
  const deltaIcon =
    reveal.yourDelta > 0 ? (
      <TrendingUp className="w-4 h-4 text-green-700" />
    ) : reveal.yourDelta < 0 ? (
      <TrendingDown className="w-4 h-4 text-red-700" />
    ) : (
      <Minus className="w-4 h-4 text-neutral-500" />
    );

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className={`brutal-card p-5 mb-4 ${
          reveal.yourIsCorrect
            ? 'bg-green-100 animate-quiz-pop shadow-[0_0_24px_rgba(16,185,129,0.55)]'
            : 'bg-red-100 animate-quiz-shake'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase font-bold text-neutral-600">
              {reveal.yourIsCorrect ? 'Correct!' : 'Wrong'}
            </div>
            <div className="text-3xl font-extrabold mt-1">
              +{reveal.yourAwardedPoints} pts
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase font-bold text-neutral-600">
              Your rank
            </div>
            <div className="text-3xl font-extrabold flex items-center gap-1">
              #{reveal.yourRank ?? '—'} {deltaIcon}
            </div>
            <div className="text-xs text-neutral-600">
              Score: <span className="font-bold">{reveal.yourScore}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="brutal-card p-4">
        <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
          <Trophy className="w-5 h-5" /> Top 10
        </h3>
        <ul className="space-y-1">
          {reveal.top10.map((row) => (
            <li
              key={row.userId}
              className={`flex items-center gap-2 text-sm border-b border-neutral-200 py-1 last:border-b-0 ${
                row.rank === reveal.yourRank ? 'font-extrabold bg-yellow-50' : ''
              }`}
            >
              <span className="w-6 text-right">{row.rank}</span>
              <span className="flex-1 truncate">{row.displayName}</span>
              <span className="font-mono font-bold">{row.score}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-center text-sm text-neutral-500 mt-3">
        Next question in {reveal.interstitialSec}s…
      </p>
    </div>
  );
}
