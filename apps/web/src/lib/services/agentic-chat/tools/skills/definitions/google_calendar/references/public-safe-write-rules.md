<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/google_calendar/references/public-safe-write-rules.md -->

# Public Safe Calendar Write Rules

Use this reference before any calendar write.

## Required Preflight

1. Choose calendar scope: primary, shared, project, or explicit calendar ID.
2. Determine the intended operation: read, create, update, delete, reschedule, availability, or sync.
3. Use a bounded lookup window with timezone.
4. Search for likely matches by title, time overlap, attendees, linked metadata, and external IDs.
5. Decide whether the request is really a create, update, ask, or no-op.

## Create Gate

Create only when:

- the target calendar scope is known;
- the relevant time window has been searched;
- no reasonable existing event matches; and
- the user did not imply "move," "change," "update," "reschedule," or "cancel."

If confidence is low, ask before creating.

## Mutation Gate

Update or delete only when:

- an exact event ID, mapped local ID, or concrete recurring instance is known;
- the calendar ID is known;
- attendee notification impact is acceptable or clarified; and
- the requested change is represented explicitly.

Do not mutate from a vague title match alone.

## Recurrence Gate

Map the user's wording before writing:

- "Only this one" -> edit one instance.
- "From now on" -> edit future instances or future series shape.
- "All of them" -> edit the full series.

If the wording is ambiguous, ask.

## Sync Boundary

Search answers what exists right now. Sync answers what changed since last sync.

Do not use sync tokens as a substitute for duplicate prevention, and do not create replacement events to repair uncertain sync state.

## Output

After any write, report:

- calendar scope;
- event title and time;
- whether it was created, updated, deleted, or skipped;
- event identity used;
- attendee notification or sync implication when relevant.
