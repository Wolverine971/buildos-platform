# Admin Recent Activity Ontology Audit (2026-01-03)

## Scope

Audit the admin "recent activity" stats and logs to confirm they use the correct ontology data sources, and identify gaps in logging and querying.

## Current Data Sources

### Logging Pipelines

- `user_activity_logs` via `ActivityLogger` in web and worker. Used for login, briefs, brain dumps, templates, admin actions, etc. Evidence: `apps/web/src/lib/utils/activityLogger.ts`, `apps/worker/src/lib/utils/activityLogger.ts`.
- `onto_project_logs` via async activity logger for ontology endpoints and chat session processor. Evidence: `apps/web/src/lib/services/async-activity-logger.ts`, `apps/web/src/routes/api/onto/*`, `apps/worker/src/workers/chat/chatSessionActivityProcessor.ts`.

### Admin Queries + UI Sections

- Admin dashboard "Recent Activity" uses `getRecentActivity` which queries `user_activity_logs`. Evidence: `apps/web/src/lib/services/admin/dashboard-analytics.service.ts`, `apps/web/src/routes/admin/+page.svelte`.
- Admin recent activity endpoint `/api/admin/analytics/recent-activity` also uses `getRecentActivity`. Evidence: `apps/web/src/routes/api/admin/analytics/recent-activity/+server.ts`.
- Admin user activity modal timeline + stats use legacy tables (`projects`, `tasks`, `notes`, `brain_dumps`, `daily_briefs`, `task_calendar_events`). Evidence: `apps/web/src/routes/api/admin/users/[userId]/activity/+server.ts`, `apps/web/src/lib/components/admin/UserActivityModal.svelte`.
- Admin user context panel uses `EmailGenerationService.getUserContext`, which pulls legacy tables for counts and recent projects. Evidence: `apps/web/src/routes/api/admin/users/[id]/context/+server.ts`, `apps/web/src/lib/services/email-generation-service.ts`.
- Ontology project activity logs are surfaced only in project UI via `/api/onto/projects/[id]/logs`. Evidence: `apps/web/src/routes/api/onto/projects/[id]/logs/+server.ts`, `apps/web/src/lib/components/ontology/ProjectActivityLogPanel.svelte`.

## Findings

1. Admin dashboard recent activity is not using ontology logs.
    - Current feed is sourced from `user_activity_logs`, which does not include ontology entity changes created via `/api/onto/*`.
    - Impact: Admin "Recent Activity" misses most ontology work (tasks/goals/documents created or updated in the new system).
    - Evidence: `apps/web/src/lib/services/admin/dashboard-analytics.service.ts`, `apps/web/src/routes/api/onto/tasks/create/+server.ts`.

2. Admin per-user activity stats and timeline are built from legacy tables.
    - The user activity endpoint builds stats and recent activity from `projects`, `tasks`, `notes`, etc.
    - Impact: Counts and timelines will be incorrect for users whose work lives in `onto_*` tables. Missing ontology-only entities and project changes.
    - Evidence: `apps/web/src/routes/api/admin/users/[userId]/activity/+server.ts`.

3. Admin user context panel uses legacy activity data.
    - `EmailGenerationService.getUserContext` counts `projects`, `tasks`, `notes`, `phases`, etc., not `onto_*`.
    - Impact: "Recent activity stats" in the admin user context panel can show zeros or outdated values after ontology migration.
    - Evidence: `apps/web/src/lib/services/email-generation-service.ts`.

4. Ontology activity logging has a schema mismatch for entity types.
    - Code logs `document` and `decision` entity types, but the `onto_project_logs` constraint only allows a fixed list that excludes those values.
    - Impact: Inserts for documents/decisions likely fail silently (async logger catches errors), producing missing logs.
    - Evidence: `apps/web/src/routes/api/onto/documents/create/+server.ts`, `apps/web/src/routes/api/onto/decisions/+server.ts`, `supabase/migrations/20251208_project_activity_logging.sql`, `packages/shared-types/src/project-activity.types.ts`.

5. Ontology activity log enrichment does not map `document` or `decision`.
    - `ProjectActivityLogPanel` enrichment only maps `note` to `onto_documents` and has no mapping for `document` or `decision`.
    - Impact: Even if logs are stored, entity names may not be fetched and UI will fall back to sparse data.
    - Evidence: `apps/web/src/lib/components/ontology/ProjectActivityLogPanel.svelte`.

6. Some ontology write paths do not log activity at all.
    - Example: ontology project instantiation inserts `onto_*` entities but does not record `onto_project_logs`.
    - Impact: Large batches of project creation/seed data appear missing from recent activity.
    - Evidence: `apps/web/src/lib/services/ontology/instantiation.service.ts`.

7. RLS may block admin visibility into ontology logs.
    - `onto_project_logs` RLS policy restricts SELECT to project owners (auth.uid). Admin endpoints use the user-scoped Supabase client.
    - Impact: Admin dashboard would not see global ontology activity even after query changes unless using a service role client or admin-specific policy.
    - Evidence: `supabase/migrations/20251208_project_activity_logging.sql`, `apps/web/src/lib/supabase/admin.ts`.

8. UI assumptions are based on `activity_type` strings, not ontology `entity_type` + `action`.
    - Admin UI components expect fields like `activity_type` (e.g., `task_created`), while ontology logs store separate `entity_type` and `action`.
    - Impact: Updating queries to ontology logs will require UI mapping changes.
    - Evidence: `apps/web/src/routes/admin/+page.svelte`, `apps/web/src/lib/components/admin/ActivityTimelineChart.svelte`.

## Things To Fix (Recommended)

- [x] Decide the canonical admin activity feed source.
    - Implemented a combined feed that merges `onto_project_logs` with `user_activity_logs` for non-ontology events.
- [x] Update admin recent activity queries to use ontology logs (or combined view).
    - Admin recent activity now returns `entity_type` + `action` with optional entity/project labels.
- [x] Update per-user activity stats and timelines to use ontology tables.
    - Switched to `onto_projects`, `onto_tasks`, `onto_documents`, `ontology_daily_briefs`, and `onto_project_logs`.
- [x] Fix `onto_project_logs` entity type constraint.
    - Added `document` and `decision` to the constraint and aligned with `ProjectLogEntityType`.
- [x] Update ontology log enrichment mappings.
    - Added `document` and `decision` mappings to the project log enrichment.
- [x] Fill logging gaps for ontology batch operations.
    - Added bulk activity logging to ontology project instantiation.
- [x] Ensure admin access to ontology logs.
    - Added an admin SELECT policy to `onto_project_logs`.

## Open Questions

- Should the admin "Recent Activity" feed include non-ontology events (login, brief generation) alongside ontology entity changes?
- Is the admin dashboard expected to show global activity across all users, or only per-admin-owned projects?
- Should the UI evolve to display `entity_type` + `action` rather than `activity_type` strings?
