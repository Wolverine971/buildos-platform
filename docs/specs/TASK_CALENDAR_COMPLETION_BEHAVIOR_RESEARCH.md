<!-- docs/specs/TASK_CALENDAR_COMPLETION_BEHAVIOR_RESEARCH.md -->

# Task Completion vs Calendar Scheduling Research

Date: 2026-02-15
Status: Complete
Completed: 2026-02-16

## Implementation Status (Complete)

This spec has been fully implemented for ontology task flows (`onto_tasks` / `onto_events`).

Implemented:

1. `PATCH /api/onto/tasks/[id]` now triggers event sync on transition to `done`.
2. `TaskEventSyncService` now prunes only future linked task events when task state is `done` and keeps past events.
3. Reopen behavior (`done -> non-done`) does not auto-reschedule unless explicit scheduling fields (`start_at` / `due_at`) are edited.
4. Regression tests were added/updated for completion and reopen behavior.

Validation:

- `pnpm test -- 'src/routes/api/onto/tasks/[id]/task-patch-completion-sync.test.ts' src/lib/services/ontology/task-event-sync.service.test.ts`
- Result: 2 files passed, 6 tests passed.

## Question

When a task has future scheduling metadata (`start_at`/`due_at`) and is marked complete (`done`), should it be removed from the calendar?

## Current BuildOS Behavior (Pre-Implementation Audit)

### Ontology task flow (`onto_tasks` + `onto_events`) used by `/projects/[id]`

1. Task create always attempts task-event sync based on dates:
    - `apps/web/src/routes/api/onto/tasks/create/+server.ts:298`
    - `apps/web/src/lib/services/ontology/task-event-sync.service.ts:140`
2. Task update sets `completed_at` on `state_key -> done`, but event sync is only keyed off `title/start_at/due_at` presence:
    - `apps/web/src/routes/api/onto/tasks/[id]/+server.ts:382`
    - `apps/web/src/routes/api/onto/tasks/[id]/+server.ts:495`
3. Task-event sync logic is date-driven only (no `state_key === done` handling), so done tasks with future dates keep linked events:
    - `apps/web/src/lib/services/ontology/task-event-sync.service.ts:140`
4. Deleting an ontology task does remove linked events (and optionally sync delete to Google):
    - `apps/web/src/routes/api/onto/tasks/[id]/+server.ts:672`
    - `apps/web/src/routes/api/onto/tasks/[id]/task-delete-calendar-events.test.ts:100`

Result: In ontology flows, completing a future-scheduled task does **not** currently unschedule it from calendar events.

Note: The above reflected behavior at audit time (2026-02-15) and is now superseded by the implementation status in this doc.

### Legacy task flow (`tasks` + `task_calendar_events`)

Legacy project task endpoints explicitly remove calendar events when status transitions to `done`:

- Single task update:
    - `apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts:212`
- Batch updates:
    - `apps/web/src/routes/api/projects/[id]/tasks/batch/+server.ts:124`
- Recurring task update:
    - `apps/web/src/routes/api/tasks/[id]/recurrence/+server.ts:460`

Result: Legacy flows already behave as "complete => unschedule."

## External Product Pattern Research

### Todoist (official)

- Google Calendar integration keeps completed tasks visible as completed markers.
- Official FAQ states there is no option to remove completed tasks from calendar sync.
- Source: https://todoist.com/help/articles/use-google-calendar-with-todoist-rCqwLCt3G

### ClickUp (official)

- Calendar view supports showing/hiding closed tasks via filters.
- Recurring task docs indicate recurring scheduling behavior is separate from one-off completion semantics.
- Sources:
    - https://help.clickup.com/hc/en-us/articles/6310090043671-Use-Calendar-view
    - https://help.clickup.com/hc/en-us/articles/6304848344599-Use-recurring-tasks

## Interpretation

There are two common valid models:

1. Keep completed items on calendar, visually marked complete (history-first model).
2. Remove/hide completed items by default, optionally expose them via filter/toggle (planning-focus model).

BuildOS currently mixes both:

- Legacy task system uses model (2).
- Ontology task system effectively behaves like model (1) but without a clear user-facing policy/toggle.

## Recommended Behavior for BuildOS

### Recommendation

Adopt a consistent default policy for ontology tasks:

- When a task transitions to `done`, remove/cancel **future** task-generated calendar events.
- Keep past events intact for historical context.

This matches the user expectation in this request and aligns with existing legacy behavior.

### Proposed policy details

1. On `state_key` transition to `done`:
    - Unschedule task-linked events where event time is in the future.
2. On reopening (`done -> non-done`):
    - Do not auto-reschedule by default; require explicit reschedule (or add a configurable setting later).
3. Optional future enhancement:
    - Add user/project preference: `completed_task_calendar_behavior = remove | keep_marked_complete`.

## Implementation Notes (Ontology path)

1. Add completion-aware event handling in task update path:
    - `apps/web/src/routes/api/onto/tasks/[id]/+server.ts`
2. Extend `TaskEventSyncService` to prune future events when task is `done`:
    - `apps/web/src/lib/services/ontology/task-event-sync.service.ts`
3. Add tests for:
    - `todo -> done` with future dates removes future linked events.
    - `todo -> done` with past-only events keeps history.
    - `done -> todo` does not auto-create events unless explicitly requested.

## Execution Plan (Approved)

### Scope

Apply the recommendation only to ontology task flows (`onto_tasks` / `onto_events`) so behavior matches existing legacy task behavior.

### Planned code changes

1. Trigger sync on completion transitions:
    - Update `PATCH /api/onto/tasks/[id]` to include `state_key` transitions in `shouldSyncEvents`.
    - File: `apps/web/src/routes/api/onto/tasks/[id]/+server.ts`

2. Add done-state pruning policy in task-event sync:
    - In `TaskEventSyncService.syncTaskEvents`, when task state is `done`, skip creating/updating desired events and only prune removable future task events.
    - Keep past events for history.
    - File: `apps/web/src/lib/services/ontology/task-event-sync.service.ts`

3. Define "removable future event" rule:
    - `start` event: remove when `start_at > now`.
    - `due` event: remove when `end_at > now` (fallback `start_at > now`).
    - `range` event: remove when `start_at > now`.
    - Untyped event fallback: remove when `start_at > now`.

4. Add regression tests:
    - Route test: `PATCH` triggers event sync when transitioning to `done`.
    - Service test: done-state pruning removes future events and keeps past events.
    - Files under:
        - `apps/web/src/routes/api/onto/tasks/[id]/`
        - `apps/web/src/lib/services/ontology/`

### Acceptance criteria

1. Marking an ontology task `done` removes future linked task calendar events.
2. Past linked task events are retained.
3. Reopening (`done -> non-done`) does not auto-reschedule unless explicit date/scheduling edits occur.
4. Existing create/update date sync behavior remains unchanged for non-done tasks.

Status: All acceptance criteria met.

## Final answer to the original question

Yes: for BuildOS, the proper default behavior should be to unschedule future calendar events when a task is completed, while retaining past calendar history.
