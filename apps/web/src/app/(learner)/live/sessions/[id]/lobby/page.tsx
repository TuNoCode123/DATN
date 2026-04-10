'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App } from 'antd';
import { Users, Radio } from 'lucide-react';
import {
  connectLiveExamSocket,
  disconnectLiveExamSocket,
} from '@/lib/live-exam-socket';
import type { Socket } from 'socket.io-client';

type Player = { userId: string; displayName: string };

export default function LobbyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = use(params);
  const router = useRouter();
  const { message } = App.useApp();

  const [players, setPlayers] = useState<Player[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const s: Socket = connectLiveExamSocket();

    s.emit(
      'lobby.join',
      { sessionId },
      (ack: { ok: boolean; error?: string }) => {
        if (!ack?.ok) message.error(ack?.error ?? 'Could not join lobby');
      },
    );

    const onState = (snap: { players: Player[]; count: number }) => {
      setPlayers(snap.players);
      setCount(snap.count);
    };
    const onJoin = (p: Player) => {
      setPlayers((prev) =>
        prev.find((x) => x.userId === p.userId) ? prev : [...prev, p],
      );
      setCount((c) => c + 1);
    };
    const onLeft = ({
      userId,
      kicked,
    }: {
      userId: string;
      kicked?: boolean;
    }) => {
      setPlayers((prev) => prev.filter((p) => p.userId !== userId));
      setCount((c) => Math.max(0, c - 1));
      if (kicked) {
        message.warning('You were removed from the room');
      }
    };
    const onStarted = () => {
      router.push(`/live/sessions/${sessionId}/play`);
    };
    const onEnded = () => {
      message.info('Session ended');
      router.push(`/live`);
    };

    s.on('lobby.state', onState);
    s.on('lobby.playerJoined', onJoin);
    s.on('lobby.playerLeft', onLeft);
    s.on('exam.started', onStarted);
    s.on('exam.ended', onEnded);

    return () => {
      s.off('lobby.state', onState);
      s.off('lobby.playerJoined', onJoin);
      s.off('lobby.playerLeft', onLeft);
      s.off('exam.started', onStarted);
      s.off('exam.ended', onEnded);
      s.emit('lobby.leave', { sessionId });
      disconnectLiveExamSocket();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="max-w-3xl mx-auto">
      <div
        className="brutal-card p-6 mb-4 text-center"
        data-testid="lobby-waiting"
      >
        <Radio className="w-10 h-10 mx-auto text-green-600 mb-2 animate-pulse" />
        <h1 className="text-2xl md:text-3xl font-extrabold">
          Waiting for host to start…
        </h1>
        <p className="text-neutral-600 mt-2">
          Hang tight — the exam begins the moment your host clicks Start.
        </p>
      </div>

      <div className="brutal-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Users className="w-5 h-5" /> Players in room
          </h2>
          <div className="text-2xl font-extrabold">{count}</div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {players.map((p) => (
            <div
              key={p.userId}
              className="brutal-card p-2 text-sm text-center truncate"
              data-testid="player-tile"
            >
              {p.displayName}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
