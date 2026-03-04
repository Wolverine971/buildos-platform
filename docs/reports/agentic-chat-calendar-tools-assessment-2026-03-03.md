<!-- docs/reports/agentic-chat-calendar-tools-assessment-2026-03-03.md -->

# Agentic Chat Calendar Tools Assessment (2026-03-03)

## Scope

- Investigate calendar tool exposure in agentic chat.
- Document how tool access/execution is tracked.
- Document core data models.
- Assess create/edit/search behavior and identify duplicate-event risks.

## Executive Summary

- Calendar tools currently exposed to agentic chat are:
    - `list_calendar_events`
    - `get_calendar_event_details`
    - `create_calendar_event`
    - `update_calendar_event`
    - `delete_calendar_event`
    - `get_project_calendar`
    - `set_project_calendar`
- As of this remediation pass (March 3, 2026), duplicate-prone update behavior has been tightened:
    - Missing project mappings with prior external references now skip with `missing_project_sync_mapping` instead of creating new events.
    - Google 404 during project update now returns `external_event_not_found` (no recreate fallback).
    - Mapping recovery now uses event props/external links for project events when sync rows are missing.
- Event search in chat now supports `query` (alias `q`) in `list_calendar_events` and forwards query filtering to Google (`q`) plus ontology event text filtering.
- Validation and alias handling now enforce safer edits:
    - `update_calendar_event` / `delete_calendar_event` require `onto_event_id` or `event_id`.
    - `external_event_id` now aliases to `event_id`.
- Update/delete calendar scope handling is now consistent with detail lookup (`calendar_scope` + `project_id` support in definitions and executor resolution).
- Fastchat v2 tracking now persists `chat_tool_executions` rows (with `message_id`) and increments `chat_sessions.tool_call_count`.

## Remediation Status (Implemented)

### 1) Duplicate prevention on edit

- Updated `processProjectEventSyncJob` in `apps/web/src/lib/services/ontology/onto-event-sync.service.ts`:
    - Missing mapping + prior external reference => `skipped` (`missing_project_sync_mapping`) and sync error marker.
    - Google update 404 => `skipped` (`external_event_not_found`) and sync error marker.
    - No automatic recreate on update failure paths.
- Added project mapping recovery:
    - `resolveExternalMapping` now recovers project mappings from `props.external_event_id` / `props.external_calendar_id` or parsed `external_link`.
    - Added `repairProjectSyncRow` to restore missing `onto_event_sync` entries when updates succeed from recovered mappings.

### 2) Update/delete identifier safety

- Added calendar validation in `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`:
    - `update_calendar_event` and `delete_calendar_event` now require one of `onto_event_id` or `event_id`.
- Added alias support:
    - `external_event_id` now maps to `event_id` via semantic aliasing and ID alias expansion.

### 3) Search in chat calendar tooling

- `list_calendar_events` schema now includes `query` and `q` in:
    - `apps/web/src/lib/services/agentic-chat/tools/core/definitions/calendar.ts`
- `CalendarExecutor.listCalendarEvents` now:
    - Reads `query`/`q`.
    - Passes query to Google (`CalendarService.getCalendarEvents(..., q)`).
    - Applies text filtering to ontology events (title/description/location/task title props).

### 4) Scope consistency for edit/delete

- `update_calendar_event` and `delete_calendar_event` tool definitions now include:
    - `calendar_scope` (`user|project|calendar_id`)
    - `project_id`
- Executor now resolves calendar IDs consistently across get/update/delete using scope-aware project calendar lookup.

### 5) Tracking fixes (v2)

- Fastchat v2 now inserts per-tool execution rows into `chat_tool_executions` with `message_id`.
- Fastchat v2 session stats now increment `tool_call_count` via `updateSessionStats(...toolCallCountDelta...)`.

## 1) Tool Exposure

### Source of truth

- Calendar tool definitions: `apps/web/src/lib/services/agentic-chat/tools/core/definitions/calendar.ts`
- Context grouping: `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`
- Fast chat runtime selection: `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts`
- API stream runtime uses selected tools: `apps/web/src/routes/api/agent/v2/stream/+server.ts`

### Exposed calendar tools

Defined in `calendar.ts` (lines ~10-310):

- `list_calendar_events`
- `get_calendar_event_details`
- `create_calendar_event`
- `update_calendar_event`
- `delete_calendar_event`
- `get_project_calendar`
- `set_project_calendar`

### Context exposure behavior

From `tools.config.ts`:

- `calendar` group includes all 7 tools.
- `global` tool group includes calendar event list/get/create/update/delete.
- `project` tool group includes all 7 tools.
- `calendar` context maps to groups `base + global` (so includes event CRUD, but not project calendar mapping tools).

From `tool-selector.ts`:

- Calendar tools enabled automatically for `project*` and `calendar` contexts.
- In non-project/global contexts, calendar tools are enabled by intent heuristics (`calendar`, `schedule`, `meeting`, etc.).

### Gateway mode behavior

- If `AGENTIC_CHAT_TOOL_GATEWAY=true`, selected tools become `[tool_help, tool_exec]` only.
- But `tool_exec` can execute ops from full registry, and validation path uses `CHAT_TOOL_DEFINITIONS` (full set), not session-scoped subset.
- Local env currently has `AGENTIC_CHAT_TOOL_GATEWAY=false` (`apps/web/.env`).

## 2) How Access/Execution Is Tracked

### Tool exposure snapshots

- `agents.available_tools` stores the tool list assigned to planner/executor agents.
- Written in:
    - `agent-chat-orchestrator.ts` (`createPlannerAgentRecord`)
    - `executor-coordinator.ts` (`createExecutorAgentRecord`)

### Tool execution logs

- `chat_tool_executions` stores per-tool call telemetry:
    - `session_id`, `tool_name`, `tool_category`, `arguments`, `result`, `execution_time_ms`, `tokens_consumed`, `success`, `error_message`.
- Logged in `tool-executor-refactored.ts` (`logToolExecution`).

### Conversation-level traces

- Assistant message metadata stores `fastchat_tool_trace_v1` and `fastchat_tool_trace_summary`.
- Persisted in `/api/agent/v2/stream/+server.ts` before final assistant message save.

### Session counters

- `chat_sessions` tracks aggregate counters (e.g., `message_count`, `total_tokens_used`, `tool_call_count`).
- In v2 fastchat flow, `updateSessionStats` increments message/token counters but does not increment `tool_call_count`.

## 3) Calendar Data Models

Primary models (from `packages/shared-types/src/database.types.ts`):

### `onto_events`

- Internal ontology event record.
- Key fields: `id`, `title`, `description`, `start_at`, `end_at`, `timezone`, `project_id`, `owner_entity_type`, `owner_entity_id`, `props`, `sync_status`, `sync_error`, `external_link`, `last_synced_at`, `created_by`, `deleted_at`.

### `onto_event_sync`

- Mapping table from ontology event to external calendar event per user/provider.
- Key fields: `event_id`, `calendar_id` (FK -> `project_calendars.id`), `user_id`, `provider`, `external_event_id`, `sync_status`, `sync_error`, `last_synced_at`.
- Important migration: user-scoped uniqueness index on `(event_id, user_id, provider)` where `user_id IS NOT NULL`.

### `project_calendars`

- Project-to-Google calendar mapping per user.
- Key fields: `id`, `project_id`, `user_id`, `calendar_id` (Google), `calendar_name`, `color_id`, `sync_enabled`, `sync_status`, `sync_error`, `last_synced_at`.
- Important migration: unique `(project_id, user_id)`.

### `task_calendar_events` (legacy/parallel tracking)

- Task-to-calendar event mapping for older calendar flows.
- Key fields: `task_id`, `calendar_event_id`, `calendar_id`, recurrence/exception metadata, sync metadata.

## 4) Behavior Assessment

### Create

- `create_calendar_event` -> `CalendarExecutor.createCalendarEvent` -> `OntoEventSyncService.createEvent`.
- For project scope, sync is queued as `sync_calendar` job and mapped through `onto_event_sync`.

### Edit

- `update_calendar_event` supports two paths:
    - Ontology path when `onto_event_id` is supplied.
    - Direct Google path when only `event_id` is supplied.
- Project sync job attempts update if mapping exists; otherwise creates a new external event.

### Search

- Current chat calendar tooling has time-window listing, not event text search:
    - `list_calendar_events` schema has no `query`/`q` field.
    - `CalendarService.getCalendarEvents` supports `q`, but executor never forwards one.
    - `search_ontology` excludes `event` type.

## 5) Findings (Pre-Remediation Baseline)

## High: Update can create new external events when mapping is missing

- Evidence:
    - `processProjectEventSyncJob` creates external event when no mapping (`created_external_event`).
    - On update 404 it may recreate external event (`recreated_external_event`).
    - `resolveExternalMapping` returns `null` for project events without usable `onto_event_sync` rows.
- Code refs:
    - `apps/web/src/lib/services/ontology/onto-event-sync.service.ts:1164`
    - `apps/web/src/lib/services/ontology/onto-event-sync.service.ts:1223`
    - `apps/web/src/lib/services/ontology/onto-event-sync.service.ts:875`
- Impact:
    - Editing can produce a second Google event when mapping rows are missing/inconsistent.
- Why this happens:
    - Per-user sync row is treated as authoritative; when absent, fallback is create.

## High: Update API contract is too weak for reliable edit flows

- Evidence:
    - `update_calendar_event` tool schema has no required identifier (`onto_event_id` or `event_id`).
    - Validation layer does not enforce “at least one identifier required” for update/delete calendar tools.
    - `list_calendar_events` returns `external_event_id`, but alias normalization does not map that to `event_id`.
- Code refs:
    - `apps/web/src/lib/services/agentic-chat/tools/core/definitions/calendar.ts:171`
    - `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:1371`
    - `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts:557`
    - `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:2361`
- Impact:
    - LLM/tool caller can make invalid update calls more often; failure-retry patterns can drift into create flows and perceived duplicates.

## Medium: Event search is not implemented in agentic calendar tools

- Evidence:
    - No `query` field in `list_calendar_events` definition.
    - Executor list path only supports time range/pagination/scope.
    - `search_ontology` allows types task/plan/goal/milestone/document (and image in API), not event.
- Code refs:
    - `apps/web/src/lib/services/agentic-chat/tools/core/definitions/calendar.ts:16`
    - `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts:352`
    - `apps/web/src/lib/services/calendar-service.ts:16`
    - `apps/web/src/lib/services/calendar-service.ts:528`
    - `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts:473`
    - `apps/web/src/routes/api/onto/search/+server.ts:12`
- Impact:
    - User cannot reliably “search events” by text/title/content from agentic chat.

## Medium: Ontology update path clears unspecified fields

- Evidence:
    - In `CalendarExecutor.updateCalendarEvent` (ontology branch), `description` and `location` are passed as `args.description ?? null` and `args.location ?? null`.
- Code refs:
    - `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts:891`
- Impact:
    - Editing one field can unintentionally null out description/location.

## Medium: Project calendar resolution is inconsistent across read vs update/delete

- Evidence:
    - `get_calendar_event_details` supports `calendar_scope + project_id` resolution.
    - `update_calendar_event` and `delete_calendar_event` definitions lack `calendar_scope/project_id` options.
    - Google update/delete default to `calendar_id='primary'` when not provided.
- Code refs:
    - `apps/web/src/lib/services/agentic-chat/tools/core/definitions/calendar.ts:92`
    - `apps/web/src/lib/services/agentic-chat/tools/core/definitions/calendar.ts:171`
    - `apps/web/src/lib/services/agentic-chat/tools/core/definitions/calendar.ts:226`
    - `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts:934`
    - `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts:966`
- Impact:
    - Updates/deletes against project calendar events can target wrong calendar ID unless caller manually supplies it.

## Low: Tracking gaps reduce auditability

- Evidence:
    - Fastchat `updateSessionStats` does not increment `chat_sessions.tool_call_count`.
    - `chat_tool_executions` insert path leaves `message_id` unset.
- Code refs:
    - `apps/web/src/lib/services/agentic-chat-v2/session-service.ts:427`
    - `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts:579`
- Impact:
    - Session-level tool usage analytics can be incomplete or require expensive reconstruction from message metadata.

## 6) Duplicate-Prevention Recommendations

1. Enforce identifier requirements for calendar edit/delete tools.

- Add schema rule and custom validation requiring one of:
    - `onto_event_id`
    - `event_id`

2. Add robust ID aliasing for calendar tools.

- Map `external_event_id` -> `event_id`.
- Optionally map nested payloads from `list_calendar_events` deterministically.

3. Remove create-on-missing-mapping behavior for update unless explicitly requested.

- In `processProjectEventSyncJob`, when action is update and mapping is missing, return a deterministic error state (or perform a guarded reconciliation lookup first) instead of auto-create.

4. Add reconciliation before create fallback.

- Attempt provider lookup by stable identifiers (when available) before creating a new Google event.

5. Fix partial update semantics.

- For ontology path, pass `undefined` for omitted fields; do not coerce to `null`.

6. Align update/delete with project scope semantics.

- Add `calendar_scope` + `project_id` support to update/delete tool definitions and executor logic.

7. Backfill/repair sync mappings.

- Run data audit for `onto_event_sync.user_id IS NULL` and missing per-user mapping coverage.

## 7) Search Feature Recommendations

Status:

1. `list_calendar_events` now includes `query` + `q`.
2. Query is now threaded through executor + Google `q` path.
3. `search_ontology` still does not include event entities (unchanged); event search is currently provided through `list_calendar_events`.

## 9) Calendar Search Path Clarification

There are currently two different calendar read paths, and they should both exist:

1. `list_calendar_events` (agentic chat tool)

- Purpose: merged conversational event lookup across Google + ontology events.
- Supports: time range, scope resolution, pagination, and now text query (`query`/`q`).
- Best for: “find/edit/delete this meeting” in chat.

2. `/api/calendar/items` -> `list_calendar_items` RPC (dashboard/project calendar UI path)

- Purpose: unified timeline items for UI rendering (ontology events + task-derived markers like start/due/range).
- Supports: date ranges, project filters, include toggles for task markers/events.
- Does not currently include Google events or text query parameters.
- Best for: calendar grid/list UI composition and task marker visibility.

What should happen:

- Keep both paths (different product jobs).
- Use `list_calendar_events` for chat event operations and textual event search.
- Keep `/api/calendar/items` for dashboard/project calendar rendering and task timeline composition.

## 8) Suggested Test Additions

- `update_calendar_event` validation requires identifier.
- Alias mapping: `external_event_id` accepted for update/delete.
- Project sync update with missing mapping does not create duplicate external event (unless explicitly configured).
- Ontology partial update preserves untouched `description/location`.
- Search tests for event query and event-type ontology search.

## Notes

- Assessment performed via static code analysis on March 3, 2026.
- Local env indicates gateway disabled (`AGENTIC_CHAT_TOOL_GATEWAY=false`), but gateway-mode risk remains relevant for deployments with flag enabled.
