# Decision Log: NEXUS

## Index

| ID | Date | Decision | Status |
|---|---|---|---|
| D-001 | 2026-11-20 | Architecture: SPA + Supabase direct with RLS; Edge Functions only for secrets/schedules | active |
| D-002 | 2026-11-20 | Pin TypeScript 5.x, not 7.x | active |
| D-003 | 2026-11-20 | Test RLS with PGlite + a Supabase stand-in | active |
| D-004 | 2026-11-20 | Design direction: graphite + single brass accent | active |
| D-005 | 2026-11-20 | Money as safe-integer minor units in JS, bigint in Postgres | active |
| D-006 | 2026-11-20 | AI opt-in, off by default; server-side only | active |
| D-007 | 2026-11-20 | Academics use a 4.0 GPA scale, stored as data | active |
| D-008 | 2026-11-20 | Host the PWA on Vercel (free Hobby plan) | active |
| D-009 | 2026-11-20 | Keep Supabase setup minimal: single user | active |

---

## D-001 — Architecture: SPA + Supabase with RLS
- **Date:** 2026-11-20 · **Status:** active · **Decided by:** Owner (stack in spec §12) + agent (shape, Amber)
- **Context:** Spec mandates React/TS/Tailwind PWA + Supabase, zero cost, strong privacy.
- **Decision:** Browser talks to Supabase directly; RLS + column grants are the authorisation layer. Supabase Edge Functions only where a secret or schedule is required (AI gateway, web push, cron).
- **Alternatives:** own Node API (more to host, no security gain); local-first source of truth (conflict risk for money/grades).
- **Consequences:** every table needs correct RLS — enforced by a test per migration.
- **Revisit when:** multi-user sharing or complex server workflows appear.

## D-002 — TypeScript 5.x
- **Date:** 2026-11-20 · **Status:** active · **Decided by:** agent (Amber)
- **Context:** npm `latest` is TypeScript 7 (native compiler). typescript-eslint and other tooling compatibility with 7 not verified.
- **Decision:** pin TypeScript 5.x.
- **Revisit when:** typescript-eslint declares TS 7 support.

## D-003 — PGlite for database tests
- **Date:** 2026-11-20 · **Status:** active · **Decided by:** agent (Amber)
- **Context:** No Docker/Postgres locally; RLS must be tested, not assumed.
- **Decision:** `supabase/tests/harness.ts` boots PGlite, creates a minimal `auth` schema, `auth.uid()`, `anon`/`authenticated` roles with Supabase's default grants, then applies all migrations.
- **Consequences:** fast, free tests of policies and constraints. Not identical to Supabase — each phase is re-verified on the hosted project.

## D-004 — Visual direction
- **Date:** 2026-11-20 · **Status:** active (Owner may revise) · **Decided by:** agent (Amber)
- **Decision:** dark graphite, one brass accent, Inter, tabular figures, bottom nav on mobile / rail on desktop. Details in DESIGN-SYSTEM.md.

## D-005 — Money representation
- **Date:** 2026-11-20 · **Status:** active · **Decided by:** derived from spec §13
- **Decision:** `bigint` minor units + `char(3)` currency in Postgres; JS `number` constrained to safe integers (±9.0e15 minor units ≈ GHS 90 trillion) with explicit overflow errors; parsing rejects excess precision rather than rounding.
- **Revisit when:** amounts could exceed the safe-integer range (switch to `bigint` in JS).

## D-006 — AI is opt-in and server-side
- **Date:** 2026-11-20 · **Status:** active · **Decided by:** derived from spec §14–15
- **Decision:** `user_preferences.ai_enabled` defaults to false. No AI call from the browser; a future Edge Function holds keys and re-checks consent. No provider is required for any core feature.

## D-007 — 4.0 GPA scale, stored as data
- **Date:** 2026-11-20 · **Status:** active · **Decided by:** Owner (4.0 system); agent (Amber: storage shape)
- **Context:** Owner's university uses a 4.0 GPA system. Letter-to-point boundaries differ between institutions.
- **Decision:** `grading_scales` table holds letter → grade point (and optional mark range) per user; GPA = Σ(points × credits) / Σ(credits) for a term, CGPA over all completed terms; computed by a pure TS function (`src/lib/gpa.ts`) in integer hundredths with half-up rounding — no SQL mirror (simplicity; single user). Owner's scale, confirmed 2026-11-20: A 80–100 (4.0), B+ 75 (3.5), B 70 (3.0), C+ 65 (2.5), C 60 (2.0), D+ 55 (1.5), D 50 (1.0), E 45 (0.5), F <45 (0). Bands below A are ASSUMED to step by 5 marks — editable in the app. Seeded per user on first visit to Academics.
- **Revisit when:** the Owner changes institution or the school changes its scale.

## D-008 — Vercel hosting
- **Date:** 2026-11-20 · **Status:** active · **Decided by:** Owner
- **Decision:** static Vite build deployed to Vercel (Hobby, free). `vercel.json` sets SPA rewrites, no-cache on `sw.js`, and baseline security headers. Only public `VITE_` variables are set in Vercel.
- **Consequences:** Vercel Hobby is for non-commercial use — fine for a personal tool. A CSP header is deferred to Phase 7.

## D-009 — Keep Supabase setup minimal
- **Date:** 2026-11-20 · **Status:** active · **Decided by:** Owner
- **Context:** NEXUS is a personal project with exactly one user (the Owner).
- **Decision:** no extra hosted Auth hardening (server-side password policy, leaked-password checks, etc.) beyond defaults. Row Level Security stays on every table — it is what keeps the data private on a public API and costs nothing to keep.
- **Consequences:** less dashboard configuration; the app's own 10-character rule still applies at sign-up.
- **Revisit when:** anyone besides the Owner gets an account.
