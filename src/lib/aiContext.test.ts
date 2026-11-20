import { describe, expect, it } from 'vitest';
import { buildAiContext, renderContext, type MemoryItem } from './aiContext';

const m = (content: string, o: Partial<MemoryItem> = {}): MemoryItem => ({
  id: content,
  content,
  kind: 'fact',
  topic: 'personal',
  ai_visible: true,
  sensitive: false,
  expires_on: null,
  confirmed_at: null,
  source: 'user',
  ...o,
});

const memories = [
  m('Wants to own a software company'),
  m('Prefers practical exercises', { kind: 'preference' }),
  m('Studies best late at night', { kind: 'hypothesis', source: 'ai' }),
  m('Has a medical condition', { sensitive: true, ai_visible: false }),
  m('Private note', { ai_visible: false }),
  m('Exams this week', { kind: 'temporary', expires_on: '2026-11-10' }),
  m('Group project deadline Friday', { kind: 'temporary', expires_on: '2026-11-30' }),
];

describe('buildAiContext', () => {
  it('sends nothing when AI is off, whatever the permissions', () => {
    const out = buildAiContext({ aiEnabled: false, permissions: { memories: true, finances: true }, today: '2026-11-20', memories, summaries: { finances: ['x'] } });
    expect(out.sections).toEqual([]);
    expect(renderContext(out)).toBe('');
  });

  it('sends only permitted categories', () => {
    const out = buildAiContext({
      aiEnabled: true,
      permissions: { academics: true },
      today: '2026-11-20',
      memories,
      summaries: { academics: ['CGPA 3.42'], finances: ['Net worth GHS 500'] },
    });
    expect(out.sections).toEqual([{ category: 'academics', lines: ['CGPA 3.42'] }]);
    expect(out.withheld.categoriesOff).toContain('finances');
    expect(out.withheld.categoriesOff).toContain('memories');
  });

  it('filters memories: no sensitive, hidden or expired; labels guesses as unconfirmed', () => {
    const out = buildAiContext({ aiEnabled: true, permissions: { memories: true }, today: '2026-11-20', memories });
    expect(out.sections[0]!.lines).toEqual([
      'Wants to own a software company',
      'Preference: Prefers practical exercises',
      'Unconfirmed guess: Studies best late at night',
      'Currently: Group project deadline Friday',
    ]);
    expect(out.withheld).toMatchObject({ sensitive: 1, hidden: 1, expired: 1 });
    const text = renderContext(out);
    expect(text).not.toContain('medical');
    expect(text).not.toContain('Private note');
  });

  it('treats a missing permission as not allowed', () => {
    const out = buildAiContext({ aiEnabled: true, permissions: {}, today: '2026-11-20', memories });
    expect(out.sections).toEqual([]);
  });
});
