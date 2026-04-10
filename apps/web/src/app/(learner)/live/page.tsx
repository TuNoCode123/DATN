'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, Radio, Clock, History, Users, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { LiveExamTemplateStatus } from '@/lib/live-exam-types';

/**
 * Live exam home: shows the host's templates (the reusable definitions)
 * and a quick link to recent sessions. Session lifecycle / play / join
 * flows live under /live/sessions and /live/join.
 */

type MyTemplate = {
  id: string;
  title: string;
  status: LiveExamTemplateStatus;
  updatedAt: string;
  _count: { questions: number; sessions: number };
};

export default function LiveExamHomePage() {
  const { data, isLoading } = useQuery<MyTemplate[]>({
    queryKey: ['live-exam-templates', 'mine'],
    queryFn: async () => (await api.get('/live-exams/templates/mine')).data,
  });

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold">Live Exams</h1>
          <p className="text-sm md:text-base text-neutral-600 mt-1">
            Author a template once, host it live any number of times.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/live/join"
            className="brutal-btn px-4 py-2 bg-white flex items-center gap-2"
          >
            <Radio className="w-4 h-4" /> Join a room
          </Link>
          <Link
            href="/live/history"
            className="brutal-btn px-4 py-2 bg-white flex items-center gap-2"
          >
            <History className="w-4 h-4" /> History
          </Link>
          <Link
            href="/live/templates/new"
            className="brutal-btn-fill px-4 py-2 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New template
          </Link>
        </div>
      </div>

      {isLoading && <p className="text-neutral-500">Loading…</p>}

      {!isLoading && (!data || data.length === 0) && (
        <div className="brutal-card p-8 text-center">
          <h2 className="text-xl font-bold mb-2">
            You have not authored any templates yet
          </h2>
          <p className="text-neutral-600 mb-5">
            Templates are reusable quizzes. Once you publish one, you can
            spawn multiple live sessions from it — perfect for teaching the
            same class to different groups.
          </p>
          <Link
            href="/live/templates/new"
            className="brutal-btn-fill inline-block px-6 py-3"
          >
            Create your first template
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((t) => (
          <TemplateCard key={t.id} template={t} />
        ))}
      </div>
    </div>
  );
}

function TemplateCard({ template }: { template: MyTemplate }) {
  const statusColor: Record<LiveExamTemplateStatus, string> = {
    DRAFT: 'bg-neutral-200 text-neutral-700',
    PUBLISHED: 'bg-green-200 text-green-900',
    ARCHIVED: 'bg-neutral-300 text-neutral-600',
  };

  const href =
    template.status === 'DRAFT'
      ? `/live/templates/${template.id}/edit`
      : `/live/templates/${template.id}`;

  return (
    <Link href={href} className="brutal-card p-4 block hover:bg-yellow-50">
      <div className="flex items-center justify-between mb-2">
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusColor[template.status]}`}
        >
          {template.status}
        </span>
        <span className="text-xs text-neutral-500 flex items-center gap-1">
          <Users className="w-3 h-3" />
          {template._count.sessions} session
          {template._count.sessions === 1 ? '' : 's'}
        </span>
      </div>
      <h3 className="font-bold text-lg mb-3 line-clamp-2">{template.title}</h3>
      <div className="flex items-center gap-4 text-sm text-neutral-600">
        <span className="flex items-center gap-1">
          <FileText className="w-4 h-4" /> {template._count.questions} Q
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {new Date(template.updatedAt).toLocaleDateString()}
        </span>
      </div>
    </Link>
  );
}
