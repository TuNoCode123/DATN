'use client';

import { Plus, Trash2 } from 'lucide-react';
import {
  McqOption,
  QuestionDraft,
  ShortAnswerPayload,
} from '@/lib/live-exam-types';

/**
 * Dispatch component: renders the type-specific fields for a single
 * question in the template editor. Each branch is a purely controlled
 * component that takes the full QuestionDraft and emits a new draft on
 * every change (no internal state).
 */
export function QuestionFields({
  question,
  onChange,
  testIdx,
}: {
  question: QuestionDraft;
  onChange: (next: QuestionDraft) => void;
  testIdx: number;
}) {
  switch (question.type) {
    case 'MULTIPLE_CHOICE':
      return <McqFields q={question} onChange={onChange} testIdx={testIdx} />;
    case 'SHORT_ANSWER':
      return (
        <ShortAnswerFields q={question} onChange={onChange} testIdx={testIdx} />
      );
    case 'SENTENCE_REORDER':
      return (
        <SentenceReorderFields q={question} onChange={onChange} testIdx={testIdx} />
      );
  }
}

// ─── Multiple choice ───────────────────────────────────────────────

function McqFields({
  q,
  onChange,
  testIdx,
}: {
  q: Extract<QuestionDraft, { type: 'MULTIPLE_CHOICE' }>;
  onChange: (next: QuestionDraft) => void;
  testIdx: number;
}) {
  const setOption = (idx: number, patch: Partial<McqOption>) => {
    onChange({
      ...q,
      payload: {
        ...q.payload,
        options: q.payload.options.map((o, i) =>
          i === idx ? { ...o, ...patch } : o,
        ),
      },
    });
  };

  const addOption = () => {
    // Generate the next available letter id (A..Z) not already used.
    const used = new Set(q.payload.options.map((o) => o.id));
    let nextId = '';
    for (let i = 0; i < 26; i++) {
      const id = String.fromCharCode(65 + i);
      if (!used.has(id)) {
        nextId = id;
        break;
      }
    }
    if (!nextId) return;
    onChange({
      ...q,
      payload: {
        ...q.payload,
        options: [...q.payload.options, { id: nextId, text: '' }],
      },
    });
  };

  const removeOption = (idx: number) => {
    if (q.payload.options.length <= 2) return;
    const removed = q.payload.options[idx];
    const nextOptions = q.payload.options.filter((_, i) => i !== idx);
    const newCorrect =
      q.payload.correctOptionId === removed.id
        ? nextOptions[0].id
        : q.payload.correctOptionId;
    onChange({
      ...q,
      payload: {
        ...q.payload,
        options: nextOptions,
        correctOptionId: newCorrect,
      },
    });
  };

  const setCorrect = (id: string) => {
    onChange({ ...q, payload: { ...q.payload, correctOptionId: id } });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-bold uppercase">Options</label>
        <button
          type="button"
          onClick={addOption}
          disabled={q.payload.options.length >= 6}
          className="brutal-btn px-2 py-1 bg-white text-xs flex items-center gap-1 disabled:opacity-50"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {q.payload.options.map((o, idx) => (
          <label
            key={idx}
            className={`brutal-card p-3 flex items-start gap-2 cursor-pointer focus-within:-translate-x-0.5 focus-within:-translate-y-0.5 ${
              q.payload.correctOptionId === o.id ? 'bg-green-100' : 'bg-white'
            }`}
          >
            <input
              type="radio"
              name={`correct-${testIdx}`}
              checked={q.payload.correctOptionId === o.id}
              onChange={() => setCorrect(o.id)}
              className="mt-1"
              data-testid={`q-${testIdx}-correct-${o.id}`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold">Option {o.id}</div>
                {q.payload.options.length > 2 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      removeOption(idx);
                    }}
                    className="text-neutral-400 hover:text-red-500"
                    title="Remove option"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <input
                type="text"
                value={o.text}
                onChange={(e) => setOption(idx, { text: e.target.value })}
                placeholder="Option text"
                className="w-full bg-transparent px-1 mt-1 focus:outline-none placeholder:text-neutral-400"
                data-testid={`q-${testIdx}-option-${o.id}`}
              />
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Short answer ──────────────────────────────────────────────────

function ShortAnswerFields({
  q,
  onChange,
  testIdx,
}: {
  q: Extract<QuestionDraft, { type: 'SHORT_ANSWER' }>;
  onChange: (next: QuestionDraft) => void;
  testIdx: number;
}) {
  const setAccepted = (next: string[]) => {
    onChange({ ...q, payload: { ...q.payload, acceptedAnswers: next } });
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-bold uppercase">
            Accepted answers
          </label>
          <button
            type="button"
            onClick={() =>
              setAccepted([...q.payload.acceptedAnswers, ''])
            }
            disabled={q.payload.acceptedAnswers.length >= 20}
            className="brutal-btn px-2 py-1 bg-white text-xs flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-3 h-3" /> Add variant
          </button>
        </div>
        <p className="text-xs text-neutral-500 mb-2">
          A player&apos;s typed answer must match one of these (after
          trim/whitespace/case normalization). Add variants manually to
          cover common misspellings — there is no fuzzy matching.
        </p>
        <div className="space-y-2">
          {q.payload.acceptedAnswers.map((ans, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="text"
                value={ans}
                onChange={(e) => {
                  const next = [...q.payload.acceptedAnswers];
                  next[idx] = e.target.value;
                  setAccepted(next);
                }}
                placeholder={idx === 0 ? 'e.g. Paris' : 'variant'}
                className="flex-1 border-2 border-black rounded px-2 py-1"
                data-testid={`q-${testIdx}-accepted-${idx}`}
              />
              {q.payload.acceptedAnswers.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setAccepted(
                      q.payload.acceptedAnswers.filter((_, i) => i !== idx),
                    )
                  }
                  className="text-neutral-400 hover:text-red-500"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={q.payload.caseSensitive}
          onChange={(e) =>
            onChange({
              ...q,
              payload: { ...q.payload, caseSensitive: e.target.checked },
            })
          }
        />
        Case sensitive
      </label>
    </div>
  );
}

// ─── Sentence reorder ──────────────────────────────────────────────

function SentenceReorderFields({
  q,
  onChange,
  testIdx,
}: {
  q: Extract<QuestionDraft, { type: 'SENTENCE_REORDER' }>;
  onChange: (next: QuestionDraft) => void;
  testIdx: number;
}) {
  const setFragments = (next: string[]) => {
    // Keep correctOrder pointing at the same fragment indices after
    // add/remove/move. Since we store fragments in the CORRECT order
    // (the host types them that way), correctOrder is always
    // [0..n-1]. We regenerate it here.
    onChange({
      ...q,
      payload: {
        ...q.payload,
        fragments: next,
        correctOrder: next.map((_, i) => i),
      },
    });
  };

  const move = (idx: number, delta: number) => {
    const j = idx + delta;
    if (j < 0 || j >= q.payload.fragments.length) return;
    const next = [...q.payload.fragments];
    [next[idx], next[j]] = [next[j], next[idx]];
    setFragments(next);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-bold uppercase">
          Fragments in correct order
        </label>
        <button
          type="button"
          onClick={() => setFragments([...q.payload.fragments, ''])}
          disabled={q.payload.fragments.length >= 12}
          className="brutal-btn px-2 py-1 bg-white text-xs flex items-center gap-1 disabled:opacity-50"
        >
          <Plus className="w-3 h-3" /> Add fragment
        </button>
      </div>
      <p className="text-xs text-neutral-500 mb-2">
        Type the sentence fragments in their correct order. Players will
        see them shuffled and must drag them back into order.
      </p>
      <div className="space-y-2">
        {q.payload.fragments.map((f, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="w-6 text-right text-xs text-neutral-500 font-mono">
              {idx + 1}.
            </span>
            <input
              type="text"
              value={f}
              onChange={(e) => {
                const next = [...q.payload.fragments];
                next[idx] = e.target.value;
                setFragments(next);
              }}
              className="flex-1 border-2 border-black rounded px-2 py-1"
              data-testid={`q-${testIdx}-fragment-${idx}`}
            />
            <button
              type="button"
              onClick={() => move(idx, -1)}
              disabled={idx === 0}
              className="text-neutral-500 hover:text-black disabled:opacity-30"
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(idx, 1)}
              disabled={idx === q.payload.fragments.length - 1}
              className="text-neutral-500 hover:text-black disabled:opacity-30"
              title="Move down"
            >
              ↓
            </button>
            {q.payload.fragments.length > 2 && (
              <button
                type="button"
                onClick={() =>
                  setFragments(q.payload.fragments.filter((_, i) => i !== idx))
                }
                className="text-neutral-400 hover:text-red-500"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
