'use client';

import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Modal } from 'antd';
import { useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Edit,
  Play,
  Rocket,
  Trash2,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  LiveExamQuestionType,
  LiveExamSessionStatus,
  LiveExamTemplateStatus,
} from '@/lib/live-exam-types';

type TemplateDetail = {
  id: string;
  title: string;
  description: string | null;
  durationSec: number;
  perQuestionSec: number;
  interstitialSec: number;
  status: LiveExamTemplateStatus;
  createdAt: string;
  questions: Array<{
    id: string;
    orderIndex: number;
    type: LiveExamQuestionType;
    prompt: string;
  }>;
  _count: { sessions: number };
};

type SessionRow = {
  id: string;
  title: string;
  status: LiveExamSessionStatus;
  joinCode: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  _count: { participants: number };
};

/**
 * Template detail page. This is the hub for a PUBLISHED template:
 *   - metadata + question preview
 *   - "Start new session" button (spawns a session and navigates to
 *      the host console)
 *   - past sessions list
 *   - archive / delete actions
 *
 * For DRAFT templates this page redirects the user to /edit instead.
 */
export default function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading } = useQuery<TemplateDetail>({
    queryKey: ['live-exam-template', id],
    queryFn: async () => (await api.get(`/live-exams/templates/${id}`)).data,
  });

  const { data: sessions } = useQuery<SessionRow[]>({
    queryKey: ['live-exam-template', id, 'sessions'],
    queryFn: async () =>
      (await api.get(`/live-exams/templates/${id}/sessions`)).data,
  });

  const publish = useMutation({
    mutationFn: async () => {
      await api.post(`/live-exams/templates/${id}/publish`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-exam-template', id] });
      message.success('Published');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Publish failed';
      message.error(msg);
    },
  });

  const spawnSession = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/live-exams/sessions', {
        templateId: id,
      });
      return data as { id: string };
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['live-exam-templates'] });
      router.push(`/live/sessions/${session.id}/host`);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Could not start session';
      message.error(msg);
    },
  });

  const archive = useMutation({
    mutationFn: async () => {
      await api.post(`/live-exams/templates/${id}/archive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-exam-template', id] });
      message.success('Archived');
    },
  });

  const del = useMutation({
    mutationFn: async () => {
      await api.delete(`/live-exams/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-exam-templates'] });
      message.success('Deleted');
      router.push('/live');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Delete failed';
      message.error(msg);
    },
  });

  if (isLoading) return <p>Loading…</p>;
  if (!data) return <p>Template not found.</p>;

  const isDraft = data.status === 'DRAFT';
  const isPublished = data.status === 'PUBLISHED';
  const isArchived = data.status === 'ARCHIVED';

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href="/live"
        className="text-sm text-neutral-600 mb-3 inline-flex items-center gap-1"
      >
        <ArrowLeft className="w-4 h-4" /> Back to templates
      </Link>

      <div className="brutal-card p-6 mb-5">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div>
            <div className="text-xs font-bold uppercase text-neutral-500">
              {data.status}
            </div>
            <h1 className="text-3xl font-extrabold">{data.title}</h1>
            {data.description && (
              <p className="text-neutral-600 mt-1">{data.description}</p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {isDraft && (
              <>
                <Link
                  href={`/live/templates/${id}/edit`}
                  className="brutal-btn px-3 py-2 bg-white flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" /> Edit
                </Link>
                <button
                  type="button"
                  onClick={() => publish.mutate()}
                  disabled={publish.isPending}
                  className="brutal-btn-fill px-3 py-2 flex items-center gap-2 disabled:opacity-50"
                >
                  <Rocket className="w-4 h-4" /> Publish
                </button>
              </>
            )}
            {isPublished && (
              <>
                <button
                  type="button"
                  onClick={() => spawnSession.mutate()}
                  disabled={spawnSession.isPending}
                  className="brutal-btn-fill px-4 py-2 flex items-center gap-2 disabled:opacity-50"
                  data-testid="start-session-btn"
                >
                  <Play className="w-4 h-4" />
                  {spawnSession.isPending ? 'Starting…' : 'Start new session'}
                </button>
                <Link
                  href={`/live/templates/${id}/edit`}
                  className="brutal-btn px-3 py-2 bg-white flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" /> Edit
                </Link>
                <button
                  type="button"
                  onClick={() => archive.mutate()}
                  className="brutal-btn px-3 py-2 bg-white flex items-center gap-2"
                >
                  <Archive className="w-4 h-4" /> Archive
                </button>
              </>
            )}
            {!isArchived && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="brutal-btn px-3 py-2 bg-red-100 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="Questions" value={data.questions.length} />
          <Stat label="Duration" value={`${data.durationSec}s`} />
          <Stat label="Per question" value={`${data.perQuestionSec}s`} />
        </div>
      </div>

      {/* Question preview */}
      <div className="brutal-card p-5 mb-5">
        <h2 className="font-bold text-lg mb-3">Questions</h2>
        <ol className="space-y-2">
          {data.questions.map((q, i) => (
            <li
              key={q.id}
              className="border-l-4 border-black pl-3 py-1 text-sm"
            >
              <div className="text-[10px] uppercase text-neutral-500 tracking-wide">
                {q.type.replace('_', ' ').toLowerCase()}
              </div>
              <div className="font-bold flex gap-1">
                <span>{i + 1}.</span>
                {q.prompt ? (
                  <span
                    className="prose prose-sm max-w-none break-words"
                    dangerouslySetInnerHTML={{ __html: q.prompt }}
                  />
                ) : (
                  <em className="text-neutral-400">empty</em>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Sessions */}
      <div className="brutal-card p-5">
        <h2 className="font-bold text-lg mb-3">Sessions from this template</h2>
        {(!sessions || sessions.length === 0) && (
          <p className="text-sm text-neutral-500">
            No sessions yet. Click &ldquo;Start new session&rdquo; above to
            spawn one.
          </p>
        )}
        <ul className="space-y-2">
          {sessions?.map((s) => (
            <li key={s.id}>
              <Link
                href={
                  s.status === 'ENDED'
                    ? `/live/sessions/${s.id}/result?mode=host`
                    : `/live/sessions/${s.id}/host`
                }
                className="flex items-center justify-between brutal-card p-3 hover:bg-yellow-50"
              >
                <div>
                  <div className="font-bold text-sm">
                    {new Date(s.createdAt).toLocaleString()}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {s.status}
                    {s.joinCode && (
                      <>
                        {' · '}Code:{' '}
                        <span className="font-mono">{s.joinCode}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-sm text-neutral-600">
                  <Users className="w-4 h-4" /> {s._count.participants}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <Modal
        title="Delete template?"
        open={confirmDelete}
        okText="Delete"
        okButtonProps={{ danger: true }}
        onOk={() => {
          setConfirmDelete(false);
          del.mutate();
        }}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>
          This action cannot be undone. If any sessions have already been
          spawned from this template, it will be archived instead of fully
          deleted.
        </p>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="brutal-card p-3 text-center">
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div className="text-xl font-extrabold">{value}</div>
    </div>
  );
}
