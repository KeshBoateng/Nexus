import { describe, expect, it } from 'vitest';
import { DEFAULT_GRADE_BANDS } from './gpa';
import { courseProgress, progressLine, projectedGpa, requiredBand } from './target';

const bands = DEFAULT_GRADE_BANDS;
const open = { final_mark: null, final_letter: null };

describe('requiredBand', () => {
  it('turns a target GPA into one grade to aim for', () => {
    expect(requiredBand(4, bands)?.letter).toBe('A');
    expect(requiredBand(3.5, bands)?.letter).toBe('B+');
    expect(requiredBand(3.6, bands)?.letter).toBe('A');
    expect(requiredBand(3, bands)?.letter).toBe('B');
  });
});

describe('courseProgress', () => {
  it('nothing graded yet', () => {
    expect(courseProgress(open, [{ weight: 30, score: null, max_score: 20 }], 80)).toMatchObject({ standing: 'no_data', needed: 80 });
  });
  it('on track: a strong quiz and midsem', () => {
    const p = courseProgress(open, [
      { weight: 10, score: 9, max_score: 10 },
      { weight: 30, score: 25, max_score: 30 },
    ], 80);
    // earned 9 + 25 = 34 of 40 → 85%; need (80-34)/60 = 76.7% on the rest
    expect(p).toEqual({ standing: 'on_track', graded: 40, earned: 34, soFar: 85, needed: 76.7 });
  });
  it('behind but reachable', () => {
    const p = courseProgress(open, [{ weight: 40, score: 28, max_score: 40 }], 80);
    // 28/40 → 70%, earned 28; need (80-28)/60 = 86.7%
    expect(p).toMatchObject({ standing: 'behind', soFar: 70, needed: 86.7 });
  });
  it('out of reach', () => {
    expect(courseProgress(open, [{ weight: 60, score: 20, max_score: 60 }], 80).standing).toBe('out_of_reach');
  });
  it('a final mark overrides', () => {
    expect(courseProgress({ final_mark: 82, final_letter: null }, [], 80).standing).toBe('final');
  });
});

describe('projectedGpa / progressLine', () => {
  it('projects from final grades and graded work so far', () => {
    const a = courseProgress(open, [{ weight: 40, score: 34, max_score: 40 }], 80); // 85 → A
    const b = courseProgress(open, [{ weight: 30, score: 22.5, max_score: 30 }], 80); // 75 → B+
    const c = courseProgress(open, [], 80); // nothing yet → excluded
    expect(
      projectedGpa(
        [
          { credit_hours: 3, ...open, progress: a },
          { credit_hours: 3, ...open, progress: b },
          { credit_hours: 2, ...open, progress: c },
        ],
        bands,
      ),
    ).toBe(3.75);
    expect(projectedGpa([{ credit_hours: 3, ...open, progress: c }], bands)).toBeNull();
  });
  it('explains the standing in one sentence', () => {
    const A = requiredBand(4, bands);
    expect(progressLine(courseProgress(open, [], 80), A)).toBe('Aim for A (80+). Add marks as you get them back.');
    expect(progressLine(courseProgress(open, [{ weight: 40, score: 28, max_score: 40 }], 80), A)).toBe('Behind: 70% on 40% graded. Need 86.7% on the remaining 60% for A (80+).');
  });
});
