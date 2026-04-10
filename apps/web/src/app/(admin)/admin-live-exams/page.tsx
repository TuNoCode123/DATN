'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Radio, Users, Activity, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import {
  LiveExamSessionStatus,
  LiveExamTemplateStatus,
} from '@/lib/live-exam-types';

type AdminSessionRow = {
  id: string;
  title: string;
  status: LiveExamSessionStatus;
  joinCode: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  createdBy: { id: string; displayName: string | null; email: string };
  template: { id: string; title: string } | null;
  _count: { participants: number; questions: number };
};

type AdminTemplateRow = {
  id: string;
  title: string;
  status: LiveExamTemplateStatus;
  createdAt: string;
  createdBy: { id: string; displayName: string | null; email: string };
  _count: { questions: number; sessions: number };
};

type Stats = {
  sessions: Record<string, number>;
  templates: Record<string, number>;
};

const SESSION_STATUSES: LiveExamSessionStatus[] = [
  'LOBBY',
  'LIVE',
  'ENDED',
  'CANCELLED',
];

export default function AdminLiveExamsPage() {
  const [tab, setTab] = useState<'sessions' | 'templates'>('sessions');
  const [status, setStatus] = useState<LiveExamSessionStatus | null>(null);

  const { data: sessions, isLoading: sessionsLoading } = useQuery<
    AdminSessionRow[]
  >({
    queryKey: ['admin-live-exams', 'sessions', status],
    queryFn: async () => {
      const qs = status ? `?status=${status}` : '';
      return (await api.get(`/admin/live-exams/sessions${qs}`)).data;
    },
    enabled: tab === 'sessions',
    refetchInterval: tab === 'sessions' ? 5_000 : false,
  });

  const { data: templates, isLoading: templatesLoading } = useQuery<
    AdminTemplateRow[]
  >({
    queryKey: ['admin-live-exams', 'templates'],
    queryFn: async () => (await api.get('/admin/live-exams/templates')).data,
    enabled: tab === 'templates',
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ['admin-live-exams', 'stats'],
    queryFn: async () => (await api.get('/admin/live-exams/stats')).data,
    refetchInterval: 5_000,
  });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-3xl font-extrabold">Live exam monitor</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Read-only view of every template and session hosted on this platform.
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {SESSION_STATUSES.map((s) => (
          <div
            key={s}
            className={`brutal-card p-3 text-center cursor-pointer ${
              status === s ? 'bg-yellow-100' : 'bg-white'
            }`}
            onClick={() => {
              setTab('sessions');
              setStatus(status === s ? null : s);
            }}
          >
            <div className="text-xs uppercase text-neutral-500">{s}</div>
            <div className="text-2xl font-extrabold">
              {stats?.sessions?.[s] ?? 0}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab('sessions')}
          className={`brutal-btn px-4 py-2 ${
            tab === 'sessions' ? 'bg-yellow-200 font-bold' : 'bg-white'
          }`}
        >
          Sessions
        </button>
        <button
          type="button"
          onClick={() => setTab('templates')}
          className={`brutal-btn px-4 py-2 ${
            tab === 'templates' ? 'bg-yellow-200 font-bold' : 'bg-white'
          }`}
        >
          Templates
        </button>
      </div>

      {tab === 'sessions' && (
        <>
          {sessionsLoading && <p>Loading…</p>}
          {!sessionsLoading && (!sessions || sessions.length === 0) && (
            <div className="brutal-card p-6 text-center text-neutral-500">
              No sessions match this filter.
            </div>
          )}
          <div className="space-y-3">
            {sessions?.map((row) => (
              <Link
                key={row.id}
                href={`/admin-live-exams/${row.id}`}
                className="brutal-card p-4 flex items-center gap-4 flex-wrap"
              >
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-1">
                    <SessionStatusBadge status={row.status} />
                    {row.joinCode && (
                      <span className="font-mono text-xs text-neutral-500">
                        {row.joinCode}
                      </span>
                    )}
                  </div>
                  <div className="font-bold line-clamp-1">{row.title}</div>
                  <div className="text-xs text-neutral-500">
                    Host: {row.createdBy.displayName ?? row.createdBy.email}
                    {row.template && <> · Template: {row.template.title}</>}
                  </div>
                </div>
                <div className="flex gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <Radio className="w-4 h-4" /> {row._count.questions} Q
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" /> {row._count.participants}
                  </span>
                  <span className="flex items-center gap-1 text-neutral-500">
                    <Activity className="w-4 h-4" />
                    {row.startedAt
                      ? new Date(row.startedAt).toLocaleTimeString()
                      : '—'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {tab === 'templates' && (
        <>
          {templatesLoading && <p>Loading…</p>}
          {!templatesLoading && (!templates || templates.length === 0) && (
            <div className="brutal-card p-6 text-center text-neutral-500">
              No templates yet.
            </div>
          )}
          <div className="space-y-3">
            {templates?.map((t) => (
              <div
                key={t.id}
                className="brutal-card p-4 flex items-center gap-4 flex-wrap"
              >
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-1">
                    <TemplateStatusBadge status={t.status} />
                  </div>
                  <div className="font-bold line-clamp-1">{t.title}</div>
                  <div className="text-xs text-neutral-500">
                    Author: {t.createdBy.displayName ?? t.createdBy.email}
                  </div>
                </div>
                <div className="flex gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <FileText className="w-4 h-4" /> {t._count.questions} Q
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" /> {t._count.sessions} sessions
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SessionStatusBadge({ status }: { status: LiveExamSessionStatus }) {
  const cls: Record<LiveExamSessionStatus, string> = {
    LOBBY: 'bg-blue-200 text-blue-800',
    LIVE: 'bg-green-300 text-green-900 animate-pulse',
    ENDED: 'bg-neutral-300 text-neutral-700',
    CANCELLED: 'bg-red-200 text-red-800',
  };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls[status]}`}>
      {status}
    </span>
  );
}

function TemplateStatusBadge({ status }: { status: LiveExamTemplateStatus }) {
  const cls: Record<LiveExamTemplateStatus, string> = {
    DRAFT: 'bg-neutral-200 text-neutral-700',
    PUBLISHED: 'bg-green-200 text-green-900',
    ARCHIVED: 'bg-neutral-300 text-neutral-600',
  };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls[status]}`}>
      {status}
    </span>
  );
}
