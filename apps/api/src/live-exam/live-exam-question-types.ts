/**
 * Live exam question payload shapes and per-type helpers
 * (normalization, validation, grading, dispatch shaping).
 *
 * Question payloads are stored as JSON on both LiveExamTemplateQuestion
 * and LiveExamSessionQuestion. The `type` column discriminates the union.
 * Keeping validation and grading in one place means the service, gateway
 * and DTO layers all agree on shape.
 */

import { LiveExamQuestionType } from '@prisma/client';

// ─── Payload shapes (stored in DB) ─────────────────────────────────

export interface McqOption {
  id: string; // 'A' | 'B' | 'C' | 'D' (keys, not constrained to those four)
  text: string;
}

/**
 * Optional attached media rendered alongside the (HTML) prompt.
 * Stored inside the payload (not a separate column) so we can stay on
 * the existing schema. Values must be absolute URLs to files uploaded
 * via the normal file-upload pipeline.
 */
export interface QuestionMedia {
  imageUrl?: string;
  audioUrl?: string;
}

export interface McqPayload {
  options: McqOption[];
  correctOptionId: string;
  media?: QuestionMedia;
}

export interface ShortAnswerPayload {
  acceptedAnswers: string[];
  caseSensitive: boolean;
  media?: QuestionMedia;
}

export interface SentenceReorderPayload {
  fragments: string[]; // stored in CORRECT order
  correctOrder: number[]; // typically [0,1,...,n-1]; kept explicit for forward-compat
  media?: QuestionMedia;
}

export type QuestionPayload =
  | McqPayload
  | ShortAnswerPayload
  | SentenceReorderPayload;

// ─── Answer shapes (stored on LiveExamAnswer.answerPayload) ────────

export type McqAnswer = { optionId: string };
export type ShortAnswerAnswer = { text: string };
export type SentenceReorderAnswer = { order: number[] }; // ORIGINAL indices

export type AnswerPayload =
  | McqAnswer
  | ShortAnswerAnswer
  | SentenceReorderAnswer;

// ─── Validation ────────────────────────────────────────────────────

export class QuestionPayloadError extends Error {}

/**
 * Parse an untrusted `media` field into a QuestionMedia or undefined.
 * Only accepts absolute http(s) URLs. Silently drops blank/missing
 * entries so an empty `{}` doesn't round-trip as a truthy media block.
 */
function extractMedia(raw: unknown): QuestionMedia | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const m = raw as Record<string, unknown>;
  const out: QuestionMedia = {};
  const urlOf = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const s = v.trim();
    if (!s) return undefined;
    if (s.length > 2048) {
      throw new QuestionPayloadError('media url too long');
    }
    if (!/^https?:\/\//i.test(s)) {
      throw new QuestionPayloadError('media url must be absolute http(s)');
    }
    return s;
  };
  const img = urlOf(m.imageUrl);
  const aud = urlOf(m.audioUrl);
  if (img) out.imageUrl = img;
  if (aud) out.audioUrl = aud;
  return out.imageUrl || out.audioUrl ? out : undefined;
}

/**
 * Validate a question payload for storage. Throws QuestionPayloadError
 * on shape violations. Call from the controller/service on create/update
 * so bad JSON never reaches the DB.
 */
export function validateQuestionPayload(
  type: LiveExamQuestionType,
  payload: unknown,
): QuestionPayload {
  if (!payload || typeof payload !== 'object') {
    throw new QuestionPayloadError('payload must be an object');
  }
  const p = payload as Record<string, unknown>;
  const media = extractMedia(p.media);

  switch (type) {
    case 'MULTIPLE_CHOICE': {
      if (!Array.isArray(p.options) || p.options.length < 2 || p.options.length > 6) {
        throw new QuestionPayloadError(
          'MULTIPLE_CHOICE: options must be an array of 2..6 entries',
        );
      }
      const seen = new Set<string>();
      const options: McqOption[] = [];
      for (const raw of p.options) {
        if (!raw || typeof raw !== 'object') {
          throw new QuestionPayloadError('MULTIPLE_CHOICE: option must be an object');
        }
        const o = raw as Record<string, unknown>;
        if (typeof o.id !== 'string' || !o.id.trim()) {
          throw new QuestionPayloadError('MULTIPLE_CHOICE: option.id must be a non-empty string');
        }
        if (typeof o.text !== 'string' || !o.text.trim()) {
          throw new QuestionPayloadError('MULTIPLE_CHOICE: option.text must be a non-empty string');
        }
        if (seen.has(o.id)) {
          throw new QuestionPayloadError(`MULTIPLE_CHOICE: duplicate option.id "${o.id}"`);
        }
        seen.add(o.id);
        options.push({ id: o.id, text: o.text });
      }
      if (typeof p.correctOptionId !== 'string' || !seen.has(p.correctOptionId)) {
        throw new QuestionPayloadError(
          'MULTIPLE_CHOICE: correctOptionId must match one of the option ids',
        );
      }
      return { options, correctOptionId: p.correctOptionId, media };
    }

    case 'SHORT_ANSWER': {
      if (
        !Array.isArray(p.acceptedAnswers) ||
        p.acceptedAnswers.length === 0 ||
        p.acceptedAnswers.length > 20
      ) {
        throw new QuestionPayloadError(
          'SHORT_ANSWER: acceptedAnswers must be 1..20 strings',
        );
      }
      const accepted: string[] = [];
      for (const a of p.acceptedAnswers) {
        if (typeof a !== 'string' || !a.trim()) {
          throw new QuestionPayloadError(
            'SHORT_ANSWER: acceptedAnswers entries must be non-empty strings',
          );
        }
        if (a.length > 200) {
          throw new QuestionPayloadError(
            'SHORT_ANSWER: acceptedAnswer too long (max 200 chars)',
          );
        }
        accepted.push(a);
      }
      const caseSensitive = p.caseSensitive === true; // default false
      return { acceptedAnswers: accepted, caseSensitive, media };
    }

    case 'SENTENCE_REORDER': {
      if (
        !Array.isArray(p.fragments) ||
        p.fragments.length < 2 ||
        p.fragments.length > 12
      ) {
        throw new QuestionPayloadError(
          'SENTENCE_REORDER: fragments must be 2..12 strings',
        );
      }
      const fragments: string[] = [];
      for (const f of p.fragments) {
        if (typeof f !== 'string' || !f.trim()) {
          throw new QuestionPayloadError(
            'SENTENCE_REORDER: each fragment must be a non-empty string',
          );
        }
        if (f.length > 200) {
          throw new QuestionPayloadError('SENTENCE_REORDER: fragment too long');
        }
        fragments.push(f);
      }
      let correctOrder: number[];
      if (p.correctOrder === undefined) {
        correctOrder = fragments.map((_, i) => i);
      } else {
        if (!Array.isArray(p.correctOrder) || p.correctOrder.length !== fragments.length) {
          throw new QuestionPayloadError(
            'SENTENCE_REORDER: correctOrder must be a permutation of fragment indices',
          );
        }
        const seen = new Set<number>();
        correctOrder = [];
        for (const raw of p.correctOrder) {
          if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw >= fragments.length) {
            throw new QuestionPayloadError(
              'SENTENCE_REORDER: correctOrder entries must be integer fragment indices',
            );
          }
          if (seen.has(raw)) {
            throw new QuestionPayloadError(
              'SENTENCE_REORDER: correctOrder must be a permutation (no duplicates)',
            );
          }
          seen.add(raw);
          correctOrder.push(raw);
        }
      }
      return { fragments, correctOrder, media };
    }

    default: {
      // Exhaustive check
      const _never: never = type;
      throw new QuestionPayloadError(`Unknown question type: ${_never}`);
    }
  }
}

// ─── Grading ───────────────────────────────────────────────────────

/**
 * Normalize a short-answer text for comparison. We trim, collapse internal
 * whitespace, Unicode-NFC normalize (so composed diacritics compare equal
 * to decomposed), and optionally lowercase. No fuzzy matching — authors
 * list variants explicitly in acceptedAnswers.
 */
export function normalizeShortAnswer(text: string, caseSensitive: boolean): string {
  let t = text.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!caseSensitive) t = t.toLocaleLowerCase();
  return t;
}

export interface GradeResult {
  isCorrect: boolean;
}

/**
 * Pure grading function: given a typed payload + a typed answer, return
 * whether the answer is correct. No scoring / time-weighting here — that
 * stays in LiveExamScoringService.
 */
export function gradeAnswer(
  type: LiveExamQuestionType,
  payload: QuestionPayload,
  answer: AnswerPayload | null,
): GradeResult {
  if (answer === null) return { isCorrect: false };

  switch (type) {
    case 'MULTIPLE_CHOICE': {
      const p = payload as McqPayload;
      const a = answer as McqAnswer;
      if (typeof a.optionId !== 'string') return { isCorrect: false };
      return { isCorrect: a.optionId === p.correctOptionId };
    }
    case 'SHORT_ANSWER': {
      const p = payload as ShortAnswerPayload;
      const a = answer as ShortAnswerAnswer;
      if (typeof a.text !== 'string') return { isCorrect: false };
      const norm = normalizeShortAnswer(a.text, p.caseSensitive);
      if (norm.length === 0) return { isCorrect: false };
      for (const accepted of p.acceptedAnswers) {
        if (normalizeShortAnswer(accepted, p.caseSensitive) === norm) {
          return { isCorrect: true };
        }
      }
      return { isCorrect: false };
    }
    case 'SENTENCE_REORDER': {
      const p = payload as SentenceReorderPayload;
      const a = answer as SentenceReorderAnswer;
      if (!Array.isArray(a.order) || a.order.length !== p.correctOrder.length) {
        return { isCorrect: false };
      }
      for (let i = 0; i < p.correctOrder.length; i++) {
        if (a.order[i] !== p.correctOrder[i]) return { isCorrect: false };
      }
      return { isCorrect: true };
    }
    default: {
      const _never: never = type;
      return { isCorrect: false };
    }
  }
}

// ─── Answer shape validation (from untrusted WS client) ────────────

/**
 * Validate a client-submitted answer against the question type. Returns
 * a typed AnswerPayload on success, or null on shape mismatch (treated
 * as "answer rejected, do not persist"). Throws on blatantly malformed
 * input so the gateway can emit an error ack.
 */
export function validateAnswerPayload(
  type: LiveExamQuestionType,
  input: unknown,
): AnswerPayload {
  if (!input || typeof input !== 'object') {
    throw new QuestionPayloadError('answer payload must be an object');
  }
  const a = input as Record<string, unknown>;

  switch (type) {
    case 'MULTIPLE_CHOICE': {
      if (typeof a.optionId !== 'string' || !a.optionId.trim()) {
        throw new QuestionPayloadError('MULTIPLE_CHOICE: answer.optionId required');
      }
      return { optionId: a.optionId };
    }
    case 'SHORT_ANSWER': {
      if (typeof a.text !== 'string') {
        throw new QuestionPayloadError('SHORT_ANSWER: answer.text required');
      }
      if (a.text.length > 500) {
        throw new QuestionPayloadError('SHORT_ANSWER: answer too long');
      }
      return { text: a.text };
    }
    case 'SENTENCE_REORDER': {
      if (!Array.isArray(a.order)) {
        throw new QuestionPayloadError('SENTENCE_REORDER: answer.order required');
      }
      const order: number[] = [];
      const seen = new Set<number>();
      for (const raw of a.order) {
        if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 100) {
          throw new QuestionPayloadError('SENTENCE_REORDER: order entries must be indices');
        }
        if (seen.has(raw)) {
          throw new QuestionPayloadError('SENTENCE_REORDER: order must not repeat');
        }
        seen.add(raw);
        order.push(raw);
      }
      return { order };
    }
    default: {
      const _never: never = type;
      throw new QuestionPayloadError(`unknown question type: ${_never}`);
    }
  }
}

// ─── Dispatch shaping (payload sent to client at question time) ────
//
// Player clients must never see correct answers. For SENTENCE_REORDER
// we also shuffle fragments before sending so the correct order isn't
// leaked. A fresh shuffle permutation is generated per dispatch and
// held by the gateway runtime so that (a) mid-question rejoins see the
// same shuffle and (b) client-submitted positions can be translated
// back to original indices for grading.

export interface McqDispatchPayload {
  type: 'MULTIPLE_CHOICE';
  options: McqOption[];
  media?: QuestionMedia;
}

export interface ShortAnswerDispatchPayload {
  type: 'SHORT_ANSWER';
  media?: QuestionMedia;
}

export interface SentenceReorderDispatchPayload {
  type: 'SENTENCE_REORDER';
  /** Fragments in SHUFFLED order (client renders these as chips). */
  shuffledFragments: string[];
  media?: QuestionMedia;
}

export type DispatchPayload =
  | McqDispatchPayload
  | ShortAnswerDispatchPayload
  | SentenceReorderDispatchPayload;

/**
 * Build the client-safe payload for a question. For SENTENCE_REORDER,
 * takes a permutation `shuffle[i] = originalIndex` and returns fragments
 * in the shuffled order. The caller (gateway) owns the permutation so
 * it can translate client answers back to original indices.
 */
export function buildDispatchPayload(
  type: LiveExamQuestionType,
  payload: QuestionPayload,
  shuffle?: number[],
): DispatchPayload {
  switch (type) {
    case 'MULTIPLE_CHOICE': {
      const p = payload as McqPayload;
      // Never leak correctOptionId to players — only send the options.
      return { type: 'MULTIPLE_CHOICE', options: p.options, media: p.media };
    }
    case 'SHORT_ANSWER': {
      const p = payload as ShortAnswerPayload;
      return { type: 'SHORT_ANSWER', media: p.media };
    }
    case 'SENTENCE_REORDER': {
      const p = payload as SentenceReorderPayload;
      const perm = shuffle ?? p.fragments.map((_, i) => i);
      return {
        type: 'SENTENCE_REORDER',
        shuffledFragments: perm.map((i) => p.fragments[i]),
        media: p.media,
      };
    }
    default: {
      const _never: never = type;
      throw new Error(`unknown question type: ${_never}`);
    }
  }
}

/**
 * Fisher-Yates random permutation of [0..n-1]. Guarantees at least one
 * swap when n >= 2 so players don't occasionally see fragments in the
 * correct order (which would leak the answer).
 */
export function randomShufflePermutation(n: number): number[] {
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  // If by chance the shuffle equals identity and n >= 2, rotate by 1.
  if (n >= 2 && perm.every((v, i) => v === i)) {
    return [...perm.slice(1), perm[0]];
  }
  return perm;
}

// ─── Reveal shaping (payload sent to client after lock) ────────────
//
// After a question locks, the player-facing reveal shows the correct
// answer in a type-appropriate shape. Host-facing reveals can include
// the same shape directly.

export interface McqRevealPayload {
  type: 'MULTIPLE_CHOICE';
  correctOptionId: string;
}
export interface ShortAnswerRevealPayload {
  type: 'SHORT_ANSWER';
  acceptedAnswers: string[]; // revealed after lock
}
export interface SentenceReorderRevealPayload {
  type: 'SENTENCE_REORDER';
  correctFragments: string[]; // in correct order
}
export type RevealPayload =
  | McqRevealPayload
  | ShortAnswerRevealPayload
  | SentenceReorderRevealPayload;

// ─── Host answer-display shaping ──────────────────────────────────
//
// Human-readable view of a single player's submitted answer, built so
// the host console can show what each player actually picked or wrote
// (never sent to players). For SENTENCE_REORDER, the input `order`
// array must already be in ORIGINAL fragment indices (the gateway
// translates from shuffled positions before calling this).

export type HostAnswerDisplay =
  | { type: 'MULTIPLE_CHOICE'; optionId: string; optionText: string }
  | { type: 'SHORT_ANSWER'; text: string }
  | { type: 'SENTENCE_REORDER'; orderedFragments: string[] };

export function buildAnswerDisplay(
  type: LiveExamQuestionType,
  payload: QuestionPayload,
  answer: AnswerPayload,
): HostAnswerDisplay {
  switch (type) {
    case 'MULTIPLE_CHOICE': {
      const p = payload as McqPayload;
      const a = answer as McqAnswer;
      const opt = p.options.find((o) => o.id === a.optionId);
      return {
        type: 'MULTIPLE_CHOICE',
        optionId: a.optionId,
        optionText: opt?.text ?? '',
      };
    }
    case 'SHORT_ANSWER': {
      const a = answer as ShortAnswerAnswer;
      return { type: 'SHORT_ANSWER', text: a.text };
    }
    case 'SENTENCE_REORDER': {
      const p = payload as SentenceReorderPayload;
      const a = answer as SentenceReorderAnswer;
      return {
        type: 'SENTENCE_REORDER',
        orderedFragments: a.order.map((i) => p.fragments[i] ?? ''),
      };
    }
    default: {
      const _never: never = type;
      throw new Error(`unknown question type: ${_never}`);
    }
  }
}

export function buildRevealPayload(
  type: LiveExamQuestionType,
  payload: QuestionPayload,
): RevealPayload {
  switch (type) {
    case 'MULTIPLE_CHOICE': {
      const p = payload as McqPayload;
      return { type: 'MULTIPLE_CHOICE', correctOptionId: p.correctOptionId };
    }
    case 'SHORT_ANSWER': {
      const p = payload as ShortAnswerPayload;
      return { type: 'SHORT_ANSWER', acceptedAnswers: p.acceptedAnswers };
    }
    case 'SENTENCE_REORDER': {
      const p = payload as SentenceReorderPayload;
      return {
        type: 'SENTENCE_REORDER',
        correctFragments: p.correctOrder.map((i) => p.fragments[i]),
      };
    }
    default: {
      const _never: never = type;
      throw new Error(`unknown question type: ${_never}`);
    }
  }
}
