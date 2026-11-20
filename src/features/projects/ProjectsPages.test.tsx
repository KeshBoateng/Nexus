import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ProjectsData } from './api';
import { addDays } from '../../lib/habits';
import { todayIn } from '../../lib/dates';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const today = todayIn('Africa/Accra');

const data: ProjectsData = {
  projects: [{ id: id(1), name: 'DCIT 208 group project', description: null, kind: 'team', status: 'active', due_on: addDays(today, 20), course_id: null }],
  members: [
    { id: id(2), project_id: id(1), name: 'Kesh', role: 'Lead', contact: null, is_me: true },
    { id: id(3), project_id: id(1), name: 'Ama', role: 'Research', contact: null, is_me: false },
  ],
  tasks: [
    { id: id(4), project_id: id(1), title: 'Literature review', assignee_member_id: id(3), status: 'todo', due_on: addDays(today, -2) },
    { id: id(5), project_id: id(1), title: 'Slides', assignee_member_id: null, status: 'todo', due_on: addDays(today, 3) },
    { id: id(6), project_id: id(1), title: 'Proposal', assignee_member_id: id(2), status: 'done', due_on: null },
  ],
  milestones: [],
  meetings: [],
};

vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), useProjects: () => ({ data, error: null, reload: async () => {} }) }));
vi.mock('../profile/ProfileProvider', () => ({ useProfile: () => ({ profile: { timezone: 'Africa/Accra', display_name: 'Kesh' } }) }));
vi.mock('../academics/useAcademics', () => ({ useAcademics: () => ({ data: null }) }));

const { ProjectsListPage, ProjectDetailPage } = await import('./ProjectsPages');

describe('Projects', () => {
  it('lists projects with health and the top next step', () => {
    render(
      <MemoryRouter>
        <ProjectsListPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('DCIT 208 group project')).toBeInTheDocument();
    expect(screen.getByText('At risk')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('shows leadership next steps with evidence, owners and team load', () => {
    render(
      <MemoryRouter initialEntries={[`/projects/${id(1)}`]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Clarify ownership of 1 task')).toBeInTheDocument();
    expect(screen.getByText('1 overdue task')).toBeInTheDocument();
    expect(screen.getByText(/Check in with Ama/)).toBeInTheDocument();
    expect(screen.getByText('Hold a kickoff meeting')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText(/^Why\?/)[0]!);
    expect(screen.getByText(/Unassigned: Slides|Literature review \(due/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Owner of Slides' })).toHaveValue('');
    expect(screen.getByText('Kesh (you)')).toBeInTheDocument();
  });
});
