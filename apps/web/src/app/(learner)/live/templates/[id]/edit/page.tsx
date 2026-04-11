'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { TemplateEditor } from '@/components/live-exam/template-editor';
import {
  LiveExamQuestionType,
  LiveExamTemplateStatus,
  QuestionDraft,
  TemplateDraft,
} from '@/lib/live-exam-types';

type TemplateDetail = {
  id: string;
  title: string;
  description: string | null;
  durationSec: number;
  perQuestionSec: number;
  interstitialSec: number;
  status: LiveExamTemplateStatus;
  questions: Array<{
    id: string;
    orderIndex: number;
    type: LiveExamQuestionType;
    prompt: string;
    payload: unknown;
    explanation: string | null;
    points: number;
  }>;
};

/**
 * Edit page. DRAFT and PUBLISHED templates are both editable; sessions
 * snapshot their own copy of the questions at spawn time so changes
 * here never affect past or in-flight sessions. ARCHIVED templates
 * are read-only and bounce back to the detail page.
 */
export default function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isLoading, error } = useQuery<TemplateDetail>({
    queryKey: ['live-exam-template', id],
    queryFn: async () => (await api.get(`/live-exams/templates/${id}`)).data,
    retry: false,
  });

  if (isLoading) return <p>Loading…</p>;
  if (error || !data) {
    return (
      <div className="brutal-card p-6 text-center">
        <p>Template not found.</p>
      </div>
    );
  }

  if (data.status === 'ARCHIVED') {
    return (
      <div className="brutal-card p-6">
        <p className="font-bold mb-2">
          This template is archived and cannot be edited.
        </p>
        <a
          href={`/live/templates/${data.id}`}
          className="brutal-btn-fill px-4 py-2 inline-block"
        >
          Open detail page
        </a>
      </div>
    );
  }

  const draft: TemplateDraft = {
    id: data.id,
    status: data.status,
    title: data.title,
    description: data.description ?? '',
    durationSec: data.durationSec,
    perQuestionSec: data.perQuestionSec,
    interstitialSec: data.interstitialSec,
    questions: data.questions.map(
      (q): QuestionDraft =>
        ({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          explanation: q.explanation ?? '',
          points: q.points,
          // Server already validates payload shape, so we trust the cast
          // here. If a future schema change desyncs, the editor's own
          // per-type fields will surface the mismatch to the author.
          payload: q.payload,
        }) as QuestionDraft,
    ),
  };

  return <TemplateEditor initial={draft} />;
}
