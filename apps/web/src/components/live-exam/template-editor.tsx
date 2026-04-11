'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App, Select } from 'antd';
import { Plus, Trash2, Save, Rocket, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '@/lib/api';
import {
  LiveExamQuestionType,
  QuestionDraft,
  TemplateDraft,
  emptyMcqQuestion,
  emptyQuestionOfType,
  validateQuestionDraft,
} from '@/lib/live-exam-types';
import { QuestionFields } from './question-fields';
import TiptapMiniEditor from '@/components/admin/tiptap-mini-editor';
import { FileUpload } from '@/components/admin/file-upload';
import type { QuestionMedia } from '@/lib/live-exam-types';

/**
 * TemplateEditor: the host-facing editor for a live exam template.
 * Handles:
 *  - template metadata (title/description/timing)
 *  - question list with add / delete / reorder
 *  - per-type question editor (dispatched by QuestionFields)
 *  - save draft (POST/PATCH), publish (template → PUBLISHED)
 *
 * This replaces the old MCQ-only exam-editor. Save semantics: saving
 * re-creates every question (deletes existing then re-posts) to keep
 * orderIndex normalization simple. This is safe because sessions
 * snapshot their own copy of the questions at spawn time, so even
 * editing a PUBLISHED template never touches in-flight or past sessions.
 */
export function TemplateEditor({ initial }: { initial?: TemplateDraft }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const [draft, setDraft] = useState<TemplateDraft>(
    initial ?? {
      title: '',
      description: '',
      durationSec: 600,
      perQuestionSec: 20,
      interstitialSec: 5,
      questions: [emptyMcqQuestion()],
    },
  );
  const [selectedIdx, setSelectedIdx] = useState(0);
  const currentQ = draft.questions[selectedIdx];

  const saveDraft = useMutation({
    mutationFn: async () => {
      let templateId = draft.id;

      if (!templateId) {
        const { data } = await api.post('/live-exams/templates', {
          title: draft.title,
          description: draft.description || undefined,
          durationSec: draft.durationSec,
          perQuestionSec: draft.perQuestionSec,
          interstitialSec: draft.interstitialSec,
        });
        templateId = data.id;
      } else {
        await api.patch(`/live-exams/templates/${templateId}`, {
          title: draft.title,
          description: draft.description || undefined,
          durationSec: draft.durationSec,
          perQuestionSec: draft.perQuestionSec,
          interstitialSec: draft.interstitialSec,
        });
        // Clear existing questions then re-add. See file-level note.
        const existing = await api.get(`/live-exams/templates/${templateId}`);
        for (const q of existing.data.questions ?? []) {
          await api.delete(
            `/live-exams/templates/${templateId}/questions/${q.id}`,
          );
        }
      }

      for (let i = 0; i < draft.questions.length; i++) {
        const q = draft.questions[i];
        await api.post(`/live-exams/templates/${templateId}/questions`, {
          orderIndex: i,
          type: q.type,
          prompt: q.prompt,
          payload: q.payload,
          explanation: q.explanation || undefined,
          points: q.points,
        });
      }

      return templateId!;
    },
    onSuccess: (templateId) => {
      queryClient.invalidateQueries({ queryKey: ['live-exam-templates', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['live-exam-template', templateId] });
      message.success(isPublished ? 'Changes saved' : 'Draft saved');
      if (!draft.id) router.push(`/live/templates/${templateId}/edit`);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Save failed';
      message.error(msg);
    },
  });

  const publish = useMutation({
    mutationFn: async () => {
      const templateId = await saveDraft.mutateAsync();
      await api.post(`/live-exams/templates/${templateId}/publish`);
      return templateId;
    },
    onSuccess: (templateId) => {
      queryClient.invalidateQueries({ queryKey: ['live-exam-templates'] });
      router.push(`/live/templates/${templateId}`);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Publish failed';
      message.error(msg);
    },
  });

  function updateQuestion(patch: Partial<QuestionDraft>) {
    setDraft((d) => ({
      ...d,
      // The type narrowing gets awkward with discriminated unions + Partial,
      // so we cast inside the map. Each call site passes patches that match
      // the current question's type.
      questions: d.questions.map((q, i) =>
        i === selectedIdx ? ({ ...q, ...patch } as QuestionDraft) : q,
      ),
    }));
  }

  function addQuestion(type: LiveExamQuestionType) {
    const next = emptyQuestionOfType(type);
    setDraft((d) => ({ ...d, questions: [...d.questions, next] }));
    setSelectedIdx(draft.questions.length);
  }

  function removeQuestion(idx: number) {
    if (draft.questions.length <= 1) return;
    setDraft((d) => ({
      ...d,
      questions: d.questions.filter((_, i) => i !== idx),
    }));
    setSelectedIdx(Math.max(0, Math.min(selectedIdx, draft.questions.length - 2)));
  }

  function moveQuestion(idx: number, delta: number) {
    const j = idx + delta;
    if (j < 0 || j >= draft.questions.length) return;
    setDraft((d) => {
      const next = [...d.questions];
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...d, questions: next };
    });
    if (selectedIdx === idx) setSelectedIdx(j);
    else if (selectedIdx === j) setSelectedIdx(idx);
  }

  function changeQuestionType(type: LiveExamQuestionType) {
    if (currentQ.type === type) return;
    // Replace with a fresh empty question of the new type, keeping the prompt.
    const replacement = emptyQuestionOfType(type);
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, i) =>
        i === selectedIdx
          ? ({ ...replacement, prompt: q.prompt } as QuestionDraft)
          : q,
      ),
    }));
  }

  const validationErrors = draft.questions.map(validateQuestionDraft);
  const firstErrorIdx = validationErrors.findIndex((e) => e !== null);
  const canSave = draft.title.trim().length > 0 && firstErrorIdx === -1;
  const canPublish = canSave && draft.questions.length > 0;
  const isPublished = draft.status === 'PUBLISHED';

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">
            {draft.id ? 'Edit template' : 'New template'}
          </h1>
          <p className="text-neutral-600 text-sm mt-1">
            {isPublished
              ? 'This template is published. Edits apply to future sessions only — past and in-flight sessions keep their own snapshot.'
              : 'Design a reusable quiz template. Once published you can spawn multiple live sessions from it.'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            className={
              isPublished
                ? 'brutal-btn-fill px-4 py-2 flex items-center gap-2 disabled:opacity-50'
                : 'brutal-btn px-4 py-2 bg-white flex items-center gap-2 disabled:opacity-50'
            }
            disabled={!canSave || saveDraft.isPending}
            onClick={() => saveDraft.mutate()}
          >
            <Save className="w-4 h-4" />
            {isPublished ? 'Save changes' : 'Save draft'}
          </button>
          {!isPublished && (
            <button
              type="button"
              className="brutal-btn-fill px-4 py-2 flex items-center gap-2 disabled:opacity-50"
              disabled={!canPublish || publish.isPending}
              onClick={() => publish.mutate()}
              data-testid="publish-btn"
            >
              <Rocket className="w-4 h-4" />
              {publish.isPending ? 'Publishing…' : 'Publish template'}
            </button>
          )}
        </div>
      </div>

      {firstErrorIdx !== -1 && (
        <div className="brutal-card p-3 mb-4 bg-red-100 text-sm">
          Question {firstErrorIdx + 1}: {validationErrors[firstErrorIdx]}
        </div>
      )}

      <div className="grid lg:grid-cols-[300px_1fr] gap-6">
        {/* ── Left: meta + question list ── */}
        <div className="space-y-4">
          <div className="brutal-card p-4 space-y-3">
            <div>
              <label className="text-xs font-bold uppercase">Title</label>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="My quiz"
                className="w-full border-2 border-black rounded px-2 py-1 mt-1"
                data-testid="template-title"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase">Description</label>
              <textarea
                value={draft.description ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                rows={2}
                className="w-full border-2 border-black rounded px-2 py-1 mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <LabeledNumber
                label="Duration (s)"
                value={draft.durationSec}
                min={30}
                onChange={(v) => setDraft({ ...draft, durationSec: v })}
              />
              <LabeledNumber
                label="Per Q (s)"
                value={draft.perQuestionSec}
                min={5}
                onChange={(v) => setDraft({ ...draft, perQuestionSec: v })}
              />
            </div>
            <LabeledNumber
              label="Interstitial (s)"
              value={draft.interstitialSec}
              min={3}
              onChange={(v) => setDraft({ ...draft, interstitialSec: v })}
            />
          </div>

          <div className="brutal-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm uppercase">
                Questions ({draft.questions.length})
              </span>
              <Select
                size="small"
                value="add"
                onChange={(v) => addQuestion(v as LiveExamQuestionType)}
                options={[
                  { value: 'add', label: '+ Add', disabled: true },
                  { value: 'MULTIPLE_CHOICE', label: 'Multiple choice' },
                  { value: 'SHORT_ANSWER', label: 'Short answer' },
                  { value: 'SENTENCE_REORDER', label: 'Sentence reorder' },
                ]}
                style={{ width: 140 }}
              />
            </div>
            <ul className="space-y-1">
              {draft.questions.map((q, i) => {
                const err = validationErrors[i];
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => setSelectedIdx(i)}
                      className={`w-full text-left px-2 py-2 rounded border-2 ${
                        i === selectedIdx
                          ? 'border-black bg-yellow-100 font-bold'
                          : err
                            ? 'border-red-300 hover:border-red-500'
                            : 'border-transparent hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] uppercase text-neutral-500 tracking-wide">
                            {q.type.replace('_', ' ').toLowerCase()}
                          </div>
                          <div className="truncate">
                            {i + 1}.{' '}
                            {htmlToPreview(q.prompt) || (
                              <em className="text-neutral-400">empty</em>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <IconBtn
                            title="Move up"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveQuestion(i, -1);
                            }}
                          >
                            <ArrowUp className="w-3 h-3" />
                          </IconBtn>
                          <IconBtn
                            title="Move down"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveQuestion(i, 1);
                            }}
                          >
                            <ArrowDown className="w-3 h-3" />
                          </IconBtn>
                          {draft.questions.length > 1 && (
                            <IconBtn
                              title="Delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeQuestion(i);
                              }}
                            >
                              <Trash2 className="w-3 h-3 text-red-500" />
                            </IconBtn>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* ── Right: current question editor ── */}
        <div className="brutal-card p-4 lg:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-bold text-lg">
              Question {selectedIdx + 1} of {draft.questions.length}
            </h2>
            <div className="flex items-center gap-3">
              <div className="text-xs">
                <span className="text-neutral-500 mr-1">Type:</span>
                <Select
                  size="small"
                  value={currentQ.type}
                  onChange={(v) => changeQuestionType(v as LiveExamQuestionType)}
                  options={[
                    { value: 'MULTIPLE_CHOICE', label: 'Multiple choice' },
                    { value: 'SHORT_ANSWER', label: 'Short answer' },
                    { value: 'SENTENCE_REORDER', label: 'Sentence reorder' },
                  ]}
                  style={{ width: 170 }}
                />
              </div>
              <div className="text-xs">
                <span className="text-neutral-500 mr-1">Points:</span>
                <input
                  type="number"
                  min={100}
                  max={5000}
                  step={100}
                  value={currentQ.points}
                  onChange={(e) =>
                    updateQuestion({
                      points: parseInt(e.target.value, 10) || 1000,
                    })
                  }
                  className="w-20 border-2 border-black rounded px-1"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase">Prompt</label>
            <div className="mt-1" data-testid={`q-${selectedIdx}-prompt`}>
              <TiptapMiniEditor
                content={currentQ.prompt}
                onChange={(html) => updateQuestion({ prompt: html })}
                placeholder="What is the capital of France?"
              />
            </div>
          </div>

          <MediaFields
            media={currentQ.payload.media}
            onChange={(media) => {
              const nextPayload = { ...currentQ.payload, media } as typeof currentQ.payload;
              setDraft((d) => ({
                ...d,
                questions: d.questions.map((x, i) =>
                  i === selectedIdx
                    ? ({ ...x, payload: nextPayload } as QuestionDraft)
                    : x,
                ),
              }));
            }}
          />

          <QuestionFields
            question={currentQ}
            onChange={(q) =>
              setDraft((d) => ({
                ...d,
                questions: d.questions.map((x, i) => (i === selectedIdx ? q : x)),
              }))
            }
            testIdx={selectedIdx}
          />

          <div>
            <label className="text-xs font-bold uppercase">
              Explanation (optional)
            </label>
            <div className="mt-1">
              <TiptapMiniEditor
                content={currentQ.explanation ?? ''}
                onChange={(html) => updateQuestion({ explanation: html })}
                placeholder="Shown after the question locks."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LabeledNumber({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-xs font-bold uppercase">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || min)}
        className="w-full border-2 border-black rounded px-2 py-1 mt-1"
      />
    </div>
  );
}

/** Strip HTML tags and collapse whitespace — for list/sidebar previews. */
function htmlToPreview(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function MediaFields({
  media,
  onChange,
}: {
  media: QuestionMedia | undefined;
  onChange: (next: QuestionMedia | undefined) => void;
}) {
  const set = (patch: Partial<QuestionMedia>) => {
    const merged: QuestionMedia = { ...(media ?? {}), ...patch };
    if (!merged.imageUrl) delete merged.imageUrl;
    if (!merged.audioUrl) delete merged.audioUrl;
    onChange(merged.imageUrl || merged.audioUrl ? merged : undefined);
  };
  return (
    <div>
      <label className="text-xs font-bold uppercase">Media (optional)</label>
      <div className="grid sm:grid-cols-2 gap-3 mt-1">
        <FileUpload
          label="Image"
          accept="image/*"
          maxSizeMB={5}
          value={media?.imageUrl ?? null}
          onChange={(url) => set({ imageUrl: url ?? undefined })}
        />
        <FileUpload
          label="Audio"
          accept="audio/*"
          maxSizeMB={10}
          value={media?.audioUrl ?? null}
          onChange={(url) => set({ audioUrl: url ?? undefined })}
        />
      </div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <span
      role="button"
      title={title}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick(e as unknown as React.MouseEvent);
      }}
      className="p-1 rounded hover:bg-neutral-200 cursor-pointer"
    >
      {children}
    </span>
  );
}
