import { matchAnswer, getAcceptedForms } from './answer-matcher';

describe('answer-matcher', () => {
  describe('matchAnswer', () => {
    // Simple exact match (case-insensitive)
    it('matches simple answers case-insensitively', () => {
      expect(matchAnswer('sylvia', 'SYLVIA')).toBe(true);
      expect(matchAnswer('Sylvia', 'SYLVIA')).toBe(true);
      expect(matchAnswer('SYLVIA', 'SYLVIA')).toBe(true);
      expect(matchAnswer('wrong', 'SYLVIA')).toBe(false);
    });

    // Slash alternatives
    it('matches slash alternatives', () => {
      expect(matchAnswer('two', 'TWO/2')).toBe(true);
      expect(matchAnswer('2', 'TWO/2')).toBe(true);
      expect(matchAnswer('three', 'TWO/2')).toBe(false);
    });

    // Optional parts with ()
    it('matches with optional parts present or absent', () => {
      expect(matchAnswer('on holiday', '(ON) HOLIDAY')).toBe(true);
      expect(matchAnswer('holiday', '(ON) HOLIDAY')).toBe(true);
      expect(matchAnswer('off holiday', '(ON) HOLIDAY')).toBe(false);
    });

    // [OR] groups
    it('matches any OR group', () => {
      expect(matchAnswer('26th of july', '26TH (OF) JULY [OR] JULY 26(TH) [OR] 26 JULY')).toBe(true);
      expect(matchAnswer('26th july', '26TH (OF) JULY [OR] JULY 26(TH) [OR] 26 JULY')).toBe(true);
      expect(matchAnswer('july 26th', '26TH (OF) JULY [OR] JULY 26(TH) [OR] 26 JULY')).toBe(true);
      expect(matchAnswer('july 26', '26TH (OF) JULY [OR] JULY 26(TH) [OR] 26 JULY')).toBe(true);
      expect(matchAnswer('26 july', '26TH (OF) JULY [OR] JULY 26(TH) [OR] 26 JULY')).toBe(true);
      expect(matchAnswer('26th', '26TH (OF) JULY [OR] JULY 26(TH) [OR] 26 JULY')).toBe(false);
    });

    // Combined: OR + optional + slash
    // Pattern: (THE) MOTORWAY [OR] (THE) M1/MOTORWAY ACCESS
    // OR group 1: (THE) MOTORWAY → "the motorway", "motorway"
    // OR group 2: (THE) M1/MOTORWAY ACCESS → slash splits into "(THE) M1" and "MOTORWAY ACCESS"
    //   → "the m1", "m1", "motorway access"
    it('matches combined patterns', () => {
      const pattern = '(THE) MOTORWAY [OR] (THE) M1/MOTORWAY ACCESS';
      expect(matchAnswer('the motorway', pattern)).toBe(true);
      expect(matchAnswer('motorway', pattern)).toBe(true);
      expect(matchAnswer('the m1', pattern)).toBe(true);
      expect(matchAnswer('m1', pattern)).toBe(true);
      expect(matchAnswer('motorway access', pattern)).toBe(true);
      expect(matchAnswer('highway', pattern)).toBe(false);
    });

    // Hyphen tolerance
    it('treats hyphens as spaces', () => {
      expect(matchAnswer('well known', 'WELL-KNOWN')).toBe(true);
      expect(matchAnswer('well-known', 'WELL-KNOWN')).toBe(true);
    });

    // Whitespace normalization
    it('normalizes whitespace', () => {
      expect(matchAnswer('  some   answer  ', 'SOME ANSWER')).toBe(true);
    });

    // Null/empty handling
    it('returns false for null/empty inputs', () => {
      expect(matchAnswer(null, 'ANSWER')).toBe(false);
      expect(matchAnswer('answer', null)).toBe(false);
      expect(matchAnswer('', 'ANSWER')).toBe(false);
      expect(matchAnswer('answer', '')).toBe(false);
    });

    // Simple answers still work (backward compatibility)
    it('works for plain MCQ-style answers', () => {
      expect(matchAnswer('A', 'A')).toBe(true);
      expect(matchAnswer('B', 'A')).toBe(false);
      expect(matchAnswer('TRUE', 'TRUE')).toBe(true);
    });
  });

  describe('getAcceptedForms', () => {
    it('returns all accepted forms for complex pattern', () => {
      const forms = getAcceptedForms('(THE) MOTORWAY [OR] (THE) M1/MOTORWAY ACCESS');
      expect(forms).toContain('the motorway');
      expect(forms).toContain('motorway');
      expect(forms).toContain('the m1');
      expect(forms).toContain('m1');
      expect(forms).toContain('motorway access');
    });

    it('returns empty array for empty input', () => {
      expect(getAcceptedForms('')).toEqual([]);
    });

    it('auto-combines time suffixes with main answers', () => {
      // "10/TEN O'CLOCK/A.M./AM" — A.M. and AM are suffix modifiers
      const forms = getAcceptedForms('10/TEN O\'CLOCK/A.M./AM');
      expect(forms).toContain('10');
      expect(forms).toContain("ten o'clock");
      expect(forms).toContain('10 am');           // main + suffix
      expect(forms).toContain("ten o'clock am");  // main + suffix
      // "am" alone should NOT be accepted
      expect(forms).not.toContain('am');
    });

    it('handles slash inside optional groups as alternatives', () => {
      const forms = getAcceptedForms('10 (A.M./AM) [OR] TEN O\'CLOCK');
      expect(forms).toContain('10 am');
      expect(forms).toContain('10');
      expect(forms).toContain("ten o'clock");
      expect(forms).not.toContain('am');
    });

    it('does not split slash inside parentheses', () => {
      const forms = getAcceptedForms('10 (A.M./AM)/TEN O\'CLOCK');
      expect(forms).toContain('10 am');
      expect(forms).toContain('10');
      expect(forms).toContain("ten o'clock");
      expect(forms).not.toContain('am');
    });

    it('auto-combines currency prefix with main answers', () => {
      // "1/ONE POUND/£" — £ is a prefix modifier
      const forms = getAcceptedForms('1/ONE POUND/£');
      expect(forms).toContain('1');
      expect(forms).toContain('one pound');
      expect(forms).toContain('£1');          // prefix + main
      expect(forms).toContain('£one pound');  // prefix + main
      // "£" alone should NOT be accepted
      expect(forms).not.toContain('£');
    });

    it('strips abbreviation dots but preserves decimal points', () => {
      expect(getAcceptedForms('1.50')).toEqual(['1.50']);
      expect(getAcceptedForms('£1.50')).toEqual(['£1.50']);
    });

    it('falls back to all-as-mains when only modifiers exist', () => {
      // Edge case: if all tokens are modifiers, treat them all as mains
      const forms = getAcceptedForms('AM/PM');
      expect(forms).toContain('am');
      expect(forms).toContain('pm');
    });

    it('handles currency pattern with optional symbol', () => {
      const forms = getAcceptedForms('(£)1 [OR] ONE POUND');
      expect(forms).toContain('£1');
      expect(forms).toContain('1');
      expect(forms).toContain('one pound');
      expect(forms).not.toContain('£');
    });
  });

  describe('matchAnswer – additional edge cases', () => {
    it('matches A.M. and AM as equivalent', () => {
      expect(matchAnswer('a.m.', 'AM')).toBe(true);
      expect(matchAnswer('AM', 'A.M.')).toBe(true);
      expect(matchAnswer('am', 'A.M.')).toBe(true);
    });

    it('preserves decimal matching', () => {
      expect(matchAnswer('1.50', '1.50')).toBe(true);
      expect(matchAnswer('150', '1.50')).toBe(false);
    });

    it('matches time with auto-combined suffix', () => {
      expect(matchAnswer('10 am', '10/TEN O\'CLOCK/A.M./AM')).toBe(true);
      expect(matchAnswer('10', '10/TEN O\'CLOCK/A.M./AM')).toBe(true);
      expect(matchAnswer('ten o\'clock', '10/TEN O\'CLOCK/A.M./AM')).toBe(true);
      expect(matchAnswer('am', '10/TEN O\'CLOCK/A.M./AM')).toBe(false);
    });

    it('matches currency with auto-combined prefix', () => {
      expect(matchAnswer('£1', '1/ONE POUND/£')).toBe(true);
      expect(matchAnswer('1', '1/ONE POUND/£')).toBe(true);
      expect(matchAnswer('£', '1/ONE POUND/£')).toBe(false);
    });
  });
});
