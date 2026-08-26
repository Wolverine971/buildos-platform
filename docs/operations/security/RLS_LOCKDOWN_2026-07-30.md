<!-- docs/operations/security/RLS_LOCKDOWN_2026-07-30.md -->

# Production RLS Lockdown — 2026-07-30

**Status:** Batch 1 is present in production. The remaining Phase 0 code and SQL are implemented and locally validated; production migration application, webhook-token rotation, and the live access-log review are still operationally pending.

**Original severity:** Active exposure. The initial audit found 52 of 246 `public` tables with `relrowsecurity = false` while `anon` and `authenticated` held full `arwdDxt`. The anon key ships to every browser, so those tables were world-readable and world-writable. The original live proof was an unauthenticated `GET /rest/v1/queue_jobs` returning real rows.

Found while verifying an unrelated finding during the agentic-chat worker migration audit (`docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_INDEPENDENT_AUDIT_2026-07-29.md`, F3).

## Phase 0 implementation update

Implemented on 2026-07-30:

- `20260730020000_phase0_rls_lockdown_remaining_tables.sql` enables RLS on the remaining 34 tables, replaces every dormant policy, removes direct anon table privileges, narrows authenticated grants, removes `TRUNCATE`/`REFERENCES`/`TRIGGER` globally, hardens project deletion, makes feedback rate limiting service-only, and adds the insert-only `log_client_error` RPC.
- `20260730030000_phase0_view_and_rpc_hardening.sql` makes all 12 ordinary internal views `security_invoker`, makes 13 internal/admin views service-only, retains authenticated access only for `user_calendar_items`, restricts internal analytics/mutation RPCs to `service_role`, and adds a read-only catalog verifier RPC.
- Public visitor tracking, beta signup/status, feedback, link tracking, public author lookups, notification creation, and polymorphic assignment writes now run through narrow server routes using the service client after their existing authorization/validation checks.
- Admin analytics and notification analytics now use the service client only after `is_admin` is established by the request session.
- The calendar webhook renewal endpoint supports a one-time `rotate_all=true` mode so stored webhook tokens can be replaced without breaking Google's channel/token pairing.
- `scripts/security/verify-rls-lockdown.mjs` no longer attempts probe inserts. It reads the catalog through a service-only `STABLE` RPC and mutates no application data.

Local PostgreSQL 16 validation applied both new migrations twice. Results: 34/34 target tables RLS-enabled, zero remaining dangerous grants, all 12 ordinary internal views set to `security_invoker`, and anon `log_client_error` remained functional while direct table access stayed revoked.

Production completion order:

1. Deploy the server code.
2. Apply migrations `20260730020000` and `20260730030000` in order.
3. Run `node scripts/security/verify-rls-lockdown.mjs --tables scripts/security/rls-phase-0.json` with the production service key available only in the operator environment.
4. Call the cron-authorized `POST /api/cron/renew-webhooks?rotate_all=true` once. Require `failed: 0`; investigate and re-register any failed user/calendar pair before considering token rotation complete.
5. Review Supabase API/Postgres/Auth logs for the affected table names, permission/RLS errors, unusual anon writes before the cutoff, and webhook token/channel failures after rotation. Record the time window and findings in the incident log.

Do not run step 4 before the code deployment: changing `webhook_token` in SQL alone breaks the token Google sends for the existing channel.

## Original Batch 1 rationale: RLS-only

Enabling RLS with no permissive policy already denies `anon` and `authenticated` — only `service_role` bypasses (`rolbypassrls`). **Proven on a throwaway PostgreSQL 16 instance with prod's exact grants in place:** with `grant all` to `anon`, an RLS-enabled table returned 0 rows to `anon` on SELECT and rejected INSERT with `new row violates row-level security policy`, while the bypass role still read normally.

A table-level `REVOKE` adds nothing for these tables and introduces a worse failure mode: SECURITY INVOKER functions get a hard `permission denied` instead of simply seeing zero rows. There is also **no precedent for revoking table grants anywhere in `supabase/migrations/`** — every existing revoke targets a function. The established BuildOS pattern is RLS + policies scoped `to authenticated`.

The Phase 0 follow-up now adds selective revokes after moving or hardening the affected invoker paths. It also revokes `TRUNCATE`, `REFERENCES`, and `TRIGGER` globally because RLS does not protect those table capabilities.

## Landmines (things a naive fix breaks)

1. **`delete_onto_project` is an agentic chat tool and is SECURITY INVOKER** (`tools.config.ts:141`). It reads/deletes `onto_permissions`, `onto_insights`, `onto_metric_points`, `onto_signals`. A revoke on those breaks project deletion via chat immediately. RLS-only is safe today because all four hold zero rows, so an RLS-filtered read and a zero-row DELETE are already the status quo.
2. **`error_logs` is written by unauthenticated requests.** Login/register failure paths use the request-scoped client before a JWT exists, so the INSERT travels as `anon` (`routes/auth/login/+server.ts:30`, `api/auth/login/+server.ts:75,305`, `api/auth/register/+server.ts:143`). A policy scoped `to authenticated` silently destroys exactly the logs needed to debug this rollout.
3. **`queue_jobs` is the only one of the 52 in the `supabase_realtime` publication** (verified via `pg_publication_rel`). `realtimeBrief.service.ts:135-141` subscribes to `postgres_changes` filtered `user_id=eq.$uid`, so it needs a SELECT policy or brief progress silently stops updating in the browser.
4. **Seven user-scoped `queue_jobs` writers, not three.** The initial map found three; a follow-up sweep of every `add_queue_job` and `from('queue_jobs')` call site found **four more, all in `/admin` routes** using `locals: { supabase }` — `api/admin/sms/daily-scheduler/trigger`, `api/admin/notifications/deliveries/[id]/retry`, `api/admin/notifications/deliveries/[id]/resend`, and `api/admin/notifications/test`. Those would have broken admin notification retry/resend/test and the manual SMS scheduler. One site was already half-fixed: `project-calendar.service.ts` had moved the read-back to the admin client with a comment about "RLS misses" but left the INSERT on the user client. **Lesson: enumerate call sites mechanically, not from a summary — the summary undercounted by more than half.**
5. **`notes` has a dormant policy that would block all writes if RLS were enabled as-is** — it joins the legacy `projects` table while the routes write through `onto_*`.
6. **All dormant policies target role `{public}`, which includes `anon`.** Replacing beats keeping.
7. **`feedback_rate_limit` currently fails open** — `api/feedback/+server.ts:98` catches errors and returns `true`.
8. **The MCP server and agent gateway are unaffected.** `context.admin` is service role at every entry point (`api/agent-call/buildos/+server.ts:39-40`, `mcp/buildos/+server.ts:16,24`, worker `agentRunWorker.ts`). Any MCP/worker failure during rollout means something other than RLS broke.

## Batch 1 — inert tables (applied)

`supabase/migrations/20260730010000_rls_lockdown_batch_1_inert_tables.sql` — 18 tables, RLS + `service_role` policy, no revokes, no behavior change.

Validation performed on a throwaway PostgreSQL 16 instance with stub tables: applies to `COMMIT`, idempotent on re-run, results in 18/18 RLS-enabled, anon blocked for both read and write with grants present, service role unaffected, and `authenticated` still reads `onto_facet_definitions` (preserving `validate_facet_values`).

Two tables needed a policy rather than bare RLS:

- `onto_facet_definitions` (3 rows) — global reference data with no ownership column, read by SECURITY INVOKER `validate_facet_values`. Gets `for select to authenticated using (true)`, which keeps the function working and excludes anon by role targeting.
- `agent_chat_messages` (535 rows) — already carries correct dormant policies (own-row ALL + `is_admin()` SELECT); they activate on enable and are left in place.

Excluded from batch 1: `retargeting_founder_pilot_members` (45 rows read by two SECURITY INVOKER functions whose call sites are not pinned down — RLS could silently zero their results).

**Verify with:** `node scripts/security/verify-rls-lockdown.mjs --tables scripts/security/rls-batch-1.json`

The verifier proves both directions and reports `WEAK` rather than `PASS` for empty tables, because an empty table returns `[]` to everyone and would otherwise false-pass.

## Historical Batch 2 plan (implemented by the Phase 0 migrations above)

| Table                 | Change                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queue_jobs`          | **Code prerequisite DONE 2026-07-30** (all seven writers moved to the service role; full web suite 3160/3160 green, svelte-check clean). Still needs the SQL: RLS + **required** SELECT `user_id = auth.uid()` for realtime + `is_admin()` SELECT for analytics, and replacement of the dormant service_role policy (it uses `current_setting('role')`, not `auth.role()`). |
| `feedback_rate_limit` | `ALTER FUNCTION check_feedback_rate_limit(...) SECURITY DEFINER` + pinned `search_path`, grant EXECUTE to anon/authenticated. Then the table hard-locks cleanly. Drop its three `USING (true)` policies.                                                                                                                                                                    |
| `error_logs`          | Decide: narrow anon+authenticated INSERT policy `with check (user_id IS NULL OR user_id = auth.uid())` plus own-row/admin SELECT (recommended), or route all six write sites through a SECURITY DEFINER `log_client_error(...)` RPC (most secure, more code). Not authenticated-only.                                                                                       |
| `visitors`            | Anon INSERT-only policy + `is_admin()` SELECT. Also make `get_visitor_overview` / `get_daily_visitors` DEFINER or the admin dashboard silently renders zeros.                                                                                                                                                                                                               |
| `beta_signups`        | Anon INSERT **and** anon SELECT (the dup-check at `api/beta/signup/+server.ts:393` 500s without SELECT) + `is_admin()` SELECT/UPDATE.                                                                                                                                                                                                                                       |

## Historical Batch 3 plan (implemented by the Phase 0 migrations above)

Group by predicate shape and ship in small batches, each with the `service_role` policy and a `.insert().select()` audit:

- **Direct `user_id = auth.uid()` (15):** `calendar_webhook_channels`, `notes` (drop legacy policy first), `notification_subscriptions`, `onto_event_sync`, `project_brief_templates`, `project_questions`, `task_calendar_events`, `user_calendar_preferences`, `user_notification_preferences`, `user_notifications`, `user_sms_preferences`, `notification_deliveries` (`recipient_user_id`), `notification_events` (`actor_user_id` OR `target_user_id`), `onto_actors`, `agent_chat_sessions`.
    - `onto_actors` needs a third disjunct for the unauthenticated public-page routes (`api/public/pages/[slug]/+server.ts:32`, `api/public/authors/[slugPrefix]/pages/+server.ts:55`) or public pages lose author attribution.
- **Project scope (6):** `onto_events`, `onto_requirements`, `onto_metrics`, `onto_sources`, `project_notification_batches`, and `onto_document_versions` via `document_id IN (SELECT d.id FROM onto_documents d WHERE current_actor_has_project_member_access(d.project_id, 'read'))`. Use the existing `onto_projects` read/write/admin shape.
- **`is_admin()`-only (5):** `beta_feedback`, `beta_members`, `legacy_entity_mappings`, `migration_log`, `system_metrics`. `system_metrics` is the cheapest table in the set — its only writer has zero call sites and both dormant policies are already correct, so `enable row level security` and nothing else.
- **Global reference (1):** `onto_facet_values` — no ownership column; `select to authenticated using (true)`.

## Historical Batch 4 plan (resolved)

- **`onto_assignments`** is service-only. The collaboration route first proves project write access, then performs the polymorphic lookup/write through the server client. `delete_onto_project` is now a guarded `SECURITY DEFINER` function so cleanup remains complete.
- **`retargeting_founder_pilot_members`** is service-only. Its freeze/report RPCs are callable only by `service_role`; all known callers are admin or cron server routes.
- The remaining SECURITY INVOKER dependencies either received a safe ownership policy or were moved behind service-only execution before table privileges were revoked.

## Verification

Beyond the script, the admin analytics RPCs need **non-empty-result** assertions, not just 200s — twelve of them are SECURITY INVOKER and return zeros rather than errors when RLS filters them (`get_visitor_overview`, `get_daily_visitors`, `get_daily_active_users`, `get_notification_channel_performance`, `get_notification_event_performance`, `get_notification_failed_deliveries`, `get_sms_notification_stats` ×2, `get_notification_active_subscriptions`, `get_notification_delivery_timeline`, `get_notification_overview_metrics`).

Post-migration invariants:

```sql
-- should list only deliberately deferred tables
select relname from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;

-- every RLS-enabled table should have >= 1 policy or be an intentional hard-lock
select tablename, count(*) from pg_policies where schemaname = 'public' group by 1;
```
