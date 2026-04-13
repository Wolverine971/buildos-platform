<!-- apps/worker/docs/features/daily-briefs/calendar-recommendations-research.md -->

# Calendar Brief Recommendations Research

Date: 2026-04-13

## Scope

This is a planning/research document for the next phase of calendar intelligence in ontology daily briefs. It focuses on seven follow-up recommendations from the first calendar section implementation.

This document is based on local codebase research, not external product research.

## Current State

- The worker daily brief path now loads a compact calendar window from internal BuildOS data in `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts`.
- The main daily brief renders a `## Calendar` section in `apps/worker/src/workers/brief/ontologyBriefGenerator.ts`.
- LLM prompts receive counts and a few next commitments in `apps/worker/src/workers/brief/ontologyPrompts.ts`, not a raw event dump.
- The worker has a `sync_calendar` processor, but `apps/worker/src/workers/calendar/calendarSyncWorker.ts` only forwards project event sync jobs to the web app webhook. It is not a general Google Calendar import or refresh.
- Web-side calendar services already know how to call Google Calendar:
    - `apps/web/src/lib/services/calendar-service.ts` lists events with `singleEvents: true` and can call Google free/busy.
    - `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts` already merges direct Google results with `onto_events`.
    - `apps/web/src/lib/services/google-oauth-service.ts` owns token lookup, status, and refresh.
- `onto_event_sync` is explicitly user-scoped by `supabase/migrations/20260426000017_onto_event_sync_user_scope.sql`.
- `onto_events.recurrence` exists in shared schema, but the worker brief loader does not expand recurrence rules.
- Worker integration tests exist under `apps/worker/tests/integration`, but default Vitest config excludes them unless `pnpm test:integration` is used.

## Recommended Execution Order

1. Tighten source labeling and sync freshness.
2. Add direct/current Google calendar refresh or cache-read.
3. Add recurrence handling.
4. Add dense-day hidden summaries.
5. Add conflict/focus-block intelligence.
6. Add integration coverage around the full calendar brief loader.

This order keeps correctness first, then expands intelligence.

## Recommendation 1: Pre-Brief Google Refresh Or Cache Read

### Goal

If the user expects "what is actually on my calendar" to mean live Google Calendar state, the daily brief should not rely only on BuildOS-known synced rows.

### Existing Code

- `apps/web/src/lib/services/calendar-service.ts` can call Google `events.list` with `singleEvents: true`.
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts` already loads Google events, loads ontology events, merges them, and returns unsynced Google-only rows.
- `apps/web/src/lib/services/google-oauth-service.ts` owns token lookup and refresh.
- `apps/worker/src/workers/calendar/calendarSyncWorker.ts` forwards outbound sync jobs, but does not import Google events before brief generation.

### Research Findings

The most reusable implementation is in the web app, not the worker. The worker uses service-role Supabase and does not currently own Google OAuth client logic. Pulling web-only services into the worker directly would cross package/runtime boundaries.

### Plan Options

- Option A: Add a web API endpoint for a narrow calendar brief refresh/read, protected by `PRIVATE_BUILDOS_WEBHOOK_SECRET`, and call it from the worker before loading calendar brief data.
- Option B: Extract Google calendar read/status helpers into a shared package that both web and worker can use.
- Option C: Keep worker internal-only and rely on webhook/import freshness, but clearly label the brief as "BuildOS-known calendar."

### Recommendation

Start with Option A. It matches the existing worker-to-web webhook pattern used by `sync_calendar`, avoids moving OAuth code immediately, and can be scoped to a tiny date window.

### Definition Of Done

- Worker asks for a current 8-day Google window before brief generation.
- Direct Google-only events are either cached into BuildOS rows or returned as a compact side payload.
- Brief can label `Google Calendar` only when the event is confirmed in the current user's Google data.
- Failure is non-fatal and rendered as sync freshness/context, not a failed brief.

## Recommendation 2: Sync Freshness

### Goal

The brief should distinguish "on Google Calendar" from "last synced long enough ago that this may be stale."

### Existing Code

- `onto_event_sync.last_synced_at` is selected in the loader query.
- `GoogleOAuthService.getCalendarStatus` returns `lastSync` from `user_calendar_tokens.updated_at`.
- The current `CalendarBriefItem` shape does not expose sync age or freshness labels.

### Plan

- Add `lastSyncedAt`, `syncAgeMinutes`, and `syncFreshness` to `CalendarBriefItem`.
- Compute freshness in the worker with thresholds:
    - `fresh`: synced in the last 6 hours.
    - `stale`: synced 6 to 24 hours ago.
    - `unknown`: no sync timestamp.
    - `expired_or_failed`: sync error or OAuth disconnected.
- Render stale/failed state in the calendar line only when useful.
- Add prompt counts for stale Google items without adding raw rows.

### Definition Of Done

- Main brief can say something like `3 Google / 1 stale sync`.
- Prompt gets a compact stale count.
- Metadata stores stale count for later monitoring.

## Recommendation 3: Current-User Source Labels For Shared Projects

### Goal

Do not say an event is on "my Google Calendar" unless the current user has a user-scoped Google sync row or a confirmed current Google read.

### Existing Code

- `onto_event_sync.user_id` was added for collaboration-safe mapping.
- `OntologyBriefDataLoader.resolveOntologyEventSource` already prefers a sync row where `sync.user_id === userId`.
- The same resolver can still infer Google intent from props or external links.
- `CalendarExecutor` filters `onto_event_sync` rows to `syncRow.user_id === this.userId` for agent calendar reads.

### Risk

Shared project events may have Google metadata from another user. The brief should not overstate that such an event is on the current user's Google Calendar.

### Plan

- Split internal source classification from user-facing source label:
    - `google_current_user`: confirmed current user's Google.
    - `google_legacy`: legacy/global sync row with no user id.
    - `google_other_user`: Google-linked, but not current user's Google.
    - `internal`: BuildOS-only.
    - `sync_issue`: intended current-user Google sync failed.
- Render `Google Calendar` only for `google_current_user` and possibly `google_legacy`.
- Render `Internal only` or `Shared Google link` for other-user sync depending on desired product language.

### Definition Of Done

- Unit tests cover current-user sync row, other-user sync row, legacy null-user sync row, props-only external id, and failed sync row.
- Shared project events do not incorrectly claim to be on the current user's Google Calendar.

## Recommendation 4: Loader Integration Coverage

### Goal

Catch Supabase query-shape regressions and project/user scoping mistakes.

### Existing Code

- Worker Vitest excludes `apps/worker/tests/integration/**` by default.
- SMS integration tests already use a real test Supabase setup with `TEST_SUPABASE_URL` or `PUBLIC_SUPABASE_URL`.
- Current calendar brief tests cover selection, ordering, source counts, and prompt budget behavior, but not the actual `loadCalendarBriefData` query chain.

### Plan

Add two layers:

- Unit-level query-shape test with a chainable Supabase mock for:
    - project `onto_events`
    - actor-owned `onto_events`
    - standalone `onto_events`
    - legacy `task_calendar_events`
- Optional integration test under `apps/worker/tests/integration/daily-brief-calendar` that seeds projects, events, sync rows, and tasks.

### Definition Of Done

- Unit tests verify explicit project/user/actor scope is always present.
- Integration test verifies a real fixture daily brief has expected today/upcoming/source labels.
- Integration tests remain opt-in unless CI has test database credentials.

## Recommendation 5: Recurrence Expansion

### Goal

Recurring meetings and recurring tasks should appear on the correct date even if only a recurrence rule is stored.

### Existing Code

- `onto_events.recurrence` exists in shared schema.
- `CalendarService.getCalendarEvents` uses Google `singleEvents: true`, which expands recurring Google events when reading directly.
- `calendar-webhook-service.ts` detects new recurring Google events and currently skips auto-creating tasks for new recurring events without a task/timeblock.
- `calendar-webhook-service.ts` handles RRULE changes for existing master recurring task events.
- `recurrence-pattern.service.ts` can parse/build RRULE-like recurrence config in the web app.
- `packages/shared-types/src/functions/generate_recurring_instances.sql` exists for recurring tasks.

### Risk

If recurring `onto_events` are stored as a master event with `recurrence` and no materialized instances, the worker brief loader will miss future occurrences because it only reads `start_at`/`end_at` rows.

### Plan

- Decide the source of truth:
    - Google direct read with `singleEvents: true` for current Google data.
    - Materialized `onto_events` instances for internal recurring events.
    - Worker-side recurrence expansion for `onto_events.recurrence`.
- Prefer avoiding a new worker-side RRULE engine if direct Google/cache materialization is available.
- If worker expansion is required, isolate it behind `expandCalendarBriefItems(items, window, timezone)` and cap expanded instances.

### Definition Of Done

- A weekly recurring event with no materialized instance appears in today's brief when applicable.
- Recurrence expansion is capped by the same 8-day window.
- Tests include recurring all-day, recurring timed, and cancelled/exception instances if supported by data.

## Recommendation 6: Dense-Day Hidden Summary

### Goal

Keep prompts small while making the rendered brief more informative on busy days.

### Existing Code

- The main brief renders up to 8 today items and 5 upcoming items.
- Prompts get counts and the first 2 today/upcoming commitments.
- Hidden prompt count is now computed from total items minus prompt-visible items.

### Plan

Add a `hiddenBreakdown` object to `CalendarBriefSection`:

- hidden by source: Google, internal, sync issue
- hidden by item type: event, task block, task start, task due
- top hidden projects by count
- all-day count

Render one compact sentence:

`Also hidden: 12 more today, including 7 Google items, 3 internal task blocks, and 4 from Launch Plan.`

### Definition Of Done

- Prompt still receives counts, not raw hidden rows.
- Main brief gives the user a meaningful summary when caps are exceeded.
- Tests cover hidden breakdown counts.

## Recommendation 7: Conflicts, First/Last Commitment, And Focus Blocks

### Goal

Turn the calendar section from a list into a day-planning signal.

### Existing Code

- `CalendarService.findAvailableSlots` uses Google free/busy.
- `OverdueTaskRescheduleService` has reusable busy interval normalization and gap building.
- `apps/web/src/lib/utils/slot-finder.ts` calculates available slots from calendar events and time blocks.
- The calendar analysis service already fetches Google calendar events and uses them for project/task suggestions.

### Plan

Add derived calendar facts after correctness work:

- first commitment time
- last commitment time
- number of calendar conflicts or overlaps
- longest available focus block today
- total scheduled minutes today
- meeting density label: light, medium, packed

Only feed derived facts to prompts unless the item itself is one of the first few commitments.

### Definition Of Done

- Main brief can say `First commitment at 9:00 AM; longest open focus block is 1h 30m.`
- Conflict detection flags overlapping timed events.
- Focus block logic respects timezone, all-day items, and user work hours where available.

## Open Questions

- Should the worker be allowed to call a web endpoint during daily brief generation, or should Google read logic move to a shared package?
    - Decision: use a narrow web endpoint first, reusing the existing worker-to-web webhook pattern. A shared package is still viable later if more worker-owned Google logic is needed.
- What freshness threshold should make a Google label look stale: 6 hours, 12 hours, or 24 hours?
    - Decision: start with 6 hours. Daily briefs are operational, so stale-but-silent calendar data is worse than a conservative stale label.
- For shared projects, what user-facing wording should represent another collaborator's Google-synced event?
    - Decision: use `Google link (unconfirmed)` for rows with Google metadata but no current-user Google confirmation. Use `Google Calendar (legacy sync)` for null-user legacy sync rows.
- Are recurring `onto_events` expected to be materialized before the brief worker runs?
    - Decision: do not assume that yet. Prefer direct Google reads with expanded events first; only add worker-side recurrence expansion if internal recurring events remain missing.
- Should dense-day hidden summaries be rendered only in the main brief or also in project briefs?
    - Decision: start in the main global brief and prompt summary. Add project-brief hidden summaries only after the global section proves useful.

## Proposed Next Implementation Slice

The first implementation slice is source-label correctness plus sync freshness:

1. Add sync freshness fields to `CalendarBriefItem`.
2. Tighten source classification around current-user `onto_event_sync.user_id`.
3. Render stale/sync issue labels in the main brief.
4. Add unit tests for current-user, other-user, legacy, stale, and failed sync cases.

This is smaller than live Google refresh and reduces the chance that the current brief makes a misleading claim.

## Implementation Notes: 2026-04-13

- Added `lastSyncedAt`, `syncAgeMinutes`, and `syncFreshness` to calendar brief items.
- Split Google source labels into confirmed current-user Google, legacy Google sync, unconfirmed Google link, internal-only, and sync issue.
- Added source counts for unconfirmed Google and stale Google items so prompts get compact calendar reliability context without raw event overload.
- Stored unconfirmed/stale counts in brief metadata for later monitoring.
- Set the initial stale threshold to 6 hours.

## Next Implementation Slice

Build the narrow web refresh/read endpoint:

1. Add a private web endpoint that accepts user id, brief date, timezone, and a capped 8-day window.
2. Reuse existing web Google OAuth/calendar services to read expanded Google events for the current user.
3. Return or cache only compact fields needed by the worker: title, start/end, all-day, calendar id, event id, link, status, and last sync/read timestamp.
4. Make the worker call this endpoint before loading the internal calendar brief. If the call fails, keep generating the brief and surface stale/unknown counts.
5. Add tests that verify direct current-user Google items do not cause prompt overload and do not overwrite internal-only events incorrectly.
