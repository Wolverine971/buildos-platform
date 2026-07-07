<!-- docs/technical/reviews/admin-dashboard-query-audit-2026-07-02.md -->

# Admin Dashboard Query Audit

Date: 2026-07-02

Scope: admin dashboard, user activity modal, admin user table, and chat analytics/export endpoints.

## Summary

The main issue was inconsistent Supabase client usage in admin-only endpoints. Several routes authenticated an admin user correctly, then continued reading cross-user activity through the request-scoped Supabase client. That can be RLS-scoped to the logged-in admin and can hide other users' current `chat_sessions` / `chat_messages` rows.

The preferred pattern is:

1. Authenticate the request user with `safeGetSession`.
2. Verify admin authorization with the existing `user.is_admin` or `admin_users` check.
3. Use `createAdminSupabaseClient()` for read-only cross-user admin analytics/activity queries.

## P1 Findings

### User Activity Modal Reads

Status: fixed in this pass.

`apps/web/src/routes/api/admin/users/[userId]/activity/+server.ts` created a service-role client for error logging, but the rest of the activity payload still used the request-scoped client. This affected project drilldown data and, most importantly, current `chat_sessions` and `chat_messages`.

Fix: after admin authorization, the endpoint now uses the service-role client for user, actor, project, activity, current chat, legacy agent chat, and project-link reads.

### Admin Analytics Routes

Status: fixed in this pass.

`apps/web/src/routes/api/admin/analytics/dashboard/+server.ts` and `apps/web/src/routes/api/admin/analytics/comprehensive/+server.ts` passed the request-scoped client into dashboard analytics services. The fallback service paths query current chat telemetry tables, so admin-wide analytics could be undercounted.

Fix: both routes now instantiate the service-role client after `user.is_admin` authorization and pass it to the analytics service functions.

### Admin Chat Telemetry Routes

Status: fixed in this pass.

The following routes verified admin membership through `admin_users`, then used the request-scoped client for cross-user telemetry reads:

- `apps/web/src/routes/api/admin/chat/dashboard/+server.ts`
- `apps/web/src/routes/api/admin/chat/agents/+server.ts`
- `apps/web/src/routes/api/admin/chat/export/+server.ts`
- `apps/web/src/routes/api/admin/chat/costs/+server.ts`
- `apps/web/src/routes/api/admin/chat/domains/+server.ts`
- `apps/web/src/routes/api/admin/chat/tools/+server.ts`
- `apps/web/src/routes/api/admin/chat/timing/+server.ts`

Fix: each route keeps the existing request-scoped admin authorization check, then switches telemetry, export, timing, tool, domain, and cost reads to the service-role client.

## P2 Findings

### Recently Active Older Chat Sessions

`apps/web/src/routes/api/admin/chat/sessions/+server.ts` filters the session list by `created_at >= startDate`. A long-lived session created before the timeframe but active through `last_message_at` inside the timeframe can be missing. Consider filtering by recent activity, matching the dashboard's `created_at` or `last_message_at` semantics.

Status: fixed. The session list now filters by `last_message_at`, `updated_at`, or `created_at` within the timeframe.

### Subscription User Filtering

`apps/web/src/routes/api/admin/subscriptions/users/+server.ts` applies subscription status filtering after pagination. Filtered pages can be short and totals can describe the unfiltered user set. Move status filtering into the query/RPC path or compute the filtered count before pagination.

Status: fixed. Status filters are resolved before pagination, and the paginated user query receives the matching or excluded user IDs before `.range()`.

### Revenue and Subscription Admin Reads

`apps/web/src/routes/api/admin/revenue/+server.ts` ignores several query errors and performs billing reads with the request-scoped client. If billing RLS is restrictive, revenue can silently show partial or zero data. Consider service-role reads after admin auth and explicit error handling.

Status: fixed. Revenue and subscription overview reads now use the service-role client after admin auth, and revenue/subscription helper queries throw on data errors instead of silently returning partial data.

### Stale `agentic_*` API Names

Some admin APIs still expose combined current + legacy chat metrics through `agentic_*` fields for compatibility. Prefer canonical `chat_*` fields in new UI/API code and treat `agentic_*` as legacy aliases.

Status: fixed. The admin users page now uses canonical `chat_*` fields for labels, sorting, and display. API responses keep `agentic_*` aliases with comments marking them as legacy compatibility fields.

### Existing Admin Typecheck Debt

Full `svelte-check` was already known to fail in `apps/web/src/lib/services/admin/chat-session-audit-compact.ts` due nullability/type issues. That remains separate from this P1 query fix.

Status: cleared for this pass. `svelte-check` reports 0 errors. The only remaining diagnostic is an existing onboarding warning in `apps/web/src/routes/onboarding/+page.svelte`.

## Validation

- `svelte-check`: 0 errors, 1 existing onboarding warning.
- Focused Vitest: 7 files passed, 21 tests passed.
