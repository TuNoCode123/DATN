/**
 * Shared type definitions for the live exam feature. Mirrors the
 * discriminated-union payload shapes on the backend in
 * apps/api/src/live-exam/live-exam-question-types.ts. When the backend
 * definitions change, update both sides in lockstep.
 */

export type LiveExamQuestionType =
  | 'MULTIPLE_CHOICE'
  | 'SHORT_ANSWER'
  | 'SENTENCE_REORDER';

export type LiveExamTemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type LiveExamSessionStatus = 'LOBBY' | 'LIVE' | 'ENDED' | 'CANCELLED';

// ─── Stored payload shapes (author-facing) ────────────────────────

export type McqOption = { id: string; text: string };

/**
 * Optional media attached to a question, rendered alongside the HTML
 * prompt. Stored inside payload.media, mirrors backend QuestionMedia.
 */
export type QuestionMedia = {
  imageUrl?: string;
  audioUrl?: string;
};

export type McqPayload = {
  options: McqOption[];
  correctOptionId: string;
  media?: QuestionMedia;
};

export type ShortAnswerPayload = {
  acceptedAnswers: string[];
  caseSensitive: boolean;
  media?: QuestionMedia;
};

export type SentenceReorderPayload = {
  fragments: string[]; // in correct order
  correctOrder: number[]; // usually [0..n-1]
  media?: QuestionMedia;
};

export type QuestionPayload =
  | McqPayload
  | ShortAnswerPayload
  | SentenceReorderPayload;

// ─── Dispatch payloads (what the player actually sees) ────────────

export type McqDispatch = {
  type: 'MULTIPLE_CHOICE';
  options: McqOption[];
  media?: QuestionMedia;
};
export type ShortAnswerDispatch = {
  type: 'SHORT_ANSWER';
  media?: QuestionMedia;
};
export type SentenceReorderDispatch = {
  type: 'SENTENCE_REORDER';
  /** Fragments already shuffled by the server. Client renders in this order. */
  shuffledFragments: string[];
  media?: QuestionMedia;
};
export type DispatchPayload =
  | McqDispatch
  | ShortAnswerDispatch
  | SentenceReorderDispatch;

// ─── Reveal payloads (what the player sees after lock) ────────────

export type McqReveal = { type: 'MULTIPLE_CHOICE'; correctOptionId: string };
export type ShortAnswerReveal = {
  type: 'SHORT_ANSWER';
  acceptedAnswers: string[];
};
export type SentenceReorderReveal = {
  type: 'SENTENCE_REORDER';
  correctFragments: string[];
};
export type RevealPayload =
  | McqReveal
  | ShortAnswerReveal
  | SentenceReorderReveal;

// ─── Answer payloads (player → server) ────────────────────────────

export type McqAnswer = { optionId: string };
export type ShortAnswerAnswer = { text: string };
/**
 * For SENTENCE_REORDER, `order` is an array of positions into the
 * SHUFFLED fragments the client received. The server translates these
 * back to original fragment indices before persisting.
 */
export type SentenceReorderAnswer = { order: number[] };
export type AnswerPayload = McqAnswer | ShortAnswerAnswer | SentenceReorderAnswer;

// ─── Host answer-display (host console only) ─────────────────────
//
// Human-readable view of a single player's submitted answer, sent to
// the host room so the host console can show what each player picked
// or wrote for the current question.

export type HostAnswerDisplay =
  | { type: 'MULTIPLE_CHOICE'; optionId: string; optionText: string }
  | { type: 'SHORT_ANSWER'; text: string }
  | { type: 'SENTENCE_REORDER'; orderedFragments: string[] };

// ─── Editor draft shapes ──────────────────────────────────────────

export type QuestionDraft =
  | {
      id?: string;
      type: 'MULTIPLE_CHOICE';
      prompt: string;
      explanation?: string;
      points: number;
      payload: McqPayload;
    }
  | {
      id?: string;
      type: 'SHORT_ANSWER';
      prompt: string;
      explanation?: string;
      points: number;
      payload: ShortAnswerPayload;
    }
  | {
      id?: string;
      type: 'SENTENCE_REORDER';
      prompt: string;
      explanation?: string;
      points: number;
      payload: SentenceReorderPayload;
    };

export type TemplateDraft = {
  id?: string;
  status?: LiveExamTemplateStatus;
  title: string;
  description?: string;
  durationSec: number;
  perQuestionSec: number;
  interstitialSec: number;
  questions: QuestionDraft[];
};

// ─── Empty factories ──────────────────────────────────────────────

export function emptyMcqQuestion(): QuestionDraft {
  return {
    type: 'MULTIPLE_CHOICE',
    prompt: '',
    points: 1000,
    payload: {
      options: [
        { id: 'A', text: '' },
        { id: 'B', text: '' },
        { id: 'C', text: '' },
        { id: 'D', text: '' },
      ],
      correctOptionId: 'A',
    },
  };
}

export function emptyShortAnswerQuestion(): QuestionDraft {
  return {
    type: 'SHORT_ANSWER',
    prompt: '',
    points: 1000,
    payload: {
      acceptedAnswers: [''],
      caseSensitive: false,
    },
  };
}

export function emptySentenceReorderQuestion(): QuestionDraft {
  return {
    type: 'SENTENCE_REORDER',
    prompt: 'Arrange the fragments into the correct sentence.',
    points: 1000,
    payload: {
      fragments: ['', ''],
      correctOrder: [0, 1],
    },
  };
}

export function emptyQuestionOfType(type: LiveExamQuestionType): QuestionDraft {
  switch (type) {
    case 'MULTIPLE_CHOICE':
      return emptyMcqQuestion();
    case 'SHORT_ANSWER':
      return emptyShortAnswerQuestion();
    case 'SENTENCE_REORDER':
      return emptySentenceReorderQuestion();
  }
}

// ─── Client-side validation (cheap pre-submit check) ──────────────

/** Strip HTML and whitespace to check whether a rich-text prompt is empty. */
function htmlIsEmpty(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() === '';
}

export function validateQuestionDraft(q: QuestionDraft): string | null {
  if (htmlIsEmpty(q.prompt)) return 'Prompt is required';
  switch (q.type) {
    case 'MULTIPLE_CHOICE': {
      if (q.payload.options.length < 2) return 'At least 2 options required';
      if (q.payload.options.some((o) => !o.text.trim()))
        return 'All options must have text';
      const ids = new Set(q.payload.options.map((o) => o.id));
      if (ids.size !== q.payload.options.length)
        return 'Option ids must be unique';
      if (!ids.has(q.payload.correctOptionId))
        return 'Correct option must be one of the listed options';
      return null;
    }
    case 'SHORT_ANSWER': {
      if (q.payload.acceptedAnswers.length === 0)
        return 'Add at least one accepted answer';
      if (q.payload.acceptedAnswers.some((a) => !a.trim()))
        return 'Accepted answers cannot be blank';
      return null;
    }
    case 'SENTENCE_REORDER': {
      if (q.payload.fragments.length < 2) return 'Need at least 2 fragments';
      if (q.payload.fragments.some((f) => !f.trim()))
        return 'Fragments cannot be blank';
      if (q.payload.correctOrder.length !== q.payload.fragments.length)
        return 'Correct order must match fragment count';
      return null;
    }
  }
}
