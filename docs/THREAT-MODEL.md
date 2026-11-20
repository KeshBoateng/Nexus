# NEXUS Threat Model (Phase 1)

## Assets
Account credentials/session · academic records · financial records · private personal context (memories) · ability to act as the user (send messages, create commitments) · availability of one's own data (export/backup).

## Actors
Anonymous internet user · another authenticated NEXUS user (if the instance is ever shared) · malicious content (web pages, imported files, AI output) · compromised dependency · lost/stolen phone.

## Entry points
Supabase Auth endpoints · PostgREST (any table, any filter, from any client holding the publishable key) · future Edge Functions (AI, push) · future imports · AI provider responses.

## Threats → controls
| Threat | Control | Status |
|---|---|---|
| Read/modify another user's rows via PostgREST | RLS owner policies on every table; anon revoked | VERIFIED (PGlite tests) |
| Change ownership / privileged columns | Column-level update grants exclude `id`/`user_id` | VERIFIED |
| Forge or erase audit history | `audit_logs` has no insert/update/delete grant; written by `security definer` trigger | VERIFIED |
| `security definer` search-path hijack | `set search_path = ''`, fully-qualified names, execute revoked from public | VERIFIED (code read) |
| Service-role key leaked to client | Only `VITE_SUPABASE_PUBLISHABLE_KEY` read by app; `.env*` ignored | VERIFIED (code read) |
| Account enumeration via reset | Generic reset message | VERIFIED (code read); signup enumeration depends on Supabase "confirm email" setting — UNVERIFIED |
| Weak passwords | Client min 10; **must also set Supabase Auth min length + leaked-password protection** | UNVERIFIED (hosted setting) |
| XSS stealing session from localStorage | React escaping, no `dangerouslySetInnerHTML`; CSP at host level (Phase 7) | Partially |
| AI exfiltrates private data | AI off by default; server-side consent check per category (Phase 3–4) | Designed |
| Prompt injection from web content/AI output takes actions | AI has no write tools on money/grades; every external action requires user approval | Designed |
| Fabricated money/grades | AI never writes those tables; balances/GPA computed deterministically | Designed |
| Service worker serves stale private data | SW caches app shell only, not API responses | VERIFIED (config read) |
| Data loss | Export (JSON) now; restore + backup drill in Phase 7 | Partial |

## Residual risks
- Session token in localStorage (Supabase default) is readable by any XSS. Accepted for now; mitigated by CSP later.
- PGlite is a stand-in; policies must be re-verified on the real project.
