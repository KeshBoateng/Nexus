// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createTestDb, createUser } from './harness';

let db: PGlite;
let alice: string;
let bob: string;
let skill: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, 'alice@example.test');
  bob = await createUser(db, 'bob@example.test');
  skill = await asUser(db, alice, async (tx) =>
    (await tx.query<{ id: string }>(`insert into public.skills (track, name) values ('technical', 'Networking') returning id`)).rows[0]!.id,
  );
}, 60_000);

describe('skills and evidence', () => {
  it('one skill name per track', async () => {
    await expect(asUser(db, alice, (tx) => tx.query(`insert into public.skills (track, name) values ('technical', 'Networking')`))).rejects.toThrow(/skills_unique/);
    await expect(asUser(db, alice, (tx) => tx.query(`insert into public.skills (track, name) values ('leadership', 'Networking')`))).resolves.toBeTruthy();
  });

  it('records evidence with https-only links', async () => {
    await asUser(db, alice, (tx) =>
      tx.query(`insert into public.skill_evidence (skill_id, kind, description, link, strength) values ($1, 'project', 'Configured VLANs in Packet Tracer', 'https://github.com/x/y', 2)`, [skill]),
    );
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.skill_evidence (skill_id, kind, description, link) values ($1, 'project', 'x', 'javascript:alert(1)')`, [skill])),
    ).rejects.toThrow(/check constraint/);
  });

  it("cannot add evidence to another user's skill", async () => {
    await expect(
      asUser(db, bob, (tx) => tx.query(`insert into public.skill_evidence (skill_id, kind, description) values ($1, 'project', 'x')`, [skill])),
    ).rejects.toThrow(/foreign key/);
  });

  it('cannot move a skill to a different track after creation', async () => {
    await expect(asUser(db, alice, (tx) => tx.query(`update public.skills set track = 'leadership' where id = $1`, [skill]))).rejects.toThrow(/permission denied/);
  });
});

describe('learning resources and progress', () => {
  it('only https resource URLs', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.learning_resources (title, url) values ('x', 'http://insecure.example')`)),
    ).rejects.toThrow(/check constraint/);
  });

  it('progress keys are catalog:/user: ids, one row per resource, done consistent', async () => {
    await asUser(db, alice, (tx) => tx.query(`insert into public.learning_progress (resource_key) values ('catalog:cs50x')`));
    await expect(asUser(db, alice, (tx) => tx.query(`insert into public.learning_progress (resource_key) values ('catalog:cs50x')`))).rejects.toThrow(/learning_progress_unique/);
    await expect(asUser(db, alice, (tx) => tx.query(`insert into public.learning_progress (resource_key) values ('https://evil')`))).rejects.toThrow(/check constraint/);
    await expect(
      asUser(db, alice, (tx) => tx.query(`update public.learning_progress set status = 'completed' where resource_key = 'catalog:cs50x'`)),
    ).rejects.toThrow(/learning_progress_done_consistent/);
  });

  it('deleting a skill keeps the user’s resources but unlinks them', async () => {
    const [s, r] = await asUser(db, alice, async (tx) => {
      const s = (await tx.query<{ id: string }>(`insert into public.skills (track, name) values ('technical', 'Temp') returning id`)).rows[0]!.id;
      const r = (await tx.query<{ id: string }>(`insert into public.learning_resources (skill_id, title, url) values ($1, 'Doc', 'https://example.com') returning id`, [s])).rows[0]!.id;
      await tx.query(`delete from public.skills where id = $1`, [s]);
      return [s, r];
    });
    expect(s).toBeTruthy();
    const { rows } = await db.query<{ skill_id: string | null; user_id: string }>(`select skill_id, user_id from public.learning_resources where id = $1`, [r]);
    expect(rows[0]).toEqual({ skill_id: null, user_id: alice });
  });

  it.each(['skills', 'skill_evidence', 'learning_resources', 'learning_progress'])('bob sees none of alice’s %s', async (t) => {
    const rows = await asUser(db, bob, async (tx) => (await tx.query(`select 1 from public.${t}`)).rows);
    expect(rows).toEqual([]);
  });
});
