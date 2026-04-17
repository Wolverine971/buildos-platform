---
layout: docs
title: Notifications
slug: notifications
summary: In-app, push, email, and SMS — routed per event, all visible in one activity log.
icon: Bell
order: 8
lastUpdated: 2026-04-17
path: apps/web/src/content/docs/notifications.md
---

Notifications in BuildOS are multi-channel and per-event configurable. The goal is to reach you once, in the right place, for the right reason — not to flood you.

## Channels

- **In-app.** Always on. The [Notifications Center](/notifications) is the activity log.
- **Push.** Browser and mobile web push.
- **Email.** Delivered to the address on your account.
- **SMS.** Opt in from profile preferences.

## Per-event routing

Each notification type — daily briefs, task reminders, calendar events, system alerts — can route to any mix of channels. You could, for example:

- Send **daily briefs** to email only.
- Send **task reminders** to push and in-app.
- Reserve **SMS** for urgent calendar events.

Configure routing from the Notifications Center or profile preferences.

## The activity log

[`/notifications`](/notifications) is the single place to see every notification you've received, across every channel, in chronological order. Use it to audit what went out, replay something you missed, or turn off a channel that's gotten noisy.

## Next

- [Daily Briefs](/docs/daily-briefs)
- [Reference & Help](/docs/reference)
