---
layout: docs
title: Brain Dump & Voice Notes
slug: brain-dump
summary: Capture messy thinking in text or voice; BuildOS structures it into your ontology.
icon: Brain
order: 3
lastUpdated: 2026-04-17
---

A brain dump is the heart of BuildOS. You talk or type the messy version of what you're working on, and the system turns it into projects, tasks, plans, and documents — always with a review step before anything is written.

## Two flavors

- **Brain Dump** — the full capture flow. Pairs with ontology-aware AI that can create or update an entire project, its plans, tasks, and context document in one pass. Use this when you have a lot to say.
- **Voice Notes** — a lighter-weight capture surface at [`/voice-notes`](/voice-notes). Record a thought, get a transcript, and optionally send it to brain-dump processing. Use this when you just want to offload an idea without the full flow.

Both paths end in the same place: entities written into your ontology.

## What gets created

A brain dump no longer produces a free-form blob. It writes into the ontology:

- **A project** (new or existing).
- A **context document** (`document.context.project`) — the markdown narrative for the project.
- **Tasks** with appropriate type keys (`task.execute`, `task.research`, etc.).
- A **plan** when the description implies phasing.
- **Goals**, **risks**, or **requirements** when the description warrants them.

You see every planned operation before it runs and can approve, edit, or discard.

## How to get the most out of a brain dump

Talk like you're briefing a thoughtful colleague. Include:

- **What you're trying to do.** The goal in plain language.
- **Where you are right now.** Current state, what's working, what isn't.
- **Any phases or milestones.** Rough shape is enough.
- **Blockers.** What's in your way.
- **Anyone or anything you depend on.** People, tools, constraints.

Fragmented is fine. Contradictions are fine. The AI resolves them during processing and surfaces anything ambiguous.

## Example: a fitness project

> "I want to start a fitness project. My goal is to lose 20 pounds and build muscle over the next 6 months. Right now I'm completely out of shape and haven't worked out in 2 years. I think I need to start with basic cardio and bodyweight exercises, then gradually add weight training. My biggest blockers are time management and staying motivated. I have a gym membership but prefer working out at home initially…"

That's enough to produce:

- A project with a context document summarizing goals and state.
- A phased plan (Month 1: cardio/bodyweight → Month 2–3: intro to weights → Month 4–6: progressive lifts).
- Tasks like "pick 3 home workouts," "schedule first gym visit," "find motivation system."
- A goal: "Lose 20 lbs and build muscle in 6 months."
- A risk: "Time management and motivation lapse."

You review everything before it saves.

## Brain dump vs. agentic chat

Brain dump is for creating and enriching. Agentic chat is for operating on what already exists — asking, updating, planning, scheduling. They're complementary: dump to capture, chat to execute.

## Next

- [Agentic Chat](/docs/agentic-chat)
- [Projects, Tasks & Plans](/docs/projects-tasks-plans)
