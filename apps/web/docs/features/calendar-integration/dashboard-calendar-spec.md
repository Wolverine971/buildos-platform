<!-- apps/web/docs/features/calendar-integration/dashboard-calendar-spec.md -->

# Dashboard Calendar Spec

## Summary

Provide a fast, Google-Calendar-like experience on the dashboard with month/week/day views, backed by ontology events plus task schedule markers. The calendar should load instantly (shell first), then fetch data asynchronously via RPC for speed and consistency.

## Architecture Decisions

### Data Model

- **Events**: `onto_events` (project and personal/actor events).
- **Task markers**: derived from `onto_tasks.start_at` / `onto_tasks.due_at`.
- **Unified read model**: `user_calendar_items` view.

### Query Strategy

- Use a single RPC (`list_calendar_items`) for range queries.
- Server filters by date range and toggle settings to minimize payload.
- Client does not fetch calendar data during SSR or initial load; fetch happens after first render.

### Preference Storage (DB vs Local)

- **Persist in DB** for durable user preferences that should sync across devices:
    - show events
    - show task range/start/due markers
- **Keep local storage** for transient UI state:
    - current view (month/week/day)
    - last visible range
    - scroll position and sidebar open state
- UI updates local state immediately; DB persistence happens asynchronously (best-effort).

Rationale: toggles affect server-side filtering and cross-device behavior, while view state is session-scoped and should not require round trips.

## UX Spec

### Entry Point

- Dashboard CTA button labeled "Calendar".
- Opens a dedicated route (`/dashboard/calendar`) or a full-height panel.

### Layout & Navigation

Top bar:

- Today button
- Prev/Next arrows
- Current range label (e.g., "Jan 2026" or "Jan 25–31, 2026")
- View switcher: Month | Week | Day
- Settings (gear) for display toggles

Optional sidebar:

- Mini month picker
- Project filters (phase 2)

### Views

- **Month**: day grid, shows N items per cell with "+X more" overflow.
- **Week**: hour grid + all-day row.
- **Day**: hour grid + all-day row.

### Items

- **Events**: time-bound blocks or all-day chips.
- **Task markers**:
    - `range`: single block when start->due <= 10 hours
    - `start`: 30-minute marker
    - `due`: 30-minute marker

Task markers should be visually distinct (icon + prefix label).

### Interactions

- **Click item** opens a detail drawer/modal (expanded view) showing:
    - title, time range, project, description
    - primary actions: "Open" and "Open in Project"
- **Open action** launches:
    - `EventEditModal` for events
    - `TaskEditModal` for task markers
- **Secondary action**: open full entity page in a new tab (project context).

## Data & API

### RPC: `list_calendar_items`

Parameters:

- `p_start` / `p_end` (timestamptz)
- `p_include_events` (bool)
- `p_include_task_range` (bool)
- `p_include_task_start` (bool)
- `p_include_task_due` (bool)
- `p_project_ids` (uuid[] | null)
- `p_limit` (int | null)

Returns:

- `calendar_item_id` (text)
- `item_type` (`event` | `task`)
- `item_kind` (`event` | `range` | `start` | `due`)
- `title`, `start_at`, `end_at`, `all_day`, `timezone`
- `project_id`, `owner_entity_type`, `owner_entity_id`
- `task_id`, `event_id`
- `state_key`, `type_key`, `props`
- `created_at`, `updated_at`

### View: `user_calendar_items`

- Includes all visible events for the current actor.
- Adds task-derived markers only if a task lacks a synced task-event (`task_event_kind`).

### Loading Strategy

- Render calendar shell immediately.
- Fetch data on `onMount` and on range changes.
- Use a small buffer window (range +/- 7 days) to keep navigation snappy.
- Cache results in memory keyed by range + toggle signature.

## Performance Notes

- Indexes:
    - `onto_events(start_at)`
    - `onto_events(project_id, start_at)`
    - `onto_events(owner_entity_type, owner_entity_id)`
    - `onto_tasks(start_at)`
    - `onto_tasks(due_at)` (already exists)
- Single RPC reduces client-side joins and makes pagination straightforward.

## Future Work (Out of Scope, Planned)

### Add Event Workflow

- Pre-selection step: choose project (or personal event).
- Event details step: name, description, date/time, optional location.
- Creates `onto_events` with:
    - `project_id` set when project selected
    - `owner_entity_type = 'project'` (or `actor` for personal)
- Subsequent edit uses `EventEditModal`.

## Open Questions

- Default visibility for completed tasks?
- Should task markers inherit project colors or use a fixed "task" palette?
- Do we need project filters in phase 1 or phase 2?

## Implementation References (Audit)

### UI & Routes

- `apps/web/src/lib/components/dashboard/Dashboard.svelte` (calendar CTA button)
- `apps/web/src/routes/dashboard/calendar/+page.server.ts` (auth gate)
- `apps/web/src/routes/dashboard/calendar/+page.svelte` (calendar page, fetch + modal wiring)
- `apps/web/src/lib/components/scheduling/CalendarView.svelte` (event rendering tweaks)
- `apps/web/src/lib/components/scheduling/CalendarItemDrawer.svelte` (item detail drawer)

### API & Data Access

- `apps/web/src/routes/api/calendar/items/+server.ts` (RPC bridge)
- `apps/web/src/routes/api/users/calendar-preferences/+server.ts` (preferences defaults/merge)
- `apps/web/src/lib/services/calendar-items.service.ts` (client fetch helper)
- `apps/web/src/lib/types/calendar-items.ts` (client types)

### Database

- `supabase/migrations/20260127_180000_dashboard_calendar.sql` (view/RPC/indexes/preferences columns)

## Related Specs & Diagrams

### Specs

- `/apps/web/docs/features/calendar-integration/README.md` (calendar integration overview)
- `/apps/web/docs/design/calendar-per-project-architecture.md` (project calendar model)
- `/apps/web/docs/design/calendar-webhook-integration.md` (webhook sync flow)

### Diagrams

- `/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md` (feature flow diagrams)
- `/docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md` (queue/job lifecycle)
