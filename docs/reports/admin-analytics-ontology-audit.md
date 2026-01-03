<!-- docs/reports/admin-analytics-ontology-audit.md -->

# Admin Analytics Ontology Audit (2026-01-01)

## Scope

- `/admin` dashboard and the analytics payload it loads
- `/admin` subroutes that surface analytics-style metrics (users, chat, notifications)
- `/api/admin/analytics/*` and `/api/admin/chat/*` endpoints

## Findings: Outdated Queries (Legacy Tables, Not Ontology)

### Admin dashboard (`/admin`)

- **Dashboard analytics service still queries legacy tables for core metrics.**
    - **Evidence:** `apps/web/src/lib/services/admin/dashboard-analytics.service.ts`
    - **Legacy sources:** `brain_dumps`, `projects`, `tasks`, `task_calendar_events`, `phases`, `daily_briefs`, `user_activity_logs`.
    - **Impact:** Brain dump and project/task KPIs ignore ontology tables and agent chat data.
    - **Suggested sources:** `agent_chat_sessions`, `agent_chat_messages`, `agent_executions`, `onto_projects`, `onto_tasks`, `onto_plans`, `ontology_daily_briefs`, `onto_braindumps`.

- **Brief chart endpoint uses legacy daily briefs.**
    - **Evidence:** `apps/web/src/routes/api/admin/analytics/brief-stats/+server.ts`
    - **Legacy source:** `get_brief_generation_stats` RPC (daily_briefs).
    - **Suggested sources:** `ontology_daily_briefs` plus recipient/delivery joins.

- **CSV export merges legacy brief stats.**
    - **Evidence:** `apps/web/src/routes/api/admin/analytics/export/+server.ts`
    - **Legacy source:** `get_brief_generation_stats` RPC (daily_briefs).
    - **Suggested sources:** ontology brief metrics + delivery/recipient stats.

- **Recent activity feed mixes ontology logs with legacy activity logs.**
    - **Evidence:** `apps/web/src/lib/services/admin/dashboard-analytics.service.ts`
    - **Legacy source:** `user_activity_logs`.
    - **Suggested sources:** `onto_project_logs` + ontology brief activity (or a combined ontology-first view).

### Admin users (`/admin/users`)

- **User list metrics still count legacy entities.**
    - **Evidence:** `apps/web/src/routes/api/admin/users/+server.ts`
    - **Legacy sources:** `brain_dumps`, `daily_briefs`, `projects`, `phases`.
    - **Suggested sources:** `onto_braindumps`, `ontology_daily_briefs`, `onto_projects`, `onto_plans`.

### Admin chat (`/admin/chat/*`)

- **Chat dashboard KPIs and activity feed still rely on legacy chat tables.**
    - **Evidence:** `apps/web/src/routes/api/admin/chat/dashboard/+server.ts`
    - **Legacy sources:** `chat_sessions`, `chat_messages`, `chat_compressions`, `chat_tool_executions`.
    - **Suggested sources:** `agent_chat_sessions`, `agent_chat_messages`, `agent_executions`, `agent_plans` (+ usage logs for costs).

- **Chat sessions list uses legacy session/message tables.**
    - **Evidence:** `apps/web/src/routes/api/admin/chat/sessions/+server.ts`
    - **Legacy sources:** `chat_sessions`, `chat_messages`, `chat_compressions`.
    - **Suggested sources:** `agent_chat_sessions`, `agent_chat_messages`.

- **Chat session detail reads legacy session + message data.**
    - **Evidence:** `apps/web/src/routes/api/admin/chat/sessions/[id]/+server.ts`
    - **Legacy sources:** `chat_sessions`, `chat_messages`, `chat_tool_executions`, `chat_compressions`.
    - **Suggested sources:** `agent_chat_sessions`, `agent_chat_messages`, `agent_executions`.

- **Chat costs endpoint falls back to legacy tables and uses them for top sessions.**
    - **Evidence:** `apps/web/src/routes/api/admin/chat/costs/+server.ts`
    - **Legacy sources:** `chat_messages`, `chat_sessions` (fallback + top sessions).
    - **Suggested sources:** `agent_chat_sessions`, `agent_chat_messages`, `llm_usage_logs`.

- **Chat export still emits legacy sessions/messages.**
    - **Evidence:** `apps/web/src/routes/api/admin/chat/export/+server.ts`
    - **Legacy sources:** `chat_sessions`, `chat_messages`.
    - **Suggested sources:** `agent_chat_sessions`, `agent_chat_messages`, `agent_executions`, `agent_plans`.

### Admin notifications (real-data preview in `/admin/notifications`)

- **Notification real-data preview pulls from legacy project/task tables.**
    - **Evidence:** `apps/web/src/routes/api/admin/notifications/real-data/[userId]/[eventType]/+server.ts`
    - **Legacy sources:** `daily_briefs`, `brain_dumps`, `projects`, `tasks`, `project_phases`.
    - **Suggested sources:** `ontology_daily_briefs`, `onto_braindumps`, `onto_projects`, `onto_tasks`, `onto_plans`.

## Items To Verify

- **RPCs used in dashboard analytics** (`get_user_engagement_metrics`, `get_daily_active_users`, `get_daily_visitors`, `get_visitor_overview`). The table sources are not in this repo; confirm whether they still aggregate legacy tables (especially `daily_briefs` and `user_activity_logs`).

<!-- get_user_engagement_metrics -->

BEGIN
RETURN QUERY
SELECT
(SELECT COUNT(_) FROM users) as total_users,
(SELECT COUNT(DISTINCT user_id) FROM user_activity_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as active_users_7d,
(SELECT COUNT(DISTINCT user_id) FROM user_activity_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as active_users_30d,
(SELECT COUNT(_) FROM daily_briefs) as total_briefs,
(SELECT ROUND(AVG(LENGTH(summary_content))) FROM daily_briefs) as avg_brief_length,
(SELECT json_agg(row_to_json(t))
FROM (
SELECT
u.email,
COUNT(db.id) as brief_count,
MAX(db.created_at) as last_brief
FROM users u
LEFT JOIN daily_briefs db ON u.id = db.user_id
WHERE db.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY u.id, u.email
ORDER BY brief_count DESC
LIMIT 10
) t) as top_active_users;
END;

<!-- get_daily_active_users -->

BEGIN
RETURN QUERY
SELECT
DATE(ual.created_at) as date,
COUNT(DISTINCT ual.user_id) as active_users
FROM user_activity_logs ual
WHERE DATE(ual.created_at) BETWEEN start_date AND end_date
GROUP BY DATE(ual.created_at)
ORDER BY date;
END;

<!-- get_daily_visitors -->

BEGIN
RETURN QUERY
WITH date_series AS (
SELECT generate_series(start_date::DATE, end_date::DATE, '1 day'::INTERVAL)::DATE AS date
),
daily_counts AS (
SELECT
DATE(created_at AT TIME ZONE 'UTC') as visit_date,
COUNT(DISTINCT visitor_id) as visitor_count
FROM visitors
WHERE DATE(created_at AT TIME ZONE 'UTC') BETWEEN start_date AND end_date
GROUP BY DATE(created_at AT TIME ZONE 'UTC')
)
SELECT
ds.date,
COALESCE(dc.visitor_count, 0) as visitor_count
FROM date_series ds
LEFT JOIN daily_counts dc ON ds.date = dc.visit_date
ORDER BY ds.date ASC;
END;

<!-- get_visitor_overview -->

BEGIN
RETURN QUERY
SELECT
(SELECT COUNT(DISTINCT visitor_id) FROM visitors) as total_visitors,
(SELECT COUNT(DISTINCT visitor_id) FROM visitors
WHERE created_at >= NOW() - INTERVAL '7 days') as visitors_7d,
(SELECT COUNT(DISTINCT visitor_id) FROM visitors
WHERE created_at >= NOW() - INTERVAL '30 days') as visitors_30d,
(SELECT COUNT(DISTINCT visitor_id) FROM visitors
WHERE DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE) as unique_visitors_today;
END;
