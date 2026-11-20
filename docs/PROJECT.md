# Project Profile: NEXUS

**Last verified:** 2026-11-20 · **Forge location:** `forge skill` · **Forge version:** 1.0

## 1. Summary

- **What it is:** A personal operating system that remembers, understands, recommends and helps execute across academics, finances, goals, development and projects. `[STATED]`
- **Type:** Web app (installable PWA, mobile-first) + backend (Supabase) + AI application (optional layer).
- **Stage:** Phase 1 (Foundation) in progress.
- **Authoritative brief:** the Master Product Specification supplied by the Owner on 2026-11-20 (summarised in `docs/ROADMAP.md`). Where this profile and the spec disagree, the spec wins until the Owner says otherwise.

## 2. Problem, users and outcome

- **Primary user:** the Owner — a university student in Ghana with technical, leadership and entrepreneurial ambitions; Android phone first, desktop second. `[STATED / ASSUMPTION: single primary user]`
- **Outcome:** the user is more capable, informed, disciplined and independent; obligations are not missed; development is evidence-based. `[STATED]`
- **Success is measured by:** the 14 acceptance criteria in spec §18 (tracked in `docs/STATUS.md`).

## 3. Scope

Phases follow spec §17. See `docs/ROADMAP.md` for the per-phase breakdown.

| MVP (Phases 1–2) | Later (Phases 3–7) | Not doing |
|---|---|---|
| Auth, profile, preferences, data export `[STATED]` | Personal memory centre (3) | Multiple autonomous AI agents `[STATED]` |
| Five-destination responsive PWA shell `[STATED]` | AI provider abstraction, recommendations, briefing, learning (4) | Paid infrastructure as a dependency `[STATED]` |
| Academics incl. GPA/CGPA `[STATED]` | Notifications, Android push, accountability (5) | AI as source of truth for money/grades `[STATED]` |
| Finances in integer minor units, GHS default `[STATED]` | Opportunity Radar, weekly reviews, offline writes (6) | Sending external messages without approval `[STATED]` |
| Goals, habits, projects with team responsibility `[STATED]` | Hardening (7) | |

**Open assumptions awaiting confirmation:** see `docs/STATUS.md`.

## 4. Constraints

- **Budget:** zero-cost infrastructure; free tiers only. `[STATED]`
- **AI:** optional; app must be fully usable without any paid AI API. A Claude Code subscription is not an app runtime API allowance. `[STATED]`
- **Team:** the Owner plus AI coding agents.
- **Legal:** personal, academic and financial data of one person. Financial/legal advice must be educational and qualified. `[STATED]`

## 5. Technology

| Area | Choice | Version | Reason / decision ref |
|---|---|---|---|
| Language | TypeScript | 5.9.x | D-002 |
| UI | React + React Router | 19.3 / 8.5 | Spec §12 |
| Styling | Tailwind CSS (v4, CSS tokens) | 4.3 | Spec §12, D-004 |
| Build / PWA | Vite + vite-plugin-pwa | 8.3 / see package.json | D-001 |
| Backend | Supabase (Postgres, Auth, RLS) | supabase-js 2.119 | Spec §12 |
| Validation | Zod | 4.x | D-001 |
| Tests | Vitest + Testing Library + PGlite (Postgres-in-process for RLS tests) | see package.json | D-003 |
| Local storage | IndexedDB via Dexie | — (Phase 6) | Spec §12 |
| Hosting | Vercel Hobby — https://nexus-theta-peach.vercel.app | — | D-008 |
| Supabase project | `nexus`, ref `obccfnhcnnlairctgomt`, eu-west-1, free | — | — |
| Academics | 4.0 GPA scale | — | D-007 |

**Commands** (verified working — see STATUS for evidence):

| Purpose | Command |
|---|---|
| Install | `npm install` |
| Run locally | `npm run dev` |
| Test (unit + database/RLS) | `npm test` |
| Type-check / lint | `npm run typecheck` · `npm run lint` |
| All checks | `npm run check` |
| Build | `npm run build` |
| Deploy (production) | `npx vercel deploy --prod` |

**Repository layout:**
```
src/app/          shell, routing, navigation config
src/features/     one folder per domain (auth, profile, settings, destinations, …)
src/components/   shared UI primitives
src/lib/          deterministic logic (money, env, theme, supabase client)
supabase/migrations/  ordered SQL migrations (the database history)
supabase/tests/   PGlite harness + RLS/constraint tests for every migration
docs/             project memory (Forge)
```

**Conventions not obvious from the code:**
- Money is always integer minor units (`src/lib/money.ts`); never floats.
- Every table: RLS enabled, owner-scoped policies, `revoke all … from anon`, column-level update grants, audit trigger where records matter.
- Every migration ships with a test in `supabase/tests/`.
- Relative imports (no path aliases).

## 6. Active Forge modules

- [x] software-engineering
- [x] architecture
- [x] security
- [x] backend
- [x] frontend
- [x] ui-ux-design
- [ ] mobile *(PWA only — covered by frontend)*
- [x] ai-systems *(from Phase 4)*
- [ ] commerce-payments *(personal finance tracking only; no payments are made)*
- [ ] desktop-tools-automation
- [ ] game-development
- [ ] game-animation-art
- [x] testing-qa
- [x] deployment-operations *(from first deploy)*

**Project-specific overrides of module standards:** none.

## 7. Quality targets

- **Security and data:** personal, academic and financial data; only the owner may read or write their rows (RLS). AI receives data only with per-category consent. `[STATED]`
- **Accessibility:** WCAG 2.2 AA. `[PROPOSED]`
- **Performance:** first load < 3 s on mid-range Android over 4G; JS bundle < 250 KB gzip for the shell. `[PROPOSED]`
- **Supported platforms:** Android Chrome (installed PWA) primary; current desktop Chrome/Edge/Firefox/Safari. `[STATED + ASSUMPTION]`
- **Reliability:** Supabase is source of truth; data export always available. `[STATED]`
- **Testing:** deterministic logic and every RLS policy automated; UI flows manually verified each phase.

## 8. Design direction

- **Character:** calm, exact, quietly premium — not playful, not corporate, not "AI-glowy".
- **Signature decisions:** deep graphite with a single brass accent; one primary focus per screen; tabular numerals for every figure.
- **Full detail:** `docs/DESIGN-SYSTEM.md`

## 10. Autonomy and approvals

- **Standing approvals:** none.
- **Version control:** the agent may `git init` and stage; **ask before the first commit** (FORGE §6 default). No remote configured.
- **Spending limits:** £0 / GHS 0. No paid service, no metered AI calls without approval.
- **Supabase:** creating a project, applying migrations to a hosted project, or changing auth settings needs the Owner's explicit approval.

## 11. Models and tools available

| Model or tool | Tier | Use for |
|---|---|---|
| Claude (Claude Code desktop) | Principal | Architecture, implementation, review |

**Can this environment start agents itself?** yes.

## 12. Pointers

- **Current state:** `docs/STATUS.md` · **Decisions:** `docs/DECISIONS.md`
- **Other documents:** `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/THREAT-MODEL.md`, `docs/DESIGN-SYSTEM.md`, `docs/SETUP.md`
