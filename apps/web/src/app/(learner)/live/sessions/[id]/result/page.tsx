'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Trophy, Check, X, Clock, Crown, Medal, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import {
  AnswerPayload,
  LiveExamQuestionType,
  QuestionMedia,
  RevealPayload,
} from '@/lib/live-exam-types';
import { PromptWithMedia } from '@/components/live-exam/prompt-media';

type PlayerResult = {
  session: { id: string; title: string; endedAt: string | null };
  me: {
    userId: string;
    displayName: string;
    finalScore: number;
    finalRank: number | null;
    correctCount: number;
    wrongCount: number;
  };
  leaderboard: Array<{
    rank: number;
    userId: string;
    displayName: string;
    score: number;
    correct: number;
    wrong: number;
  }>;
  breakdown: Array<{
    questionId: string;
    orderIndex: number;
    type: LiveExamQuestionType;
    prompt: string;
    payload: unknown;
    reveal: RevealPayload;
    explanation: string | null;
    yourAnswer: AnswerPayload | null;
    isCorrect: boolean;
    answeredMs: number | null;
    awardedPoints: number;
  }>;
};

type HostResult = {
  session: {
    id: string;
    title: string;
    endedAt: string | null;
    playerCount: number;
  };
  leaderboard: PlayerResult['leaderboard'];
  questionStats: Array<{
    questionId: string;
    orderIndex: number;
    type: LiveExamQuestionType;
    prompt: string;
    reveal: RevealPayload;
    correctRate: number;
    avgAnsweredMs: number;
    optionDistribution: Record<string, number> | null;
  }>;
};

export default function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const mode = (searchParams.get('mode') as 'player' | 'host') ?? 'player';

  if (mode === 'host') return <HostResultView sessionId={id} />;
  return <PlayerResultView sessionId={id} />;
}

// ─── Player view ────────────────────────────────

function PlayerResultView({ sessionId }: { sessionId: string }) {
  const currentUser = useAuthStore((s) => s.user);
  const { data, isLoading, error } = useQuery<PlayerResult>({
    queryKey: ['live-exam-session', sessionId, 'result', 'me'],
    queryFn: async () =>
      (await api.get(`/live-exams/sessions/${sessionId}/result/me`)).data,
    retry: false,
  });

  if (isLoading) return <p>Loading result…</p>;
  if (error || !data)
    return (
      <div className="brutal-card p-6 text-center">
        <p>No result available yet.</p>
      </div>
    );

  const podium = data.leaderboard.slice(0, 3);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Link
          href="/live"
          className="text-sm flex items-center gap-1 text-neutral-600"
        >
          <ArrowLeft className="w-4 h-4" /> Back to live exams
        </Link>
        <Link href="/live/history" className="text-sm text-neutral-600">
          View history
        </Link>
      </div>

      <div className="brutal-card p-6 md:p-8 mb-5 bg-yellow-50 text-center">
        <div className="text-xs font-bold uppercase text-neutral-500">
          {data.session.title}
        </div>
        <div className="text-5xl md:text-6xl font-extrabold mt-2" data-testid="final-score">
          {data.me.finalScore}
        </div>
        <div className="text-lg mt-1">
          Rank{' '}
          <span className="font-extrabold">#{data.me.finalRank ?? '—'}</span>{' '}
          of {data.leaderboard.length}
        </div>
        <div className="flex justify-center gap-4 mt-4">
          <span
            className="brutal-card px-4 py-2 bg-green-100 font-bold flex items-center gap-2"
            data-testid="correct-count"
          >
            <Check className="w-4 h-4 text-green-700" />
            {data.me.correctCount}
          </span>
          <span
            className="brutal-card px-4 py-2 bg-red-100 font-bold flex items-center gap-2"
            data-testid="wrong-count"
          >
            <X className="w-4 h-4 text-red-700" />
            {data.me.wrongCount}
          </span>
        </div>
      </div>

      {podium.length >= 1 && <Podium rows={podium} />}

      <div className="brutal-card p-5 mb-5">
        <h2 className="font-bold text-lg mb-3">Full leaderboard</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="text-left py-1">Rank</th>
              <th className="text-left py-1">Player</th>
              <th className="text-right py-1">Score</th>
              <th className="text-right py-1 hidden sm:table-cell">Correct</th>
            </tr>
          </thead>
          <tbody>
            {data.leaderboard.map((row) => (
              <tr
                key={row.userId}
                className={`border-b border-neutral-200 ${
                  row.userId === currentUser?.id ? 'bg-yellow-50 font-bold' : ''
                }`}
              >
                <td className="py-1">{row.rank}</td>
                <td className="py-1 truncate max-w-[180px]">
                  {row.displayName}
                </td>
                <td className="py-1 text-right font-mono">{row.score}</td>
                <td className="py-1 text-right hidden sm:table-cell">
                  {row.correct}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="brutal-card p-5">
        <h2 className="font-bold text-lg mb-3">Question breakdown</h2>
        <div className="space-y-3">
          {data.breakdown.map((q) => (
            <BreakdownCard key={q.questionId} q={q} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Podium({ rows }: { rows: PlayerResult['leaderboard'] }) {
  const first = rows.find((r) => r.rank === 1);
  const second = rows.find((r) => r.rank === 2);
  const third = rows.find((r) => r.rank === 3);
  return (
    <div
      className="brutal-card p-5 mb-5 grid grid-cols-3 gap-2 items-end"
      data-testid="podium"
    >
      <PodiumCol
        row={second}
        height="h-28"
        bg="bg-neutral-200"
        icon={<Medal className="w-6 h-6 text-neutral-500" />}
        rank={2}
      />
      <PodiumCol
        row={first}
        height="h-36"
        bg="bg-yellow-200"
        icon={<Crown className="w-7 h-7 text-yellow-600" />}
        rank={1}
      />
      <PodiumCol
        row={third}
        height="h-20"
        bg="bg-orange-200"
        icon={<Medal className="w-6 h-6 text-orange-700" />}
        rank={3}
      />
    </div>
  );
}

function PodiumCol({
  row,
  height,
  bg,
  icon,
  rank,
}: {
  row?: PlayerResult['leaderboard'][number];
  height: string;
  bg: string;
  icon: React.ReactNode;
  rank: number;
}) {
  return (
    <div className="flex flex-col items-center" data-rank={rank}>
      <div className="text-center mb-2">
        <div className="flex justify-center">{icon}</div>
        <div className="font-bold text-sm truncate max-w-[120px]">
          {row?.displayName ?? '—'}
        </div>
        <div className="text-xs text-neutral-600 font-mono">
          {row?.score ?? 0}
        </div>
      </div>
      <div
        className={`${height} w-full ${bg} border-2 border-black rounded-t-md flex items-center justify-center font-extrabold text-2xl`}
      >
        {rank}
      </div>
    </div>
  );
}

function BreakdownCard({ q }: { q: PlayerResult['breakdown'][number] }) {
  const status: 'correct' | 'wrong' | 'timeout' =
    q.yourAnswer === null ? 'timeout' : q.isCorrect ? 'correct' : 'wrong';
  const border =
    status === 'correct'
      ? 'border-green-600'
      : status === 'wrong'
        ? 'border-red-500'
        : 'border-neutral-400';
  const bg =
    status === 'correct'
      ? 'bg-green-50'
      : status === 'wrong'
        ? 'bg-red-50'
        : 'bg-neutral-100';

  const icon =
    status === 'correct' ? (
      <Check className="w-5 h-5 text-green-700" />
    ) : status === 'wrong' ? (
      <X className="w-5 h-5 text-red-700" />
    ) : (
      <Clock className="w-5 h-5 text-neutral-500" />
    );

  return (
    <div className={`p-4 rounded-lg border-2 ${border} ${bg}`}>
      <div className="flex items-start gap-2 mb-2">
        {icon}
        <div className="flex-1">
          <div className="text-xs font-bold uppercase text-neutral-500">
            Q{q.orderIndex + 1} · {q.type.replace('_', ' ').toLowerCase()}
          </div>
          <PromptWithMedia
            prompt={q.prompt}
            media={(q.payload as { media?: QuestionMedia } | null)?.media}
            promptClassName="font-bold"
          />
        </div>
        <div className="text-right text-xs">
          {q.answeredMs !== null && (
            <div className="text-neutral-600">
              {(q.answeredMs / 1000).toFixed(1)}s
            </div>
          )}
          <div className="font-bold">+{q.awardedPoints}</div>
        </div>
      </div>
      <BreakdownBody q={q} />
      {q.explanation && (
        <div className="mt-2 text-xs text-neutral-600">
          <strong>Why:</strong> <span dangerouslySetInnerHTML={{ __html: q.explanation }} />
        </div>
      )}
    </div>
  );
}

/**
 * Per-type body of the breakdown card. Shows the player's answer side
 * by side with the correct answer so they can learn from mistakes.
 */
function BreakdownBody({ q }: { q: PlayerResult['breakdown'][number] }) {
  if (q.type === 'MULTIPLE_CHOICE' && q.reveal.type === 'MULTIPLE_CHOICE') {
    const payload = q.payload as {
      options: Array<{ id: string; text: string }>;
    };
    const reveal = q.reveal;
    const picked = (q.yourAnswer as { optionId?: string } | null)?.optionId;
    return (
      <div className="grid sm:grid-cols-2 gap-2 mt-2">
        {payload.options.map((o) => {
          const isCorrect = o.id === reveal.correctOptionId;
          const isPicked = o.id === picked;
          const base = 'text-sm px-3 py-2 border-2 rounded';
          const cls = isCorrect
            ? 'border-green-600 bg-green-100 font-bold'
            : isPicked
              ? 'border-red-500 bg-red-100'
              : 'border-neutral-300 bg-white';
          return (
            <div key={o.id} className={`${base} ${cls}`}>
              <span className="font-bold mr-1">{o.id}.</span>
              {o.text}
              {isCorrect && (
                <span className="ml-2 text-xs text-green-700">(correct)</span>
              )}
              {isPicked && !isCorrect && (
                <span className="ml-2 text-xs text-red-700">(your pick)</span>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  if (q.type === 'SHORT_ANSWER' && q.reveal.type === 'SHORT_ANSWER') {
    const text = (q.yourAnswer as { text?: string } | null)?.text ?? '—';
    return (
      <div className="grid sm:grid-cols-2 gap-2 mt-2 text-sm">
        <div className="border-2 border-neutral-300 rounded p-2 bg-white">
          <div className="text-xs font-bold uppercase text-neutral-500">
            Your answer
          </div>
          <div className={q.isCorrect ? 'text-green-800' : 'text-red-700'}>
            {text}
          </div>
        </div>
        <div className="border-2 border-green-600 rounded p-2 bg-green-50">
          <div className="text-xs font-bold uppercase text-green-700">
            Accepted
          </div>
          <div className="flex flex-wrap gap-1">
            {q.reveal.acceptedAnswers.map((a, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-white border border-green-500 rounded text-xs"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (q.type === 'SENTENCE_REORDER' && q.reveal.type === 'SENTENCE_REORDER') {
    const payload = q.payload as { fragments: string[] };
    const order =
      (q.yourAnswer as { order?: number[] } | null)?.order ?? null;
    return (
      <div className="mt-2 space-y-2 text-sm">
        <div>
          <div className="text-xs font-bold uppercase text-neutral-500 mb-1">
            Your answer
          </div>
          {order ? (
            <div className="flex flex-wrap gap-1">
              {order.map((i, idx) => (
                <span
                  key={idx}
                  className={`px-2 py-1 border-2 rounded ${
                    q.isCorrect
                      ? 'border-green-600 bg-green-100'
                      : 'border-red-500 bg-red-100'
                  }`}
                >
                  {payload.fragments[i]}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-neutral-500">—</span>
          )}
        </div>
        <div>
          <div className="text-xs font-bold uppercase text-green-700 mb-1">
            Correct order
          </div>
          <div className="flex flex-wrap gap-1">
            {q.reveal.correctFragments.map((f, i) => (
              <span
                key={i}
                className="px-2 py-1 border-2 border-green-600 bg-green-100 rounded"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return null;
}

// ─── Host view ───────────────────────────────────

function HostResultView({ sessionId }: { sessionId: string }) {
  const { data, isLoading, error } = useQuery<HostResult>({
    queryKey: ['live-exam-session', sessionId, 'result', 'host'],
    queryFn: async () =>
      (await api.get(`/live-exams/sessions/${sessionId}/result/host`)).data,
    retry: false,
  });

  if (isLoading) return <p>Loading…</p>;
  if (error || !data)
    return (
      <div className="brutal-card p-6 text-center">
        <p>No host result available.</p>
      </div>
    );

  const podium = data.leaderboard.slice(0, 3);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Link
          href="/live"
          className="text-sm flex items-center gap-1 text-neutral-600"
        >
          <ArrowLeft className="w-4 h-4" /> Back to live exams
        </Link>
        <Link href="/live/history" className="text-sm text-neutral-600">
          View history
        </Link>
      </div>

      <div className="brutal-card p-6 mb-5 bg-yellow-50">
        <div className="text-xs uppercase font-bold text-neutral-500">
          Host summary
        </div>
        <h1 className="text-2xl font-extrabold">{data.session.title}</h1>
        <div className="flex gap-4 mt-3 text-sm">
          <span className="brutal-card px-3 py-1">
            Players: <strong>{data.session.playerCount}</strong>
          </span>
          <span className="brutal-card px-3 py-1">
            Questions: <strong>{data.questionStats.length}</strong>
          </span>
        </div>
      </div>

      {podium.length >= 1 && <Podium rows={podium} />}

      <div className="brutal-card p-5 mb-5">
        <h2 className="font-bold text-lg mb-3">Final leaderboard</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="text-left py-1">Rank</th>
              <th className="text-left py-1">Player</th>
              <th className="text-right py-1">Score</th>
              <th className="text-right py-1 hidden sm:table-cell">Correct</th>
              <th className="text-right py-1 hidden sm:table-cell">Wrong</th>
            </tr>
          </thead>
          <tbody>
            {data.leaderboard.map((row) => (
              <tr key={row.userId} className="border-b border-neutral-200">
                <td className="py-1">{row.rank}</td>
                <td className="py-1 truncate max-w-[180px]">
                  {row.displayName}
                </td>
                <td className="py-1 text-right font-mono">{row.score}</td>
                <td className="py-1 text-right hidden sm:table-cell">
                  {row.correct}
                </td>
                <td className="py-1 text-right hidden sm:table-cell">
                  {row.wrong}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="brutal-card p-5">
        <h2 className="font-bold text-lg mb-3">Per-question stats</h2>
        <div className="space-y-3">
          {data.questionStats.map((q) => (
            <div
              key={q.questionId}
              className="border-2 border-black rounded p-3"
            >
              <div className="text-xs uppercase text-neutral-500 mb-1">
                Q{q.orderIndex + 1} · {q.type.replace('_', ' ').toLowerCase()}
              </div>
              <div
                className="prose max-w-none font-bold break-words"
                dangerouslySetInnerHTML={{ __html: q.prompt }}
              />

              <div className="text-sm text-neutral-600 mt-1">
                Correct rate: {(q.correctRate * 100).toFixed(0)}% · Avg speed:{' '}
                {(q.avgAnsweredMs / 1000).toFixed(1)}s
              </div>
              {q.optionDistribution && (
                <div className="mt-2 flex flex-wrap gap-1 text-xs">
                  {Object.entries(q.optionDistribution).map(([key, count]) => (
                    <div
                      key={key}
                      className="border border-neutral-300 rounded px-2 py-0.5"
                    >
                      <span className="font-bold">
                        {key === '_timeout' ? '⏱' : key}
                      </span>
                      : {count}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
