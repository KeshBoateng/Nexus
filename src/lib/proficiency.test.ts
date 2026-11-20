import { describe, expect, it } from 'vitest';
import { estimateLevel, type Evidence } from './proficiency';
import { CATALOG, SUGGESTED_SKILLS, learningPlan } from './catalog';

const e = (kind: Evidence['kind'], strength: number): Evidence => ({ kind, strength });

describe('estimateLevel', () => {
  it('a single activity is never more than Beginner, however impressive', () => {
    expect(estimateLevel([]).level).toBe(0);
    expect(estimateLevel([e('certification', 3)]).level).toBe(1);
    expect(estimateLevel([e('work', 3)]).level).toBe(1);
  });
  it('Developing needs two items, one done independently', () => {
    expect(estimateLevel([e('exercise', 1), e('exercise', 1)]).level).toBe(1);
    expect(estimateLevel([e('exercise', 1), e('exercise', 2)]).level).toBe(2);
  });
  it('Proficient needs real project or work evidence', () => {
    const ex = [e('exercise', 2), e('exercise', 2), e('assessment', 1), e('certification', 1)];
    expect(estimateLevel(ex).level).toBe(2);
    expect(estimateLevel([...ex.slice(0, 3), e('project', 2)]).level).toBe(3);
  });
  it('Advanced needs breadth and things led or taught', () => {
    const base = [e('project', 2), e('project', 2), e('exercise', 2), e('assessment', 2), e('work', 3)];
    expect(estimateLevel([...base, e('project', 2)]).level).toBe(3);
    expect(estimateLevel([...base, e('teaching', 3)]).level).toBe(4);
  });
  it('explains what is needed next', () => {
    expect(estimateLevel([e('exercise', 1)]).next).toMatch(/independently/);
  });
});

describe('catalog', () => {
  it('every resource is https, uniquely identified, and tagged with suggested skills', () => {
    const all = new Set(Object.values(SUGGESTED_SKILLS).flat());
    const ids = new Set<string>();
    for (const r of CATALOG) {
      expect(r.url.startsWith('https://')).toBe(true);
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      for (const s of r.skills) expect(all.has(s)).toBe(true);
      expect(r.id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
  });

  it('learning plan drops introductory material once the user shows they know the basics', () => {
    const beginner = learningPlan('Data structures & algorithms', 1, new Set());
    expect(beginner.map((r) => r.difficulty)).toContain('intro');
    const developing = learningPlan('Data structures & algorithms', 2, new Set());
    expect(developing.every((r) => r.difficulty !== 'intro')).toBe(true);
    expect(developing.map((r) => r.id)).toEqual(['neetcode', 'mit-6006']);
  });

  it('excludes completed resources', () => {
    expect(learningPlan('Data structures & algorithms', 2, new Set(['neetcode'])).map((r) => r.id)).toEqual(['mit-6006']);
  });
});
