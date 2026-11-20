# NEXUS Architecture

## Quality attributes, ranked
1. **Security & privacy** — one person's grades, money and private context.
2. **Correctness** — money and GPA must be exact and auditable.
3. **Maintainability** — must evolve over several years.
4. **Cost** — free tiers only.
5. **Usability on a phone** — the primary device.
6. Scale — deliberately last: one user (or a handful).

## Options considered
| Option | Summary | Verdict |
|---|---|---|
| **A. SPA + Supabase directly (RLS)** + Edge Functions only where secrets/schedules are needed | Client talks to Postgres via PostgREST; RLS enforces ownership; server code only for AI calls, push, cron | **Chosen** — simplest, free, security lives in the database where it cannot be bypassed |
| B. SPA + own API server (Node) + Postgres | Every call through custom endpoints | More code and a server to host for free; no security gain over RLS for single-owner data |
| C. Local-first (IndexedDB as source of truth, sync later) | Offline-perfect | Conflict handling for money/grades is hard; spec says Supabase is source of truth initially |

## Layers
```
┌──────────────── Browser / installed PWA ────────────────┐
│ React UI  ─►  feature api.ts (Zod-validated in & out)   │
│              src/lib: money, gpa, scheduling (pure)     │
│ Service worker: app shell cache only (no API caching)   │
└───────────────┬─────────────────────────────────────────┘
                │ HTTPS, user JWT (publishable key only)
┌───────────────▼──────── Supabase (free tier) ───────────┐
│ Auth  │  Postgres + RLS (owner-only rows, column grants) │
│       │  triggers: signup, updated_at, audit_logs        │
│       │  views/functions for deterministic aggregates    │
│ Edge Functions (Phase 4–5): AI gateway, web push, cron   │
│   – hold secrets; enforce AI consent + rate limits       │
└──────────────────────────────────────────────────────────┘
                │ only with consent, only permitted fields
           Optional AI provider(s) behind one interface
```

## Rules
- **Deterministic vs AI** (spec §4): calculations, scheduling, scoring, validation live in pure TypeScript (`src/lib`) or SQL. AI only interprets, explains and drafts. AI output is never written to financial or academic tables.
- **Authorisation lives in Postgres.** The client is untrusted; RLS + column grants are the control. Client-side Zod validation is for UX only.
- **AI calls never from the browser.** Keys live in Edge Function secrets; the function re-checks `ai_enabled` and per-category consent before sending anything.
- **Feature folders** own their UI, `api.ts` and tests. Cross-feature reads go through the owning feature's `api.ts`.
- **Offline**: Phase 1 caches the app shell only. Data caching (Dexie) and queued writes come in Phase 6 with explicit conflict detection.

## Technical risks
| Risk | Mitigation |
|---|---|
| Web Push on Android PWA requires a server to send and schedule | Supabase cron + Edge Function + VAPID (free); prove in a spike at start of Phase 5 |
| Supabase free tier pauses inactive projects (after ~1 week idle — ASSUMED, check current policy) | Document; daily use keeps it active; export/backup |
| Free AI tiers change or vanish | Provider interface; AI optional; everything works with AI off |
| Fabricated learning links | Store only links that pass a server-side fetch check; record `verified_at` |
| PGlite stand-in differs from real Supabase | Run migrations against a real project before closing each phase |
