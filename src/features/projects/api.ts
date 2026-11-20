import { useCallback, useEffect, useState } from 'react';
import { cached } from '../../lib/offline';
import { z } from 'zod';
import { requireSupabase } from '../../lib/supabase';

export const PROJECT_KINDS = ['assignment', 'team', 'personal', 'business'] as const;
export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'done', 'cancelled'] as const;
export const KIND_LABEL: Record<(typeof PROJECT_KINDS)[number], string> = {
  assignment: 'Assignment',
  team: 'Team project',
  personal: 'Personal',
  business: 'Business',
};
export const STATUS_LABEL: Record<(typeof PROJECT_STATUSES)[number], string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const ProjectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  kind: z.enum(PROJECT_KINDS),
  status: z.enum(PROJECT_STATUSES),
  due_on: z.string().nullable(),
  course_id: z.uuid().nullable(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const MemberSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  name: z.string(),
  role: z.string().nullable(),
  contact: z.string().nullable(),
  is_me: z.boolean(),
});
export type Member = z.infer<typeof MemberSchema>;

export const TaskSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  title: z.string(),
  assignee_member_id: z.uuid().nullable(),
  status: z.enum(['todo', 'doing', 'done']),
  due_on: z.string().nullable(),
});
export type Task = z.infer<typeof TaskSchema>;

export const MilestoneSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  title: z.string(),
  due_on: z.string().nullable(),
  done_at: z.string().nullable(),
});
export type PMilestoneRow = z.infer<typeof MilestoneSchema>;

export const MeetingSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  held_on: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
});
export type Meeting = z.infer<typeof MeetingSchema>;

export interface ProjectsData {
  projects: Project[];
  members: Member[];
  tasks: Task[];
  milestones: PMilestoneRow[];
  meetings: Meeting[];
}

function ok<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

const sb = () => requireSupabase();

export async function fetchProjects(): Promise<ProjectsData> {
  const [projects, members, tasks, milestones, meetings] = await Promise.all([
    sb().from('projects').select('id, name, description, kind, status, due_on, course_id').order('created_at'),
    sb().from('project_members').select('id, project_id, name, role, contact, is_me').order('created_at'),
    sb().from('project_tasks').select('id, project_id, title, assignee_member_id, status, due_on').order('created_at'),
    sb().from('project_milestones').select('id, project_id, title, due_on, done_at').order('due_on', { nullsFirst: false }),
    sb().from('meetings').select('id, project_id, held_on, title, notes').order('held_on', { ascending: false }),
  ]);
  return {
    projects: z.array(ProjectSchema).parse(ok(projects)),
    members: z.array(MemberSchema).parse(ok(members)),
    tasks: z.array(TaskSchema).parse(ok(tasks)),
    milestones: z.array(MilestoneSchema).parse(ok(milestones)),
    meetings: z.array(MeetingSchema).parse(ok(meetings)),
  };
}

export const ProjectInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).nullable(),
  kind: z.enum(PROJECT_KINDS),
  status: z.enum(PROJECT_STATUSES),
  due_on: z.string().nullable(),
  course_id: z.uuid().nullable(),
});

/** Creates the project and adds the user as its first member. Returns the new id. */
export async function createProject(i: z.input<typeof ProjectInput>, myName: string): Promise<string> {
  const { id } = ok(await sb().from('projects').insert(ProjectInput.parse(i)).select('id').single()) as { id: string };
  ok(await sb().from('project_members').insert({ project_id: id, name: myName.slice(0, 80) || 'Me', role: 'Lead', is_me: true }));
  return id;
}

export async function updateProject(id: string, i: z.input<typeof ProjectInput>) {
  ok(await sb().from('projects').update(ProjectInput.parse(i)).eq('id', id));
}

export async function addMember(projectId: string, name: string, role: string | null, contact: string | null) {
  const row = z
    .object({ name: z.string().trim().min(1).max(80), role: z.string().trim().max(60).nullable(), contact: z.string().trim().max(120).nullable() })
    .parse({ name, role, contact });
  ok(await sb().from('project_members').insert({ project_id: projectId, ...row }));
}

export async function addTask(projectId: string, title: string, assignee: string | null, dueOn: string | null) {
  const t = z.string().trim().min(1).max(160).parse(title);
  ok(await sb().from('project_tasks').insert({ project_id: projectId, title: t, assignee_member_id: assignee, due_on: dueOn }));
}

export async function updateTask(id: string, patch: { status?: Task['status']; assignee_member_id?: string | null; due_on?: string | null }) {
  const row: Record<string, unknown> = { ...patch };
  if (patch.status) row.completed_at = patch.status === 'done' ? new Date().toISOString() : null;
  ok(await sb().from('project_tasks').update(row).eq('id', id));
}

export async function addMilestone(projectId: string, title: string, dueOn: string | null) {
  const t = z.string().trim().min(1).max(120).parse(title);
  ok(await sb().from('project_milestones').insert({ project_id: projectId, title: t, due_on: dueOn }));
}

export async function setMilestoneDone(id: string, done: boolean) {
  ok(await sb().from('project_milestones').update({ done_at: done ? new Date().toISOString() : null }).eq('id', id));
}

export async function addMeeting(projectId: string, heldOn: string, title: string, notes: string | null) {
  const row = z
    .object({ held_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), title: z.string().trim().min(1).max(120), notes: z.string().trim().max(10000).nullable() })
    .parse({ held_on: heldOn, title, notes });
  ok(await sb().from('meetings').insert({ project_id: projectId, ...row }));
}

export async function removeRow(table: 'projects' | 'project_members' | 'project_tasks' | 'project_milestones' | 'meetings', id: string) {
  ok(await sb().from(table).delete().eq('id', id));
}

export function useProjects() {
  const [data, setData] = useState<ProjectsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<() => void> => {
    try {
      const d = await cached('projects', fetchProjects);
      return () => {
        setData(d);
        setError(null);
      };
    } catch (err) {
      return () => setError(err instanceof Error ? err.message : 'Could not load projects.');
    }
  }, []);

  const reload = useCallback(async () => (await load())(), [load]);

  useEffect(() => {
    let active = true;
    load().then((apply) => {
      if (active) apply();
    });
    return () => {
      active = false;
    };
  }, [load]);

  return { data, error, reload };
}

/** Bundle one project's rows for the health rules. */
export function stateOf(data: ProjectsData, p: Project) {
  return {
    project: p,
    tasks: data.tasks.filter((t) => t.project_id === p.id),
    members: data.members.filter((m) => m.project_id === p.id),
    milestones: data.milestones.filter((m) => m.project_id === p.id),
    meetings: data.meetings.filter((m) => m.project_id === p.id),
  };
}
