# Status: NEXUS

**Updated:** 2026-11-20 · **Phase:** 1 — Foundation (deployed; awaiting Owner's sign-up test)

**Live:** https://nexus-theta-peach.vercel.app · **Supabase:** `nexus` (`obccfnhcnnlairctgomt`, eu-west-1)

## Done
- Project at `C:\NEXUS` under Forge; git initialised (nothing committed — awaiting Owner's OK).
- Tooling: Vite 8, React 19, TS 5.9, Tailwind 4, vite-plugin-pwa, Vitest, ESLint, PGlite. Exact versions pinned.
- Migrations 0001 (foundation) and 0002 (function privilege lockdown) — applied locally in tests and on the hosted project.
- App: setup screen, sign-in / sign-up / reset / new password, five-destination shell, Settings (profile, preferences, AI opt-in), JSON export.
- Money module; docs (PROJECT, ROADMAP, ARCHITECTURE, DATABASE, THREAT-MODEL, DESIGN-SYSTEM, SETUP, DECISIONS D-001…D-008).
- Supabase project `nexus` created (free). To stay within the 2-active-project free limit, **`sentinel` was paused** at the Owner's request (data kept; restore from the dashboard).
- Vercel project `nexus` linked and deployed to production with public env vars (production + preview).

## Evidence
| Check | Result |
|---|---|
| `npx vitest run` | 4 files, **49/49 passed** (17 database/RLS tests) |
| Mutation checks | Owner policy → `using (true)`: isolation test failed ✔; migration 0002 removed: 3 privilege tests failed ✔ |
| `npx tsc -b`, `npx eslint .`, `npm run build` | all exit 0; JS 169 KB gzip |
| Hosted RLS check (rolled-back transaction) | profiles_created=2, prefs_ai_off=2, a_sees_profiles=1, a_updates_b=0, a_updates_self=1, change_owner=denied, audit_insert=denied, a_sees_others_audit=0, anon_read=denied; DB left with 0 users afterwards |
| Supabase security advisors | 4 warnings after 0001 → **0** after 0002 |
| Production URL | `/`, `/settings`, manifest, `sw.js`, icon → 200; security headers present; sign-in screen renders (env vars baked in) |

## Not verified
- Real sign-up → email confirmation → Settings edit → export on production (needs the Owner's own email).
- Signed-in shell and Settings rendered in a browser.
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
| K-1 | Single 583 KB JS chunk; no route code-splitting | Low | Phase 2 |
| K-2 | `npm audit` advisories in dev dependencies, not triaged | Low–Unknown | Before Phase 2 ends |
| K-3 | No restore path for exports | Medium | Phase 7 |
| K-4 | No Content-Security-Policy header yet | Medium | Phase 7 (or earlier) |
| K-5 | `audit_logs_user_created_idx` reported unused (expected — no traffic yet) | Info | Re-check after use |

## Next
Owner completes the 3 dashboard actions and signs up on the live site → Phase 2 slice 1: Academics (4.0 GPA/CGPA).
