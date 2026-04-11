'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Plus,
  Radio,
  Clock,
  History,
  Users,
  FileText,
  Sparkles,
  Search,
  Zap,
  Waves,
} from 'lucide-react';
import { api } from '@/lib/api';
import { LiveExamTemplateStatus } from '@/lib/live-exam-types';

type MyTemplate = {
  id: string;
  title: string;
  status: LiveExamTemplateStatus;
  updatedAt: string;
  _count: { questions: number; sessions: number };
};

export default function LiveExamHomePage() {
  const [query, setQuery] = useState('');
  const { data, isLoading } = useQuery<MyTemplate[]>({
    queryKey: ['live-exam-templates', 'mine'],
    queryFn: async () => (await api.get('/live-exams/templates/mine')).data,
  });

  const filtered = data?.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="max-w-7xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-white border-[2.5px] border-slate-800 text-xs font-bold text-slate-800 shadow-[3px_3px_0px_#1E293B]">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            Real-time classroom
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-800">
            Live Exams
          </h1>
          <p className="text-sm text-slate-600 mt-2 max-w-xl">
            Author a template once, host it live any number of times.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <GhostLink href="/live/join" icon={<Radio className="w-4 h-4" />}>
            Join a room
          </GhostLink>
          <GhostLink
            href="/live/history"
            icon={<History className="w-4 h-4" />}
          >
            History
          </GhostLink>
          <PrimaryAction />
        </div>
      </header>

      {/* ── Search bar ─────────────────────────────────────────── */}
      <div className="mb-6 rounded-2xl border-[2.5px] border-slate-800 bg-white shadow-[4px_4px_0px_#1E293B] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your templates…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border-2 border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition-all"
            />
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 border-2 border-emerald-200 text-xs font-bold text-emerald-700">
            <FileText className="w-3.5 h-3.5" />
            {data?.length ?? 0} template{data?.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      {isLoading && <SkeletonGrid />}

      {!isLoading && (!data || data.length === 0) && <EmptyState />}

      {!isLoading && filtered && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      )}

      {!isLoading && data && data.length > 0 && filtered?.length === 0 && (
        <div className="rounded-2xl border-[2.5px] border-dashed border-slate-400 bg-white py-12 text-center">
          <Waves className="w-10 h-10 mx-auto text-emerald-500 mb-3" />
          <p className="text-slate-600 text-sm">
            No templates match &quot;{query}&quot;.
          </p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/*  Cards                                                              */
/* ─────────────────────────────────────────────────────────────────── */

function TemplateCard({ template }: { template: MyTemplate }) {
  const published = template.status === 'PUBLISHED';
  const archived = template.status === 'ARCHIVED';

  const href =
    template.status === 'DRAFT'
      ? `/live/templates/${template.id}/edit`
      : `/live/templates/${template.id}`;

  const badge = published
    ? {
        dot: 'bg-emerald-500',
        bg: 'bg-emerald-50',
        border: 'border-emerald-300',
        text: 'text-emerald-700',
      }
    : archived
      ? {
          dot: 'bg-slate-400',
          bg: 'bg-slate-100',
          border: 'border-slate-300',
          text: 'text-slate-600',
        }
      : {
          dot: 'bg-sky-500',
          bg: 'bg-sky-50',
          border: 'border-sky-300',
          text: 'text-sky-700',
        };

  return (
    <Link href={href} className="group block">
      <div className="h-full rounded-2xl border-[2.5px] border-slate-800 bg-white shadow-[4px_4px_0px_#1E293B] p-5 transition-all duration-150 group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:shadow-[6px_6px_0px_#1E293B]">
        <div className="flex items-center justify-between mb-4">
          <div
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border-2 ${badge.bg} ${badge.border}`}
          >
            {published ? (
              <span className="relative flex w-2 h-2">
                <span className="animate-ping absolute inset-0 rounded-full bg-emerald-400 opacity-75" />
                <span className={`relative rounded-full w-2 h-2 ${badge.dot}`} />
              </span>
            ) : (
              <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
            )}
            <span
              className={`text-[10px] font-black uppercase tracking-wider ${badge.text}`}
            >
              {template.status}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg border-2 border-slate-800 bg-amber-100 flex items-center justify-center shadow-[2px_2px_0px_#1E293B] transition-colors group-hover:bg-amber-200">
            <Zap className="w-4 h-4 text-slate-800" />
          </div>
        </div>

        <h3 className="text-lg font-black text-slate-800 line-clamp-2 mb-1">
          {template.title}
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Updated {new Date(template.updatedAt).toLocaleDateString()}
        </p>

        <div className="flex items-center gap-4 pt-3 border-t-2 border-dashed border-slate-200">
          <Stat
            icon={<FileText className="w-3.5 h-3.5" />}
            value={`${template._count.questions}Q`}
          />
          <Stat
            icon={<Users className="w-3.5 h-3.5" />}
            value={`${template._count.sessions} session${template._count.sessions === 1 ? '' : 's'}`}
          />
          <Stat
            icon={<Clock className="w-3.5 h-3.5" />}
            value={new Date(template.updatedAt).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            })}
          />
        </div>
      </div>
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/*  Shared bits                                                        */
/* ─────────────────────────────────────────────────────────────────── */

function Stat({
  icon,
  value,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
      <span className="text-emerald-600">{icon}</span>
      {value}
    </span>
  );
}

function GhostLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border-[2.5px] border-slate-800 bg-white text-sm font-bold text-slate-800 shadow-[3px_3px_0px_#1E293B] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_#1E293B] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_#1E293B] transition-all"
    >
      {icon}
      {children}
    </Link>
  );
}

function PrimaryAction() {
  return (
    <Link
      href="/live/templates/new"
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border-[2.5px] border-slate-800 bg-emerald-500 text-sm font-black text-white shadow-[3px_3px_0px_#1E293B] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_#1E293B] hover:bg-emerald-600 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_#1E293B] transition-all"
    >
      <Plus className="w-4 h-4" />
      New template
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-44 rounded-2xl border-[2.5px] border-slate-800 bg-slate-100 shadow-[4px_4px_0px_#1E293B] animate-pulse"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border-[2.5px] border-slate-800 bg-white shadow-[6px_6px_0px_#1E293B] p-10 text-center">
      <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-emerald-100 border-[2.5px] border-slate-800 flex items-center justify-center shadow-[3px_3px_0px_#1E293B]">
        <Sparkles className="w-7 h-7 text-emerald-600" />
      </div>

      <h2 className="text-2xl font-black text-slate-800 mb-2">
        You haven&apos;t authored any templates yet
      </h2>
      <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
        Templates are reusable quizzes. Publish one and spawn multiple live
        sessions from it — perfect for teaching the same class to different
        groups.
      </p>
      <div className="inline-block">
        <PrimaryAction />
      </div>
    </div>
  );
}

