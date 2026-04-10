import {
  QuestionPayloadError,
  buildDispatchPayload,
  buildRevealPayload,
  gradeAnswer,
  normalizeShortAnswer,
  randomShufflePermutation,
  validateAnswerPayload,
  validateQuestionPayload,
} from '../live-exam-question-types';

/**
 * Focused unit tests for the live-exam discriminated-union helpers.
 * These exercise the validation / grading / normalization logic that
 * underpins the gateway's `exam.answer` handling and the template
 * service's payload validation — i.e. the two places a small bug
 * would show up as "points awarded incorrectly" in production.
 */
describe('live-exam question types', () => {
  // ─── validateQuestionPayload ──────────────────────────────

  describe('validateQuestionPayload', () => {
    it('accepts a well-formed MCQ', () => {
      const p = validateQuestionPayload('MULTIPLE_CHOICE', {
        options: [
          { id: 'A', text: 'a' },
          { id: 'B', text: 'b' },
        ],
        correctOptionId: 'A',
      });
      expect(p).toEqual({
        options: [
          { id: 'A', text: 'a' },
          { id: 'B', text: 'b' },
        ],
        correctOptionId: 'A',
      });
    });

    it('rejects an MCQ with fewer than 2 options', () => {
      expect(() =>
        validateQuestionPayload('MULTIPLE_CHOICE', {
          options: [{ id: 'A', text: 'a' }],
          correctOptionId: 'A',
        }),
      ).toThrow(QuestionPayloadError);
    });

    it('rejects an MCQ with a correctOptionId that does not match any option', () => {
      expect(() =>
        validateQuestionPayload('MULTIPLE_CHOICE', {
          options: [
            { id: 'A', text: 'a' },
            { id: 'B', text: 'b' },
          ],
          correctOptionId: 'Z',
        }),
      ).toThrow(/correctOptionId must match/);
    });

    it('rejects MCQ with duplicate option ids', () => {
      expect(() =>
        validateQuestionPayload('MULTIPLE_CHOICE', {
          options: [
            { id: 'A', text: 'a' },
            { id: 'A', text: 'b' },
          ],
          correctOptionId: 'A',
        }),
      ).toThrow(/duplicate option\.id/);
    });

    it('accepts SHORT_ANSWER with variants', () => {
      const p = validateQuestionPayload('SHORT_ANSWER', {
        acceptedAnswers: ['Paris', 'paris'],
        caseSensitive: false,
      });
      expect(p).toEqual({
        acceptedAnswers: ['Paris', 'paris'],
        caseSensitive: false,
      });
    });

    it('defaults caseSensitive to false when omitted', () => {
      const p = validateQuestionPayload('SHORT_ANSWER', {
        acceptedAnswers: ['x'],
      });
      expect((p as { caseSensitive: boolean }).caseSensitive).toBe(false);
    });

    it('rejects SHORT_ANSWER with empty acceptedAnswers', () => {
      expect(() =>
        validateQuestionPayload('SHORT_ANSWER', {
          acceptedAnswers: [],
          caseSensitive: false,
        }),
      ).toThrow(QuestionPayloadError);
    });

    it('rejects SHORT_ANSWER with a blank variant', () => {
      expect(() =>
        validateQuestionPayload('SHORT_ANSWER', {
          acceptedAnswers: ['Paris', '   '],
          caseSensitive: false,
        }),
      ).toThrow(QuestionPayloadError);
    });

    it('accepts SENTENCE_REORDER and defaults correctOrder to [0..n-1]', () => {
      const p = validateQuestionPayload('SENTENCE_REORDER', {
        fragments: ['I', 'eat', 'apples'],
      });
      expect((p as { correctOrder: number[] }).correctOrder).toEqual([0, 1, 2]);
    });

    it('rejects SENTENCE_REORDER with a correctOrder length mismatch', () => {
      expect(() =>
        validateQuestionPayload('SENTENCE_REORDER', {
          fragments: ['a', 'b', 'c'],
          correctOrder: [0, 1],
        }),
      ).toThrow(/permutation/);
    });

    it('rejects SENTENCE_REORDER with duplicate indices in correctOrder', () => {
      expect(() =>
        validateQuestionPayload('SENTENCE_REORDER', {
          fragments: ['a', 'b', 'c'],
          correctOrder: [0, 0, 1],
        }),
      ).toThrow(/permutation/);
    });

    it('rejects null payload', () => {
      expect(() =>
        validateQuestionPayload('MULTIPLE_CHOICE', null),
      ).toThrow();
    });
  });

  // ─── normalizeShortAnswer ─────────────────────────────────

  describe('normalizeShortAnswer', () => {
    it('trims and collapses whitespace', () => {
      expect(normalizeShortAnswer('  hello    world  ', false)).toBe('hello world');
    });

    it('lowercases when caseSensitive is false', () => {
      expect(normalizeShortAnswer('Paris', false)).toBe('paris');
    });

    it('preserves case when caseSensitive is true', () => {
      expect(normalizeShortAnswer('Paris', true)).toBe('Paris');
    });

    it('NFC-normalizes combined diacritics so decomposed matches composed', () => {
      // "é" can be U+00E9 (composed) or U+0065 U+0301 (decomposed).
      // After NFC both should collapse to the composed form.
      const composed = '\u00e9';
      const decomposed = '\u0065\u0301';
      expect(normalizeShortAnswer(composed, false)).toBe(
        normalizeShortAnswer(decomposed, false),
      );
    });
  });

  // ─── gradeAnswer ──────────────────────────────────────────

  describe('gradeAnswer', () => {
    it('null answer is always wrong (timeout)', () => {
      const payload = validateQuestionPayload('SHORT_ANSWER', {
        acceptedAnswers: ['x'],
        caseSensitive: false,
      });
      expect(gradeAnswer('SHORT_ANSWER', payload, null).isCorrect).toBe(false);
    });

    it('MCQ: correct optionId', () => {
      const payload = validateQuestionPayload('MULTIPLE_CHOICE', {
        options: [
          { id: 'A', text: 'a' },
          { id: 'B', text: 'b' },
        ],
        correctOptionId: 'B',
      });
      expect(
        gradeAnswer('MULTIPLE_CHOICE', payload, { optionId: 'B' }).isCorrect,
      ).toBe(true);
      expect(
        gradeAnswer('MULTIPLE_CHOICE', payload, { optionId: 'A' }).isCorrect,
      ).toBe(false);
    });

    it('SHORT_ANSWER: matches any accepted variant after normalization', () => {
      const payload = validateQuestionPayload('SHORT_ANSWER', {
        acceptedAnswers: ['Paris', 'paris'],
        caseSensitive: false,
      });
      // Both casings match the lowercase-normalized variant.
      expect(
        gradeAnswer('SHORT_ANSWER', payload, { text: 'PARIS' }).isCorrect,
      ).toBe(true);
      expect(
        gradeAnswer('SHORT_ANSWER', payload, { text: '  paris  ' }).isCorrect,
      ).toBe(true);
    });

    it('SHORT_ANSWER: case sensitive requires exact casing', () => {
      const payload = validateQuestionPayload('SHORT_ANSWER', {
        acceptedAnswers: ['Paris'],
        caseSensitive: true,
      });
      expect(
        gradeAnswer('SHORT_ANSWER', payload, { text: 'paris' }).isCorrect,
      ).toBe(false);
      expect(
        gradeAnswer('SHORT_ANSWER', payload, { text: 'Paris' }).isCorrect,
      ).toBe(true);
    });

    it('SHORT_ANSWER: empty text is wrong', () => {
      const payload = validateQuestionPayload('SHORT_ANSWER', {
        acceptedAnswers: ['Paris'],
        caseSensitive: false,
      });
      expect(
        gradeAnswer('SHORT_ANSWER', payload, { text: '   ' }).isCorrect,
      ).toBe(false);
    });

    it('SHORT_ANSWER: internal whitespace normalization', () => {
      const payload = validateQuestionPayload('SHORT_ANSWER', {
        acceptedAnswers: ['hello world'],
        caseSensitive: false,
      });
      expect(
        gradeAnswer('SHORT_ANSWER', payload, { text: 'hello  world' }).isCorrect,
      ).toBe(true);
    });

    it('SENTENCE_REORDER: exact match on original indices', () => {
      const payload = validateQuestionPayload('SENTENCE_REORDER', {
        fragments: ['I', 'eat', 'apples'],
      });
      expect(
        gradeAnswer('SENTENCE_REORDER', payload, { order: [0, 1, 2] }).isCorrect,
      ).toBe(true);
      expect(
        gradeAnswer('SENTENCE_REORDER', payload, { order: [0, 2, 1] }).isCorrect,
      ).toBe(false);
    });

    it('SENTENCE_REORDER: length mismatch is wrong', () => {
      const payload = validateQuestionPayload('SENTENCE_REORDER', {
        fragments: ['a', 'b'],
      });
      expect(
        gradeAnswer('SENTENCE_REORDER', payload, { order: [0] }).isCorrect,
      ).toBe(false);
    });
  });

  // ─── validateAnswerPayload (from untrusted client input) ──

  describe('validateAnswerPayload', () => {
    it('MCQ rejects missing optionId', () => {
      expect(() => validateAnswerPayload('MULTIPLE_CHOICE', {})).toThrow();
    });

    it('SHORT_ANSWER rejects non-string text', () => {
      expect(() => validateAnswerPayload('SHORT_ANSWER', { text: 42 })).toThrow();
    });

    it('SHORT_ANSWER rejects oversized text', () => {
      expect(() =>
        validateAnswerPayload('SHORT_ANSWER', { text: 'x'.repeat(600) }),
      ).toThrow(/too long/);
    });

    it('SENTENCE_REORDER rejects duplicate positions', () => {
      expect(() =>
        validateAnswerPayload('SENTENCE_REORDER', { order: [0, 0, 1] }),
      ).toThrow(/not repeat/);
    });

    it('SENTENCE_REORDER rejects non-array order', () => {
      expect(() =>
        validateAnswerPayload('SENTENCE_REORDER', { order: 'nope' }),
      ).toThrow();
    });

    it('MCQ passes a minimally valid answer through', () => {
      expect(validateAnswerPayload('MULTIPLE_CHOICE', { optionId: 'A' })).toEqual({
        optionId: 'A',
      });
    });
  });

  // ─── randomShufflePermutation ─────────────────────────────

  describe('randomShufflePermutation', () => {
    it('returns a permutation of [0..n-1]', () => {
      for (let i = 0; i < 10; i++) {
        const n = 6;
        const p = randomShufflePermutation(n);
        expect(p).toHaveLength(n);
        expect(new Set(p).size).toBe(n);
        expect(p.every((v) => v >= 0 && v < n)).toBe(true);
      }
    });

    it('n=2 never returns identity (would leak the answer)', () => {
      for (let i = 0; i < 20; i++) {
        const p = randomShufflePermutation(2);
        expect(p).toEqual([1, 0]);
      }
    });

    it('handles n=1 and n=0 without crashing', () => {
      expect(randomShufflePermutation(1)).toEqual([0]);
      expect(randomShufflePermutation(0)).toEqual([]);
    });
  });

  // ─── buildDispatchPayload ─────────────────────────────────

  describe('buildDispatchPayload', () => {
    it('MCQ dispatch does not include correctOptionId', () => {
      const payload = validateQuestionPayload('MULTIPLE_CHOICE', {
        options: [
          { id: 'A', text: 'a' },
          { id: 'B', text: 'b' },
        ],
        correctOptionId: 'B',
      });
      const dispatch = buildDispatchPayload('MULTIPLE_CHOICE', payload);
      expect(dispatch).toEqual({
        type: 'MULTIPLE_CHOICE',
        options: [
          { id: 'A', text: 'a' },
          { id: 'B', text: 'b' },
        ],
      });
      expect('correctOptionId' in dispatch).toBe(false);
    });

    it('SENTENCE_REORDER dispatch shuffles according to the supplied permutation', () => {
      const payload = validateQuestionPayload('SENTENCE_REORDER', {
        fragments: ['one', 'two', 'three'],
      });
      const dispatch = buildDispatchPayload(
        'SENTENCE_REORDER',
        payload,
        [2, 0, 1],
      );
      expect(dispatch).toEqual({
        type: 'SENTENCE_REORDER',
        shuffledFragments: ['three', 'one', 'two'],
      });
    });
  });

  // ─── buildRevealPayload ───────────────────────────────────

  describe('buildRevealPayload', () => {
    it('SENTENCE_REORDER reveals fragments in the correct order, not storage order', () => {
      // Storage stores correctOrder explicitly; the reveal should
      // honor it rather than just returning fragments as stored.
      const payload = validateQuestionPayload('SENTENCE_REORDER', {
        fragments: ['C', 'A', 'B'],
        correctOrder: [1, 2, 0],
      });
      const reveal = buildRevealPayload('SENTENCE_REORDER', payload);
      expect(reveal).toEqual({
        type: 'SENTENCE_REORDER',
        correctFragments: ['A', 'B', 'C'],
      });
    });
  });
});
