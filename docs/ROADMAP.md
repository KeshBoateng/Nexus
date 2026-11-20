# NEXUS Roadmap

Derived from spec §17. Each phase ends with something usable end to end, its tests passing, and docs updated. A phase is not "done" because its UI looks finished (spec §18).

## Phase 1 — Foundation  *(in progress)*
- Project structure, tooling, test harness (unit + Postgres/RLS via PGlite)
- Supabase Auth (email + password, reset); profile + preferences created on signup
- Migration 0001: `profiles`, `user_preferences`, `audit_logs` with RLS, column grants, audit triggers
- Design tokens, dark-first theme with light/system option
- Responsive shell: five destinations (bottom bar on mobile, rail on desktop), Settings outside primary nav
- Data export (JSON) — the first piece of acceptance criterion 13
- **Exit:** sign up → profile exists → edit profile/preferences → export, verified against a real Supabase project.

## Phase 2 — Core management  *(DONE 2026-11-20 — Academics, Finances, Goals & habits, Projects)*
Order chosen so each slice is independently usable:
1. **Academics:** terms, courses (credit hours), assessments, grading scale → GPA/CGPA as pure, tested functions; deadlines.
2. **Finances:** accounts, transactions (integer minor units, multi-currency, no FX invention), budgets, savings goals; net worth = deterministic SQL view.
3. **Goals and habits:** goals, milestones, habit check-ins, streaks.
4. **Projects:** projects, members, tasks with owners, milestones, meetings/notes, health indicators (unassigned/overdue counts).
5. **Home v1:** deterministic "today" — due soon, overdue, budget status. No AI.

## Phase 3 — Personal context  *(DONE 2026-11-20)*
`personal_memories` with classification (`fact | preference | pattern | temporary | hypothesis`), source and confidence; Memory Centre (view, correct, delete); per-category AI access permissions. Hypotheses can only become facts by explicit user confirmation.

## Phase 4 — Intelligence  *(DONE 2026-11-20)*
- AI provider interface (server-side via Supabase Edge Function; keys never in client). Default: **no provider**; optional free-tier providers configurable.
- Deterministic recommendation engine first (rules + scoring over recorded data), AI only for explanation/phrasing when enabled.
- Recommendation lifecycle: `viewed → accepted → started → completed → applied`; feedback (very/somewhat/not useful/already know) feeds scoring.
- Daily briefing (3–5 primary items), learning plans with **verified** resource links only, leadership coaching from project state.

## Phase 5 — Notifications  *(DONE 2026-11-20)*
Notification centre, scheduling, quiet hours, dedupe, completion-based suppression, Web Push to Android PWA (VAPID; scheduled via Supabase cron + Edge Function), Accountability Mode.

## Phase 6 — Advanced  *(DONE 2026-11-20)*
Opportunity Radar (with link verification), weekly reviews, analytics, Dexie offline cache + queued writes with conflict detection (never silent overwrite of money/grades).

## Phase 7 — Hardening
Security audit, E2E tests, performance, backup/restore drill, accessibility audit, deployment.

## Acceptance criteria tracker (spec §18)
| # | Criterion | Phase | Status |
|---|---|---|---|
| 1 | Personal information persists | 1 | DB layer VERIFIED (PGlite); hosted UNVERIFIED |
| 2 | Academic & financial calculations accurate | 2 | money primitives + GPA/CGPA VERIFIED (unit tests) |
| 3 | Modules don't duplicate information | 2 | Projects link to courses (no copy); balances computed not stored |
| 4 | Inspect & correct memory | 3 | Built: Memory Centre; DB rules VERIFIED by tests |
| 5 | Recommendations explain reasoning | 4 | Built: why + evidence + benefit on every item |
| 6 | Feedback influences recommendations | 4 | VERIFIED (engine tests: scoring/suppression from feedback) |
| 7 | Verified learning links | 4 | Catalog links fetched (HTTP 200) 2026-11-20; user links labelled unverified |
| 8 | Briefings reflect recorded data | 4 | Built: every item derived from records with evidence |
| 9 | Notifications on Android PWA | 5 | VERIFIED 2026-11-20 (test push received on Owner's phone) |
| 10 | Team responsibility tracking | 2 | VERIFIED (DB tests: same-project assignee FK; rule tests) |
| 11 | AI failures don't break core | 4 | AI off by default; no core feature calls AI |
| 12 | User information protected | all | RLS tests VERIFIED for Phase 1 tables |
| 13 | Export and restore | 1/7 | export v11 covers all tables; restore pending (Phase 7) |
| 14 | Within free limits | all | no paid dependencies |
