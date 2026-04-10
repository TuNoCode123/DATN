'use client';

import { Check, X } from 'lucide-react';
import {
  AnswerPayload,
  DispatchPayload,
  LiveExamQuestionType,
  RevealPayload,
} from '@/lib/live-exam-types';

/**
 * Per-type live player views. Each component renders the question,
 * handles user interaction, and exposes a `submit` function via the
 * parent's `onSubmit` callback. The parent (play page) owns the phase
 * state and the socket — player widgets are dumb.
 *
 * Phases:
 *   'OPEN'     — interactive, user can submit
 *   'ANSWERED' — user has submitted, widget is locked
 *   'LOCKED'   — question closed, reveal is shown
 */
export type PlayerPhase = 'OPEN' | 'ANSWERED' | 'LOCKED';

export type QuestionEnvelope = {
  id: string;
  type: LiveExamQuestionType;
  prompt: string;
  dispatch: DispatchPayload;
};

/**
 * Dispatcher: picks the right player view based on question type.
 */
export function LiveQuestionView({
  question,
  phase,
  myAnswer,
  reveal,
  onSubmit,
}: {
  question: QuestionEnvelope;
  phase: PlayerPhase;
  myAnswer: AnswerPayload | null;
  reveal: RevealPayload | null;
  onSubmit: (answer: AnswerPayload) => void;
}) {
  switch (question.type) {
    case 'MULTIPLE_CHOICE':
      return (
        <McqPlayer
          question={question}
          phase={phase}
          myAnswer={myAnswer as { optionId: string } | null}
          reveal={reveal as { correctOptionId: string } | null}
          onSubmit={onSubmit}
        />
      );
    case 'SHORT_ANSWER':
      return (
        <ShortAnswerPlayer
          question={question}
          phase={phase}
          myAnswer={myAnswer as { text: string } | null}
          reveal={reveal as { acceptedAnswers: string[] } | null}
          onSubmit={onSubmit}
        />
      );
    case 'SENTENCE_REORDER':
      return (
        <SentenceReorderPlayer
          question={question}
          phase={phase}
          myAnswer={myAnswer as { order: number[] } | null}
          reveal={reveal as { correctFragments: string[] } | null}
          onSubmit={onSubmit}
        />
      );
  }
}

// ─── MCQ ──────────────────────────────────────────────────────────

function McqPlayer({
  question,
  phase,
  myAnswer,
  reveal,
  onSubmit,
}: {
  question: QuestionEnvelope;
  phase: PlayerPhase;
  myAnswer: { optionId: string } | null;
  reveal: { correctOptionId: string } | null;
  onSubmit: (answer: AnswerPayload) => void;
}) {
  if (question.dispatch.type !== 'MULTIPLE_CHOICE') return null;
  const options = question.dispatch.options;
  const picked = myAnswer?.optionId ?? null;
  const correctId = reveal?.correctOptionId ?? null;

  // Kahoot-inspired vibrant palette — red / blue / amber / emerald.
  // Amber needs dark text for contrast; others stay white.
  const palette = [
    { bg: '#ef4444', text: '#ffffff', ring: '#7f1d1d' },
    { bg: '#2563eb', text: '#ffffff', ring: '#1e3a8a' },
    { bg: '#f59e0b', text: '#1a1a1a', ring: '#78350f' },
    { bg: '#10b981', text: '#ffffff', ring: '#064e3b' },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {options.map((o, idx) => {
        const color = palette[idx % palette.length];
        const isPicked = picked === o.id;
        const isCorrect = phase === 'LOCKED' && correctId === o.id;
        const isWrongPick =
          phase === 'LOCKED' && isPicked && correctId !== o.id;
        const isLockedOther =
          phase === 'LOCKED' && !isCorrect && !isWrongPick;
        const isPickedActive = phase !== 'LOCKED' && isPicked;

        const tileBg = isLockedOther ? '#d4d4d8' : color.bg;
        const tileText = isLockedOther ? '#52525b' : color.text;

        return (
          <button
            key={o.id}
            type="button"
            disabled={phase !== 'OPEN'}
            onClick={() => onSubmit({ optionId: o.id })}
            style={{
              backgroundColor: tileBg,
              color: tileText,
              borderColor: '#000',
              boxShadow: isPickedActive
                ? '8px 8px 0 0 #000'
                : isCorrect
                  ? '8px 8px 0 0 #000'
                  : '5px 5px 0 0 #000',
              transform: isPickedActive
                ? 'translate(-3px, -3px) scale(1.02)'
                : isCorrect
                  ? 'translate(-3px, -3px)'
                  : undefined,
              opacity: isLockedOther ? 0.55 : isWrongPick ? 0.85 : 1,
            }}
            className={`
              relative rounded-2xl border-[3px] p-5 min-h-[96px]
              flex items-center gap-4 text-left
              transition-all duration-150
              disabled:cursor-not-allowed
              enabled:hover:-translate-x-[2px] enabled:hover:-translate-y-[2px]
              enabled:hover:shadow-[7px_7px_0_0_#000]
              ${isPickedActive ? 'ring-[5px] ring-white ring-offset-[3px] ring-offset-black' : ''}
              ${isCorrect ? 'ring-[5px] ring-white ring-offset-[3px] ring-offset-black animate-pulse' : ''}
            `}
            data-testid={`option-${o.id}`}
          >
            <span
              className="flex-shrink-0 w-14 h-14 rounded-xl bg-white border-[3px] border-black flex items-center justify-center text-3xl font-black text-black"
              style={{ boxShadow: '3px 3px 0 0 rgba(0,0,0,0.35)' }}
            >
              {o.id}
            </span>
            <span
              className="flex-1 font-black text-lg leading-snug break-words"
              style={{ color: tileText }}
            >
              {o.text}
            </span>
            {isCorrect && (
              <span className="flex-shrink-0 w-11 h-11 rounded-full bg-white border-[3px] border-black flex items-center justify-center">
                <Check
                  className="w-6 h-6 text-emerald-700"
                  strokeWidth={4}
                />
              </span>
            )}
            {isWrongPick && (
              <span className="flex-shrink-0 w-11 h-11 rounded-full bg-white border-[3px] border-black flex items-center justify-center">
                <X className="w-6 h-6 text-red-700" strokeWidth={4} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Short answer ─────────────────────────────────────────────────

import { useEffect, useState } from 'react';

function ShortAnswerPlayer({
  question,
  phase,
  myAnswer,
  reveal,
  onSubmit,
}: {
  question: QuestionEnvelope;
  phase: PlayerPhase;
  myAnswer: { text: string } | null;
  reveal: { acceptedAnswers: string[] } | null;
  onSubmit: (answer: AnswerPayload) => void;
}) {
  // We seed the input with `myAnswer?.text` if the parent hands us a
  // pre-filled answer (e.g. on rejoin), otherwise track our own text.
  const [text, setText] = useState(myAnswer?.text ?? '');

  // Reset the input whenever a new question arrives. The parent already
  // unmounts/remounts per question via `key={question.id}` but we also
  // defensively reset on id change here.
  useEffect(() => {
    setText(myAnswer?.text ?? '');
  }, [question.id, myAnswer?.text]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit({ text: trimmed });
  };

  const disabled = phase !== 'OPEN';
  const isCorrect = phase === 'LOCKED' && myAnswer !== null && reveal !== null
    ? normalizeMatch(myAnswer.text, reveal.acceptedAnswers)
    : false;

  return (
    <div className="space-y-3">
      <div className="brutal-card p-1 flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          disabled={disabled}
          placeholder="Type your answer…"
          className={`flex-1 px-3 py-3 text-lg bg-transparent focus:outline-none ${
            disabled ? 'text-neutral-500' : ''
          }`}
          data-testid="short-answer-input"
          autoFocus
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !text.trim()}
          className="brutal-btn-fill px-4 py-2 m-1 disabled:opacity-50"
        >
          Submit
        </button>
      </div>
      {phase === 'LOCKED' && reveal && (
        <div
          className={`brutal-card p-4 ${
            isCorrect ? 'bg-green-100' : 'bg-red-100'
          }`}
        >
          <div className="text-xs uppercase font-bold text-neutral-600 mb-1">
            {isCorrect ? 'Correct!' : 'Accepted answers'}
          </div>
          <div className="flex flex-wrap gap-2">
            {reveal.acceptedAnswers.map((a, i) => (
              <span
                key={i}
                className="px-2 py-1 bg-white border-2 border-black rounded text-sm"
              >
                {a}
              </span>
            ))}
          </div>
          {myAnswer && !isCorrect && (
            <div className="text-sm mt-2">
              You wrote: <strong>{myAnswer.text}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Client-side exact-match (with normalization) used to decide which
// color to paint after the reveal. Server is authoritative; this is
// only a UI hint.
function normalizeMatch(text: string, accepted: string[]): boolean {
  const norm = (s: string) =>
    s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const t = norm(text);
  return accepted.some((a) => norm(a) === t);
}

// ─── Sentence reorder ─────────────────────────────────────────────

function SentenceReorderPlayer({
  question,
  phase,
  myAnswer,
  reveal,
  onSubmit,
}: {
  question: QuestionEnvelope;
  phase: PlayerPhase;
  myAnswer: { order: number[] } | null;
  reveal: { correctFragments: string[] } | null;
  onSubmit: (answer: AnswerPayload) => void;
}) {
  if (question.dispatch.type !== 'SENTENCE_REORDER') return null;
  const shuffled = question.dispatch.shuffledFragments;

  // `picked` is an array of INDICES into `shuffled` in the order the
  // player has tapped them. The player builds the answer by tapping
  // fragments; tapping a fragment already in the answer returns it to
  // the pool.
  const [picked, setPicked] = useState<number[]>([]);

  // Reset on question change.
  useEffect(() => {
    setPicked([]);
  }, [question.id]);

  const pool = shuffled
    .map((text, i) => ({ text, index: i }))
    .filter((f) => !picked.includes(f.index));

  const togglePick = (shuffledIdx: number) => {
    if (phase !== 'OPEN') return;
    setPicked((prev) =>
      prev.includes(shuffledIdx)
        ? prev.filter((i) => i !== shuffledIdx)
        : [...prev, shuffledIdx],
    );
  };

  const removeFromPicked = (shuffledIdx: number) => {
    if (phase !== 'OPEN') return;
    setPicked((prev) => prev.filter((i) => i !== shuffledIdx));
  };

  const submit = () => {
    if (picked.length !== shuffled.length) return;
    onSubmit({ order: picked });
  };

  const disabled = phase !== 'OPEN';
  const canSubmit = !disabled && picked.length === shuffled.length;

  return (
    <div className="space-y-3">
      {/* Answer tray */}
      <div className="brutal-card p-3 min-h-[64px] bg-white">
        <div className="text-xs uppercase font-bold text-neutral-500 mb-2">
          Your answer
        </div>
        <div className="flex flex-wrap gap-2">
          {picked.length === 0 && (
            <span className="text-sm text-neutral-400">
              Tap fragments below to build the sentence
            </span>
          )}
          {picked.map((shuffledIdx) => (
            <button
              key={shuffledIdx}
              type="button"
              onClick={() => removeFromPicked(shuffledIdx)}
              disabled={disabled}
              className="brutal-btn px-3 py-1.5 bg-yellow-100 text-sm font-bold"
            >
              {shuffled[shuffledIdx]}
            </button>
          ))}
        </div>
      </div>

      {/* Pool */}
      <div>
        <div className="text-xs uppercase font-bold text-neutral-500 mb-2">
          Available fragments
        </div>
        <div className="flex flex-wrap gap-2">
          {pool.map((f) => (
            <button
              key={f.index}
              type="button"
              onClick={() => togglePick(f.index)}
              disabled={disabled}
              className="brutal-btn px-3 py-1.5 bg-white text-sm font-bold disabled:opacity-50"
              data-testid={`fragment-${f.index}`}
            >
              {f.text}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="brutal-btn-fill w-full py-2 disabled:opacity-50"
      >
        Submit answer
      </button>

      {phase === 'LOCKED' && reveal && (
        <div className="brutal-card p-4 bg-green-50">
          <div className="text-xs uppercase font-bold text-neutral-600 mb-2">
            Correct order
          </div>
          <div className="flex flex-wrap gap-2">
            {reveal.correctFragments.map((f, i) => (
              <span
                key={i}
                className="px-3 py-1.5 bg-green-200 border-2 border-black rounded text-sm font-bold"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
