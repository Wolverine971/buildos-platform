---
layout: docs
title: Agentic Chat
slug: agentic-chat
summary: An in-app collaborator that already knows your BuildOS projects. Audit context, forecast deadlines, plan work, schedule tasks, and write back into the graph.
icon: MessageSquare
order: 4
lastUpdated: 2026-04-17
path: apps/web/src/content/docs/agentic-chat.md
---

Agentic chat is your working companion inside BuildOS. Unlike a stateless chatbot, it already knows your projects, your tasks, your documents, and (if you've connected it) your calendar. It can read anything in the graph, write into it with your approval, pull in web research, and coordinate across projects.

It's context-aware. Where you open it shapes what it focuses on.

## Where to find it

- **Nav icon.** The default entry point — opens with a context picker.
- **Dashboard brief card.** Opens split-pane on desktop, bottom-sheet on mobile, with today's brief already loaded.
- **Inside a document or milestone.** Scopes the conversation to that entity.
- **Before your first message.** A context selection screen confirms what the agent will look at, and lets you change it.

## What it actually does

Think about it as a collaborator with capabilities, not a tool catalog.

### Understands your work

- **Workspace and project overviews** — status snapshots without stitching reads together by hand.
- **Search across projects, tasks, documents, and goals** — find anything without leaving chat.
- **Entity deep-dives** — pull the full state of a specific task, project, or document.

### Structures and advances work

- **Project creation** — turn a loose idea into a valid project with the smallest structure that fits.
- **Planning and task structuring** — break outcomes into plans, refine what exists, connect tasks to goals and milestones.
- **Document workspace management** — create, update, place, and reorganize docs without breaking hierarchy rules.
- **Risks, goals, milestones** — update, close, re-scope with the changes reviewed before they land.

### Thinks about the project with you

- **Project audit** — health check: blockers, stale work, missing coverage, structural gaps.
- **Project forecast** — schedule outcomes, slippage risk, the biggest drivers of uncertainty.

### Coordinates execution

- **Calendar management** — check availability, schedule or reschedule, cancel, map project calendars.
- **Web research** — search the web, fetch specific URLs, pull external context into the project.
- **People context** — use profile and contact records when personalization matters.

Anything the agent writes is approved first and shows up in the rest of the product just like something you made yourself.

## Prompts worth trying

**From the nav (workspace-wide)**

- "What should I work on today?"
- "What's happened across my projects this week?"
- "Which projects have stalled in the last ten days?"
- "Find tasks that are blocked and tell me why."

**Inside a project**

- "What's blocking this one?"
- "Audit this project — where are the gaps?"
- "Draft a plan for launching by March."
- "Which tasks are overdue and why?"
- "Are we on track? Show me the risk."
- "Update the context doc with what I learned yesterday."

**With calendar connected**

- "Find me two hours tomorrow for focus work."
- "Schedule the top three tasks from this project this week."
- "Cancel today's placeholder and reschedule for Thursday morning."

**From a brief**

- "Turn today's priorities into calendar blocks."
- "Explain why this task is on today's brief."

**Starting a new project**

- "Help me scope a new book project."
- "I want to launch a newsletter. Break that into phases."

## A note on judgment

The agent tries to act fast, but it doesn't pretend to know things it doesn't. If the target is ambiguous — two projects with similar names, a task it can't resolve — it asks one concise question before it writes. If a write fails, it says what didn't change instead of faking success. That's the behavior you want from a collaborator.

## Next

- [Calendar & Time Blocks](/docs/calendar)
- [Daily Briefs](/docs/daily-briefs)
- [Connect External Agents](/docs/connect-agents) — extend the same capabilities to Claude Code or OpenClaw.
