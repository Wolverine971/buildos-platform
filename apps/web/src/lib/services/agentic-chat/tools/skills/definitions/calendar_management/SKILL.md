---
name: Calendar Operations
description: Calendar workflow playbook for BuildOS agentic chat. Use for event reads/writes, scope decisions, and project calendar mapping.
legacy_paths:
    - cal.skill
    - calendar.skill
    - cal.skills
    - calendar.skills
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/calendar_management/SKILL.md
---

# Calendar Operations

Calendar workflow playbook for BuildOS agentic chat. Use for event reads/writes, scope decisions, and project calendar mapping.

## When to Use

- Read events in a time window
- Create, reschedule, or cancel events
- Choose between user scope and project scope
- Manage project calendar mapping
- Link work sessions to tasks

## Workflow

1. Choose scope first: user, project, or explicit calendar_id.
2. For project scope, include exact project_id.
3. Use timezone-safe ISO 8601 values for start_at and end_at, or supply timezone.
4. For project calendar mapping questions, check cal.project.get before assuming a project calendar exists.
5. For update/delete, discover and pass exact onto_event_id or event_id.
6. For first-time or complex writes, inspect the exact tool schema with tool_schema before buildos_call.
7. After execution, tell the user what changed and mention sync implications when they matter.

## Related Tools

- `cal.event.list`
- `cal.event.get`
- `cal.event.create`
- `cal.event.update`
- `cal.event.delete`
- `cal.project.get`
- `cal.project.set`

## Guardrails

- Prefer onto_event_id when available for update/delete.
- If sync status matters, verify with calendar ops instead of guessing.
- If a task is clearly the subject of the event, include task_id.
- If only start_at is known, the backend may default duration; still prefer explicit end_at when the user gave enough detail.

## Examples

### Schedule a project work session tied to a task

- If the exact args are unclear, call `tool_schema({ op: "cal.event.create" })`.
- Then call `buildos_call({ op: "cal.event.create", args: { ... } })` with title, start_at, project_id, calendar_scope="project", and task_id when relevant.

### Reschedule an existing event safely

- Use cal.event.list or cal.event.get to discover the exact onto_event_id or event_id.
- If the update shape is unclear, call `tool_schema({ op: "cal.event.update" })`.
- Then call `buildos_call({ op: "cal.event.update", args: { ... } })` with the exact identifier and updated fields.

## Notes

- Calendar reads and writes are often sensitive to scope, time zone normalization, and exact event identifiers.
- Use `tool_schema` if the request depends on less common fields such as sync_to_calendar or calendar_id.
