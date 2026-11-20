import { describe, expect, it } from 'vitest';
import { DEFAULT_GRADE_BANDS as B, bandForMark, computeGpa, formatGpa, resolveGrade, validateBands } from './gpa';

const course = (credit_hours: number, final_mark: number | null, final_letter: string | null = null) => ({
  credit_hours,
  final_mark,
  final_letter,
});

describe('bandForMark (Owner scale: A = 80–100, 5-mark steps)', () => {
  it.each([
    [100, 'A'],
    [80, 'A'],
    [79.99, 'B+'],
    [79.5, 'B+'],
    [75, 'B+'],
    [74, 'B'],
    [70, 'B'],
    [69, 'C+'],
    [60, 'C'],
    [55, 'D+'],
    [50, 'D'],
    [45, 'E'],
    [44.99, 'F'],
    [0, 'F'],
  ])('%d → %s', (mark, letter) => {
    expect(bandForMark(mark, B)?.letter).toBe(letter);
  });

  it('rejects out-of-range marks', () => {
    expect(bandForMark(-1, B)).toBeNull();
    expect(bandForMark(100.01, B)).toBeNull();
    expect(bandForMark(Number.NaN, B)).toBeNull();
  });
});

describe('resolveGrade', () => {
  it('prefers mark over letter', () => {
    expect(resolveGrade(course(3, 82, 'C'), B)).toEqual({ letter: 'A', points: 4 });
  });
  it('uses a letter when no mark', () => {
    expect(resolveGrade(course(3, null, 'B+'), B)).toEqual({ letter: 'B+', points: 3.5 });
  });
  it('treats no mark and no letter as in progress', () => {
    expect(resolveGrade(course(3, null), B)).toBeNull();
  });
});

describe('computeGpa', () => {
  it('weights by credit hours', () => {
    // A(4.0)×3 + B(3.0)×2 + C+(2.5)×1 = 12 + 6 + 2.5 = 20.5 / 6 = 3.41666… → 3.42
    const r = computeGpa([course(3, 85), course(2, 72), course(1, 66)], B);
    expect(r).toMatchObject({ gpa: 3.42, gradedCredits: 6, qualityPointsX100: 2050, inProgressCredits: 0 });
  });

  it('counts F credits but excludes in-progress courses', () => {
    const r = computeGpa([course(3, 90), course(3, 30), course(3, null)], B);
    expect(r).toMatchObject({ gpa: 2, gradedCredits: 6, inProgressCredits: 3 });
  });

  it('rounds half up exactly (no float drift)', () => {
    // 3.5×1 + 3.0×1 + 3.0×2 = 12.5 / 4 = 3.125 → 3.13
    expect(computeGpa([course(1, 76), course(1, 71), course(2, 70)], B).gpa).toBe(3.13);
    // 2.5×1 + 2.0×1 = 4.5 / 2 = 2.25 exactly
    expect(computeGpa([course(1, 66), course(1, 61)], B).gpa).toBe(2.25);
  });

  it('returns null with nothing graded', () => {
    expect(computeGpa([], B).gpa).toBeNull();
    expect(computeGpa([course(3, null)], B).gpa).toBeNull();
    expect(formatGpa(null)).toBe('—');
  });

  it('CGPA over several terms equals pooled credit-weighted average, not the mean of GPAs', () => {
    const term1 = [course(3, 85), course(3, 85)]; // 4.00 over 6 credits
    const term2 = [course(2, 61)]; // 2.00 over 2 credits
    const cgpa = computeGpa([...term1, ...term2], B).gpa;
    expect(cgpa).toBe(3.5); // (24 + 4) / 8 — the mean of GPAs would wrongly give 3.00
  });

  it('rejects invalid credit hours', () => {
    expect(() => computeGpa([course(0, 80)], B)).toThrow();
    expect(() => computeGpa([course(1.5, 80)], B)).toThrow();
  });
});

describe('validateBands', () => {
  it('accepts the default scale', () => {
    expect(validateBands(B)).toEqual([]);
  });
  it('reports overlaps and gaps', () => {
    const broken = [
      { letter: 'A', min_mark: 70, max_mark: 100, points: 4 },
      { letter: 'B', min_mark: 60, max_mark: 75, points: 3 },
      { letter: 'F', min_mark: 0, max_mark: 50, points: 0 },
    ];
    const issues = validateBands(broken);
    expect(issues.some((i) => i.includes('overlap'))).toBe(true);
    expect(issues.some((i) => i.includes('Gap'))).toBe(true);
  });
});
