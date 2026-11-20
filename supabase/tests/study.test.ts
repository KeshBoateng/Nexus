// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, createTestDb, createUser } from './harness';

let db: PGlite;
let alice: string;
let bob: string;
let mat: string;

const path = (user: string) => `${user}/${crypto.randomUUID()}.pdf`;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, 'alice@example.test');
  bob = await createUser(db, 'bob@example.test');
  mat = await asUser(db, alice, async (tx) =>
    (
      await tx.query<{ id: string }>(
        `insert into public.study_materials (title, file_path, mime, size_bytes, extracted_text, status)
         values ('DCIT 201 Lecture 3 - Recursion', $1, 'application/pdf', 120000, 'Recursion is when a function calls itself. Base case stops the recursion.', 'extracted') returning id`,
        [path(alice)],
      )
    ).rows[0]!.id,
  );
}, 60_000);

describe('study_materials', () => {
  it("can't point at another user's storage folder", async () => {
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`insert into public.study_materials (title, file_path, mime, size_bytes) values ('x', $1, 'application/pdf', 10)`, [path(bob)]),
      ),
    ).rejects.toThrow(/study_materials_path_is_own/);
  });

  it('rejects odd paths and oversize files', async () => {
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.study_materials (title, file_path, mime, size_bytes) values ('x', '../etc/passwd', 'x', 10)`)),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.study_materials (title, file_path, mime, size_bytes) values ('x', $1, 'application/pdf', 30000000)`, [path(alice)])),
    ).rejects.toThrow(/check constraint/);
  });

  it('is full-text searchable (title and body)', async () => {
    const hits = await asUser(db, alice, async (tx) =>
      (await tx.query<{ id: string }>(`select id from public.study_materials where search @@ websearch_to_tsquery('english', 'base case')`)).rows,
    );
    expect(hits.map((h) => h.id)).toEqual([mat]);
  });

  it('extracted text and file path cannot be changed after upload', async () => {
    await expect(asUser(db, alice, (tx) => tx.query(`update public.study_materials set extracted_text = 'x' where id = $1`, [mat]))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, alice, (tx) => tx.query(`update public.study_materials set file_path = $2 where id = $1`, [mat, path(alice)]))).rejects.toThrow(/permission denied/);
  });
});

describe('study_analyses', () => {
  it('one pack per material, arrays only, owner only', async () => {
    await expect(asUser(db, bob, (tx) => tx.query(`insert into public.study_analyses (material_id, summary) values ($1, 'x')`, [mat]))).rejects.toThrow(/foreign key/);
    await asUser(db, alice, (tx) =>
      tx.query(`insert into public.study_analyses (material_id, summary, flashcards) values ($1, 'Recursion basics', '[{"q":"What stops recursion?","a":"A base case"}]')`, [mat]),
    );
    await expect(asUser(db, alice, (tx) => tx.query(`insert into public.study_analyses (material_id, summary) values ($1, 'again')`, [mat]))).rejects.toThrow(/study_analyses_one_per_material/);
  });

  it('deleting a material removes its pack', async () => {
    await asUser(db, alice, (tx) => tx.query(`delete from public.study_materials where id = $1`, [mat]));
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.study_analyses where material_id = $1`, [mat]);
    expect(rows[0]!.n).toBe(0);
  });

  it.each(['study_materials', 'study_analyses'])('bob sees none of alice’s %s', async (t) => {
    const rows = await asUser(db, bob, async (tx) => (await tx.query(`select 1 from public.${t}`)).rows);
    expect(rows).toEqual([]);
  });

  it("allows a 'study' AI permission, default off", async () => {
    await asUser(db, alice, (tx) => tx.query(`insert into public.ai_permissions (category) values ('study')`));
    const { rows } = await db.query<{ allowed: boolean }>(`select allowed from public.ai_permissions where user_id = $1 and category = 'study'`, [alice]);
    expect(rows[0]!.allowed).toBe(false);
  });
});

describe('study_notes (resumable generation)', () => {
  it('saves each part once, owner only, and goes with the material', async () => {
    const m = await asUser(db, alice, async (tx) =>
      (await tx.query<{ id: string }>(`insert into public.study_materials (title, file_path, mime, size_bytes) values ('Long', $1, 'application/pdf', 10) returning id`, [path(alice)])).rows[0]!.id,
    );
    await asUser(db, alice, (tx) => tx.query(`insert into public.study_notes (material_id, part, parts_total, notes) values ($1, 1, 3, '- point')`, [m]));
    await expect(asUser(db, alice, (tx) => tx.query(`insert into public.study_notes (material_id, part, parts_total, notes) values ($1, 1, 3, 'again')`, [m]))).rejects.toThrow(/study_notes_once/);
    await expect(asUser(db, bob, (tx) => tx.query(`insert into public.study_notes (material_id, part, parts_total, notes) values ($1, 2, 3, 'x')`, [m]))).rejects.toThrow(/foreign key/);
    await expect(asUser(db, alice, (tx) => tx.query(`update public.study_notes set notes = 'x' where material_id = $1`, [m]))).rejects.toThrow(/permission denied/);
    await asUser(db, alice, (tx) => tx.query(`delete from public.study_materials where id = $1`, [m]));
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.study_notes where material_id = $1`, [m]);
    expect(rows[0]!.n).toBe(0);
  });
});
