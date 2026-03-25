import { ScoringService } from './scoring.service';

describe('ScoringService', () => {
  let service: ScoringService;

  beforeEach(() => {
    service = new ScoringService();
  });

  // ─── IELTS Band Score Conversion ────────────────────────────────────────────

  describe('getIeltsBandScore', () => {
    describe('Listening', () => {
      it('should return band 9.0 for 39-40 correct', () => {
        expect(service.getIeltsBandScore('LISTENING', 39)).toBe(9.0);
        expect(service.getIeltsBandScore('LISTENING', 40)).toBe(9.0);
      });

      it('should return band 8.5 for 37-38 correct', () => {
        expect(service.getIeltsBandScore('LISTENING', 37)).toBe(8.5);
        expect(service.getIeltsBandScore('LISTENING', 38)).toBe(8.5);
      });

      it('should return band 6.0 for 23-25 correct', () => {
        expect(service.getIeltsBandScore('LISTENING', 23)).toBe(6.0);
        expect(service.getIeltsBandScore('LISTENING', 25)).toBe(6.0);
      });

      it('should return band 5.0 for 16-17 correct', () => {
        expect(service.getIeltsBandScore('LISTENING', 16)).toBe(5.0);
        expect(service.getIeltsBandScore('LISTENING', 17)).toBe(5.0);
      });

      it('should return band 0 for 0 correct', () => {
        expect(service.getIeltsBandScore('LISTENING', 0)).toBe(0);
      });

      it('should return band 4.0 for 10-12 correct', () => {
        expect(service.getIeltsBandScore('LISTENING', 10)).toBe(4.0);
        expect(service.getIeltsBandScore('LISTENING', 12)).toBe(4.0);
      });

      it('should return band 7.0 for 30-31 correct', () => {
        expect(service.getIeltsBandScore('LISTENING', 30)).toBe(7.0);
        expect(service.getIeltsBandScore('LISTENING', 31)).toBe(7.0);
      });
    });

    describe('Academic Reading', () => {
      it('should return band 9.0 for 40 correct', () => {
        expect(service.getIeltsBandScore('READING', 40, 'IELTS_ACADEMIC')).toBe(9.0);
      });

      it('should return band 6.0 for 23-26 correct', () => {
        expect(service.getIeltsBandScore('READING', 23, 'IELTS_ACADEMIC')).toBe(6.0);
        expect(service.getIeltsBandScore('READING', 26, 'IELTS_ACADEMIC')).toBe(6.0);
      });

      it('should return band 5.0 for 15-18 correct', () => {
        expect(service.getIeltsBandScore('READING', 15, 'IELTS_ACADEMIC')).toBe(5.0);
        expect(service.getIeltsBandScore('READING', 18, 'IELTS_ACADEMIC')).toBe(5.0);
      });

      it('should return band 7.0 for 30-32 correct', () => {
        expect(service.getIeltsBandScore('READING', 30, 'IELTS_ACADEMIC')).toBe(7.0);
        expect(service.getIeltsBandScore('READING', 32, 'IELTS_ACADEMIC')).toBe(7.0);
      });

      it('should return band 0 for 0 correct', () => {
        expect(service.getIeltsBandScore('READING', 0, 'IELTS_ACADEMIC')).toBe(0);
      });
    });

    describe('General Training Reading', () => {
      it('should return band 9.0 for 40 correct', () => {
        expect(service.getIeltsBandScore('READING', 40, 'IELTS_GENERAL')).toBe(9.0);
      });

      it('should return band 6.0 for 30-31 correct (General has higher thresholds)', () => {
        expect(service.getIeltsBandScore('READING', 30, 'IELTS_GENERAL')).toBe(6.0);
        expect(service.getIeltsBandScore('READING', 31, 'IELTS_GENERAL')).toBe(6.0);
      });

      it('should return band 5.0 for 23-25 correct', () => {
        expect(service.getIeltsBandScore('READING', 23, 'IELTS_GENERAL')).toBe(5.0);
        expect(service.getIeltsBandScore('READING', 25, 'IELTS_GENERAL')).toBe(5.0);
      });
    });

    it('should default to Academic reading when examType not specified', () => {
      expect(service.getIeltsBandScore('READING', 30)).toBe(7.0);
    });
  });

  describe('calculateIeltsOverallBand', () => {
    it('should average and round to nearest 0.5', () => {
      // 7.0 + 6.5 = 13.5 / 2 = 6.75 → rounds to 7.0
      expect(service.calculateIeltsOverallBand([7.0, 6.5])).toBe(7.0);
    });

    it('should round 6.25 to 6.5', () => {
      // 6.0 + 6.5 = 12.5 / 2 = 6.25 → rounds to 6.5
      expect(service.calculateIeltsOverallBand([6.0, 6.5])).toBe(6.5);
    });

    it('should handle single skill', () => {
      expect(service.calculateIeltsOverallBand([7.5])).toBe(7.5);
    });

    it('should handle four skills', () => {
      // 7.0 + 7.5 + 6.0 + 6.5 = 27.0 / 4 = 6.75 → rounds to 7.0
      expect(service.calculateIeltsOverallBand([7.0, 7.5, 6.0, 6.5])).toBe(7.0);
    });

    it('should round .125 down to .0', () => {
      // 6.0 + 6.0 + 6.0 + 6.5 = 24.5 / 4 = 6.125 → rounds to 6.0
      expect(service.calculateIeltsOverallBand([6.0, 6.0, 6.0, 6.5])).toBe(6.0);
    });
  });

  // ─── TOEIC Scaled Score Conversion ──────────────────────────────────────────

  describe('getToeicScaledScore', () => {
    describe('Listening', () => {
      it('should return 495 for 100 correct', () => {
        expect(service.getToeicScaledScore('LISTENING', 100)).toBe(495);
      });

      it('should return 5 for 0 correct', () => {
        expect(service.getToeicScaledScore('LISTENING', 0)).toBe(5);
      });

      it('should return score in valid range for mid values', () => {
        const score = service.getToeicScaledScore('LISTENING', 50);
        expect(score).toBeGreaterThanOrEqual(5);
        expect(score).toBeLessThanOrEqual(495);
        // score should be divisible by 5
        expect(score % 5).toBe(0);
      });

      it('should return approximately 275 for 50 correct', () => {
        const score = service.getToeicScaledScore('LISTENING', 50);
        expect(score).toBeGreaterThanOrEqual(245);
        expect(score).toBeLessThanOrEqual(305);
      });
    });

    describe('Reading', () => {
      it('should return 495 for 100 correct', () => {
        expect(service.getToeicScaledScore('READING', 100)).toBe(495);
      });

      it('should return 5 for 0 correct', () => {
        expect(service.getToeicScaledScore('READING', 0)).toBe(5);
      });

      it('should return score in valid range', () => {
        const score = service.getToeicScaledScore('READING', 75);
        expect(score).toBeGreaterThanOrEqual(5);
        expect(score).toBeLessThanOrEqual(495);
        expect(score % 5).toBe(0);
      });
    });
  });

  describe('calculateToeicTotalScore', () => {
    it('should sum listening and reading scaled scores', () => {
      expect(service.calculateToeicTotalScore(420, 365)).toBe(785);
    });

    it('should return 990 for perfect scores', () => {
      expect(service.calculateToeicTotalScore(495, 495)).toBe(990);
    });

    it('should return 10 for minimum scores', () => {
      expect(service.calculateToeicTotalScore(5, 5)).toBe(10);
    });
  });

  // ─── Full Attempt Scoring ──────────────────────────────────────────────────

  describe('calculateAttemptScores', () => {
    it('should calculate IELTS scores with section breakdown', () => {
      const result = service.calculateAttemptScores(
        'IELTS_ACADEMIC',
        [
          { skill: 'LISTENING', correct: 30, total: 40 },
          { skill: 'READING', correct: 35, total: 40 },
        ],
      );

      expect(result.bandScore).toBeDefined();
      expect(result.scaledScore).toBeNull();
      expect(result.sectionScores).toBeDefined();

      const listening = result.sectionScores.listening as any;
      expect(listening).toBeDefined();
      expect(listening.correct).toBe(30);
      expect(listening.total).toBe(40);
      expect(listening.band).toBeGreaterThanOrEqual(1);

      const reading = result.sectionScores.reading as any;
      expect(reading).toBeDefined();
      expect(reading.correct).toBe(35);
      expect(reading.band).toBeGreaterThanOrEqual(1);
    });

    it('should calculate TOEIC scores with section breakdown', () => {
      const result = service.calculateAttemptScores(
        'TOEIC_LR',
        [
          { skill: 'LISTENING', correct: 85, total: 100 },
          { skill: 'READING', correct: 78, total: 100 },
        ],
      );

      expect(result.bandScore).toBeNull();
      expect(result.scaledScore).toBeDefined();
      expect(result.scaledScore).toBeGreaterThanOrEqual(10);
      expect(result.scaledScore).toBeLessThanOrEqual(990);
      expect(result.sectionScores).toBeDefined();

      const listening = result.sectionScores.listening as any;
      expect(listening).toBeDefined();
      expect(listening.correct).toBe(85);
      expect(listening.scaled).toBeDefined();

      const reading = result.sectionScores.reading as any;
      expect(reading).toBeDefined();
      expect(reading.correct).toBe(78);
      expect(reading.scaled).toBeDefined();
    });

    it('should handle single-skill IELTS attempt (listening only)', () => {
      const result = service.calculateAttemptScores(
        'IELTS_ACADEMIC',
        [{ skill: 'LISTENING', correct: 25, total: 40 }],
      );

      expect(result.bandScore).toBeDefined();
      expect(result.sectionScores.listening).toBeDefined();
      expect(result.sectionScores.reading).toBeUndefined();
    });
  });
});
