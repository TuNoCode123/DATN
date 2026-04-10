'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Modal } from 'antd';
import { ArrowLeft, Square, Trophy, Users, Activity } from 'lucide-react';
import { api } from '@/lib/api';
import {
  LiveExamQuestionType,
  LiveExamSessionStatus,
} from '@/lib/live-exam-types';

type AdminDetail = {
  session: {
    id: string;
    title: string;
    status: LiveExamSessionStatus;
    joinCode: string | null;
    startedAt: string | null;
    endedAt: string | null;
    createdBy: { id: string; displayName: string | null; email: string };
    template: { id: string; title: string } | null;
    questions: Array<{
      id: string;
      orderIndex: number;
      type: LiveExamQuestionType;
      prompt: string;
    }>;
    participants: Array<{
      id: string;
      userId: string;
      displayName: string;
      finalScore: number | null;
      finalRank: number | null;
      correctCount: number;
      wrongCount: number;
    }>;
  };
  liveLeaderboard: Array<{
    rank: number;
    userId: string;
    displayName: string;
    score: number;
    correct: number;
    wrong: number;
  }>;
};

type EventRow = {
  id: string;
  type: string;
  userId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export default function AdminLiveExamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [tab, setTab] = useState<'participants' | 'leaderboard' | 'events'>(
    'leaderboard',
  );
  const [confirmEnd, setConfirmEnd] = useState(false);

  const { data, isLoading } = useQuery<AdminDetail>({
    queryKey: ['admin-live-exam-session', id],
    queryFn: async () =>
      (await api.get(`/admin/live-exams/sessions/${id}`)).data,
    refetchInterval: 3_000,
  });

  const { data: events } = useQuery<EventRow[]>({
    queryKey: ['admin-live-exam-session', id, 'events'],
    queryFn: async () =>
      (await api.get(`/admin/live-exams/sessions/${id}/events`)).data,
    enabled: tab === 'events',
    refetchInterval: tab === 'events' ? 3_000 : false,
  });

  const forceEnd = useMutation({
    mutationFn: async () => {
      await api.post(`/admin/live-exams/sessions/${id}/force-end`);
    },
    onSuccess: () => {
      message.success('Session force-ended');
      setConfirmEnd(false);
      queryClient.invalidateQueries({
        queryKey: ['admin-live-exam-session', id],
      });
      queryClient.invalidateQueries({ queryKey: ['admin-live-exams'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Force-end failed';
      message.error(msg);
    },
  });

  if (isLoading || !data) return <p>Loading…</p>;
  const session = data.session;
  const canForceEnd = session.status === 'LIVE' || session.status === 'LOBBY';
  const leaderboard =
    data.liveLeaderboard.length > 0
      ? data.liveLeaderboard
      : session.participants
          .slice()
          .sort((a, b) => (a.finalRank ?? 999) - (b.finalRank ?? 999))
          .map((p, i) => ({
            rank: p.finalRank ?? i + 1,
            userId: p.userId,
            displayName: p.displayName,
            score: p.finalScore ?? 0,
            correct: p.correctCount,
            wrong: p.wrongCount,
          }));

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        href="/admin-live-exams"
        className="text-sm text-neutral-600 mb-3 inline-flex items-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" /> Back to monitor
      </Link>

      <div className="brutal-card p-5 mb-4 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="text-xs uppercase text-neutral-500 font-bold">
            {session.status}
          </div>
          <h1 className="text-2xl font-extrabold">{session.title}</h1>
          <div className="text-xs text-neutral-500 mt-1">
            Host: {session.createdBy.displayName ?? session.createdBy.email}
            {session.joinCode && (
              <>
                {' · '}Code:{' '}
                <span className="font-mono">{session.joinCode}</span>
              </>
            )}
            {session.template && <> · Template: {session.template.title}</>}
          </div>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" /> {session.participants.length}
          </span>
          <span className="flex items-center gap-1">
            <Trophy className="w-4 h-4" /> {session.questions.length} Q
          </span>
          <span className="flex items-center gap-1 text-neutral-500">
            <Activity className="w-4 h-4" />
            {session.startedAt
              ? new Date(session.startedAt).toLocaleTimeString()
              : '—'}
          </span>
        </div>
        {canForceEnd && (
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            className="brutal-btn px-4 py-2 bg-red-200 flex items-center gap-2"
          >
            <Square className="w-4 h-4" /> Force end
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {(['leaderboard', 'participants', 'events'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`brutal-btn px-3 py-1.5 capitalize ${
              tab === t ? 'bg-yellow-200 font-bold' : 'bg-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'leaderboard' && (
        <div className="brutal-card p-4">
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
              {leaderboard.map((row) => (
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
      )}

      {tab === 'participants' && (
        <div className="brutal-card p-4">
          <ul className="space-y-1">
            {session.participants.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between text-sm border-b border-neutral-200 py-1"
              >
                <span>{p.displayName}</span>
                <span className="font-mono text-xs text-neutral-500">
                  {p.userId}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'events' && (
        <div className="brutal-card p-4">
          <ul className="space-y-1 text-sm font-mono">
            {events?.map((e) => (
              <li
                key={e.id}
                className="flex gap-2 border-b border-neutral-200 py-1"
              >
                <span className="text-neutral-500">
                  {new Date(e.createdAt).toLocaleTimeString()}
                </span>
                <span className="font-bold">{e.type}</span>
                {e.userId && (
                  <span className="text-neutral-600">{e.userId}</span>
                )}
                {e.payload && (
                  <span className="text-xs text-neutral-500 truncate">
                    {JSON.stringify(e.payload)}
                  </span>
                )}
              </li>
            ))}
            {events && events.length === 0 && (
              <li className="text-neutral-500">No events yet.</li>
            )}
          </ul>
        </div>
      )}

      <Modal
        title="Force-end this session?"
        open={confirmEnd}
        okText="End now"
        okButtonProps={{ danger: true }}
        onOk={() => forceEnd.mutate()}
        onCancel={() => setConfirmEnd(false)}
      >
        <p>
          Current answers will be scored, leaderboard frozen, and all players
          routed to the result page.
        </p>
      </Modal>
    </div>
  );
}
