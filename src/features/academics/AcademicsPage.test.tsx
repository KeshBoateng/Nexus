import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { DEFAULT_GRADE_BANDS } from '../../lib/gpa';
import type { AcademicsData } from './api';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let data: AcademicsData;
const base = (): AcademicsData => ({
  bands: DEFAULT_GRADE_BANDS.map((b, i) => ({ id: uuid(100 + i), ...b })),
  terms: [{ id: uuid(1), name: 'L200 Sem 1', starts_on: null, ends_on: null, target_gpa: 4, created_at: '2026-09-01T00:00:00Z' }],
  courses: [
    { id: uuid(2), term_id: uuid(1), code: 'DCIT 201', title: 'Programming II', credit_hours: 3, final_mark: null, final_letter: null },
    { id: uuid(3), term_id: uuid(1), code: 'MATH 223', title: 'Calculus', credit_hours: 3, final_mark: null, final_letter: null },
    { id: uuid(4), term_id: uuid(1), code: 'UGRC 220', title: 'Critical Thinking', credit_hours: 2, final_mark: null, final_letter: null },
  ],
  assessments: [
    // Programming II: midsem 34/40, worth 40% → 85% so far, on track for A
    { id: uuid(5), course_id: uuid(2), title: 'Midsem', kind: 'midterm', due_at: null, weight: 40, score: 34, max_score: 40, completed_at: '2026-10-20T00:00:00Z' },
    // Calculus: quiz 14/20, worth 20% → 70%, behind; needs (80-14)/80 = 82.5%
    { id: uuid(6), course_id: uuid(3), title: 'Quiz 1', kind: 'quiz', due_at: null, weight: 20, score: 14, max_score: 20, completed_at: '2026-10-10T00:00:00Z' },
    { id: uuid(7), course_id: uuid(4), title: 'Essay 1', kind: 'assignment', due_at: new Date(Date.now() + 86_400_000).toISOString(), weight: 20, score: null, max_score: null, completed_at: null },
  ],
});

vi.mock('./useAcademics', () => ({ useAcademics: () => ({ data, error: null, reload: async () => {} }) }));
vi.mock('../profile/ProfileProvider', () => ({ useProfile: () => ({ profile: { timezone: 'Africa/Accra' } }) }));

const { AcademicsPage } = await import('./AcademicsPage');
const show = () =>
  render(
    <MemoryRouter>
      <AcademicsPage />
    </MemoryRouter>,
  );
const stat = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

describe('AcademicsPage', () => {
  it('tracks the current semester against its target GPA', () => {
    data = base();
    show();
    expect(stat('Target GPA')).toBe('4.00');
    // A (4.0) ×3 + B (3.0, from 70%) ×3 → 3.50; Critical Thinking has no marks yet so it is left out
    expect(stat('Projected GPA')).toBe('3.50');
    expect(stat('Courses on track')).toBe('1/3');
    expect(screen.getByText(/aiming for/)).toHaveTextContent('A (80+) in every course');

    const row = (title: string) => screen.getByText(title).closest('div')!.parentElement!;
    expect(within(row('Programming II')).getByText(/^On track: 85% on 40% graded/)).toBeInTheDocument();
    expect(within(row('Calculus')).getByText('Behind: 70% on 20% graded. Need 82.5% on the remaining 80% for A (80+).')).toBeInTheDocument();
    expect(within(row('Critical Thinking')).getByText('Aim for A (80+). Add marks as you get them back.')).toBeInTheDocument();
    expect(within(row('Critical Thinking')).getByText('Taking now')).toBeInTheDocument();
    expect(within(row('Critical Thinking')).getByRole('link', { name: /No study files yet/ })).toHaveAttribute('href', `/life/study?course=${uuid(4)}`);

    // Deadlines show what's open, its weight, and a way to record the mark
    expect(screen.getByText('Essay 1')).toBeInTheDocument();
    expect(screen.getByText(/worth 20%/)).toBeInTheDocument();
    expect(screen.getByText(/^Tomorrow/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add mark' })).toBeInTheDocument();
  });

  it('starts from a blank slate: asks only for this semester', () => {
    data = { ...base(), terms: [], courses: [], assessments: [] };
    show();
    expect(screen.getByText('Start this semester')).toBeInTheDocument();
    expect(screen.getByLabelText('Target GPA')).toHaveValue(4);
  });
});
