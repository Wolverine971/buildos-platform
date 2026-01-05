<!-- apps/web/docs/features/ontology/ONTOLOGY_CALENDAR_EVENTS_INTEGRATION_SPEC.md -->

# Ontology Calendar Events Integration Spec

Status: Draft
Owner: Product + Platform

## Goals

- Expose ontology calendar events on `/projects/[id]` (insight panel list + create/update).
- Make project calendars first-class for ontology projects.
- Add calendar tooling to agentic chat (list, create, update, delete, details).
- Keep Google Calendar sync reliable and traceable (onto_event_sync).

## Non-goals

- Full rewrite of legacy task calendar flows (`task_calendar_events`).
- Deep redesign of calendar analysis onboarding.
- Custom calendar UI (full month view) on project page.

## Current State (Audit)

### Data model

- `onto_events` and `onto_event_sync` exist (see `supabase/migrations/20251121_ontology_calendar_foundation.sql`).
- `onto_event_sync.calendar_id` references `project_calendars.id`.
- Migration added to align `project_calendars.project_id` to `onto_projects`
  and drop legacy `onto_project_id`.

### Services and endpoints

- `CalendarService.scheduleTask` dual-writes `onto_events` only on create (no update/delete sync).
    - `apps/web/src/lib/services/calendar-service.ts`
- `ProjectCalendarService` is now ontology-first but still contains legacy task sync helpers.
    - `apps/web/src/lib/services/project-calendar.service.ts`
- `GET /api/projects/[id]/onto-events` is legacy and expects a legacy project id.
    - `apps/web/src/routes/api/projects/[id]/onto-events/+server.ts`
- `/projects/[id]` page uses ontology RPCs and does not load events.
    - `apps/web/src/routes/projects/[id]/+page.svelte`
    - `apps/web/src/routes/api/onto/projects/[id]/full/+server.ts`
- Agentic chat toolset excludes calendar tools (see `apps/web/src/lib/chat/LLM_TOOL_INSTRUCTIONS.md`).
- `ChatContextService` calendar mode now reads from `onto_events`.
    - `apps/web/src/lib/services/chat-context-service.ts`

## Target Architecture

### Core entities

- `onto_events` is canonical for BuildOS event data.
- `onto_event_sync` stores external provider mapping (Google event id, sync status).
- `project_calendars` is the link between an ontology project and a calendar.
- `onto_edges` capture semantic links (event <-> task, event <-> output, etc).

### Decisions (Confirmed)

- No legacy `projects` row for ontology projects.
- `project_calendars.project_id` should reference `onto_projects` (drop legacy FK, drop `onto_project_id`).
- Allow `onto_events` creation when calendar is not connected (local-only).
- Canonical task-event edge: `task -> event` with `rel = 'has_event'`.
- Defer project calendar creation until the user connects Google Calendar.
- Agentic chat "list calendar events" returns both Google events and `onto_events`,
  merges/dedupes results, and flags missing external mappings.
- Chat listing uses strict time ordering (no source grouping).

### Relationship policy (confirmed)

- `onto_events.owner_entity_type/owner_entity_id` is required for direct ownership.
- Also write an edge for graph traversal:
    - Direction: `task -> event`
    - Rel: `has_event`
- Align migrations + services to the same edge direction and rel key.

### Task-linked scheduling rule (confirmed)

- When an `onto_task` has both `start_at` and `due_at`:
    - If `due_at - start_at <= 10 hours`, create **one** event spanning
      `start_at` → `due_at`.
    - If `due_at - start_at > 10 hours`, create **two** events:
        - Start event: 30 minutes starting at `start_at`.
        - Due event: 30 minutes ending at `due_at` (event start = `due_at - 30m`).
- When only one task timestamp is set:
    - `start_at` only → create a single 30-minute start event.
    - `due_at` only → create a single 30-minute due event starting at `due_at - 30m`.
- These rules only apply when the task is linked to events (via `has_event`).
- Keep this logic centralized (single service) and document edge cases
  before syncing `onto_tasks.start_at/due_at` from event edits.
- Event title conventions:
    - Range event uses the task title.
    - Start/due events use `Start: {task}` / `Due: {task}` prefixes.

### Sync policy

- When BuildOS creates/updates/deletes an event:
    - Update `onto_events`.
    - If calendar connected and sync enabled, update Google event and record `onto_event_sync`.
    - If calendar not connected (or sync disabled), keep the event local-only and
      surface unsynced state in UI/tool results.
    - Update `onto_events.sync_status` and `onto_events.last_synced_at`.
- When Google events are changed (webhook):
    - Update `onto_event_sync` and mirror to `onto_events` if linked.

### Event → Task sync (safe baseline)

- Only sync task dates when:
    - `onto_events.owner_entity_type = 'task'`, and
    - `props.task_event_kind` is present (`range`, `start`, or `due`).
- Mapping:
    - `range` → `start_at = event.start_at`, `due_at = event.end_at`
    - `start` → `start_at = event.start_at`
    - `due` → `due_at = event.end_at` (fallback to `event.start_at` if needed)
- Do not clear the opposite timestamp when only one side updates.
- Ignore untyped task-linked events for safety (no inference).

### Task metadata enrichment (agentic chat)

- When a chat tool creates or updates an event linked to a task:
    - Store `task_id`, `task_title`, and `task_link` (path `/projects/{project_id}/tasks/{task_id}`)
      in `onto_events.props`.
    - Ensure `owner_entity_type = 'task'` and create the `task -> event` edge if missing.
    - Set `props.task_event_kind` (defaults to `range` unless only a start time was provided).

## Implementation Plan

### 1) Data and security

- Migrate `project_calendars.project_id` to reference `onto_projects` and drop the legacy FK.
- Update generated types (`packages/shared-types/src/database.types.ts`) and any
  web layer types relying on the legacy relationship.
- Add or confirm RLS policies for:
    - `onto_events`
    - `onto_event_sync`
- Align type definitions:
    - Update `apps/web/src/lib/types/onto.ts` to match current `onto_events` columns.

### 2) API surface (ontology-first)

Add new endpoints:

- `GET /api/onto/projects/[id]/events`
    - Filters: `timeMin`, `timeMax`, `owner_type`, `owner_id`, `includeDeleted`, `limit`.
    - Include `onto_event_sync` rows by default.
- `POST /api/onto/projects/[id]/events`
    - Creates `onto_events` and optional Google event.
    - Accepts `calendar_scope` (`project`, `user`, `calendar_id`) and `sync_to_calendar`.
    - Must allow local-only events when no calendar connection exists.
- `GET /api/onto/events/[id]`
    - Returns event + sync info.
- `PATCH /api/onto/events/[id]`
    - Updates event + external sync if linked.
- `DELETE /api/onto/events/[id]`
    - Soft delete or cancel; mirror to Google if linked.

Add or update project calendar endpoints:

- `GET /api/onto/projects/[id]/calendar`
    - Returns linked `project_calendars` row (via `project_id` -> `onto_projects`).
- `POST /api/onto/projects/[id]/calendar`
    - Create a new project calendar for the project.
- `PATCH /api/onto/projects/[id]/calendar`
    - Update name/color/sync status.
- `DELETE /api/onto/projects/[id]/calendar`
    - Detach or delete the calendar mapping.

### 3) Service layer

Introduce a thin orchestrator service, for example:

- `OntoEventSyncService`
    - create/update/delete `onto_events`
    - call `CalendarService` for Google operations
    - write `onto_event_sync`

Update `CalendarService`:

- On schedule/update/delete, ensure `onto_event_sync` and `onto_events` stay consistent.
- Add helper for creating/updating events from ontology payloads (not legacy tasks).

Update `ProjectCalendarService`:

- Add methods for `project_id` lookup and update (ontology-first).
- Avoid legacy `projects` dependency where possible.
- When calendar is not connected, do not create a calendar. Defer calendar
  creation until after the user connects Google Calendar (e.g., after OAuth callback).

### 4) Project page (`/projects/[id]`)

Data loading:

- Add `event_count` to `get_project_skeleton` and include events in `get_project_full`,
  or fetch events in a separate request.

UI updates:

- Add "Events" insight panel with count, list (time, title, linked task).
- Add event create/edit modal:
    - create new event (optional task link)
    - update event (time/title/location)
    - delete or cancel event
- Add project calendar settings entry:
    - reuse `ProjectCalendarSettingsModal` or build a new ontology version.

### 5) Agentic chat tooling

Add a calendar tool category and executor:

- New tool definitions (examples):
    - `list_calendar_events`
    - `get_calendar_event_details`
    - `create_calendar_event`
    - `update_calendar_event`
    - `delete_calendar_event`
    - `get_project_calendar`
    - `set_project_calendar`
- Use `calendar_scope` to select:
    - `user` calendar (primary or a specific calendar id)
    - `project` calendar (resolve via `project_id` -> `onto_projects`)
- Tool results must include:
    - `source` (google | ontology)
    - `is_synced` (boolean)
    - `external_event_id` (nullable) for ontology events without a Google mapping
- Dedupe logic:
    - Primary: `onto_event_sync.external_event_id` (merge ontology + Google results).
    - Secondary: only if the `onto_event` title matches the linked `onto_task` title,
      use title matching against Google events (only when external id is missing).
- Update tool plumbing:
    - `apps/web/src/lib/services/agentic-chat/tools/core/definitions/*`
    - `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`
    - `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts`
    - `apps/web/src/lib/chat/LLM_TOOL_INSTRUCTIONS.md`
    - `apps/web/src/lib/components/agent/AgentChatModal.svelte` (tool display)
    - `apps/web/src/lib/components/agent/PlanVisualization.svelte` (tool labels)
- Update `ChatContextService` calendar context to use `onto_events` instead of
  `task_calendar_events`.

### 6) Graph and focus (optional but likely)

- Add `event` to `/api/onto/projects/[id]/entities` and `ProjectFocusSelector`.
- Extend project graph loader to include `onto_events` and event edges.

### 7) Tests and telemetry

- API tests for new event endpoints (CRUD + sync error paths).
- Chat tool tests for new calendar tool names.
- Add logging for sync failures (`onto_event_sync.sync_error`).

## Progress Updates (In Repo)

- Migration + types aligned for `project_calendars.project_id` → `onto_projects`:
    - `supabase/migrations/20260129_align_project_calendars_to_onto_projects.sql`
    - `packages/shared-types/src/database.types.ts`
    - `packages/shared-types/src/database.schema.ts`
- `onto_events` types updated (template fields removed) and legacy migration service updated.
    - `apps/web/src/lib/types/onto.ts`
    - `apps/web/src/lib/services/ontology/calendar-migration.service.ts`
- Ontology-first event APIs + sync service added:
    - `apps/web/src/routes/api/onto/projects/[id]/events/+server.ts`
    - `apps/web/src/routes/api/onto/events/[id]/+server.ts`
    - `apps/web/src/lib/services/ontology/onto-event-sync.service.ts`
    - `apps/web/src/lib/services/ontology/task-event-sync.service.ts`
- `/projects/[id]` now fetches and lists events, with create/edit modals and
  project calendar settings entry.
    - `apps/web/src/routes/projects/[id]/+page.svelte`
    - `apps/web/src/lib/components/ontology/EventCreateModal.svelte`
    - `apps/web/src/lib/components/ontology/EventEditModal.svelte`
    - `apps/web/src/lib/components/project/ProjectCalendarSettingsModal.svelte`
- Calendar tools integrated into agentic chat tool definitions + executor:
    - `apps/web/src/lib/services/agentic-chat/tools/core/definitions/calendar.ts`
    - `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts`
    - `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts`
    - `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`
    - `apps/web/src/lib/chat/LLM_TOOL_INSTRUCTIONS.md`
    - `apps/web/src/lib/components/agent/AgentChatModal.svelte`
    - `apps/web/src/lib/components/agent/PlanVisualization.svelte`
    - Title-based dedupe only runs when task title matches event title.
- Task-event sync now creates 30-minute start/due events when only one task date is set,
  and event edits sync back to task dates when `task_event_kind` is present.
- Agentic chat now enriches task-linked events with task metadata and a task link path.
- Task-linked events now store task metadata (`task_id`, `task_title`, `task_link`) on create/update.
- Backfill script added for existing task-linked events:
    - `apps/web/scripts/backfill-task-event-metadata.ts`

## Open Questions

1. For task-linked events, what are the exact edge-case rules for syncing
   `onto_tasks.start_at/due_at` (recurrence, all-day, timezone changes, manual overrides)?
