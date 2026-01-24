---
title: 'Under the Hood: How BuildOS Organizes Your Thoughts'
description: 'A peek behind the curtain at the ontology that powers BuildOS—rich context architecture where goals, plans, tasks, and documents all connect.'
author: 'DJ Wayne'
date: '2025-12-17'
lastmod: '2026-01-24'
changefreq: 'monthly'
priority: '0.8'
published: true
tags:
    [
        'under-the-hood',
        'getting-started',
        'ontology',
        'architecture',
        'technical',
        'project-lens',
        'context-building',
        'zoom'
    ]
readingTime: 9
excerpt: 'Most productivity tools force you into rigid templates. BuildOS takes a different approach—a connected ontology where goals, plans, tasks, and documents form rich context that compounds over time.'
pic: 'under-the-hood'
path: apps/web/src/content/blogs/getting-started/under-the-hood.md
---

## The Problem with Templates

Most productivity tools love templates. "Pick a template for your project!" they say. Software project? Use this one. Book writing? That one. Marketing campaign? Another.

But here's the thing: your projects don't fit neatly into boxes. Your book project might also be a business venture. Your "simple task" might balloon into a mini-project. Reality is messy.

We built BuildOS differently.

(That said, if you *need* structure upfront, you can always ask: "Create me a template with goals, milestones, and phases." BuildOS accommodates—it just doesn't require it.)

---

## Structure That Emerges

Instead of forcing you to pick templates upfront, BuildOS lets structure **emerge from your conversations**.

When you chat with BuildOS about a project, the AI listens for patterns:

- Are you talking about goals? It recognizes that.
- Mentioning specific tasks? Captured.
- Planning milestones? Noted.
- Worrying about risks? We track those too.

The system doesn't need you to click "Add Task" and fill out a form. You just talk, and BuildOS figures out what's what.

---

## The Ontology: Rich Context Architecture

Under the hood, BuildOS organizes your work using what we call an **ontology**—a connected architecture of entities that form rich context:

```
Goals (Why you're doing this)
  └── Plans (How you'll get there)
       └── Tasks (What to do next)
            └── Documents (What you've learned)
```

This isn't just organization—it's **context infrastructure**. Every piece knows what it connects to. Every entity carries its parent context.

### Goals

What you're trying to achieve. Goals are the "why" behind your projects. "Ship the MVP by March." "Write 80,000 words." "Close the funding round." Goals sit at the top of the hierarchy—everything else exists to serve them.

### Plans

How you're going to get there. Plans are strategic groupings of work. Think of them like phases or sprints—a collection of related tasks that move you toward a goal. Plans connect goals to execution.

### Tasks

The actual work. Tasks are the things you do today. Call this person. Write this section. Review that document. Tasks are where rubber meets road—but in BuildOS, every task knows which goal it serves and which plan it belongs to.

### Documents

The knowledge you need. Meeting notes, specs, reference materials, decision records. Documents live inside your projects and give the AI (and you) context. They're not isolated files—they're connected to the work they inform.

### Milestones

Significant markers along the way. The investor meeting. The beta launch. The manuscript deadline. Milestones make progress visible and give you something to celebrate.

### Risks

Things that could go wrong. Every project has them. BuildOS helps you identify and track risks so you can address them before they derail you.

---

## Intelligent Classification

Here's where it gets interesting.

When you tell BuildOS "I need to prepare for the investor meeting on Thursday," it doesn't just create a task. It understands:

- There's a **milestone** (the meeting)
- There might be **tasks** (prepare deck, gather metrics)
- This relates to a **goal** (close funding)
- It might have **risks** (not enough traction data)

The system creates the right structures automatically. You don't have to think about whether something is a "task" or a "milestone"—you just describe what you're trying to do.

### But What If It Gets It Wrong?

Fair question. No AI is perfect.

BuildOS uses a hybrid approach: fast pattern matching for immediate responsiveness, with optional AI refinement running in the background. But more importantly, **you're always in control**.

Every entity has a full editing interface. If the system thinks something is a coordination meeting when it's really a research task, you click, change it, done. Classifications, states, priorities—all editable. The AI gives you a starting point; you refine it.

---

## Flexible Properties

Here's another thing we do differently: **flexible properties**.

Traditional tools have rigid fields. A task has a title, description, due date, priority. That's it.

In BuildOS, entities have **props**—flexible key-value properties stored directly on each entity. A book project might track:

- `genre`: "fantasy"
- `target_word_count`: 80000
- `current_word_count`: 23450
- `writing_stage`: "drafting"

A startup project might track:

- `funding_stage`: "pre-seed"
- `target_mrr`: 10000
- `current_mrr`: 2500
- `team_size`: 3

These props aren't predetermined. They emerge as you chat. The AI picks up on what matters for YOUR specific project and tracks it accordingly.

### Where You See Them

Props appear in entity detail views and edit modals. You can add, edit, or remove props anytime—they're yours to customize.

### Built-in Facets

Beyond custom props, BuildOS has structured **facets** for common dimensions:

- **Context**: personal, client, commercial, open source, nonprofit
- **Scale**: micro, small, medium, large, epic
- **Stage**: discovery, planning, execution, launch, maintenance

Facets help the AI understand what kind of work this is—so it can give you better recommendations and surface relevant tasks.

---

## State Without Bureaucracy

Every piece of work has a lifecycle. Tasks go from "to do" to "in progress" to "done." Projects move from "planning" to "active" to "complete."

But we keep it simple:

| Thing     | States                                          |
| --------- | ----------------------------------------------- |
| Project   | draft → active → paused → complete → archived   |
| Task      | todo → in_progress → blocked → done → abandoned |
| Goal      | active → achieved → abandoned                   |
| Milestone | pending → achieved → missed                     |

No complicated workflows. No approval chains. Just sensible states that match how real work actually flows.

---

## Everything Connects

The real power is in connections.

A task can **belong to** a plan. A plan **supports** a goal. A risk can **threaten** a milestone. A document **provides context** for a project.

These relationships create a web of meaning. When you ask BuildOS "What should I focus on today?", it can trace connections:

- What goals have upcoming milestones?
- What tasks support those goals?
- What's blocked and what's ready?
- What risks need attention?

You get intelligent recommendations because everything is connected.

---

## Project Lens: Zoom Into Your Context

Here's where the ontology becomes interactive: **Project Lens lets you zoom into any level of your context**.

When you focus on a specific entity—a goal, a task, a document—the AI automatically loads the relevant context:

| Zoom Level | What AI Knows                         | Example Use            |
| ---------- | ------------------------------------- | ---------------------- |
| Goal       | All connected plans, tasks, documents | Strategic review       |
| Plan       | Parent goal + all tasks in this plan  | Phase planning         |
| Task       | Full context chain + task details     | Execution guidance     |
| Document   | What it connects to + content         | Research and decisions |

**You control the altitude. AI follows.**

This is why the ontology matters. Without structured context, "zoom into my marketing task" would mean nothing. With the ontology, it means loading:

- The parent goal this task serves
- The plan it belongs to
- Related documents
- Dependencies and blockers
- History of decisions

### The Zoom Flow

```
Need strategic view?
    ↓
Zoom out to goal level
    ↓
Need execution details?
    ↓
Zoom into a specific task
    ↓
Need research?
    ↓
Zoom into a document
```

Every zoom level loads the right context automatically.

### How It Works (For the Curious)

When you focus on an entity, the system runs a parallel context load:

1. **Full project context**: all entities, relationships, recent activity
2. **Element focus**: the specific entity you're zoomed into

The result is merged into a combined projection—recent tasks, upcoming deadlines, related documents, risks—intelligently filtered so the AI has what it needs without hitting token limits. A one-minute cache keeps things snappy for multi-turn conversations.

---

## Context That Compounds

Here's what makes this architecture powerful: **context compounds through the ontology**.

Every brain dump, every task completed, every decision documented—it all connects through these relationships. Day 1 context is helpful. Day 100 context—where everything connects to everything—is like having a partner who knows your entire work history.

The AI doesn't just remember your tasks. It understands which goals they serve, what risks might block them, and which documents provide the context you need.

(For a deeper dive on context compounding, see [Context Engineering 101](/blog/context-engineering-101).)

## Team Collaboration

You can invite collaborators to any project. Invitees get role-based access—some can edit, others can view—and everyone benefits from the shared context. The AI understands who's working on what.

## The Bottom Line

BuildOS doesn't force your brain into rigid boxes. Structure emerges from conversations. Properties adapt to your work. And everything compounds over time.

That's what's under the hood.

---

**Ready to see the ontology in action?**

Start with a brain dump. Watch structure emerge from your thoughts. See how goals connect to plans connect to tasks.

[Try the connected approach →](/)

<!-- dj notes 

In this article, we need to talk about the proper structure that is ideal. Ideally, in a project, you have goals. These are your end states. And goals are big and their main goals. And you usually break down a goal into milestones, incremental steps to get to your end goal. From there, each milestone has a plan to get there. Your whole plan to reach that milestone and those plans is a detailed strategy. And that plan consists of tasks. With all this you have risks and different requirements. And you might be referring to different documents. This is the hierarchy and layout that BuildOS tries to get to and it's flexible so starting out you may just have a project with a few tasks or you may just have a project with a goal. As you continue to talk about your project and add to it, the structure will emerge and you'll be able to get clarity into what's next and what's helping you get to where you want to be. 
-->
