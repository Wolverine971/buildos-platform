---
layout: docs
title: Calendar & Time Blocks
slug: calendar
summary: Turn BuildOS tasks into scheduled time blocks on Google Calendar, and let the agent own the rescheduling loop when plans, energy, or deadlines shift.
icon: Calendar
order: 6
lastUpdated: 2026-04-17
path: apps/web/src/content/docs/calendar.md
---

BuildOS connects to Google Calendar so your tasks can become real time blocks, your calendar events can live next to the work they belong to, and the agent can schedule on your behalf with full context on what actually matters today.

## Connect Google Calendar

1. Go to [`/profile?tab=calendar`](/profile?tab=calendar).
2. Click **Connect Google Calendar**.
3. Grant permission to read and create events.
4. Configure your working hours and scheduling preferences.
5. Start scheduling tasks from any project, plan, or brief.

Support for other providers (Outlook, Apple Calendar) is on the roadmap based on demand.

## Three ways to schedule

- **From a task card.** Click the scheduling action; BuildOS finds slots inside your working hours and proposes times.
- **From the agent.** _"Find me two hours tomorrow for focus work."_ _"Schedule the top three tasks from this project this week."_
- **Directly on the calendar surface.** Drag tasks into time slots.

Events are created with the linked entity context — title, project, and anything relevant from the task — so you see what the block is for without opening BuildOS.

## Task dates vs. calendar events

Different things, on purpose:

- **Task dates** — due dates for planning. Nothing lands on your calendar.
- **Calendar events** — actual time blocks you've committed to working.

Not every task needs a time block. The split lets you plan honestly and only schedule what you'll actually do.

## Time Blocks

[`/time-blocks`](/time-blocks) is a calendar-style planning surface with analytics on how focus time is spent. It's currently rolling out behind a feature flag — if you don't see it and want in, let us know on [feedback](/feedback).

## The agent and your calendar

With calendar connected, the agent can check availability, propose slots, create events, reschedule, and cancel — all inside your working hours and respecting the scope on your account. A few prompts that tend to work well:

- _"What's my day tomorrow look like?"_
- _"Find two hours of focus time before Friday."_
- _"Move today's unfinished tasks to Monday."_
- _"Block time for the three most urgent tasks this week."_

## Next

- [Daily Briefs](/docs/daily-briefs)
- [Agentic Chat](/docs/agentic-chat)
