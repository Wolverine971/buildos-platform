---
layout: docs
title: Daily Briefs
slug: daily-briefs
summary: AI-generated briefs delivered by email, SMS, and in-app — with a chat that acts on them.
icon: Mail
order: 7
lastUpdated: 2026-04-17
---

A brief is a short, AI-generated synthesis of your current state — what's happening in your projects, what to focus on, what's blocked, and what's changed since last time. Briefs are how BuildOS shows up when you aren't inside the app.

## Types

- **Individual project briefs.** Deep-dive updates scoped to one project.
- **Master daily briefs.** A comprehensive rollup across every active project, with the day's priorities and strategic alignment.

## Delivery

- **In-app.** Always available on the [Briefs](/briefs) page, with an analytics tab for generation stats, delivery success, and engagement.
- **Email.** Delivered to the address on your account at your scheduled time.
- **SMS.** Opt in from profile preferences. Powered by Twilio.

Pick whichever combination fits. You can turn channels on and off per brief type.

## What a brief contains

Each brief is generated from your ontology and includes:

- **Project status** — current progress and milestone updates.
- **Priority actions** — what to focus on today or this week.
- **Blockers and challenges** — items that need a decision.
- **Recent context** — insights from the latest capture sessions.
- **Strategic alignment** — how active projects ladder to your goals.

## Chat from a brief

Tap a brief card on the dashboard and the agent opens in `daily_brief` context with the brief pre-loaded. Try:

- "Turn today's priorities into calendar blocks."
- "Explain why this task is on today's brief."
- "What did I ship this week across all projects?"
- "Pick three tasks I should finish before Friday."

Anything the agent creates from a brief chat — calendar events, new tasks, updated documents — is written back into your ontology.

## Cadence and engagement backoff

Briefs adapt. If you stop engaging, BuildOS dials back delivery instead of spamming you. You can override this in brief settings at any time. The `daily_brief_update` agent context exists specifically for tuning cadence and notifications without leaving chat.

## Next

- [Notifications](/docs/notifications) — where briefs live alongside other channels.
- [Agentic Chat](/docs/agentic-chat)
