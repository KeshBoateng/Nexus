# Status: NEXUS

**Updated:** 2026-11-20 · **Phase:** 2 — Core management (Academics + Finances live; Goals & habits next)

**Live:** https://nexus-theta-peach.vercel.app · **Supabase:** `nexus` (`obccfnhcnnlairctgomt`, eu-west-1)

## Done
- Project at `C:\NEXUS` under Forge; repo github.com/KeshBoateng/Nexus; pushes to `main` auto-deploy.
- Tooling: Vite 8, React 19, TS 5.9, Tailwind 4, vite-plugin-pwa, Vitest, ESLint, PGlite. Exact versions pinned.
- Migrations 0001 (foundation) and 0002 (function privilege lockdown) — applied locally in tests and on the hosted project.
- App: setup screen, sign-in / sign-up / reset / new password, five-destination shell, Settings (profile, preferences, AI opt-in), JSON export.
- Money module; docs (PROJECT, ROADMAP, ARCHITECTURE, DATABASE, THREAT-MODEL, DESIGN-SYSTEM, SETUP, DECISIONS D-001…D-008).
- Supabase project `nexus` created (free). To stay within the 2-active-project free limit, **`sentinel` was paused** at the Owner's request (data kept; restore from the dashboard).
- Vercel project `nexus` linked and deployed to production with public env vars (production + preview).
- Owner signed up and confirmed their email on production (2026-11-20).
- **Academics (Phase 2 slice 1):** migration 0003 (grade bands, terms, courses, assessments); exact GPA/CGPA on the Owner's 4.0 scale; Academics page (terms, courses, deadlines, editable scale); Home "Needs attention" (overdue + next 7 days); export v2 includes academics.
- **Finances (Phase 2 slice 2):** migration 0004 (accounts, transactions, budgets, savings goals; `account_balances` security-invoker view). Balances computed from opening balance + ledger, never stored. Per-currency totals, no FX. Finances page (record, budgets, accounts, goals, recent); Home "Money this month" with budget alerts; export v3.

## Evidence
| Check | Result |
|---|---|
| `npx vitest run` | 11 files, **128/128 passed** (incl. 52 database/RLS, 26 GPA, 13 finance, page renders) |
| View-leak mutation | Removing `security_invoker` from `account_balances` → isolation test failed ✔ (restored) |
| Hosted finances check (rolled back) | momo=38750, savings=20000, sees own 3 accounts only, cross-currency transfer denied, write into other user's account denied |
| Mutation checks | Owner policy → `using (true)`: isolation test failed ✔; migration 0002 removed: 3 privilege tests failed ✔ |
| `npx tsc -b`, `npx eslint .`, `npm run build` | all exit 0; JS 169 KB gzip |
| Hosted RLS check (rolled-back transaction) | profiles_created=2, prefs_ai_off=2, a_sees_profiles=1, a_updates_b=0, a_updates_self=1, change_owner=denied, audit_insert=denied, a_sees_others_audit=0, anon_read=denied; DB left with 0 users afterwards |
| Supabase security advisors | 0 table/function warnings after 0003; only "leaked password protection" (waived, D-009) |
| Hosted academics check (rolled back) | own_course=1, attach to another user's term=denied, sees only own terms=1 |
| Auto-deploy of `0b1eabd` | Production Ready in ~34 s; `/life/academics` → 200 |
| Auto-deploy of `604c2bd` | Production Ready; live bundle contains Finances UI; `/life/finances` → 200 |
| Production URL | `/`, `/settings`, manifest, `sw.js`, icon → 200; security headers present; sign-in screen renders (env vars baked in) |

## Not verified
- Signed-in screens (Home, Academics, Settings) in a real browser on production — the agent can't sign in as the Owner; Academics is covered by a render test only.
- Mark bands below A (5-mark steps) — ASSUMED from "go on from there"; editable in Academics → Grading scale.
- PWA install on Android; SVG-only icon may need PNGs.
- Colour contrast measured formally.

## Hosting setup (done 2026-11-20, agent via Chrome)
- Supabase Site URL `https://nexus-theta-peach.vercel.app`; Redirect URLs `https://nexus-theta-peach.vercel.app/**`, `http://localhost:5173/**` — VERIFIED after reload.
- Vercel GitHub app granted access to `KeshBoateng/Nexus`; Vercel project `nexus` connected to the repo — pushes to `main` deploy to production.
- Supabase server-side password minimum left at default — Owner decision D-009 (single user; keep setup simple).
- Optional for the Owner: enable 2FA on Vercel.

## Open questions
1. **Letter-grade → point mapping** for your school's 4.0 scale (e.g. A=4.0, B+=3.5, B=3.0 … and the mark ranges) — blocks Phase 2 Academics seed.

## Confirmed
- Single user (the Owner) — confirmed 2026-11-20. Team mates are records, not accounts.
- Default timezone `Africa/Accra`, currency GHS.

## Known issues and debt
| ID | Issue | Severity | Repay when |
|---|---|---|---|
| K-1 | Single 637 KB JS chunk (181 KB gzip); no route code-splitting | Low | End of Phase 2 |
| K-6 | Finances loads the whole ledger at once; fine for years of personal use, would need paging at ~10k transactions | Low | If it gets slow |
| K-7 | Transactions can be deleted and re-entered but not edited in the UI (DB allows it; audited) | Low | Next finance pass |
| K-8 | Investments, assets/liabilities beyond account balances, and reports not built yet (spec §2.2) | — | Phase 2 later / Phase 6 |
| K-2 | `npm audit` advisories in dev dependencies, not triaged | Low–Unknown | Before Phase 2 ends |
| K-3 | No restore path for exports | Medium | Phase 7 |
| K-4 | No Content-Security-Policy header yet | Medium | Phase 7 (or earlier) |
| K-5 | `audit_logs_user_created_idx` reported unused (expected — no traffic yet) | Info | Re-check after use |

## Next
Owner completes the 3 dashboard actions and signs up on the live site → Phase 2 slice 1: Academics (4.0 GPA/CGPA).
