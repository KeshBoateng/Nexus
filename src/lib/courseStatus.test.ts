import { describe, expect, it } from 'vitest';
import { courseStatus, courseStudy, currentTerm, statusSummary, studyLine, termStatus } from './courseStatus';

const today = '2026-11-20';
const noDates = { starts_on: null, ends_on: null };
const ended = { starts_on: '2026-01-10', ends_on: '2026-05-30' };
const future = { starts_on: '2027-01-12', ends_on: '2027-05-30' };
const now = { starts_on: '2026-08-15', ends_on: '2026-12-20' };

describe('courseStatus', () => {
  it('a recorded mark or grade means completed, whatever the dates', () => {
    expect(courseStatus({ final_mark: 72, final_letter: null }, now, today)).toBe('completed');
    expect(courseStatus({ final_mark: null, final_letter: 'B+' }, future, today)).toBe('completed');
  });
  it('without a result: taking now, awaiting result, or upcoming by semester dates', () => {
    const blank = { final_mark: null, final_letter: null };
    expect(courseStatus(blank, now, today)).toBe('taking');
    expect(courseStatus(blank, noDates, today)).toBe('taking');
    expect(courseStatus(blank, ended, today)).toBe('awaiting');
    expect(courseStatus(blank, future, today)).toBe('upcoming');
  });
});

describe('termStatus', () => {
  it('summarises a semester', () => {
    expect(termStatus(['completed', 'completed'], ended, today)).toBe('completed');
    expect(termStatus(['completed', 'taking'], now, today)).toBe('current');
    expect(termStatus(['completed', 'awaiting'], ended, today)).toBe('awaiting');
    expect(termStatus(['upcoming'], future, today)).toBe('upcoming');
    expect(termStatus([], future, today)).toBe('upcoming');
    expect(termStatus([], now, today)).toBe('empty');
  });
});

describe('courseStudy', () => {
  it('rolls files and Learn progress up to each course', () => {
    const s = courseStudy(
      [
        { id: 'm1', course_id: 'c1' },
        { id: 'm2', course_id: 'c1' },
        { id: 'm3', course_id: null },
      ],
      [
        { material_id: 'm1', status: 'understood' },
        { material_id: 'm1', status: 'understood' },
        { material_id: 'm1', status: 'review' },
        { material_id: 'm3', status: 'understood' },
      ],
      [
        { material_id: 'm1', sections_total: 14 },
        { material_id: 'm1', sections_total: 14 },
      ],
    );
    expect(s.get('c1')).toEqual({ files: 2, understood: 2, total: 14, review: 1 });
    expect(s.has('null')).toBe(false);
  });
});

describe('studyLine / statusSummary', () => {
  it('describes a course’s study files', () => {
    expect(studyLine(undefined)).toBe('No study files yet — add some');
    expect(studyLine({ files: 1, understood: 0, total: 0, review: 0 })).toBe('1 file · not started in Learn');
    expect(studyLine({ files: 3, understood: 9, total: 14, review: 2 })).toBe('3 files · 9 of 14 sections understood · 2 to review');
  });
  it('summarises course counts', () => {
    expect(statusSummary({ completed: 5, taking: 2, awaiting: 1, upcoming: 0 })).toBe('2 taking now · 1 awaiting result · 5 completed');
  });
});

describe('currentTerm', () => {
  const t = (id: string, starts_on: string | null, ends_on: string | null, created_at = '2026-01-01T00:00:00Z') => ({ id, starts_on, ends_on, created_at });
  it('picks the semester you are in now', () => {
    expect(currentTerm([t('old', '2026-01-10', '2026-05-30'), t('now', '2026-08-15', '2026-12-20')], today)?.id).toBe('now');
  });
  it('falls back to the latest started, then upcoming, and handles no dates', () => {
    expect(currentTerm([t('old', '2026-01-10', '2026-05-30'), t('next', '2027-01-12', null)], today)?.id).toBe('old');
    expect(currentTerm([t('next', '2027-01-12', null)], today)?.id).toBe('next');
    expect(currentTerm([t('nodates', null, null)], today)?.id).toBe('nodates');
    expect(currentTerm([], today)).toBeNull();
  });
});
