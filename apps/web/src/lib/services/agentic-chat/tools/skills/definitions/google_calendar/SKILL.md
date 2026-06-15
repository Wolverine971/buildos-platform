---
name: Google Calendar
description: Use Google Calendar safely from an AI agent. Use when reading, creating, rescheduling, cancelling, or syncing calendar events; choosing calendar scope; preventing duplicate events; handling recurring events; or linking calendar time to projects and tasks.
preserve_markdown: true
legacy_paths:
    - google-calendar
    - google-workspace/google-calendar
    - google-calendar-for-ai-agents-search-before-you-create
    - google_calendar_for_ai_agents_search_before_you_create
    - apps/web/src/content/blogs/agent-skills/google-calendar-for-ai-agents-search-before-you-create.md
reference_modules:
    - id: google_calendar.public_safe_write_rules
      name: Public Safe Calendar Write Rules
      summary: Portable checklist for scope, lookup, create/update/delete, recurrence, time zones, and sync boundaries.
      when_to_load:
          - When using the portable bundle outside BuildOS.
          - Before creating, updating, deleting, or rescheduling calendar events.
          - When recurrence, attendee notification, duplicate event, or sync risk is present.
      path: references/public-safe-write-rules.md
      visibility: public
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/google_calendar/SKILL.md
---

# Google Calendar

Google Calendar is live operational state. Calendar writes should be conservative because bad writes change someone's day.

The core rule is simple: **search before create**.

Create only after choosing scope, inspecting the relevant time window, and deciding the request is not really an update to an existing event.

## When to Use

- Read calendar events in a time window.
- Create work blocks, meetings, reminders, or follow-up sessions.
- Reschedule or cancel events.
- Search for an existing meeting or work block.
- Find availability.
- Handle recurring events or one-off exceptions.
- Diagnose duplicate event or sync risk.
- Link calendar time to a task, project, CRM record, or workflow.

## Workflow

1. Choose scope first: primary calendar, shared calendar, project calendar, or explicit calendar ID.
2. Use bounded lookup: search with an explicit time window and timezone.
3. Search for likely matches by title, time overlap, attendees, linked task/project metadata, local mapping, and external event IDs.
4. If a likely event exists, update it, ask, or confirm whether the user wants an additional event.
5. Create only when no reasonable match exists or the user explicitly wants another event.
6. For update/delete, use exact IDs. Prefer local mapping, then external event ID plus calendar ID.
7. Treat recurring events as high risk. Clarify whether the user means one instance, future instances, or the whole series.
8. Report what changed and mention attendee notifications or sync implications when relevant.

## Read Rules

- Use explicit start and end bounds.
- Carry timezone when available.
- Use text search for lookup tasks like "find the design review."
- Use free/busy or availability tools when the user asks for an open slot.
- Return concrete recurring instances when the user asks what is on the calendar.

## Create Rules

- Never create blindly.
- Search the target time window first.
- Prefer adding metadata that links the event to the originating task, project, CRM record, or workflow.
- If confidence is low, ask before creating.
- Do not create a replacement event as a hidden fallback for a failed update.

## Update and Delete Rules

- Use exact event IDs or local mapped IDs.
- Verify calendar scope before mutation.
- Verify whether attendees may be notified.
- For important or complex writes, read the existing event first and merge intended changes.
- Do not mutate based on vague title matching alone.

## Recurrence Rules

- "Only this one" means edit the specific instance.
- "From now on" means edit future instances or the future series shape.
- "All of them" means edit the full series.
- If wording is ambiguous, ask.
- Never silently apply a broad recurrence edit.

## Time Rules

- Prefer timezone-safe ISO 8601 datetimes.
- Treat date-only and all-day events separately from timed events.
- Do not invent a precise time when the user only gave a date.
- If only a start time is known, ask or use the product's explicit default-duration policy.

## Sync Rules

Lookup and sync are different jobs.

- Use list/search for discovery and duplicate prevention.
- Use incremental sync tokens only for "what changed since last time?"
- Do not combine search matching logic with sync-token state.
- If sync state is broken, report or repair it; do not casually recreate events.

## Related Tools

- `cal.event.list`
- `cal.event.create`
- `cal.event.update`
- `cal.event.delete`

## Guardrails

- Do not create a calendar event before searching the relevant window.
- Do not mutate by vague title matching alone.
- Do not silently apply broad recurrence edits.
- Do not invent calendar scope.
- Do not hide failed updates by creating replacement events.
- Do not merge search logic with background sync-token state.

## Examples

### Reschedule an existing meeting

- Choose calendar scope.
- Search the target day for the meeting title and overlapping attendees.
- Inspect likely matches.
- If one obvious match exists, update that event ID.
- If multiple plausible matches exist, ask.
- Do not create a second event at the new time.

### Create a project work block

- Resolve the project or task if the agent has access to one.
- Search the target week for existing related work blocks.
- If a work block exists, ask whether to move it or add another session.
- If none exists, find a slot and create the event.
- Store task/project metadata when supported.

### Move one recurring instance

- Search the narrow target window.
- Identify the concrete recurring instance.
- Update only that instance.
- Preserve the rest of the series.

## Notes

- Calendar agents should preserve state before generating new state.
- Scope is part of correctness. A successful API call to the wrong calendar is still wrong.
- Event identity matters more than title similarity.
- Recurrence is where vague calendar agents break real workflows.
