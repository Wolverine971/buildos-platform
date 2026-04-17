---
layout: docs
title: The BuildOS Ontology
slug: ontology
summary: Projects, tasks, plans, documents, goals — the semantic model behind everything in BuildOS.
icon: Layers
order: 2
lastUpdated: 2026-04-17
---

The ontology is the semantic model BuildOS uses to represent your work. When you brain-dump a project or ask the agent to do something, the system reads and writes through this model. You don't need to understand it deeply to use BuildOS, but knowing the pieces makes everything else click.

## Entities

| Entity | What it is | Example type keys | States |
| --- | --- | --- | --- |
| **Project** | Root work unit; container for everything else | `project.developer.app`, `project.writer.book`, `project.marketer.campaign`, `project.designer.website` | planning → active → completed / cancelled |
| **Task** | An actionable item with a clear outcome | `task.execute`, `task.create`, `task.research`, `task.review`, `task.coordinate`, `task.refine`, `task.admin`, `task.plan` | todo → in_progress → done (or blocked) |
| **Plan** | A grouping of tasks with a timeline. Replaces the older "phases" framing | `plan.phase.project`, `plan.timebox.sprint`, `plan.pipeline.sales` | draft → active → completed |
| **Document** | Project knowledge — specs, research, decisions, context | `document.context.project`, `document.spec.technical`, `document.decision.rfc`, `document.knowledge.research` | draft → in_review → ready → published |
| **Goal** | A strategic objective | `goal.outcome.project`, `goal.metric.usage`, `goal.behavior.cadence` | draft → active → achieved / abandoned |
| **Requirement** | A constraint or dependency | `requirement.functional`, `requirement.non_functional` | — |
| **Milestone** | A time-based progress marker | — | — |
| **Risk** | A potential issue with a mitigation | — | identified → mitigated → closed |
| **Asset** | A file, image, or diagram. Images get **OCR** so the agent can read them | — | — |
| **Event** | A calendar item linked to work | — | — |

Every entity also carries three **facets** that describe its scope:

- **context** — who the work is for
- **scale** — how big it is
- **stage** — where it is in its lifecycle

Facets are how the agent decides what to surface. A task with `context: personal` and `scale: quick` shows up differently from one with `context: client` and `scale: multi-week`.

## An ideal project

```
Project ("Build SaaS App")
├── Context document  (markdown narrative — goals, constraints, overview)
├── Plans
│   ├── Plan: Discovery  (start / end dates)
│   └── Plan: Development
│       ├── Tasks      (research, create, review, execute)
│       ├── Documents  (specs, design docs)
│       └── Assets     (images with OCR-extracted text)
├── Goals              ("Launch MVP", "Reach 1,000 users")
├── Requirements       (functional, constraints)
└── Risks              (technical, budget, schedule)
```

The context document is the project's narrative. Goals are how you measure success. Plans group tasks over time. Documents hold specs and research. Assets carry images, diagrams, and whatever else needs to live next to the work.

## What makes a well-formed project

BuildOS works best when a project has:

1. A **context document** with clear goals and constraints.
2. Tasks organized into at least one **plan**.
3. At least one **goal** attached.
4. Key **risks** identified — even if some are just "unknown unknowns".
5. A habit of **brain-dumping back into it** so the context stays fresh.

You don't need all five on day one. The agent will nudge you toward the missing pieces over time.

## Type keys

Every task, project, and document gets a semantic type key (`task.execute`, `project.writer.book`, `document.spec.technical`). The classifier assigns these automatically based on the description, but you can change them. Type keys drive how the agent reasons — `task.research` tasks won't be scheduled the same way `task.execute` tasks are, and a `project.writer.book` gets different default plans than `project.developer.app`.

## Intelligence layers

Two layers sit on top of the ontology:

- **Type-key classification** — runs on capture to auto-label projects, tasks, and documents.
- **Tree agent** — a background agent for complex, hierarchical work like large research or book projects. It fans out into sub-tasks and documents, then folds the results back in.

You don't invoke these directly. They run as part of capture and background jobs.

## Next

- [Brain Dump & Voice Notes](/docs/brain-dump) — how entities get into the ontology.
- [Agentic Chat](/docs/agentic-chat) — how the agent reads and writes ontology data.
- [Projects, Tasks & Plans](/docs/projects-tasks-plans) — the UI around these entities.
