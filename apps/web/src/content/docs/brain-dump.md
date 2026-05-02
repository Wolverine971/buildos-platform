---
layout: docs
title: Brain Dump & Voice Notes
slug: brain-dump
summary: Talk or type through the messy version of your work. BuildOS turns rough notes and voice dumps into structured projects with durable context and memory.
icon: Brain
order: 3
lastUpdated: 2026-04-17
path: apps/web/src/content/docs/brain-dump.md
---

A brain dump is the shortest path from _"I've got this thing in my head"_ to a project you can actually work on. You describe the work in plain language — voice or text — and BuildOS turns it into a project with a context document, tasks, a plan if one fits, and goals or risks if you named any.

Nothing gets written without your approval. Every planned change is previewed; you can edit, drop, or accept before anything lands.

## Two paths in

- **Brain Dump.** The full capture flow. Best when you've got a lot to say — a new project, a long update, a research-heavy session. It can create or update an entire project, its plan, tasks, and context document in one pass.
- **Voice Notes.** A lighter-weight surface at [`/voice-notes`](/voice-notes). Record a thought, get a transcript, and send it to a brain dump only if you want the structuring. Use it when you just need to offload something before it disappears.

Both end in the same place: structured entities in your project graph.

## What actually gets written

Dumps don't produce a free-form blob. They write into the graph:

- **A project** — new, or the existing one you're adding to.
- **A context document** — the project's markdown narrative.
- **Tasks** with semantic type keys (`task.execute`, `task.research`, and so on).
- **A plan** when the shape of the work implies phasing.
- **Goals**, **risks**, or **milestones** when you named them.

You see every planned write before it runs. Approve, edit, or discard.

## What to say

Talk like you're briefing a thoughtful collaborator who has never seen your work before. Useful ingredients:

- **The outcome.** What you're trying to produce.
- **Where you are now.** What's done, what isn't, what's unclear.
- **Rough phases.** Even a two-word sketch.
- **Blockers.** Time, skills, decisions, people.
- **Constraints and resources.** Deadlines, tools, collaborators.

Fragmentary is fine. Contradictions are fine. BuildOS resolves what it can and asks before guessing.

## A real example

> "I want to start a fitness project. Goal: lose twenty pounds and build muscle over the next six months. I've been out of shape for two years. I think I need basic cardio and bodyweight work first, then progressive weight training. Biggest blockers are time and staying motivated. I have a gym membership but I'd rather start at home."

What BuildOS proposes from that:

- A **project** with a context document summarizing the goal and the starting state.
- A **phased plan**: Month 1 cardio and bodyweight → Months 2–3 intro to lifts → Months 4–6 progressive lifting.
- **Tasks** like _"pick three home workouts,"_ _"schedule first gym visit,"_ _"decide on a motivation system."_
- A **goal**: _"Lose 20 lbs and build muscle in 6 months."_
- A **risk**: _"Time and motivation drift."_

You review the whole thing before any of it saves.

## Brain dump vs. the agent

- **Dump** to get structure on a blank page or to refresh a stale project.
- **[Agent chat](/docs/agentic-chat)** to operate on what exists — ask, update, plan, schedule.

They work together: dump captures the raw material, chat does the ongoing work.

## Next

- [Agentic Chat](/docs/agentic-chat)
- [Projects, Tasks & Plans](/docs/projects-tasks-plans)
