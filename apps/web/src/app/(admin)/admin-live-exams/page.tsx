'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import {
  Activity,
  FileText,
  Users,
  Radio,
  Search,
  Sparkles,
  Plus,
  LayoutGrid,
  Zap,
  Hash,
  Clock,
  Waves,
} from 'lucide-react';
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

const STATUS_META: Record<
  LiveExamSessionStatus,
  { label: string; glow: string; dot: string; accent: string }
> = {
  LOBBY: {
    label: 'In lobby',
    glow: 'from-sky-500/20 to-blue-500/5',
    dot: 'bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.9)]',
    accent: 'text-sky-300',
  },
  LIVE: {
    label: 'Live now',
    glow: 'from-emerald-500/25 to-green-500/5',
    dot: 'bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,1)]',
    accent: 'text-emerald-300',
  },
  ENDED: {
    label: 'Ended',
    glow: 'from-slate-500/15 to-slate-500/5',
    dot: 'bg-slate-400',
    accent: 'text-slate-300',
  },
  CANCELLED: {
    label: 'Cancelled',
    glow: 'from-rose-500/20 to-red-500/5',
    dot: 'bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.9)]',
    accent: 'text-rose-300',
  },
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 24, filter: 'blur(6px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { type: 'spring', stiffness: 140, damping: 18 },
  },
};

export default function AdminLiveExamsPage() {
  const [tab, setTab] = useState<'sessions' | 'templates'>('sessions');
  const [status, setStatus] = useState<LiveExamSessionStatus | null>(null);
  const [query, setQuery] = useState('');

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

  const filteredSessions = sessions?.filter((s) =>
    s.title.toLowerCase().includes(query.toLowerCase()),
  );
  const filteredTemplates = templates?.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="relative min-h-[calc(100vh-4rem)] -mx-4 -my-6 px-4 py-6 md:-mx-8 md:px-8 overflow-hidden">
      <MeshBackdrop />

      <motion.div
        className="relative max-w-7xl mx-auto"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <motion.header
          variants={itemVariants}
          className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8"
        >
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full backdrop-blur-md bg-white/5 border border-white/10 text-xs font-medium text-white/80">
              <Sparkles className="w-3.5 h-3.5 text-violet-300" />
              AI-powered live exam monitor
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-br from-white via-white to-violet-200 bg-clip-text text-transparent">
              Live Exams
            </h1>
            <p className="text-sm text-white/60 mt-2 max-w-xl">
              Real-time view of every template and session. Updates every five
              seconds.
            </p>
          </div>

          <PrimaryAction />
        </motion.header>

        {/* ── Stats strip ─────────────────────────────────────────── */}
        <motion.div
          variants={itemVariants}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6"
        >
          {SESSION_STATUSES.map((s) => {
            const active = status === s;
            const meta = STATUS_META[s];
            return (
              <motion.button
                key={s}
                type="button"
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                onClick={() => {
                  setTab('sessions');
                  setStatus(active ? null : s);
                }}
                className={`group relative overflow-hidden rounded-2xl border backdrop-blur-md px-4 py-4 text-left transition-all duration-300 ${
                  active
                    ? 'border-violet-400/60 bg-white/10 shadow-[0_0_0_1px_rgba(167,139,250,0.4),0_20px_60px_-15px_rgba(139,92,246,0.5)]'
                    : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07] hover:border-white/20'
                }`}
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${meta.glow} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                />
                <div className="relative flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-white/60">
                    {meta.label}
                  </span>
                </div>
                <div className="relative text-3xl font-black text-white tabular-nums">
                  {stats?.sessions?.[s] ?? 0}
                </div>
              </motion.button>
            );
          })}
        </motion.div>

        {/* ── Floating filter bar ─────────────────────────────────── */}
        <motion.div
          variants={itemVariants}
          className="sticky top-4 z-20 mb-6 rounded-2xl border border-white/10 bg-slate-950/50 backdrop-blur-xl px-3 py-2 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.8)]"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/5">
              <TabButton
                active={tab === 'sessions'}
                onClick={() => setTab('sessions')}
                icon={<Activity className="w-4 h-4" />}
                label="Sessions"
              />
              <TabButton
                active={tab === 'templates'}
                onClick={() => setTab('templates')}
                icon={<LayoutGrid className="w-4 h-4" />}
                label="Templates"
              />
            </div>

            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${tab}…`}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-violet-400/50 focus:bg-white/[0.07] transition-all duration-300"
              />
            </div>

            {status && (
              <button
                onClick={() => setStatus(null)}
                className="px-3 py-2 rounded-xl bg-violet-500/20 border border-violet-400/30 text-xs font-semibold text-violet-200 hover:bg-violet-500/30 transition-all duration-300"
              >
                Clear: {status}
              </button>
            )}
          </div>
        </motion.div>

        {/* ── Content ─────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {tab === 'sessions' ? (
              <SessionList
                rows={filteredSessions}
                loading={sessionsLoading}
              />
            ) : (
              <TemplateList
                rows={filteredTemplates}
                loading={templatesLoading}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <LottiePlaceholder />
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/*  Components                                                         */
/* ─────────────────────────────────────────────────────────────────── */

function PrimaryAction() {
  return (
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
    >
      <Link
        href="/live/templates"
        className="group relative inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-white overflow-hidden
                   bg-gradient-to-r from-blue-600 via-violet-600 to-fuchsia-600
                   shadow-[0_10px_40px_-10px_rgba(139,92,246,0.7)]
                   border border-white/10 transition-all duration-300"
      >
        <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
        <Plus className="w-4 h-4 relative" />
        <span className="relative">New Template</span>
      </Link>
    </motion.div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-300 ${
        active ? 'text-white' : 'text-white/50 hover:text-white/80'
      }`}
    >
      {active && (
        <motion.span
          layoutId="tab-pill"
          className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/30 to-violet-500/30 border border-violet-400/40"
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
      )}
      <span className="relative flex items-center gap-2">
        {icon}
        {label}
      </span>
    </button>
  );
}

function SessionList({
  rows,
  loading,
}: {
  rows: AdminSessionRow[] | undefined;
  loading: boolean;
}) {
  if (loading) return <SkeletonGrid />;
  if (!rows || rows.length === 0) return <EmptyState label="No sessions match this filter." />;

  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {rows.map((row) => {
        const meta = STATUS_META[row.status];
        return (
          <motion.div key={row.id} variants={itemVariants}>
            <Link href={`/admin-live-exams/${row.id}`}>
              <motion.div
                whileHover={{ y: -5 }}
                transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                className="group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md p-5 transition-all duration-300
                           hover:border-violet-400/50 hover:bg-white/[0.06]
                           hover:shadow-[0_25px_80px_-20px_rgba(139,92,246,0.5)]"
              >
                <div
                  className={`absolute -top-24 -right-24 w-48 h-48 rounded-full bg-gradient-to-br ${meta.glow} blur-3xl opacity-60 group-hover:opacity-100 transition-opacity duration-500`}
                />

                <div className="relative flex items-center justify-between mb-4">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.accent}`}>
                      {row.status}
                    </span>
                  </div>
                  {row.joinCode && (
                    <div className="flex items-center gap-1 font-mono text-xs text-white/50">
                      <Hash className="w-3 h-3" />
                      {row.joinCode}
                    </div>
                  )}
                </div>

                <h3 className="relative text-lg font-bold text-white line-clamp-2 mb-1">
                  {row.title}
                </h3>
                <p className="relative text-xs text-white/50 mb-4 line-clamp-1">
                  Host: {row.createdBy.displayName ?? row.createdBy.email}
                  {row.template && <> · {row.template.title}</>}
                </p>

                <div className="relative flex items-center gap-4 pt-3 border-t border-white/10">
                  <Stat icon={<Radio className="w-3.5 h-3.5" />} value={`${row._count.questions}Q`} />
                  <Stat icon={<Users className="w-3.5 h-3.5" />} value={row._count.participants} />
                  <Stat
                    icon={<Clock className="w-3.5 h-3.5" />}
                    value={row.startedAt ? new Date(row.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                  />
                </div>
              </motion.div>
            </Link>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function TemplateList({
  rows,
  loading,
}: {
  rows: AdminTemplateRow[] | undefined;
  loading: boolean;
}) {
  if (loading) return <SkeletonGrid />;
  if (!rows || rows.length === 0) return <EmptyState label="No templates yet." />;

  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {rows.map((t) => {
        const published = t.status === 'PUBLISHED';
        return (
          <motion.div
            key={t.id}
            variants={itemVariants}
            whileHover={{ y: -5 }}
            transition={{ type: 'spring', stiffness: 280, damping: 20 }}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md p-5 transition-all duration-300
                       hover:border-violet-400/50 hover:bg-white/[0.06]
                       hover:shadow-[0_25px_80px_-20px_rgba(139,92,246,0.5)]"
          >
            <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/5 blur-3xl opacity-60 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative flex items-center justify-between mb-4">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                {published && (
                  <span className="relative flex w-1.5 h-1.5">
                    <span className="animate-ping absolute inset-0 rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative rounded-full w-1.5 h-1.5 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" />
                  </span>
                )}
                {!published && <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />}
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    published ? 'text-emerald-300' : 'text-slate-300'
                  }`}
                >
                  {t.status}
                </span>
              </div>
              <Zap className="w-4 h-4 text-white/20 group-hover:text-violet-300 transition-colors duration-300" />
            </div>

            <h3 className="relative text-lg font-bold text-white line-clamp-2 mb-1">
              {t.title}
            </h3>
            <p className="relative text-xs text-white/50 mb-4 line-clamp-1">
              Author: {t.createdBy.displayName ?? t.createdBy.email}
            </p>

            <div className="relative flex items-center gap-4 pt-3 border-t border-white/10">
              <Stat icon={<FileText className="w-3.5 h-3.5" />} value={`${t._count.questions}Q`} />
              <Stat icon={<Users className="w-3.5 h-3.5" />} value={`${t._count.sessions} sessions`} />
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function Stat({ icon, value }: { icon: React.ReactNode; value: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white/70">
      <span className="text-violet-300/80">{icon}</span>
      {value}
    </span>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-40 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md animate-pulse"
        />
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] backdrop-blur-md py-16 text-center">
      <Waves className="w-10 h-10 mx-auto text-violet-300/60 mb-3" />
      <p className="text-white/60 text-sm">{label}</p>
    </div>
  );
}

function LottiePlaceholder() {
  return (
    <motion.div
      variants={itemVariants}
      className="mt-10 rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/10 via-indigo-500/5 to-transparent backdrop-blur-md p-6 flex items-center gap-4 overflow-hidden relative"
    >
      <div
        id="lottie-ai-scanning"
        className="relative w-20 h-20 shrink-0 rounded-xl bg-gradient-to-br from-violet-500/30 to-indigo-500/20 border border-white/10 flex items-center justify-center"
        aria-label="AI scanning animation placeholder"
      >
        <motion.div
          className="absolute inset-2 rounded-lg border-2 border-violet-300/60"
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <Sparkles className="w-6 h-6 text-violet-200 relative" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-white">AI is listening</p>
        <p className="text-xs text-white/50">
          Drop a Lottie JSON at <code className="text-violet-300">#lottie-ai-scanning</code> for the live-wave scanning effect.
        </p>
      </div>
    </motion.div>
  );
}

/* ─── Moving mesh gradient backdrop ─────────────────────────────── */
function MeshBackdrop() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-slate-950">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage:
            'radial-gradient(ellipse 80% 60% at 50% 40%, black 40%, transparent 100%)',
        }}
      />
      <motion.div
        className="absolute -top-40 -left-20 w-[520px] h-[520px] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.45), transparent 60%)' }}
        animate={{ x: [0, 80, 0], y: [0, 40, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-20 right-0 w-[480px] h-[480px] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.4), transparent 60%)' }}
        animate={{ x: [0, -60, 0], y: [0, 60, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-0 left-1/3 w-[560px] h-[560px] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.3), transparent 60%)' }}
        animate={{ x: [0, 50, 0], y: [0, -50, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}
