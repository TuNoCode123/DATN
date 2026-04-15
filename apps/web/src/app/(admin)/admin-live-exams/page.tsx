'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pagination } from 'antd';
import { cn } from '@/lib/utils';
import {
  Activity,
  FileText,
  Users,
  Radio,
  Search,
  Plus,
  LayoutGrid,
  Hash,
  Clock,
  Loader2,
  Zap,
  Eye,
  EyeOff,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  connectLiveExamSocket,
  disconnectLiveExamSocket,
} from '@/lib/live-exam-socket';
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

type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
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

const STATUS_BADGE: Record<LiveExamSessionStatus, string> = {
  LOBBY: 'bg-sky-100 text-sky-800 border-sky-400',
  LIVE: 'bg-emerald-100 text-emerald-800 border-emerald-400',
  ENDED: 'bg-gray-100 text-gray-700 border-gray-400',
  CANCELLED: 'bg-red-100 text-red-800 border-red-400',
};

const STATUS_DOT: Record<LiveExamSessionStatus, string> = {
  LOBBY: 'bg-sky-500',
  LIVE: 'bg-emerald-500',
  ENDED: 'bg-gray-400',
  CANCELLED: 'bg-red-500',
};

const STAT_CARD_COLORS: Record<LiveExamSessionStatus, { bg: string; icon: string; border: string }> = {
  LOBBY: { bg: 'bg-sky-50', icon: 'text-sky-600', border: 'border-sky-400' },
  LIVE: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-400' },
  ENDED: { bg: 'bg-gray-50', icon: 'text-gray-500', border: 'border-gray-400' },
  CANCELLED: { bg: 'bg-red-50', icon: 'text-red-600', border: 'border-red-400' },
};

export default function AdminLiveExamsPage() {
  const [tab, setTab] = useState<'sessions' | 'templates'>('sessions');
  const [status, setStatus] = useState<LiveExamSessionStatus | null>(null);
  const [query, setQuery] = useState('');
  const [sessionPage, setSessionPage] = useState(1);
  const [templatePage, setTemplatePage] = useState(1);
  const [wsConnected, setWsConnected] = useState(false);
  const pageSize = 12;
  const queryClient = useQueryClient();

  const invalidateSessions = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin-live-exams', 'sessions'] });
    queryClient.invalidateQueries({ queryKey: ['admin-live-exams', 'stats'] });
  }, [queryClient]);

  useEffect(() => {
    const socket = connectLiveExamSocket();

    const onConnect = () => {
      setWsConnected(true);
      socket.emit('admin.watchAll');
    };
    const onDisconnect = () => setWsConnected(false);
    const onSessionUpdate = () => invalidateSessions();

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('admin.sessionUpdate', onSessionUpdate);

    if (socket.connected) {
      setWsConnected(true);
      socket.emit('admin.watchAll');
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('admin.sessionUpdate', onSessionUpdate);
      disconnectLiveExamSocket();
    };
  }, [invalidateSessions]);

  const { data: sessionsRes, isLoading: sessionsLoading } = useQuery<
    PaginatedResponse<AdminSessionRow>
  >({
    queryKey: ['admin-live-exams', 'sessions', status, sessionPage],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(sessionPage), pageSize: String(pageSize) });
      if (status) params.set('status', status);
      return (await api.get(`/admin/live-exams/sessions?${params}`)).data;
    },
    enabled: tab === 'sessions',
    refetchInterval: tab === 'sessions' ? (wsConnected ? 30_000 : 5_000) : false,
  });

  const { data: templatesRes, isLoading: templatesLoading } = useQuery<
    PaginatedResponse<AdminTemplateRow>
  >({
    queryKey: ['admin-live-exams', 'templates', templatePage],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(templatePage), pageSize: String(pageSize) });
      return (await api.get(`/admin/live-exams/templates?${params}`)).data;
    },
    enabled: tab === 'templates',
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ['admin-live-exams', 'stats'],
    queryFn: async () => (await api.get('/admin/live-exams/stats')).data,
    refetchInterval: wsConnected ? 30_000 : 5_000,
  });

  const filteredSessions = sessionsRes?.data?.filter((s) =>
    s.title.toLowerCase().includes(query.toLowerCase()),
  );
  const filteredTemplates = templatesRes?.data?.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-black">Live Exams</h1>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold border rounded-full',
              wsConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-400'
                : 'bg-red-50 text-red-700 border-red-400',
            )}
          >
            {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {wsConnected ? 'Live' : 'Offline'}
          </span>
        </div>
        <Link
          href="/live/templates"
          className="brutal-btn-fill px-4 py-2 text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Template
        </Link>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {SESSION_STATUSES.map((s) => {
          const active = status === s;
          const colors = STAT_CARD_COLORS[s];
          return (
            <button
              key={s}
              type="button"
              onClick={() => {
                setTab('sessions');
                setStatus(active ? null : s);
                setSessionPage(1);
              }}
              className={cn(
                'brutal-card px-4 py-3 text-left transition-all',
                active && 'ring-2 ring-indigo-500 ring-offset-1',
                colors.bg,
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={cn('w-2 h-2 rounded-full', STATUS_DOT[s])} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  {s}
                </span>
              </div>
              <div className={cn('text-2xl font-black', colors.icon)}>
                {stats?.sessions?.[s] ?? 0}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 border-2 border-black rounded-lg bg-white">
          <button
            type="button"
            onClick={() => setTab('sessions')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-colors',
              tab === 'sessions'
                ? 'bg-black text-white'
                : 'text-gray-500 hover:text-black',
            )}
          >
            <Activity className="w-4 h-4" />
            Sessions
          </button>
          <button
            type="button"
            onClick={() => setTab('templates')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold transition-colors',
              tab === 'templates'
                ? 'bg-black text-white'
                : 'text-gray-500 hover:text-black',
            )}
          >
            <LayoutGrid className="w-4 h-4" />
            Templates
          </button>
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${tab}...`}
            className="w-full pl-9 pr-3 py-2 border-2 border-black rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        {status && (
          <button
            onClick={() => setStatus(null)}
            className="brutal-btn px-3 py-2 text-xs font-bold bg-white"
          >
            Clear: {status} ✕
          </button>
        )}
      </div>

      {/* Content */}
      {tab === 'sessions' ? (
        <SessionList rows={filteredSessions} loading={sessionsLoading} />
      ) : (
        <TemplateList rows={filteredTemplates} loading={templatesLoading} />
      )}

      {/* Pagination */}
      {tab === 'sessions' && sessionsRes && sessionsRes.total > pageSize && (
        <div className="flex justify-center pt-2">
          <Pagination
            current={sessionPage}
            total={sessionsRes.total}
            pageSize={pageSize}
            onChange={(p) => setSessionPage(p)}
            showSizeChanger={false}
            showTotal={(total) => `${total} sessions`}
          />
        </div>
      )}
      {tab === 'templates' && templatesRes && templatesRes.total > pageSize && (
        <div className="flex justify-center pt-2">
          <Pagination
            current={templatePage}
            total={templatesRes.total}
            pageSize={pageSize}
            onChange={(p) => setTemplatePage(p)}
            showSizeChanger={false}
            showTotal={(total) => `${total} templates`}
          />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function SessionList({
  rows,
  loading,
}: {
  rows: AdminSessionRow[] | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="brutal-card py-16 text-center">
        <Activity className="w-10 h-10 mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 text-sm font-bold">No sessions match this filter.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {rows.map((row) => (
        <Link key={row.id} href={`/admin-live-exams/${row.id}`}>
          <div className="brutal-card p-5 h-full hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all bg-white">
            <div className="flex items-center justify-between mb-3">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-bold border rounded-full',
                  STATUS_BADGE[row.status],
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT[row.status])} />
                {row.status}
              </span>
              {row.joinCode && (
                <span className="flex items-center gap-1 font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-300">
                  <Hash className="w-3 h-3" />
                  {row.joinCode}
                </span>
              )}
            </div>

            <h3 className="text-base font-black line-clamp-2 mb-1">{row.title}</h3>
            <p className="text-xs text-gray-500 mb-4 line-clamp-1">
              Host: {row.createdBy.displayName ?? row.createdBy.email}
              {row.template && <> · {row.template.title}</>}
            </p>

            <div className="flex items-center gap-4 pt-3 border-t-2 border-gray-200">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600">
                <Radio className="w-3.5 h-3.5 text-indigo-500" />
                {row._count.questions}Q
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600">
                <Users className="w-3.5 h-3.5 text-indigo-500" />
                {row._count.participants}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                {row.startedAt
                  ? new Date(row.startedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function TemplateList({
  rows,
  loading,
}: {
  rows: AdminTemplateRow[] | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="brutal-card py-16 text-center">
        <LayoutGrid className="w-10 h-10 mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 text-sm font-bold">No templates yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {rows.map((t) => {
        const published = t.status === 'PUBLISHED';
        return (
          <div
            key={t.id}
            className="brutal-card p-5 hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all bg-white"
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-bold border rounded-full',
                  published
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-400'
                    : 'bg-gray-100 text-gray-700 border-gray-400',
                )}
              >
                {published ? (
                  <Eye className="w-3 h-3" />
                ) : (
                  <EyeOff className="w-3 h-3" />
                )}
                {t.status}
              </span>
              <Zap className="w-4 h-4 text-gray-300" />
            </div>

            <h3 className="text-base font-black line-clamp-2 mb-1">{t.title}</h3>
            <p className="text-xs text-gray-500 mb-4 line-clamp-1">
              Author: {t.createdBy.displayName ?? t.createdBy.email}
            </p>

            <div className="flex items-center gap-4 pt-3 border-t-2 border-gray-200">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600">
                <FileText className="w-3.5 h-3.5 text-indigo-500" />
                {t._count.questions}Q
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600">
                <Users className="w-3.5 h-3.5 text-indigo-500" />
                {t._count.sessions} sessions
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
