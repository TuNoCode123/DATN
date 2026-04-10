'use client';

import { use, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { App, Modal } from 'antd';
import {
  Users,
  Play,
  Square,
  Copy,
  Radio,
  Trophy,
  Clock,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  connectLiveExamSocket,
  disconnectLiveExamSocket,
} from '@/lib/live-exam-socket';
import type { Socket } from 'socket.io-client';
import {
  DispatchPayload,
  HostAnswerDisplay,
  LiveExamQuestionType,
  LiveExamSessionStatus,
  RevealPayload,
} from '@/lib/live-exam-types';

type PlayerAnswerEntry = {
  userId: string;
  displayName: string;
  display: HostAnswerDisplay;
  isCorrect: boolean;
  answeredMs: number;
};

type HostView = {
  session: {
    id: string;
    title: string;
    status: LiveExamSessionStatus;
    joinCode: string | null;
    inviteSlug: string | null;
    perQuestionSec: number;
    interstitialSec: number;
    durationSec: number;
    questions: Array<{
      id: string;
      orderIndex: number;
      type: LiveExamQuestionType;
      prompt: string;
      payload: unknown;
    }>;
    participants: Array<{
      id: string;
      userId: string;
      displayName: string;
      finalScore: number | null;
      finalRank: number | null;
    }>;
  };
  leaderboard: Array<{
    rank: number;
    userId: string;
    displayName: string;
    score: number;
    correct: number;
    wrong: number;
  }>;
  phaseState: {
    qindex: number | null;
    phase: string | null;
    qstart: number | null;
  };
};

type Phase = 'LOBBY' | 'OPEN' | 'LOCKED' | 'INTERSTITIAL' | 'ENDED';

type CurrentQ = {
  index: number;
  question: {
    id: string;
    type: LiveExamQuestionType;
    prompt: string;
    dispatch: DispatchPayload;
  };
  reveal: RevealPayload;
  dispatchedAt: number;
  perQuestionSec: number;
};

export default function HostConsolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const { data, isLoading } = useQuery<HostView>({
    queryKey: ['live-exam-session', sessionId, 'host-view'],
    queryFn: async () =>
      (await api.get(`/live-exams/sessions/${sessionId}/host-view`)).data,
  });

  const [socket, setSocket] = useState<Socket | null>(null);
  const [phase, setPhase] = useState<Phase>('LOBBY');
  const [currentQ, setCurrentQ] = useState<CurrentQ | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [playerAnswers, setPlayerAnswers] = useState<PlayerAnswerEntry[]>([]);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [leaderboard, setLeaderboard] = useState<HostView['leaderboard']>([]);
  const [lobbyPlayers, setLobbyPlayers] = useState<
    Array<{ userId: string; displayName: string }>
  >([]);
  const [remainingMs, setRemainingMs] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);

  useEffect(() => {
    if (!data) return;
    if (data.session.status === 'LIVE') {
      const ph = (data.phaseState.phase as Phase) ?? 'OPEN';
      setPhase(ph);
    } else if (data.session.status === 'ENDED') {
      setPhase('ENDED');
    } else {
      setPhase('LOBBY');
    }
    setLobbyPlayers(
      data.session.participants.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
      })),
    );
    setTotalPlayers(data.session.participants.length);
    setLeaderboard(data.leaderboard);
  }, [data]);

  useEffect(() => {
    const s = connectLiveExamSocket();
    setSocket(s);

    s.emit(
      'host.watch',
      { sessionId },
      (ack: { ok: boolean; error?: string }) => {
        if (!ack?.ok) message.error(ack?.error ?? 'Could not attach host viewer');
      },
    );

    const onLobbyJoin = (p: { userId: string; displayName: string }) => {
      setLobbyPlayers((prev) =>
        prev.find((x) => x.userId === p.userId) ? prev : [...prev, p],
      );
      setTotalPlayers((c) => c + 1);
    };
    const onLobbyLeft = ({ userId }: { userId: string }) => {
      setLobbyPlayers((prev) => prev.filter((p) => p.userId !== userId));
      setTotalPlayers((c) => Math.max(0, c - 1));
    };
    const onLobbyState = (snap: {
      players: Array<{ userId: string; displayName: string }>;
      count: number;
    }) => {
      setLobbyPlayers(snap.players);
      setTotalPlayers(snap.count);
    };
    const onQView = (payload: {
      index: number;
      question: CurrentQ['question'];
      reveal: RevealPayload;
      dispatchedAt: number;
      perQuestionSec: number;
    }) => {
      setPhase('OPEN');
      setCurrentQ(payload);
      setAnsweredCount(0);
      setPlayerAnswers([]);
    };
    const onAnswerStream = (p: {
      userId: string;
      displayName: string;
      answeredMs: number;
      answeredCount: number;
      totalPlayers: number;
      isCorrect: boolean;
      display: HostAnswerDisplay;
    }) => {
      setAnsweredCount(p.answeredCount);
      setTotalPlayers(p.totalPlayers);
      setPlayerAnswers((prev) => {
        const next = prev.filter((e) => e.userId !== p.userId);
        next.push({
          userId: p.userId,
          displayName: p.displayName,
          display: p.display,
          isCorrect: p.isCorrect,
          answeredMs: p.answeredMs,
        });
        return next;
      });
    };
    const onQLocked = () => setPhase('LOCKED');
    const onLbUpdate = (p: { top10: HostView['leaderboard'] }) => {
      setPhase('INTERSTITIAL');
      setLeaderboard(p.top10);
    };
    const onFullLb = (p: { rows: HostView['leaderboard'] }) => {
      setLeaderboard(p.rows);
    };
    const onEnded = () => {
      setPhase('ENDED');
      queryClient.invalidateQueries({
        queryKey: ['live-exam-session', sessionId],
      });
      setTimeout(
        () => router.push(`/live/sessions/${sessionId}/result?mode=host`),
        800,
      );
    };

    s.on('lobby.state', onLobbyState);
    s.on('lobby.playerJoined', onLobbyJoin);
    s.on('lobby.playerLeft', onLobbyLeft);
    s.on('host.questionView', onQView);
    s.on('host.answerStream', onAnswerStream);
    s.on('exam.questionLocked', onQLocked);
    s.on('leaderboard.update', onLbUpdate);
    s.on('host.fullLeaderboard', onFullLb);
    s.on('exam.ended', onEnded);

    return () => {
      s.off('lobby.state', onLobbyState);
      s.off('lobby.playerJoined', onLobbyJoin);
      s.off('lobby.playerLeft', onLobbyLeft);
      s.off('host.questionView', onQView);
      s.off('host.answerStream', onAnswerStream);
      s.off('exam.questionLocked', onQLocked);
      s.off('leaderboard.update', onLbUpdate);
      s.off('host.fullLeaderboard', onFullLb);
      s.off('exam.ended', onEnded);
      disconnectLiveExamSocket();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (phase !== 'OPEN' || !currentQ) return;
    const tick = () => {
      const elapsed = Date.now() - currentQ.dispatchedAt;
      setRemainingMs(
        Math.max(0, currentQ.perQuestionSec * 1000 - elapsed),
      );
    };
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [phase, currentQ]);

  const startExam = () => {
    if (!socket) return;
    socket.emit(
      'host.start',
      { sessionId },
      (ack: { ok: boolean; error?: string }) => {
        if (!ack?.ok) message.error(ack?.error ?? 'Start failed');
      },
    );
  };

  const endExam = () => {
    if (!socket) return;
    setConfirmEnd(false);
    socket.emit('host.end', { sessionId }, () => {
      /* navigates on exam.ended */
    });
  };

  const kickPlayer = (userId: string) => {
    if (!socket) return;
    socket.emit('host.kick', { sessionId, userId });
  };

  const copyCode = () => {
    if (!data?.session.joinCode) return;
    navigator.clipboard.writeText(data.session.joinCode);
    message.success('Join code copied');
  };

  if (isLoading || !data) return <p>Loading host console…</p>;

  const session = data.session;
  const isLobby = phase === 'LOBBY';
  const qrUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/live-exams/sessions/${sessionId}/qr`;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="brutal-card p-4 md:p-5 mb-4 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="text-xs text-neutral-500 uppercase font-bold">
            Host console
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold line-clamp-1">
            {session.title}
          </h1>
        </div>

        <PhasePill phase={phase} remainingMs={remainingMs} />

        {session.joinCode && (
          <button
            type="button"
            onClick={copyCode}
            className="brutal-btn px-3 py-2 bg-yellow-100 font-mono font-bold tracking-widest flex items-center gap-2"
            title="Copy join code"
          >
            {session.joinCode} <Copy className="w-4 h-4" />
          </button>
        )}

        {isLobby ? (
          <button
            type="button"
            onClick={startExam}
            disabled={totalPlayers === 0}
            className="brutal-btn-fill px-5 py-2 flex items-center gap-2 disabled:opacity-50"
            data-testid="host-start-btn"
          >
            <Play className="w-4 h-4" /> Start
          </button>
        ) : phase !== 'ENDED' ? (
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            className="brutal-btn px-4 py-2 bg-red-200 flex items-center gap-2"
          >
            <Square className="w-4 h-4" /> Force end
          </button>
        ) : null}
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          {isLobby ? (
            <LobbyPanel
              players={lobbyPlayers}
              onKick={kickPlayer}
              qrUrl={qrUrl}
              inviteSlug={session.inviteSlug}
            />
          ) : phase === 'ENDED' ? (
            <div className="brutal-card p-8 text-center">
              <Trophy className="w-12 h-12 mx-auto text-yellow-500 mb-2" />
              <h2 className="text-xl font-bold mb-1">Session ended</h2>
              <p className="text-neutral-600">Loading results…</p>
            </div>
          ) : (
            <CurrentQuestionPanel
              currentQ={currentQ}
              phase={phase}
              answeredCount={answeredCount}
              totalPlayers={totalPlayers}
              remainingMs={remainingMs}
              playerAnswers={playerAnswers}
            />
          )}
        </div>

        <LeaderboardPanel
          leaderboard={leaderboard}
          lobbyCount={totalPlayers}
          isLobby={isLobby}
        />
      </div>

      <Modal
        title="End session for all players?"
        open={confirmEnd}
        okText="End now"
        okButtonProps={{ danger: true }}
        onOk={endExam}
        onCancel={() => setConfirmEnd(false)}
      >
        <p>
          Their current question will be scored and the leaderboard will
          freeze.
        </p>
      </Modal>
    </div>
  );
}

// ── Sub-components ──

function PhasePill({ phase, remainingMs }: { phase: Phase; remainingMs: number }) {
  const sec = Math.ceil(remainingMs / 1000);
  const cls: Record<Phase, string> = {
    LOBBY: 'bg-blue-200 text-blue-900',
    OPEN: 'bg-green-300 text-green-900',
    LOCKED: 'bg-yellow-200 text-yellow-900',
    INTERSTITIAL: 'bg-purple-200 text-purple-900',
    ENDED: 'bg-neutral-300 text-neutral-800',
  };
  return (
    <div
      className={`font-bold text-sm px-3 py-1.5 border-2 border-black rounded-full ${cls[phase]}`}
    >
      {phase}
      {phase === 'OPEN' && ` · ${sec}s`}
    </div>
  );
}

function LobbyPanel({
  players,
  onKick,
  qrUrl,
  inviteSlug,
}: {
  players: Array<{ userId: string; displayName: string }>;
  onKick: (uid: string) => void;
  qrUrl: string;
  inviteSlug: string | null;
}) {
  return (
    <div className="brutal-card p-5" data-testid="host-lobby">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Users className="w-5 h-5" /> Waiting room — {players.length} player
          {players.length === 1 ? '' : 's'}
        </h2>
        {inviteSlug && (
          <div className="text-xs text-neutral-500">
            Invite: <span className="font-mono">/live/join/{inviteSlug}</span>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-[auto_1fr] gap-5">
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="Join QR code"
            className="w-40 h-40 border-2 border-black rounded"
          />
          <div className="text-xs text-neutral-500 mt-1">Scan to join</div>
        </div>

        <div>
          {players.length === 0 && (
            <div className="text-neutral-500">
              <Radio className="w-5 h-5 inline-block animate-pulse mr-1" />
              Waiting for players to join…
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {players.map((p) => (
              <div
                key={p.userId}
                className="brutal-card p-2 text-sm flex items-center justify-between gap-2"
                data-testid="player-tile"
              >
                <span className="truncate">{p.displayName}</span>
                <button
                  type="button"
                  onClick={() => onKick(p.userId)}
                  className="text-neutral-400 hover:text-red-500 text-xs"
                  title="Kick"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrentQuestionPanel({
  currentQ,
  phase,
  answeredCount,
  totalPlayers,
  remainingMs,
  playerAnswers,
}: {
  currentQ: CurrentQ | null;
  phase: Phase;
  answeredCount: number;
  totalPlayers: number;
  remainingMs: number;
  playerAnswers: PlayerAnswerEntry[];
}) {
  if (!currentQ) {
    return (
      <div className="brutal-card p-6 text-center text-neutral-500">
        Waiting for next question…
      </div>
    );
  }
  return (
    <>
      <div className="brutal-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase font-bold text-neutral-500">
            Question {currentQ.index + 1} ·{' '}
            {currentQ.question.type.replace('_', ' ').toLowerCase()}
          </div>
          <div className="flex items-center gap-1 text-sm text-neutral-600">
            <Clock className="w-4 h-4" />
            {Math.ceil(remainingMs / 1000)}s
          </div>
        </div>
        <h2 className="text-xl font-extrabold mb-4">
          {currentQ.question.prompt}
        </h2>

        <HostRevealView dispatch={currentQ.question.dispatch} reveal={currentQ.reveal} />

        <div className="text-xs text-neutral-500 italic mt-3">
          {phase === 'OPEN'
            ? 'Players are answering — you are observing.'
            : phase === 'LOCKED'
              ? "Time's up — calculating scores…"
              : 'Showing leaderboard…'}
        </div>
      </div>

      <div className="brutal-card p-4 bg-yellow-50">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold">Answers in</div>
          <div className="text-2xl font-extrabold">
            {answeredCount} / {totalPlayers}
          </div>
        </div>
        <div className="mt-2 h-3 bg-white border-2 border-black rounded overflow-hidden">
          <div
            className="h-full bg-green-400 transition-all"
            style={{
              width: `${totalPlayers ? (answeredCount / totalPlayers) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      <PlayerAnswersPanel playerAnswers={playerAnswers} />
    </>
  );
}

function PlayerAnswersPanel({
  playerAnswers,
}: {
  playerAnswers: PlayerAnswerEntry[];
}) {
  const sorted = [...playerAnswers].sort(
    (a, b) => a.answeredMs - b.answeredMs,
  );
  return (
    <div className="brutal-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-sm uppercase text-neutral-600">
          Player answers
        </h3>
        <span className="text-xs text-neutral-500">{sorted.length} in</span>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-neutral-500 italic">
          Waiting for players to submit…
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((entry) => (
            <li
              key={entry.userId}
              className={`border-2 border-black rounded p-2 flex gap-3 items-start ${
                entry.isCorrect ? 'bg-green-50' : 'bg-red-50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-sm truncate">
                    {entry.displayName}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 border border-black rounded ${
                      entry.isCorrect
                        ? 'bg-green-300 text-green-900'
                        : 'bg-red-300 text-red-900'
                    }`}
                  >
                    {entry.isCorrect ? 'CORRECT' : 'WRONG'}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-mono ml-auto">
                    {(entry.answeredMs / 1000).toFixed(1)}s
                  </span>
                </div>
                <AnswerDisplayView display={entry.display} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnswerDisplayView({ display }: { display: HostAnswerDisplay }) {
  if (display.type === 'MULTIPLE_CHOICE') {
    return (
      <div className="text-sm">
        <span className="font-bold mr-1">{display.optionId}.</span>
        <span className="text-neutral-700">{display.optionText}</span>
      </div>
    );
  }
  if (display.type === 'SHORT_ANSWER') {
    return (
      <div className="text-sm font-mono break-words whitespace-pre-wrap">
        “{display.text}”
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {display.orderedFragments.map((f, i) => (
        <span
          key={i}
          className="px-1.5 py-0.5 bg-white border-2 border-black rounded text-xs"
        >
          {f}
        </span>
      ))}
    </div>
  );
}

/**
 * Host-only view of the correct answer. For MCQ we show all options
 * with the correct one highlighted. For short-answer we list the
 * accepted answers. For sentence-reorder we show the correct order.
 */
function HostRevealView({
  dispatch,
  reveal,
}: {
  dispatch: DispatchPayload;
  reveal: RevealPayload;
}) {
  if (dispatch.type === 'MULTIPLE_CHOICE' && reveal.type === 'MULTIPLE_CHOICE') {
    return (
      <div className="grid sm:grid-cols-2 gap-3">
        {dispatch.options.map((o) => (
          <div
            key={o.id}
            className={`brutal-card p-3 border-2 ${
              reveal.correctOptionId === o.id
                ? 'bg-green-200 border-green-700'
                : 'bg-white'
            }`}
          >
            <span className="font-bold mr-2">{o.id}.</span>
            {o.text}
            {reveal.correctOptionId === o.id && (
              <span className="ml-2 text-xs font-bold text-green-800">
                (correct)
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }
  if (dispatch.type === 'SHORT_ANSWER' && reveal.type === 'SHORT_ANSWER') {
    return (
      <div className="brutal-card p-3 bg-green-50">
        <div className="text-xs uppercase font-bold text-neutral-600 mb-1">
          Accepted answers
        </div>
        <div className="flex flex-wrap gap-2">
          {reveal.acceptedAnswers.map((a, i) => (
            <span
              key={i}
              className="px-2 py-1 bg-white border-2 border-black rounded text-sm"
            >
              {a}
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (dispatch.type === 'SENTENCE_REORDER' && reveal.type === 'SENTENCE_REORDER') {
    return (
      <div>
        <div className="text-xs uppercase font-bold text-neutral-500 mb-2">
          Shuffled (what players see)
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {dispatch.shuffledFragments.map((f, i) => (
            <span
              key={i}
              className="px-2 py-1 bg-neutral-100 border-2 border-black rounded text-sm"
            >
              {f}
            </span>
          ))}
        </div>
        <div className="text-xs uppercase font-bold text-neutral-500 mb-2">
          Correct order
        </div>
        <div className="flex flex-wrap gap-2">
          {reveal.correctFragments.map((f, i) => (
            <span
              key={i}
              className="px-2 py-1 bg-green-200 border-2 border-black rounded text-sm font-bold"
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

function LeaderboardPanel({
  leaderboard,
  lobbyCount,
  isLobby,
}: {
  leaderboard: HostView['leaderboard'];
  lobbyCount: number;
  isLobby: boolean;
}) {
  return (
    <div className="brutal-card p-4 h-fit">
      <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
        <Trophy className="w-5 h-5" /> Leaderboard
      </h3>
      {isLobby ? (
        <p className="text-sm text-neutral-500">
          {lobbyCount} player{lobbyCount === 1 ? '' : 's'} ready.
        </p>
      ) : leaderboard.length === 0 ? (
        <p className="text-sm text-neutral-500">Updating…</p>
      ) : (
        <ul className="space-y-1">
          {leaderboard.map((row) => (
            <li
              key={row.userId}
              className="flex items-center gap-2 text-sm border-b border-neutral-200 py-1 last:border-b-0"
            >
              <span className="w-6 text-right font-bold">{row.rank}</span>
              <span className="flex-1 truncate">{row.displayName}</span>
              <span className="font-mono font-bold">{row.score}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
