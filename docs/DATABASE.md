# NEXUS Database Design

Postgres on Supabase. One `public` schema with table groups by prefix-free domain names (spec §13). Migrations in `supabase/migrations/` are the history; this document is the design.

## Standards for every table
- `id uuid primary key default gen_random_uuid()` (except 1:1 tables keyed by `user_id`).
- `user_id uuid not null references profiles(id) on delete cascade` + index — even on child tables, so RLS is a single equality check (no joins in policies).
- RLS enabled; `revoke all from anon, authenticated`; grant only the verbs needed; **column-level update grants** exclude `id`, `user_id`, `created_at`.
- Policies use `(select auth.uid())` (evaluated once per query).
- `created_at`, `updated_at` (trigger). Audit trigger on records that matter (money, grades, memories, recommendations).
- **Money:** `bigint` minor units + `currency char(3)`. Never `float`/`real`/`numeric` arithmetic in the client.
- **Grades:** grade points as `numeric(3,2)`; credit hours `smallint`. GPA computed by a pure function and mirrored by a SQL function, both tested on the same cases.
- Enumerations as `text` + `check` (easier to evolve than Postgres enums).

## Entity map
| Group | Tables | Phase |
|---|---|---|
| Identity | `profiles`, `user_preferences`, `audit_logs` | 1 ✅ |
| Academics | `academic_terms`, `courses`, `grading_scales`, `assessments`, `study_sessions` | 2 |
| Finances | `financial_accounts`, `transactions`, `budgets`, `savings_goals`, `investments` | 2 |
| Life | `goals`, `goal_milestones`, `habits`, `habit_checkins` | 2 |
| Projects | `projects`, `project_members`, `project_tasks`, `milestones`, `meetings` | 2 |
| Context | `personal_memories`, `ai_permissions` | 3 |
| Development | `career_tracks`, `skills`, `skill_evidence`, `learning_resources`, `learning_progress` | 4 |
| Intelligence | `recommendations`, `recommendation_feedback`, `recommendation_events`, `daily_briefings`, `weekly_reviews` | 4/6 |
| Notifications | `notifications`, `notification_preferences`, `push_subscriptions` | 5 |
| Radar | `opportunities` | 6 |

## Key designs (to be implemented in their phase)
- **transactions:** `account_id`, `amount_minor bigint not null check (amount_minor <> 0)`, `direction in ('income','expense','transfer')`, `occurred_on date`, `category`, `note`, `source in ('manual','import')` — **no `'ai'` source**: AI may suggest, the user records. Balances are a view (`sum`), never a stored mutable number.
- **project_members:** `name`, optional `email`, `role`; members are *records*, not app users (team mates don't need accounts). `project_tasks.assignee_member_id` nullable → "unassigned" is a query, which drives leadership coaching.
- **personal_memories:** `kind in ('fact','preference','pattern','temporary','hypothesis')`, `source in ('onboarding','user','record','activity','checkin','feedback','ai')`, `confidence`, `expires_at`, `ai_visible boolean`, `sensitive boolean`. A check constraint forbids `kind='fact'` with `source='ai'` unless `confirmed_at` is set.
- **recommendations:** title, action, rationale, category, priority, est_minutes, benefit, `evidence jsonb` (references to source rows), `due_on`, `status`; `recommendation_events` records viewed/accepted/started/completed/applied with timestamps, so "clicked" ≠ "achieved".
- **learning_resources:** `url`, `verified_at`, `verified_status`; UI shows only verified rows.

## Migration log
| File | Contents | Tested by |
|---|---|---|
| `20261120000001_foundation.sql` | profiles, user_preferences, audit_logs, signup trigger, RLS, grants | `supabase/tests/foundation.test.ts` |
| `20261120000002_revoke_function_execute.sql` | Revoke EXECUTE on trigger functions from anon/authenticated (Supabase default privileges grant it) | `foundation.test.ts` › function privileges |

| `20261120000003_academics.sql` | grade_bands, academic_terms, courses, assessments; composite (id, user_id) FKs; `user_id default auth.uid()` with no client write grant; audit on grades; audit function skips deletes whose owner is already gone | `supabase/tests/academics.test.ts` |

| `20261120000004_finances.sql` | financial_accounts, transactions, budgets, savings_goals; `account_balances` view (security_invoker); same-currency transfer trigger; account currency lock; audit on accounts + transactions | `supabase/tests/finances.test.ts` |

| `20261120000005_goals_habits.sql` | goals, goal_milestones, habits, habit_checkins (insert/delete only; one per habit per day) | `supabase/tests/goals_habits.test.ts` |

| `20261120000006_projects.sql` | projects, project_members (one is_me per project), project_tasks (assignee FK over member+project+user, ON DELETE SET NULL (assignee only)), project_milestones, meetings | `supabase/tests/projects.test.ts` |

| `20261120000007_personal_context.sql` | personal_memories (classification + AI-fact/sensitive/expiry rules), ai_permissions (default off); both audited | `supabase/tests/personal_context.test.ts` |

| `20261120000008_recommendations.sql` | recommendations (reasoning immutable; status-only updates), recommendation_events + recommendation_feedback (append-only), daily_briefings | `supabase/tests/recommendations.test.ts` |

| `20261120000009_development.sql` | skills, skill_evidence (https-only links), learning_resources (https-only), learning_progress (status + understood + applied; key `catalog:`/`user:`) | `supabase/tests/development.test.ts` |

| `20261120000010_ai_requests.sql` | ai_requests (append-only log: model, categories shared, status, sizes — no message content) | via ai-chat function |

| `20261120000011_notifications.sql` | notifications (server-created; user may read/snooze/dismiss), notification_preferences, push_subscriptions, app_secrets (no grants: service role only), accountability_mode, nexus_budgets_over() (server-only) | `supabase/tests/notifications.test.ts` |
| `20261120000012_notify_schedule.sql` | pg_cron + pg_net; cron token generated in-DB; job every 15 min (hosted only, skipped in PGlite) | live run checked |

| `20261120000013_reviews_opportunities.sql` | weekly_reviews (one per ISO week), opportunities (https links; link_status/link_checked_at server-only; URL edit resets check) | `supabase/tests/reviews_opportunities.test.ts` |

| `20261120000014_study_library.sql` | study_materials (path must be in own folder; text/path immutable; tsvector search), study_analyses (one per material), ai_permissions + 'study' | `supabase/tests/study.test.ts` |
| `20261120000015_study_storage.sql` | private `study` bucket + owner-folder storage policies (hosted only) | live probes |

All fifteen are applied to the hosted project `nexus` (ref `obccfnhcnnlairctgomt`, eu-west-1) on 2026-11-20.

**Standard added:** every new function must `revoke execute … from public, anon, authenticated` unless it is meant to be called via RPC.
