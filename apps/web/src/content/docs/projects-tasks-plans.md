---
layout: docs
title: Projects, Tasks & Plans
slug: projects-tasks-plans
summary: Organize work into projects with tasks, plans, documents, and goals.
icon: FolderOpen
order: 5
lastUpdated: 2026-04-17
---

Projects are how BuildOS anchors everything else. A project holds its own context document, tasks, plans, goals, documents, risks, and assets — all the ontology entities described in [The BuildOS Ontology](/docs/ontology). This page covers the day-to-day surfaces you'll use to work with them.

## Views

Every project has three main views:

- **Kanban.** Columns represent states or plans. Drag tasks between columns to change status or reassign them to a different plan.
- **Timeline.** A Gantt-style view keyed to plan start and end dates. Good for deadline-driven work.
- **Documents.** The context document plus any specs, research, and decisions you've attached.

Use Kanban for flexible, iteration-based work. Use Timeline for date-driven projects. Use Documents when you need to read, write, or export narrative context.

## Tasks

A task has a type key (`task.execute`, `task.research`, `task.review`, etc.) that shapes how the agent reasons about it, and a state:

- **todo** — not started.
- **in_progress** — actively being worked.
- **done** — finished.
- **blocked** — can't proceed; usually paired with a note on what's blocking.

You can add tasks manually, have them extracted from a brain dump, or ask the agent to create them. Tasks support dependencies — linking one to another so the UI and the agent both know the order.

## Plans

Plans replace the older "phases" concept. A plan is a typed grouping of tasks with its own timeline. The common types:

- `plan.phase.project` — classic phased delivery.
- `plan.timebox.sprint` — time-boxed sprints.
- `plan.pipeline.sales` — pipeline-style flows.

A project can have multiple plans. Tasks belong to one plan at a time, or to no plan at all.

## The context document

Every project has a **context document** (`document.context.project`) — a markdown narrative that captures goals, constraints, key decisions, and anything else you want the agent to remember. It's the richest input the agent uses when reasoning about the project.

Edit it by hand in the rich markdown editor, or let brain dump and agentic chat write into it. Exporting is still available when you want to paste a copy into an external tool, but the primary workflow now is to let the agent operate on it in place.

![Rich markdown editor for editing project context](/blogs/s-context-edit.webp)

## Goals, risks, requirements, assets

Projects can have any combination of:

- **Goals** — strategic objectives (`goal.outcome.project`, `goal.metric.usage`).
- **Risks** — known issues with mitigations.
- **Requirements** — functional or non-functional constraints.
- **Assets** — files and images (images get OCR so the agent can read them).

You don't need all of these on every project. Start with a context doc, tasks, and maybe a goal. Add the rest when you feel the absence.

## Public projects

Any project can be published at `/p/<your-slug>` with a share icon on the project list. Public projects get view counts and comments. An index of all your public projects lives at `/p/<your-handle>`.

## Next

- [Calendar & Time Blocks](/docs/calendar)
- [Daily Briefs](/docs/daily-briefs)
