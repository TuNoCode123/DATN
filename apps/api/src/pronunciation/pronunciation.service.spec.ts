import { Test } from '@nestjs/testing';
import { PronunciationService } from './pronunciation.service';
import { PrismaService } from '../prisma/prisma.service';
import { BedrockService } from '../bedrock/bedrock.service';
import type { TranscribeItem } from './pronunciation.gateway';

/**
 * Unit tests for deterministic word alignment & scoring.
 * We access private methods via bracket notation to test core logic
 * without needing Prisma/Bedrock dependencies for pure functions.
 */
describe('PronunciationService – alignment & scoring', () => {
  let service: PronunciationService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        PronunciationService,
        { provide: PrismaService, useValue: {} },
        { provide: BedrockService, useValue: {} },
      ],
    }).compile();
    service = mod.get(PronunciationService);
  });

  // ─── helpers to call private methods ──────────────────────
  const normalize = (w: string) => (service as any).normalize(w);
  const editDistance = (a: string, b: string) =>
    (service as any).editDistance(a, b);
  const substitutionScore = (a: string, b: string) =>
    (service as any).substitutionScore(a, b);
  const alignWords = (t: string[], s: string[]) =>
    (service as any).alignWords(t, s) as (number | null)[];
  const buildWordComparison = (
    target: string,
    spoken: string,
    items?: TranscribeItem[],
  ) => (service as any).buildWordComparison(target, spoken, items);
  const computeScores = (wc: any[], items?: TranscribeItem[]) =>
    (service as any).computeScores(wc, items);

  // ─── normalize ────────────────────────────────────────────
  describe('normalize', () => {
    it('lowercases and strips punctuation', () => {
      expect(normalize('Hello!')).toBe('hello');
      expect(normalize("It's")).toBe("it's");
      expect(normalize('county,')).toBe('county');
      expect(normalize('fair!')).toBe('fair');
      expect(normalize('120th')).toBe('120th');
    });

    it('preserves apostrophes', () => {
      expect(normalize("we'll")).toBe("we'll");
      expect(normalize("don't")).toBe("don't");
    });
  });

  // ─── editDistance ─────────────────────────────────────────
  describe('editDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(editDistance('hello', 'hello')).toBe(0);
    });

    it('returns correct distance for similar words', () => {
      expect(editDistance('county', 'country')).toBe(1);
      expect(editDistance('fair', 'far')).toBe(1);
    });

    it('returns correct distance for dissimilar words', () => {
      expect(editDistance('we', 'free')).toBe(3);
      expect(editDistance('celebrate', 'slip')).toBe(8);
      expect(editDistance('the', 'res')).toBe(3);
    });

    it('handles empty strings', () => {
      expect(editDistance('', '')).toBe(0);
      expect(editDistance('abc', '')).toBe(3);
      expect(editDistance('', 'xyz')).toBe(3);
    });
  });

  // ─── substitutionScore ────────────────────────────────────
  describe('substitutionScore', () => {
    it('returns +3 for exact match', () => {
      expect(substitutionScore('hello', 'hello')).toBe(3);
    });

    it('returns 0 (mild) for similar words (sim >= 0.5)', () => {
      expect(substitutionScore('county', 'country')).toBe(0);
      expect(substitutionScore('fair', 'far')).toBe(0);
    });

    it('returns -5 (heavy) for dissimilar words (sim < 0.5)', () => {
      expect(substitutionScore('we', 'free')).toBe(-5);
      expect(substitutionScore('celebrate', 'slip')).toBe(-5);
      expect(substitutionScore('the', 'res')).toBe(-5);
      expect(substitutionScore('120th', 'uh')).toBe(-5);
      expect(substitutionScore('anniversary', 'whatever')).toBe(-5);
    });

    it('returns +3 for two empty strings', () => {
      expect(substitutionScore('', '')).toBe(3);
    });
  });

  // ─── alignWords ───────────────────────────────────────────
  describe('alignWords', () => {
    it('aligns identical sequences', () => {
      const t = ['good', 'morning', 'world'];
      const s = ['good', 'morning', 'world'];
      const a = alignWords(t, s);
      expect(a).toEqual([0, 1, 2]);
    });

    it('handles extra spoken words (insertions)', () => {
      const t = ['good', 'morning'];
      const s = ['good', 'very', 'morning'];
      const a = alignWords(t, s);
      expect(a[0]).toBe(0); // good → good
      expect(a[1]).toBe(2); // morning → morning (skip "very")
    });

    it('handles missed target words (deletions)', () => {
      const t = ['good', 'morning', 'world'];
      const s = ['good', 'world'];
      const a = alignWords(t, s);
      expect(a[0]).toBe(0); // good → good
      expect(a[1]).toBeNull(); // morning → missed
      expect(a[2]).toBe(1); // world → world
    });

    it('aligns similar words as substitutions, not gaps', () => {
      const t = ['the', 'county', 'fair'];
      const s = ['the', 'country', 'far'];
      const a = alignWords(t, s);
      expect(a).toEqual([0, 1, 2]); // county→country, fair→far
    });

    it('uses gaps for completely different words instead of forced substitution', () => {
      // The core bug fix — "we" should NOT align with "free"
      const t = ['as', 'we', 'celebrate', 'the', '120th', 'anniversary', 'of'];
      const s = ['as', 'free', 'slip', 'res', 'uh', 'whatever', 'anniversary', 'of'];
      const a = alignWords(t, s);

      expect(a[0]).toBe(0); // as → as
      expect(a[1]).toBeNull(); // we → MISSED (not "free")
      expect(a[2]).toBeNull(); // celebrate → MISSED (not "slip")
      expect(a[3]).toBeNull(); // the → MISSED (not "res")
      expect(a[4]).toBeNull(); // 120th → MISSED (not "uh")
      expect(a[5]).toBe(6); // anniversary → anniversary
      expect(a[6]).toBe(7); // of → of
    });

    it('handles the full county-fair transcript scenario', () => {
      const target =
        "Good afternoon, everyone, and welcome to the county fair! It's wonderful to have you here today as we celebrate the 120th anniversary of our city.";
      const spoken =
        "Good afternoon, everyone. and welcome to the country fair. It's wonderful to have you here today as free slip res uh whatever. Chelsea anniversary of our city.";

      const tw = target.split(/\s+/);
      const sw = spoken.split(/\s+/);
      const a = alignWords(tw, sw);

      // Verify key alignments
      // "county" (index 7) should align with "country"
      expect(sw[a[7]!]).toBe('country');
      // "fair!" (index 8) should align with "fair."
      expect(normalize(sw[a[8]!])).toBe('fair');
      // "we" (index 17) should be MISSED
      expect(a[17]).toBeNull();
      // "celebrate" (index 18) should be MISSED
      expect(a[18]).toBeNull();
      // "the" (index 19) should be MISSED
      expect(a[19]).toBeNull();
      // "120th" (index 20) should be MISSED
      expect(a[20]).toBeNull();
      // "anniversary" (index 21) should match
      expect(normalize(sw[a[21]!])).toBe('anniversary');
      // "city." (index 24) should match
      expect(normalize(sw[a[24]!])).toBe('city');
    });

    it('handles empty spoken (all missed)', () => {
      const t = ['hello', 'world'];
      const s: string[] = [];
      const a = alignWords(t, s);
      expect(a).toEqual([null, null]);
    });

    it('handles empty target', () => {
      const t: string[] = [];
      const s = ['hello', 'world'];
      const a = alignWords(t, s);
      expect(a).toEqual([]);
    });

    it('handles duplicate words correctly', () => {
      // "to" appears twice in target — both should find matches
      const t = ['welcome', 'to', 'the', 'fair', 'to', 'have', 'fun'];
      const s = ['welcome', 'to', 'the', 'fair', 'to', 'have', 'fun'];
      const a = alignWords(t, s);
      expect(a).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it('handles repeated word in spoken (user stutters)', () => {
      const t = ['good', 'morning'];
      const s = ['good', 'good', 'morning'];
      const a = alignWords(t, s);
      expect(a[0]).not.toBeNull(); // good → one of the "good"s
      expect(a[1]).toBe(2); // morning → morning
    });
  });

  // ─── buildWordComparison ──────────────────────────────────
  describe('buildWordComparison', () => {
    it('marks exact matches as correct and fluent', () => {
      const wc = buildWordComparison('hello world', 'hello world');
      expect(wc).toHaveLength(2);
      expect(wc[0]).toMatchObject({
        target: 'hello',
        spoken: 'hello',
        correct: true,
        fluent: true,
      });
      expect(wc[1]).toMatchObject({
        target: 'world',
        spoken: 'world',
        correct: true,
        fluent: true,
      });
    });

    it('marks similar-but-wrong words as not correct', () => {
      const wc = buildWordComparison('the county fair', 'the country far');
      expect(wc[1]).toMatchObject({
        target: 'county',
        spoken: 'country',
        correct: false,
      });
      expect(wc[2]).toMatchObject({
        target: 'fair',
        spoken: 'far',
        correct: false,
      });
    });

    it('marks unspoken target words as missed', () => {
      const wc = buildWordComparison('good morning world', 'good world');
      expect(wc[1]).toMatchObject({
        target: 'morning',
        spoken: null,
        correct: false,
      });
    });

    it('does not force-align dissimilar words', () => {
      const wc = buildWordComparison(
        'as we celebrate anniversary',
        'as free slip anniversary',
      );
      const we = wc.find((w: any) => w.target === 'we');
      const celebrate = wc.find((w: any) => w.target === 'celebrate');
      expect(we!.spoken).toBeNull(); // missed, not "free"
      expect(celebrate!.spoken).toBeNull(); // missed, not "slip"
    });

    it('uses Transcribe confidence for fluency', () => {
      const items: TranscribeItem[] = [
        { content: 'hello', confidence: 0.95, startTime: 0, endTime: 0.5, type: 'pronunciation' },
        { content: 'world', confidence: 0.6, startTime: 0.6, endTime: 1.0, type: 'pronunciation' },
      ];
      const wc = buildWordComparison('hello world', 'hello world', items);
      expect(wc[0].fluent).toBe(true); // confidence 0.95 >= 0.85
      expect(wc[1].fluent).toBe(false); // confidence 0.6 < 0.85
    });

    it('marks word as not fluent when preceded by long pause', () => {
      const items: TranscribeItem[] = [
        { content: 'hello', confidence: 0.95, startTime: 0, endTime: 0.5, type: 'pronunciation' },
        { content: 'world', confidence: 0.95, startTime: 1.5, endTime: 2.0, type: 'pronunciation' },
      ];
      const wc = buildWordComparison('hello world', 'hello world', items);
      expect(wc[0].fluent).toBe(true);
      expect(wc[1].fluent).toBe(false); // gap 1.0s > 0.5s
    });

    it('strips punctuation when comparing', () => {
      const wc = buildWordComparison(
        "It's wonderful!",
        "it's wonderful",
      );
      expect(wc[0].correct).toBe(true);
      expect(wc[1].correct).toBe(true);
    });
  });

  // ─── computeScores ────────────────────────────────────────
  describe('computeScores', () => {
    it('gives 100% across the board for perfect match', () => {
      const wc = [
        { target: 'hello', spoken: 'hello', correct: true, confidence: 0.99, fluent: true },
        { target: 'world', spoken: 'world', correct: true, confidence: 0.98, fluent: true },
      ];
      const scores = computeScores(wc);
      expect(scores.accuracy.score).toBe(100);
      expect(scores.completeness.score).toBe(100);
      expect(scores.overall.status).toBe('master');
    });

    it('calculates accuracy as % of correct words', () => {
      const wc = [
        { target: 'the', spoken: 'the', correct: true, confidence: null, fluent: true },
        { target: 'county', spoken: 'country', correct: false, confidence: null, fluent: false },
        { target: 'fair', spoken: 'far', correct: false, confidence: null, fluent: false },
      ];
      const scores = computeScores(wc);
      expect(scores.accuracy.score).toBe(33); // 1/3
    });

    it('calculates completeness as % of words with any spoken match', () => {
      const wc = [
        { target: 'good', spoken: 'good', correct: true, confidence: null, fluent: true },
        { target: 'morning', spoken: null, correct: false, confidence: null, fluent: false },
        { target: 'world', spoken: null, correct: false, confidence: null, fluent: false },
      ];
      const scores = computeScores(wc);
      expect(scores.completeness.score).toBe(33); // 1/3
    });

    it('uses Transcribe confidence for pronunciation score', () => {
      const wc = [
        { target: 'a', spoken: 'a', correct: true, confidence: 0.90, fluent: true },
        { target: 'b', spoken: 'b', correct: true, confidence: 0.80, fluent: false },
      ];
      const scores = computeScores(wc);
      expect(scores.pronunciation.score).toBe(85); // avg(0.90, 0.80)*100
    });

    it('falls back to accuracy when no confidence data', () => {
      const wc = [
        { target: 'hello', spoken: 'hello', correct: true, confidence: null, fluent: true },
        { target: 'world', spoken: null, correct: false, confidence: null, fluent: false },
      ];
      const scores = computeScores(wc);
      expect(scores.pronunciation.score).toBe(scores.accuracy.score);
    });

    it('penalizes fluency for pauses in Transcribe items', () => {
      const wc = [
        { target: 'a', spoken: 'a', correct: true, confidence: 0.9, fluent: true },
        { target: 'b', spoken: 'b', correct: true, confidence: 0.9, fluent: true },
        { target: 'c', spoken: 'c', correct: true, confidence: 0.9, fluent: true },
      ];
      const items: TranscribeItem[] = [
        { content: 'a', confidence: 0.9, startTime: 0, endTime: 0.3, type: 'pronunciation' },
        { content: 'b', confidence: 0.9, startTime: 1.5, endTime: 1.8, type: 'pronunciation' }, // 1.2s gap → -10
        { content: 'c', confidence: 0.9, startTime: 2.5, endTime: 2.8, type: 'pronunciation' }, // 0.7s gap → -5
      ];
      const scores = computeScores(wc, items);
      expect(scores.fluency.score).toBe(85); // 100 - 10 - 5
    });

    it('assigns correct status thresholds', () => {
      const toStatus = (s: number) =>
        s >= 90 ? 'master' : s >= 70 ? 'good' : s >= 50 ? 'fair' : 'poor';
      expect(toStatus(95)).toBe('master');
      expect(toStatus(75)).toBe('good');
      expect(toStatus(55)).toBe('fair');
      expect(toStatus(30)).toBe('poor');

      // Verify the service uses the same thresholds
      const perfect = [
        { target: 'a', spoken: 'a', correct: true, confidence: 0.99, fluent: true },
      ];
      expect(computeScores(perfect).overall.status).toBe('master');

      const poor = [
        { target: 'a', spoken: null, correct: false, confidence: null, fluent: false },
        { target: 'b', spoken: null, correct: false, confidence: null, fluent: false },
        { target: 'c', spoken: null, correct: false, confidence: null, fluent: false },
      ];
      expect(computeScores(poor).overall.status).toBe('poor');
    });
  });
});
