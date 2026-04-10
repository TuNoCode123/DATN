'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Trophy, Users, Calendar } from 'lucide-react';
import { api } from '@/lib/api';

type PlayedRow = {
  id: string;
  sessionId: string;
  title: string;
  endedAt: string | null;
  myScore: number;
  myRank: number | null;
  correctCount: number;
  wrongCount: number;
  totalPlayers: number;
};

type HostedRow = {
  sessionId: string;
  title: string;
  endedAt: string | null;
  playerCount: number;
  avgScore: number;
  topScore: number;
  topPlayerName: string | null;
};

export default function LiveHistoryPage() {
  const [tab, setTab] = useState<'played' | 'hosted'>('played');

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-extrabold mb-5">Live exam history</h1>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          type="button"
          onClick={() => setTab('played')}
          className={`brutal-btn px-4 py-2 ${
            tab === 'played' ? 'bg-yellow-200 font-bold' : 'bg-white'
          }`}
        >
          Played
        </button>
        <button
          type="button"
          onClick={() => setTab('hosted')}
          className={`brutal-btn px-4 py-2 ${
            tab === 'hosted' ? 'bg-yellow-200 font-bold' : 'bg-white'
          }`}
        >
          Hosted
        </button>
      </div>

      {tab === 'played' ? <PlayedList /> : <HostedList />}
    </div>
  );
}

function PlayedList() {
  const { data, isLoading } = useQuery<{
    items: PlayedRow[];
    nextCursor: string | null;
  }>({
    queryKey: ['live-exam-history', 'mine'],
    queryFn: async () => (await api.get('/live-exams/history/mine')).data,
  });

  if (isLoading) return <p>Loading…</p>;
  if (!data || data.items.length === 0)
    return (
      <div className="brutal-card p-6 text-center text-neutral-600">
        You have not played any live exams yet.
      </div>
    );

  return (
    <div className="space-y-3">
      {data.items.map((row) => (
        <Link
          key={row.id}
          href={`/live/sessions/${row.sessionId}/result?mode=player`}
          className="brutal-card p-4 flex items-center gap-4 flex-wrap"
        >
          <div className="flex-1 min-w-[180px]">
            <div className="font-bold line-clamp-1">{row.title}</div>
            <div className="text-xs text-neutral-500 flex items-center gap-1 mt-1">
              <Calendar className="w-3 h-3" />
              {row.endedAt ? new Date(row.endedAt).toLocaleString() : 'Unknown'}
            </div>
          </div>
          <div className="flex gap-3 text-sm">
            <div>
              <div className="text-xs text-neutral-500">Score</div>
              <div className="font-extrabold text-lg">{row.myScore}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Rank</div>
              <div className="font-extrabold text-lg">
                #{row.myRank ?? '—'}
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="text-xs text-neutral-500">Correct</div>
              <div className="font-extrabold text-lg">
                {row.correctCount}/{row.correctCount + row.wrongCount}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function HostedList() {
  const { data, isLoading } = useQuery<{
    items: HostedRow[];
    nextCursor: string | null;
  }>({
    queryKey: ['live-exam-history', 'hosted'],
    queryFn: async () => (await api.get('/live-exams/history/hosted')).data,
  });

  if (isLoading) return <p>Loading…</p>;
  if (!data || data.items.length === 0)
    return (
      <div className="brutal-card p-6 text-center text-neutral-600">
        You have not hosted any live exams yet.
      </div>
    );

  return (
    <div className="space-y-3">
      {data.items.map((row) => (
        <Link
          key={row.sessionId}
          href={`/live/sessions/${row.sessionId}/result?mode=host`}
          className="brutal-card p-4 flex items-center gap-4 flex-wrap"
        >
          <div className="flex-1 min-w-[180px]">
            <div className="font-bold line-clamp-1">{row.title}</div>
            <div className="text-xs text-neutral-500 flex items-center gap-1 mt-1">
              <Calendar className="w-3 h-3" />
              {row.endedAt ? new Date(row.endedAt).toLocaleString() : 'Unknown'}
            </div>
          </div>
          <div className="flex gap-3 text-sm">
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4 text-neutral-500" />
              <div>
                <div className="text-xs text-neutral-500">Players</div>
                <div className="font-extrabold">{row.playerCount}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Trophy className="w-4 h-4 text-yellow-500" />
              <div>
                <div className="text-xs text-neutral-500">Top</div>
                <div className="font-extrabold truncate max-w-[120px]">
                  {row.topPlayerName ?? '—'}
                </div>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
