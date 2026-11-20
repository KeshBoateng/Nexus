# Setting up NEXUS

## Requirements
- Node.js 22+ (developed on 24.13) and npm.
- A free Supabase account (https://supabase.com).

## 1. Install and check
```powershell
npm install
npm run check
```
`npm run check` runs type-checking, lint and all tests. Database tests run against an in-process Postgres (PGlite) — no Supabase needed.

## 2. Create the Supabase project (free tier)
1. Supabase Dashboard → New project. Pick the region closest to you (e.g. `eu-west` for Ghana — choose by latency).
2. **SQL Editor →** paste and run each file in `supabase/migrations/` **in filename order**.
   *(Or with the Supabase CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.)*
3. **Authentication → Providers → Email:** keep "Confirm email" ON.
4. **Authentication → Policies / Passwords:** set minimum password length to **10**; enable leaked-password protection if your plan offers it.
5. **Authentication → URL configuration:** Site URL = `http://localhost:5173` for development (add your deployed URL later to Redirect URLs).

## 3. Environment variables
Copy `.env.example` to `.env.local`:

| Variable | Where to find it | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | Project Settings → API → Project URL | No (public) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → publishable (or legacy `anon`) key | No (public; RLS protects data) |

**Never** put the `service_role` / secret key in any `VITE_` variable or anywhere in this repo. Future server secrets (AI keys, VAPID private key) go into Supabase Edge Function secrets only.

## 4. Run
```powershell
npm run dev
```
Open http://localhost:5173, create an account, confirm the email, sign in.

## 5. Verify Phase 1 on the real project
- [ ] Sign up → Settings shows your name, `Africa/Accra`, `GHS`.
- [ ] Change name/currency/theme → Save → reload: values persist.
- [ ] Export my data → JSON contains profile, preferences and audit entries.
- [ ] In the SQL editor: `select * from audit_logs order by id desc limit 5;` shows your edits.
- [ ] Supabase Dashboard → Advisors → Security: no errors.

## Install on Android
Open the deployed (HTTPS) site in Chrome → menu → **Add to Home screen / Install app**. (Installation needs HTTPS; `localhost` works for desktop testing only.)
