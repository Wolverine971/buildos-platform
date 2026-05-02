---
layout: docs
title: The BuildOS Ontology
slug: ontology
summary: Projects, tasks, plans, documents, goals, and people — the connected graph behind everything in BuildOS, and how it makes your context legible to agents.
icon: Layers
order: 2
lastUpdated: 2026-04-17
path: apps/web/src/content/docs/ontology.md
---

Every project in BuildOS is a connected graph — not a folder, not a list. The graph is what makes the project remember: tasks know which plan they belong to, documents know which project they describe, goals know which milestones ladder into them. When you ask the agent to audit a project or forecast a timeline, it's walking this graph.

You don't have to memorize any of this to use BuildOS. But once you see the pieces, the rest of the product is easier to operate.

## The pieces

| Entity        | What it is                                                             | Example type keys                                                                                                          | States                                    |
| ------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Project**   | The root work unit. Contains everything else                           | `project.developer.app`, `project.writer.book`, `project.marketer.campaign`                                                | planning → active → completed / cancelled |
| **Task**      | An actionable item with a clear outcome                                | `task.execute`, `task.create`, `task.research`, `task.review`, `task.coordinate`, `task.refine`, `task.admin`, `task.plan` | todo → in_progress → done / blocked       |
| **Plan**      | A grouping of tasks with a timeline (phases, sprints, pipelines)       | `plan.phase.project`, `plan.timebox.sprint`, `plan.pipeline.sales`                                                         | draft → active → completed                |
| **Document**  | Project knowledge — context, specs, research, decisions                | `document.context.project`, `document.spec.technical`, `document.decision.rfc`, `document.knowledge.research`              | draft → in_review → ready → published     |
| **Goal**      | A strategic objective                                                  | `goal.outcome.project`, `goal.metric.usage`, `goal.behavior.cadence`                                                       | draft → active → achieved / abandoned     |
| **Milestone** | A time-based progress marker                                           | —                                                                                                                          | —                                         |
| **Risk**      | A known issue with a mitigation                                        | —                                                                                                                          | identified → mitigated → closed           |
| **Event**     | A calendar item linked to work                                         | —                                                                                                                          | —                                         |
| **Member**    | A person on the project with a role                                    | —                                                                                                                          | —                                         |
| **Asset**     | A file, image, or diagram. Images are OCR'd so the agent can read them | —                                                                                                                          | —                                         |

Every entity also carries three **facets** that describe its scope:

- **context** — who the work is for.
- **scale** — how big it is.
- **stage** — where it is in its lifecycle.

Facets are how the agent decides what to surface. A task with `context: personal` and `scale: quick` gets treated differently from one with `context: client` and `scale: multi-week`.

## An ideal project

```
Project ("Build SaaS App")
├── Context document   (markdown narrative — goals, constraints, overview)
├── Members            (who's on it, what role)
├── Plans
│   ├── Plan: Discovery        (start / end dates)
│   └── Plan: Development
│       ├── Tasks              (research, create, review, execute)
│       ├── Documents          (specs, design docs)
│       └── Assets             (images with OCR-extracted text)
├── Goals              ("Launch MVP", "Reach 1,000 users")
├── Milestones         ("Private beta open", "Landing page live")
└── Risks              (technical, budget, schedule)
```

The context document is the project's narrative. Goals are how you measure success. Plans group tasks over time. Documents hold specs and research. Assets carry the things that don't belong in prose.

## What a well-formed project looks like

BuildOS works best when a project has:

1. A **context document** with clear goals and constraints.
2. Tasks organized into at least one **plan**.
3. At least one **goal** attached.
4. Key **risks** named — even if some are just "unknowns."
5. A habit of **dumping back into it** when your thinking changes.

You don't need all five on day one. The agent nudges you toward the missing pieces as the project matures.

## Type keys

Tasks, projects, and documents get a semantic type key like `task.execute` or `project.writer.book`. The classifier assigns them on capture; you can override any of them. Type keys are how the agent reasons — `task.research` doesn't get scheduled the same way `task.execute` does, and `project.writer.book` gets different default plans than `project.developer.app`.

## Where intelligence lives

Two layers sit on top of the graph and run without you thinking about them:

- **Classification** — labels projects, tasks, and documents as they're captured so the rest of the product can reason about them.
- **Tree agent** — a background worker for large, hierarchical work (book-length research, long launches). It fans out, produces entities, and folds them back into the project.

## Next

- [Brain Dump & Voice Notes](/docs/brain-dump) — how entities land in the graph.
- [Agentic Chat](/docs/agentic-chat) — how the agent reads and writes across it.
- [Projects, Tasks & Plans](/docs/projects-tasks-plans) — the day-to-day UI around these entities.
