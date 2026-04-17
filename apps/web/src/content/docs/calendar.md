---
layout: docs
title: Calendar & Time Blocks
slug: calendar
summary: Turn tasks into scheduled work with Google Calendar and the time-blocks surface.
icon: Calendar
order: 6
lastUpdated: 2026-04-17
---

BuildOS connects to Google Calendar so tasks can become time blocks, and calendar events can show up next to the work they belong to.

## Connect Google Calendar

1. Go to [`/profile?tab=calendar`](/profile?tab=calendar).
2. Click **Connect Google Calendar**.
3. Grant BuildOS permission to read and create calendar events.
4. Configure your working hours and scheduling preferences.
5. Start one-click scheduling tasks from any project or phase.

Support for other calendar providers (Outlook, Apple Calendar) is on the roadmap based on demand.

## Scheduling tasks

You can schedule a task three ways:

- **From a task card.** Click the **Schedule** action; BuildOS finds slots inside your working hours.
- **From the agent.** "Find me 2 hours tomorrow for focus work" or "schedule the top 3 tasks from this project this week."
- **Directly on the calendar surface.** Drag a task into a time slot.

Events are created with the linked entity context so you see the task title, project, and any relevant notes without opening BuildOS.

## Task dates vs. calendar events

They're different things, on purpose:

- **Task dates** — due dates for planning. They don't put anything on your calendar.
- **Calendar events** — actual time blocks when you intend to work on a task.

You choose which tasks get scheduled and when. Not every task needs a time block.

## Time Blocks

The Time Blocks surface at [`/time-blocks`](/time-blocks) is a calendar-style planning view with analytics on how you spent focus time. It's currently behind the `time_play` feature flag. If you don't see it, ping [feedback](/feedback).

## The agent and your calendar

The agent has `list_calendar_events` (read) and `create_calendar_event` (write) tools. In **calendar** context, or when the question implies scheduling, it can check availability, propose slots, and write events. It respects your working hours and the `read_only` vs `read_write` scopes on your account.

## Next

- [Daily Briefs](/docs/daily-briefs)
- [Agentic Chat](/docs/agentic-chat)
