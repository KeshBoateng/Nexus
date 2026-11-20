import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { DEFAULT_GRADE_BANDS } from '../../lib/gpa';
import type { AcademicsData } from './api';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const data: AcademicsData = {
  bands: DEFAULT_GRADE_BANDS.map((b, i) => ({ id: uuid(100 + i), ...b })),
  terms: [{ id: uuid(1), name: 'L200 Sem 1', starts_on: null, ends_on: null, created_at: '2026-09-01T00:00:00Z' }],
  courses: [
    { id: uuid(2), term_id: uuid(1), code: 'DCIT 201', title: 'Programming II', credit_hours: 3, final_mark: 85, final_letter: null },
    { id: uuid(3), term_id: uuid(1), code: 'MATH 223', title: 'Calculus', credit_hours: 3, final_mark: 72, final_letter: null },
    { id: uuid(4), term_id: uuid(1), code: 'UGRC 220', title: 'Critical Thinking', credit_hours: 2, final_mark: null, final_letter: null },
  ],
  assessments: [
    {
      id: uuid(5),
      course_id: uuid(4),
      title: 'Essay 1',
      kind: 'assignment',
      due_at: new Date(Date.now() + 86_400_000).toISOString(),
      weight: null,
      score: null,
      max_score: null,
      completed_at: null,
    },
  ],
};

vi.mock('./useAcademics', () => ({ useAcademics: () => ({ data, error: null, reload: async () => {} }) }));
vi.mock('../profile/ProfileProvider', () => ({ useProfile: () => ({ profile: { timezone: 'Africa/Accra' } }) }));

const { AcademicsPage } = await import('./AcademicsPage');

describe('AcademicsPage', () => {
  it('shows CGPA, term GPA, grades and deadlines from recorded data', () => {
    render(
      <MemoryRouter>
        <AcademicsPage />
      </MemoryRouter>,
    );
    // (4.0×3 + 3.0×3) / 6 = 3.50; the 2-credit course is in progress
    expect(screen.getAllByText('3.50').length).toBeGreaterThanOrEqual(2);
    const stat = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    expect(stat('CGPA')).toBe('3.50');
    expect(stat('Credits graded')).toBe('6');
    expect(stat('Credits in progress')).toBe('2');
    const prog = screen.getByText('Programming II').closest('div')!.parentElement!;
    expect(within(prog).getByText('A')).toBeInTheDocument();
    // Completed vs taking now, and the link into the Study Library per course
    expect(within(prog).getByText('Completed')).toBeInTheDocument();
    const ugrc = screen.getByText('Critical Thinking').closest('div')!.parentElement!;
    expect(within(ugrc).getByText('Taking now')).toBeInTheDocument();
    expect(within(ugrc).getByRole('link', { name: /No study files yet/ })).toHaveAttribute('href', `/life/study?course=${uuid(4)}`);
    expect(screen.getByText(/1 taking now · 2 completed/)).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Essay 1')).toBeInTheDocument();
    expect(screen.getByText(/^Tomorrow/)).toBeInTheDocument();
  });
});
