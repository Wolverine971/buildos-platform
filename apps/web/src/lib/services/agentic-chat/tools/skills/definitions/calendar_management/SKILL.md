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
3. Use timezone-safe ISO 8601 values for start_at and end_at, or supply timezone.
4. For project calendar mapping questions, check cal.project.get before assuming a project calendar exists.
5. For update/delete, discover and pass exact onto_event_id or event_id.
6. For first-time or complex writes, inspect the exact tool schema with `tool_schema` before calling the direct calendar tool.
7. After execution, tell the user what changed and mention sync implications when they matter.

## Contract

After a calendar write, tell the user:

- What changed: event title, the resolved time window (with timezone), scope (user, project, or explicit calendar_id), and any task link.
- Sync implications when they matter — for example that a synced event will propagate to the connected calendar.
- For reads: the events in the requested window, stated in the user's terms, plus the exact window you queried.

Stop conditions before replying: scope was chosen explicitly before the write; start/end times are timezone-safe; update/delete used an exact `onto_event_id` or `event_id` discovered from a read rather than guessed; you have not claimed an event was created, moved, or cancelled until the tool call returned success.

## Policy

- Prefer onto_event_id when available for update/delete.
- If sync status matters, verify with calendar ops instead of guessing.
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

- If the exact args are unclear, call `tool_schema({ op: "cal.event.create" })`.
- Then call `create_calendar_event({ ... })` with title, start_at, project_id, `calendar_scope: "project"`, and task_id when relevant.

### Reschedule an existing event safely

- Use cal.event.list or cal.event.get to discover the exact onto_event_id or event_id.
- If the update shape is unclear, call `tool_schema({ op: "cal.event.update" })`.
- Then call `update_calendar_event({ ... })` with the exact identifier and updated fields.

## Provenance

- Calendar reads and writes are often sensitive to scope, time zone normalization, and exact event identifiers.
- Use `tool_schema` if the request depends on less common fields such as sync_to_calendar or calendar_id.
