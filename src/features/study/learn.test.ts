import { describe, expect, it } from 'vitest';
import { nextSection, statusFor, understoodCount, type SectionProgress } from './learn';

const sec = (i: number) => ({ index: i, start: 0, end: 1, fromPage: i, toPage: i, approximate: false });
const prog = (section: number, status: SectionProgress['status']): SectionProgress => ({ id: `p${section}`, section, status, score: null, attempts: 1 });

describe('Learn mode progress', () => {
  it('self-check sets the status; the pass mark is 70%', () => {
    expect(statusFor(3, 4)).toEqual({ score: 75, status: 'understood' });
    expect(statusFor(2, 3)).toEqual({ score: 67, status: 'review' });
    expect(statusFor(0, 0)).toEqual({ score: 0, status: 'review' });
  });

  it('continues with sections to review first, then the first new one', () => {
    const sections = [1, 2, 3, 4].map(sec);
    expect(nextSection({ sections, progress: new Map() })).toBe(1);
    expect(nextSection({ sections, progress: new Map([[1, prog(1, 'understood')], [2, prog(2, 'understood')]]) })).toBe(3);
    expect(nextSection({ sections, progress: new Map([[1, prog(1, 'understood')], [3, prog(3, 'review')]]) })).toBe(3);
    const all = new Map([1, 2, 3, 4].map((i) => [i, prog(i, 'understood')] as const));
    expect(nextSection({ sections, progress: all })).toBeNull();
    expect(understoodCount({ progress: all })).toBe(4);
  });
});
