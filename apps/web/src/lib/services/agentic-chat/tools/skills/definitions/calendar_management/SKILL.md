---
name: Calendar Operations
catalog_line: 'BuildOS calendar workflow: event reads and writes, scope decisions, project calendar mapping.'
description: Calendar workflow playbook for BuildOS agentic chat. Use for event reads/writes, scope decisions, and project calendar mapping.
skill_type: procedure # procedure | strategy | reference | resource | policy | orchestration
altitude: task # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true
legacy_paths:
    - cal.skill
    - calendar.skill
    - cal.skills
    - calendar.skills
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/calendar_management/SKILL.md
---

# Calendar Operations

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Related Tools → Examples → Provenance.
  This file is skill_type: procedure at task altitude, so Procedure carries the weight (the ordered
  calendar runbook); Contract states what to report; Policy holds the guardrails. It routes to no sibling
  skills, so there is no Routing block; there are no external sources, so Provenance holds operational notes.
-->

## Identity

Calendar workflow playbook for BuildOS agentic chat. Use for event reads/writes, scope decisions, and project calendar mapping. This is a **procedure** skill at **task** altitude: a runbook of ordered steps for operating the calendar tools, with checkpoints, an output contract, and guardrails.

## Activation

- Read events in a time window
- Create, reschedule, or cancel events
- Choose between user scope and project scope
- Manage project calendar mapping
- Link work sessions to tasks

## Procedure

1. Choose scope first: user, project, or explicit calendar_id.
2. For project scope, include exact project_id.
3. Use timezone-safe ISO 8601 values: `time_min`/`time_max` for reads and `start_at`/`end_at` for writes, or supply timezone. For a date-only event, pass `YYYY-MM-DD`; do not invent midnight UTC or a clock time. Date-only writes are all-day events.
4. For project calendar mapping questions, check cal.project.get before assuming a project calendar exists.
5. For update/delete, discover and pass exact onto_event_id or event_id.
6. Treat words such as "all", "every", "clean up", or a category like "shooting-related" as an exhaustive lookup request. Do not use a project overview or an upcoming-only list as the candidate set. Query an explicit window broad enough for the user's wording, paginate until exhausted, and include past or in-progress events unless the user limited the request to future events.
7. For first-time or complex writes, inspect the existing event and verify the exact scope and fields before calling the paired direct calendar tool.
8. After a bulk update/delete, repeat the same bounded lookup and verify that no active matches remain. Report local deletion and provider-sync status separately; a queued or failed provider sync is not a completed Google Calendar deletion.

## Contract

After a calendar write, tell the user:

- What changed: event title, the resolved time window (with timezone), scope (user, project, or explicit calendar_id), and any task link.
- Sync implications when they matter — for example that a synced event will propagate to the connected calendar.
- For reads: the events in the requested window, stated in the user's terms, plus the exact window you queried.

Stop conditions before replying: scope was chosen explicitly before the write; start/end times are timezone-safe; update/delete used an exact `onto_event_id` or `event_id` discovered from a read rather than guessed; exhaustive requests were verified with the same full lookup after mutation; you have not claimed an event was created, moved, or cancelled until the local mutation and any claimed provider sync have each reached a confirmed terminal success state.

## Policy

- Prefer onto_event_id when available for update/delete.
- If sync status matters, verify with calendar ops instead of guessing.
- Project overviews are summaries, not exhaustive event search results. Never use them alone to satisfy an "all events" mutation.
- If a task is clearly the subject of the event, include task_id.
- If only start_at is known, the backend may default duration; still prefer explicit end_at when the user gave enough detail.

## Related Tools

- `cal.event.list`
- `cal.event.get`
- `cal.event.create`
- `cal.event.update`
- `cal.event.delete`
- `cal.project.get`
- `cal.project.set`

## Examples

### Schedule a project work session tied to a task

- Call `create_calendar_event({ ... })` with title, start_at, project_id, `calendar_scope: "project"`, and task_id when relevant.
- If a required value is unclear, resolve it from project/calendar context or ask one focused question before writing.

### Reschedule an existing event safely

- Use cal.event.list or cal.event.get to discover the exact onto_event_id or event_id.
- Then call `update_calendar_event({ ... })` with the exact identifier and updated fields.

## Provenance

- Calendar reads and writes are often sensitive to scope, time zone normalization, and exact event identifiers.
- The paired calendar tools already provide their exact callable schemas; use fields such as sync_to_calendar or calendar_id only when the request and resolved scope require them.
