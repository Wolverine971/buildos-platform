<!-- apps/web/docs/features/admin-dashboard/ONTOLOGY_ANALYTICS_PLAN.md -->

# Admin Analytics Ontology Migration Plan

## Goals

- Replace legacy brain dump analytics with ontology-first agent chat data (`agent_chat_sessions`, `agent_chat_messages`, `agent_executions`, `agent_plans`).
- Track daily brief recipients (who is eligible vs who actually received email/SMS) rather than just total briefs generated.
- Ensure system health metrics are fresh and sourced from the right signals, with reliable updates.

## Current State (findings)

- **Admin dashboard payload** (`apps/web/src/lib/services/admin/dashboard-analytics.service.ts`)
    - `getComprehensiveAnalytics` still pulls from `brain_dumps` for totals, averages, and leaderboards; UI surfaces these as “Brain Dumps” cards/leaderboards in `apps/web/src/routes/admin/+page.svelte`.
    - Daily brief charts use `get_brief_generation_stats` RPC (likely backed by `daily_briefs`); export endpoint (`apps/web/src/routes/api/admin/analytics/export/+server.ts`) also uses this.
    - System health card just reads the last 10 rows from `system_metrics` via `getSystemMetrics`; no freshness check.
    - `admin_analytics` table is only written by `ActivityLogger.updateDailyAnalytics`, which counts `daily_briefs` and `user_activity_logs` but is not invoked anywhere.
- **Agent/ontology data already available**
    - Core tables: `agent_chat_sessions` (status, session_type, message_count, plan link, user_id), `agent_chat_messages` (role, model_used, tool_calls, tokens_used), `agent_executions`, `agent_plans`, `agents`.
    - Admin chat APIs (`apps/web/src/routes/api/admin/chat/*`) already query these tables for agent analytics; export route at `apps/web/src/routes/api/admin/chat/export/+server.ts` still exports legacy `chat_sessions/messages`.
    - Admin UI spec (`apps/web/docs/features/chat-system/ADMIN_UI_SPECIFICATION.md`) expects ontology chat metrics (session_count, avg_turns, tokens, strategy breakdown).
- **Daily brief signals**
    - Generation tables: `daily_briefs`, `project_daily_briefs`; ontology worker writes to `ontology_daily_briefs` (type-asserted because schema not updated yet) in `apps/worker/src/workers/brief/ontologyBriefGenerator.ts`.
    - Recipient preferences: `user_notification_preferences.should_email_daily_brief` / `should_sms_daily_brief`; `preferenceChecker` enforces these for `brief.completed` notifications (`apps/worker/src/workers/notification/preferenceChecker.ts`).
    - Delivery evidence: `emails` (category likely `daily_brief`), `email_recipients` (sent_at, delivered_at, opens), `email_tracking_events`; SMS channel via `user_sms_preferences`.
    - Linkage: `chat_sessions_daily_briefs` table connects briefs to chat sessions (useful for context/attribution).
    - No current admin view that lists “who is getting briefs”; daily brief counts come only from generation RPC/`daily_briefs`.
- **System health signals**
    - `system_metrics` table is written only via `ActivityLogger.logSystemMetric` and currently used in `LLMPool.makeRequest` to record LLM call duration; `refresh_system_metrics` was removed, so no refresher exists today.
    - Admin dashboard and export read `system_metrics` without validating staleness.
    - Error surface exists via `ErrorLoggerService`, but `getSystemOverview`/`getSystemMetrics` don’t combine error rates or queue health (no queue depth/cron lag metrics captured).

## Gaps

- Brain dump metrics no longer represent agentic chat usage; UI/queries still hard-coded to `brain_dumps`.
- Daily brief analytics lack recipient visibility and do not account for ontology `ontology_daily_briefs`; admin export omits per-user delivery and channel breakdown.
- System health panel may show stale or incomplete data; no scheduled writer for `system_metrics` and no refresher RPC.
- Admin chat export still points at legacy `chat_sessions/messages` instead of ontology agent chat tables.

## Plan

1. **Data model & SQL surface**
    - Add SQL views/RPCs for ontology chat analytics (e.g., `get_agent_chat_overview(start_date, end_date)`) that return: sessions count, avg turns, tokens per session/message, planner vs executor session mix, failures (status = failed), and per-user leaderboards (top chat users by sessions/messages/tokens).
    - Add daily brief recipient view: join `user_notification_preferences` + `user_sms_preferences` + `emails/email_recipients` filtered by `category='daily_brief'` + (eventual) `ontology_daily_briefs` for generation status; expose per-user channel flags, last_sent timestamps, and last_delivery status.
    - Add a system health refresher (new RPC or scheduled job) that writes to `system_metrics`: LLM latency (per provider), worker queue depth/oldest job, failed job count, Supabase error rate, recent agent execution failure rate. Use a new worker cron to populate on an interval (e.g., every 5–10 minutes).

2. **Backend service updates**
    - Replace `brainDumpMetrics` in `getComprehensiveAnalytics` with ontology chat aggregates (sessions/messages/tokens/tool calls/strategy split) and update leaderboards to use agent chat users instead of brain dump authors.
    - Update `getBriefGenerationStats` to read from `ontology_daily_briefs` when present, fall back to `daily_briefs`, and augment with recipient counts from the new daily-brief-recipient view (email vs SMS vs in-app).
    - Update admin chat export (`apps/web/src/routes/api/admin/chat/export/+server.ts`) to export `agent_chat_sessions/messages/executions/plans` instead of legacy `chat_sessions`.
    - Wire `getSystemMetrics` to the refreshed system health view and include “last updated” metadata; feed the same into `/api/admin/analytics/export` CSV.
    - Make `ActivityLogger.updateDailyAnalytics` (web + worker versions) compute daily metrics from agent chat + brief recipient view (daily active chat users, sessions, messages, briefs sent per channel) and schedule it via worker cron.

3. **UI/dashboard updates**
    - Swap “Brain Dumps” cards/leaderboards in `apps/web/src/routes/admin/+page.svelte` for agent chat KPIs (total agent conversations, avg turns, tokens/session, planner vs executor mix, failure rate).
    - Add a “Daily Brief Recipients” panel showing: total opted-in email/SMS users, actually delivered in last 24h/7d, top non-delivered reasons (preference off, bounce, SMS opt-out), and last-send timestamps.
    - Enhance “System Health” to display current metric values with freshness badges and a trend (e.g., queue depth, LLM latency, failed jobs, error rate).
    - Update CSV export and any summaries to match the new metrics (agent chat + brief recipients + refreshed system health).

4. **Testing & rollout**
    - Backfill sanity checks: cross-verify agent chat counts vs existing admin chat endpoints, and daily brief recipients vs `emails/email_recipients`.
    - Add unit/integration tests for new RPCs/views and server endpoints; include regression coverage for admin dashboard payload shape.

- Plan a staged rollout flag (e.g., feature flag to toggle new dashboard sections) to de-risk UI changes while data surfaces stabilize.

## Cleanup: endpoints to deprecate/remove

- `apps/web/src/routes/api/admin/analytics/brief-stats/+server.ts`: Legacy brief chart backed by `get_brief_generation_stats` (daily_briefs). Replace with ontology brief recipient/sent stats and remove this endpoint once the new view is live.
- `apps/web/src/routes/api/admin/analytics/export/+server.ts`: CSV export merges `get_brief_generation_stats` with daily users and raw `system_metrics`; replace with the new ontology chat + brief recipient + refreshed system health export, then delete this legacy export route.
- `apps/web/src/routes/api/admin/chat/export/+server.ts`: Exports legacy `chat_sessions/messages`; replace with `agent_chat_sessions/messages/executions/plans` export and delete the legacy handler.
- Admin dashboard payload sections that surface `brainDumpMetrics` and brain dump leaderboards in `apps/web/src/lib/services/admin/dashboard-analytics.service.ts` and `apps/web/src/routes/admin/+page.svelte`: remove the legacy cards/leaderboards after the agent-chat KPIs ship.

## Cleanup: database RPCs/functions to drop after migration

- `get_brief_generation_stats(start_date, end_date)`: legacy daily_briefs aggregation; delete after the new ontology brief/recipient view or RPC ships and consumers are switched.
- Any helper views/functions that aggregate `brain_dumps` for admin dashboards (none referenced directly in code; confirm migrations for `get_brain_dump_*` if they exist) should be dropped after the agent chat aggregates land.
- `refresh_system_metrics` was removed; avoid referencing it in future plans.
