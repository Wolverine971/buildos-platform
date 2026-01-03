<!-- docs/reports/admin-analytics-ontology-audit.md -->

# Admin Analytics Ontology Audit (2026-01-01)

## Scope

- `/admin` dashboard and the analytics payload it loads
- `/admin` subroutes that surface analytics-style metrics (users, chat, notifications)
- `/api/admin/analytics/*` and `/api/admin/chat/*` endpoints

## Update (2026-01-27)

- Dashboard analytics now use ontology + agent sources (`apps/web/src/lib/services/admin/dashboard-analytics.service.ts`).
- Admin users metrics now use ontology tables (`apps/web/src/routes/api/admin/users/+server.ts`).
- Admin chat endpoints now use agent tables + usage logs (`apps/web/src/routes/api/admin/chat/*`).
- Notification real-data preview now uses ontology sources (`apps/web/src/routes/api/admin/notifications/real-data/[userId]/[eventType]/+server.ts`).
- RPCs `get_user_engagement_metrics`, `get_daily_active_users`, `get_brief_generation_stats` updated to ontology tables (`supabase/migrations/20260127_admin_analytics_ontology_updates.sql`).

## Findings (Resolved 2026-01-27)

### Admin dashboard (`/admin`)

- **Dashboard analytics service still queries legacy tables for core metrics.**
    - **Evidence:** `apps/web/src/lib/services/admin/dashboard-analytics.service.ts`
    - **Legacy sources:** `brain_dumps`, `projects`, `tasks`, `task_calendar_events`, `phases`, `daily_briefs`, `user_activity_logs`.
    - **Impact:** Brain dump and project/task KPIs ignore ontology tables and agent chat data.
    - **Suggested sources:** `agent_chat_sessions`, `agent_chat_messages`, `agent_executions`, `onto_projects`, `onto_tasks`, `onto_plans`, `ontology_daily_briefs`, `onto_braindumps`.
    - **Status:** Resolved (ontology + agent sources).

- **Brief chart endpoint uses legacy daily briefs.**
    - **Evidence:** `apps/web/src/routes/api/admin/analytics/brief-stats/+server.ts`
    - **Legacy source:** `get_brief_generation_stats` RPC (daily_briefs).
    - **Suggested sources:** `ontology_daily_briefs` plus recipient/delivery joins.
    - **Status:** Resolved via updated RPC (`supabase/migrations/20260127_admin_analytics_ontology_updates.sql`).

- **CSV export merges legacy brief stats.**
    - **Evidence:** `apps/web/src/routes/api/admin/analytics/export/+server.ts`
    - **Legacy source:** `get_brief_generation_stats` RPC (daily_briefs).
    - **Suggested sources:** ontology brief metrics + delivery/recipient stats.
    - **Status:** Resolved via updated RPC (`supabase/migrations/20260127_admin_analytics_ontology_updates.sql`).

- **Recent activity feed mixes ontology logs with legacy activity logs.**
    - **Evidence:** `apps/web/src/lib/services/admin/dashboard-analytics.service.ts`
    - **Legacy source:** `user_activity_logs`.
    - **Suggested sources:** `onto_project_logs` + ontology brief activity (or a combined ontology-first view).
    - **Status:** Resolved (ontology logs + briefs).

### Admin users (`/admin/users`)

- **User list metrics still count legacy entities.**
    - **Evidence:** `apps/web/src/routes/api/admin/users/+server.ts`
    - **Legacy sources:** `brain_dumps`, `daily_briefs`, `projects`, `phases`.
    - **Suggested sources:** `onto_braindumps`, `ontology_daily_briefs`, `onto_projects`, `onto_plans`.
    - **Status:** Resolved (ontology tables).

### Admin chat (`/admin/chat/*`)

- **Chat dashboard KPIs and activity feed still rely on legacy chat tables.**
    - **Evidence:** `apps/web/src/routes/api/admin/chat/dashboard/+server.ts`
    - **Legacy sources:** `chat_sessions`, `chat_messages`, `chat_compressions`, `chat_tool_executions`.
    - **Suggested sources:** `agent_chat_sessions`, `agent_chat_messages`, `agent_executions`, `agent_plans` (+ usage logs for costs).
    - **Status:** Resolved (agent tables + usage logs).

- **Chat sessions list uses legacy session/message tables.**
    - **Evidence:** `apps/web/src/routes/api/admin/chat/sessions/+server.ts`
    - **Legacy sources:** `chat_sessions`, `chat_messages`, `chat_compressions`.
    - **Suggested sources:** `agent_chat_sessions`, `agent_chat_messages`.
    - **Status:** Resolved (agent tables).

- **Chat session detail reads legacy session + message data.**
    - **Evidence:** `apps/web/src/routes/api/admin/chat/sessions/[id]/+server.ts`
    - **Legacy sources:** `chat_sessions`, `chat_messages`, `chat_tool_executions`, `chat_compressions`.
    - **Suggested sources:** `agent_chat_sessions`, `agent_chat_messages`, `agent_executions`.
    - **Status:** Resolved (agent tables).

- **Chat costs endpoint falls back to legacy tables and uses them for top sessions.**
    - **Evidence:** `apps/web/src/routes/api/admin/chat/costs/+server.ts`
    - **Legacy sources:** `chat_messages`, `chat_sessions` (fallback + top sessions).
    - **Suggested sources:** `agent_chat_sessions`, `agent_chat_messages`, `llm_usage_logs`.
    - **Status:** Resolved (agent tables + usage logs fallback).

- **Chat export still emits legacy sessions/messages.**
    - **Evidence:** `apps/web/src/routes/api/admin/chat/export/+server.ts`
    - **Legacy sources:** `chat_sessions`, `chat_messages`.
    - **Suggested sources:** `agent_chat_sessions`, `agent_chat_messages`, `agent_executions`, `agent_plans`.
    - **Status:** Resolved (agent tables only).

### Admin notifications (real-data preview in `/admin/notifications`)

- **Notification real-data preview pulls from legacy project/task tables.**
    - **Evidence:** `apps/web/src/routes/api/admin/notifications/real-data/[userId]/[eventType]/+server.ts`
    - **Legacy sources:** `daily_briefs`, `brain_dumps`, `projects`, `tasks`, `project_phases`.
    - **Suggested sources:** `ontology_daily_briefs`, `onto_braindumps`, `onto_projects`, `onto_tasks`, `onto_plans`.
    - **Status:** Resolved (ontology sources).

## Items To Verify (Remaining)

- `get_daily_visitors` and `get_visitor_overview` still source `visitors` (not ontology). Confirm that is still expected.
- Current definitions for `get_user_engagement_metrics`, `get_daily_active_users`, `get_brief_generation_stats` live in `supabase/migrations/20260127_admin_analytics_ontology_updates.sql`.
