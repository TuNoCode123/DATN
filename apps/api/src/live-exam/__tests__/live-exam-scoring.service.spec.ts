import { LiveExamScoringService } from '../live-exam-scoring.service';

describe('LiveExamScoringService', () => {
  const svc = new LiveExamScoringService();
  const base = 1000;
  const perQuestionSec = 20;

  it('awards full points when answered instantly', () => {
    expect(
      svc.score({ isCorrect: true, answeredMs: 0, perQuestionSec, basePoints: base }),
    ).toBe(1000);
  });

  it('awards half points when answered at the final millisecond', () => {
    expect(
      svc.score({
        isCorrect: true,
        answeredMs: perQuestionSec * 1000,
        perQuestionSec,
        basePoints: base,
      }),
    ).toBe(500);
  });

  it('awards intermediate points on the linear curve (midpoint = 750)', () => {
    expect(
      svc.score({
        isCorrect: true,
        answeredMs: (perQuestionSec * 1000) / 2,
        perQuestionSec,
        basePoints: base,
      }),
    ).toBe(750);
  });

  it('awards zero when the answer is wrong regardless of speed', () => {
    expect(
      svc.score({ isCorrect: false, answeredMs: 0, perQuestionSec, basePoints: base }),
    ).toBe(0);
  });

  it('awards zero on timeout (selectedOption null → answeredMs null)', () => {
    expect(
      svc.score({
        isCorrect: false,
        answeredMs: null,
        perQuestionSec,
        basePoints: base,
      }),
    ).toBe(0);
  });

  it('clamps the score to an integer', () => {
    const result = svc.score({
      isCorrect: true,
      answeredMs: 7_333,
      perQuestionSec,
      basePoints: base,
    });
    expect(Number.isInteger(result)).toBe(true);
  });

  it('never exceeds basePoints even if answeredMs is negative due to clock skew', () => {
    expect(
      svc.score({
        isCorrect: true,
        answeredMs: -500,
        perQuestionSec,
        basePoints: base,
      }),
    ).toBeLessThanOrEqual(base);
  });

  it('never drops below half basePoints when over-time but still correct', () => {
    expect(
      svc.score({
        isCorrect: true,
        answeredMs: perQuestionSec * 1000 + 5_000,
        perQuestionSec,
        basePoints: base,
      }),
    ).toBe(500);
  });
});
