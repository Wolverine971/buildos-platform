<!-- apps/worker/docs/features/daily-briefs/calendar-section-plan.md -->

# Daily Brief Calendar Section Plan

## Goal

Add a compact calendar section to the main ontology daily brief so the user can see what is on their calendar today and what is coming up, with each item labeled as Google Calendar or internal-only.

## Product Shape

The main/global brief should include a top-level `## Calendar` section near the top, after `Start Here` and before `Executive Summary`.

The section should show:

- Today: relevant timed events, all-day events, and task-derived calendar markers for the brief date.
- Upcoming: a small number of next calendar items after today.
- Source labels:
    - `Google Calendar` when the item has a synced Google mapping.
    - `Internal only` when it exists only in BuildOS.
    - `Google sync issue` when the item appears intended for Google but sync failed.

## Prompt Budget Rule

Do not feed a long raw calendar dump into LLM prompts.

The brief renderer can show selected calendar rows, but prompts should receive only compact summary facts:

- count of today's calendar items
- count of upcoming calendar items
- count by source label
- next one or two hard commitments

## Data Strategy

Use internal BuildOS calendar data first, not direct Google API calls from the worker.

Primary sources:

- `onto_events` for real BuildOS calendar events
- `onto_event_sync` for Google sync status on ontology events
- `onto_tasks` `start_at` and `due_at` for internal task-derived calendar markers
- `task_calendar_events` as a legacy fallback for older Google-scheduled task events

The worker runs with a service-role Supabase client, so it should query explicitly by user/actor/project scope instead of relying on request-auth RPC helpers like `current_actor_id()`.

## Relevance Rules

- Today window: user-local brief date from 00:00 to next day 00:00.
- Upcoming window: after today through the next 7 local days.
- Maximum visible items:
    - Today: 8
    - Upcoming: 5
- Ordering:
    - timed items before all-day items
    - earliest start first
    - all-day items by title
- Deduplicate by external Google event id first, then by task/event identity and start time.
- Exclude completed/cancelled/deleted items when the internal state indicates they should not be actionable.

## Implementation Checklist

- [x] Add calendar brief types.
- [x] Add a compact calendar loader to the ontology brief data loader.
- [x] Attach calendar data to `OntologyBriefData`.
- [x] Render `## Calendar` in the main brief markdown.
- [x] Add summary-only calendar facts to LLM prompts.
- [x] Add tests for relevance caps, source labels, and no raw prompt overload.

## Review Notes and Expansion Recommendations

- Add a pre-brief Google calendar refresh or cache-read step if the requirement is "actual Google Calendar right now" rather than "BuildOS-known calendar data." The current worker intentionally reads internal synced state.
- Track sync freshness in the brief data, using `onto_event_sync.last_synced_at`, so the brief can distinguish "on Google Calendar" from "last synced 18 hours ago."
- Tighten Google source labels for shared projects. Prefer a current-user `onto_event_sync.user_id` match before saying an item is on the user's Google Calendar.
- Add database-backed integration coverage for `loadCalendarBriefData` query shape. Current tests cover selection, ordering, source counts, and prompt budget behavior.
- Add recurrence expansion if `onto_events.recurrence` can store unmaterialized recurring events. The brief should not rely on only stored event instances if recurring events are not expanded elsewhere.
- Add a dense-day summary when more items are hidden, grouped by source and project, so the prompt stays compact but the user still sees why a day is packed.
- Consider surfacing calendar conflicts, first commitment time, last commitment time, and open focus blocks as the next layer of calendar intelligence.
