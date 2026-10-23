<!-- tasker/144-shared-project-calendar-sync.md -->

# 144 — What shared projects put on your Google Calendar

**Status:** RESEARCH · **Priority:** P3 · **Opened:** 2026-10-23 · **Size:** ~half a day to map, then DJ decides  
**Owner:** Claude · **Needs from DJ to start:** nothing to map; a decision after

## Why

The access audit found that dated tasks a guest agent adds in a shared project sync to every member's Google Calendar, including the owner's. DJ (2026-10-23): "I don't even know how much that gets updated." Before deciding anything, map what actually happens.

## Map, in plain words

1. Which tasks and events from a shared project reach which members' calendars (owner, editors, viewers; only those who connected Google and mapped the project?). Start at `apps/web/src/lib/services/project-calendar.service.ts` (`total_members`, `mapped_members`, `active_sync_members`) and the calendar workers in `apps/worker/src/workers/calendar/`.
2. When: on create, on every edit, on a schedule, by webhook? How fast?
3. What a guest agent's task does: does it create an event for the owner? For everyone?
4. What gets updated or deleted when the task changes or is archived.

## Then DJ picks

- Leave as is.
- Guest-agent tasks sync only to their person's calendar.
- Only assigned tasks sync to the assignee's calendar.

Related: [130](130-calendar-you-can-trust.md) (calendar correctness and the MCP project fence).

## Exit

A short plain-language answer to DJ, his pick recorded, and the change (if any) built with tests.
