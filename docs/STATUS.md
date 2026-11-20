# Status: NEXUS

**Updated:** 2026-11-20 · **Phase:** 6 complete — Phase 7 (hardening) next

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
- **Goals & habits (Phase 2 slice 3):** migration 0005 (goals, goal_milestones, habits, habit_checkins). Goal progress = milestones done/total; habit streaks daily or N×/week (Mon–Sun). Goals & habits page; Home "Today's habits" check-off; export v4. Shared `ConfirmDelete` + `useRunner` extracted.
- **Projects (Phase 2 slice 4):** migration 0006 (projects, members, tasks, milestones, meetings). Assignee must belong to the same project (composite FK). Deterministic health + leadership next steps with evidence (ownership, overdue check-ins, meeting cadence, deadline vs progress, workload imbalance). "Prepare agenda" copies an agenda; nothing is sent. Home shows at-risk projects + your tasks this week. Export v5. Section pages lazy-loaded.
- **Personal context (Phase 3):** migration 0007 (personal_memories, ai_permissions). DB enforces: AI-originated facts/preferences need user confirmation; sensitive never AI-visible; source immutable; permissions default off. `buildAiContext()` is the single gate for future AI calls. Intelligence page: onboarding, Memory Centre (correct/delete/hide/sensitive/confirm-reject guesses), AI master switch + per-category toggles + exact preview. Export v6.
- **Recommendations (Phase 4a):** migration 0008 (recommendations, events, feedback, daily_briefings). Deterministic rules across all modules; feedback learning (not useful −15, very useful +10, already know hides 14 d, not now 3 d); essential obligations floor 70. Daily briefing (3–5, max 2 per category) at top of Home with why/evidence, Done/On it/Not now/Applied and ratings. History in Intelligence. Export v7.
- **Development & learning (Phase 4b):** migration 0009 (skills, skill_evidence, learning_resources, learning_progress). Proficiency estimated from evidence only (single item ≤ Beginner). Catalog of 33 free resources verified live 2026-11-20. Adaptive plans skip intro once Developing. Daily learning step in the briefing. Development page. Export v8.
- **AI assistant (Phase 4c, optional):** Edge Function `ai-chat` (v2, provider-neutral, defaults Groq `openai/gpt-oss-120b`). Server enforces sign-in, AI switch, per-category permissions (same filter file as the app preview, test-checked), 50 msgs/day; conversation not stored; key only in Edge secrets. Migration 0010 `ai_requests` log. "Ask NEXUS" panel in Intelligence. Export v9. Gemini free tier rejected (free-tier prompts may be used to improve Google products / human review).
- **Notifications (Phase 5):** migrations 0011 (notifications, notification_preferences, push_subscriptions, app_secrets, accountability_mode, `nexus_budgets_over` server-only) and 0012 (pg_cron every 15 min → `notify`). Edge Function `notify` (run / public-key / test): deterministic reminders (deadlines 24 h + overdue, briefing time, evening habits, my project tasks, budgets, accountability daily + Sunday weekly), dedupe, completion-based suppression, quiet hours, category prefs, Web Push via VAPID keys generated inside Supabase. Custom service worker (push + click → in-app path only). Bell with unread count, Notifications page (read/snooze/dismiss/history), Settings panel (enable push, test, per-category, Accountability Mode). Export v10.

- **Install (2026-11-20):** one-tap install (Chrome `beforeinstallprompt`), iPhone Add-to-Home-Screen steps, PNG icons 192/512/maskable/apple-touch (`scripts/icons.mjs`).
- **Phase 6:** migration 0013 (weekly_reviews, opportunities; link_status server-only, reset on URL change). Weekly review page (records snapshot + reflection); Insights panel (GPA by term, monthly spend, habit consistency); Opportunity Radar (tracker + relevance to skills/goals + `verify-link` Edge Function with SSRF protections + 7-day/1-day deadline reminders via `notify` v2; weekly note links to /review); offline viewing (IndexedDB per user, banner, writes need connection, cleared on sign-out). Export v11.

- **Study Library (2026-11-20):** migrations 0014 (study_materials with full-text search, study_analyses, 'study' AI permission) and 0015 (private `study` bucket, per-user folder policies, 25 MB, document types only). Text extracted on-device (pdf.js, mammoth, JSZip; lazy-loaded). Auto-filing by course code (filename any case; body text needs capitalised code seen twice). Edge Function `study-analyze`: consent-checked, document text only, chunked for long files (≤5 parts), shares 50/day cap, JSON validated. UI at My Life → Study Library: upload many files, search, course/topic edit, open file (5-min signed URL), study pack (summary, concepts, flashcards, practice questions). Export v12 (records + extracted text; files stay in storage).
- **Study packs, paced (2026-11-20):** first real run hit Groq free-tier 429 ("TPM limit 8000"; three calls in ~3 s). Fixed: migration 0016 `study_notes` saves each part's notes; `study-analyze` v2 uses 7k-char parts, waits out rate limits within a 100 s budget or returns `in_progress` + `retry_after`; the app keeps calling with a countdown until done. Rate-limited calls aren't counted against the daily cap.

## Evidence
| Check | Result |
|---|---|
| `npx vitest run` | 36 files, **311/311 passed** (incl. 114 database/RLS, 26 GPA, 13 finance, 11 habits, 14 project rules, 4 AI gate, 10 recommendation engine, 8 proficiency/catalog, page renders) |
| View-leak mutation | Removing `security_invoker` from `account_balances` → isolation test failed ✔ (restored) |
| Hosted finances check (rolled back) | momo=38750, savings=20000, sees own 3 accounts only, cross-currency transfer denied, write into other user's account denied |
| Mutation checks | Owner policy → `using (true)`: isolation test failed ✔; migration 0002 removed: 3 privilege tests failed ✔ |
| `npx tsc -b`, `npx eslint .`, `npm run build` | all exit 0; JS 169 KB gzip |
| Hosted RLS check (rolled-back transaction) | profiles_created=2, prefs_ai_off=2, a_sees_profiles=1, a_updates_b=0, a_updates_self=1, change_owner=denied, audit_insert=denied, a_sees_others_audit=0, anon_read=denied; DB left with 0 users afterwards |
| Supabase security advisors | 0 table/function warnings after 0003; only "leaked password protection" (waived, D-009) |
| Hosted academics check (rolled back) | own_course=1, attach to another user's term=denied, sees only own terms=1 |
| Auto-deploy of `0b1eabd` | Production Ready in ~34 s; `/life/academics` → 200 |
| AI assistant (2026-11-20 16:52 UTC) | Owner's message → function 200, Groq `openai/gpt-oss-120b` replied; `ai_requests` row status ok. Earlier 503 traced to secret saved as `API_key` instead of `AI_API_KEY` (fixed by Owner). |
| Push to Android (2026-11-20) | Owner enabled push, sent test, notification arrived; server shows 1 subscribed device, test notification pushed_at set. |
| notify job (2026-11-20 17:04 UTC) | triggered in-DB → HTTP 200, 1 user processed, no errors; VAPID keys + cron token present (values never read). Missing/wrong cron token → 403; unauthenticated key request → 401. |
| Auto-deploy of `604c2bd` | Production Ready; live bundle contains Finances UI; `/life/finances` → 200 |
| Production URL | `/`, `/settings`, manifest, `sw.js`, icon → 200; security headers present; sign-in screen renders (env vars baked in) |

## Not verified
- Study Library end to end on the Owner's phone: real PDF/Word/PowerPoint upload, extraction, study pack generation (Groq JSON mode with `openai/gpt-oss-120b` ASSUMED supported). Probed: analyze unauthenticated → 401; bucket not publicly readable; anonymous listing empty.
- Scanned (image-only) PDFs are stored but not readable — no OCR.
- Offline mode on a real phone in airplane mode; Weekly review, Radar, Insights signed-in in a real browser (render-tested logic only).
- `verify-link` against a real opportunity (deployed; needs one saved link).
- Opportunity Radar does not discover listings itself — by design (no fabricated listings; no paid feed).
- "Repeatedly postponed tasks" (spec §10) not detected — due-date changes aren't tracked yet.
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
| K-1 | ~~Single large JS chunk~~ — fixed: section pages lazy-loaded (main 301 KB + vendor 323 KB; ~182 KB gzip upfront) | — | Done |
| K-6 | Finances loads the whole ledger at once; fine for years of personal use, would need paging at ~10k transactions | Low | If it gets slow |
| K-7 | Transactions can be deleted and re-entered but not edited in the UI (DB allows it; audited) | Low | Next finance pass |
| K-8 | Investments, assets/liabilities beyond account balances, and reports not built yet (spec §2.2) | — | Phase 2 later / Phase 6 |
| K-9 | "Periodic reflections" and routines (spec §2.2) not built; reflections fold into weekly reviews | — | Phase 6 |
| K-11 | ~~PWA update mode 'prompt' without an update button kept users on the first cached build~~ — fixed 2026-11-20 (`2ef71d7`, autoUpdate + skipWaiting). Lesson: verify the deployed app as a returning visitor, not only fresh loads. | — | Done |
| K-10 | Habit check-ins load only the last ~110 days (enough for displayed streaks; longer streaks would undercount) | Low | If a streak passes ~15 weeks |
| K-2 | `npm audit` advisories in dev dependencies, not triaged | Low–Unknown | Before Phase 2 ends |
| K-3 | No restore path for exports | Medium | Phase 7 |
| K-4 | No Content-Security-Policy header yet | Medium | Phase 7 (or earlier) |
| K-5 | `audit_logs_user_created_idx` reported unused (expected — no traffic yet) | Info | Re-check after use |

## Next
Owner completes the 3 dashboard actions and signs up on the live site → Phase 2 slice 1: Academics (4.0 GPA/CGPA).
