---
name: Storyboard Journey Lens
description: Find the shape of a story-driven piece before drafting by mapping how the audience arrives at the idea and choosing where to enter the story. Use when the piece is carried by a person, a moment, or an arc and you need a journey map plus an entry point — not for drafting prose or executing narrative craft (that is story_driven_content_craft).
skill_type: strategy # procedure | reference | strategy | resource | policy | orchestration
altitude: task # task | domain | meta
activation: progressive # always_on | progressive | invoked
parent_id: content_creation_pipeline
depth: 1
preserve_markdown: true
legacy_paths:
    - storyboard-journey-lens
    - marketing-and-content.storyboard-journey-lens.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/storyboard_journey_lens/SKILL.md
---

# Storyboard Journey Lens

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Examples.
  This file is skill_type: strategy, so Judgment carries the weight — the journey-map and entry-point
  frameworks, the thresholds, and the boundary/precondition gates all live there. Procedure is the short
  ordered pass; Routing declares the two hand-offs (idea_expansion_lens, story_driven_content_craft).
  Secondary type: procedure — it does carry a real Workflow. Dominant stays strategy because the value is
  DECIDING the shape and the entry point, not executing steps; the matrix keeps that Procedure block legal.
-->

## Identity

Map how a real person arrives at the idea, then decide where to **enter** that story. This is an ideation framework that runs at the pipeline's Expand stage: its output is a **shape** (a journey map + a chosen entry point), not prose. Drafting and narrative execution happen later — escalate to `story_driven_content_craft` for that. This is a **strategy** skill at **task** altitude.

## Activation

Use this lens when the idea is carried by a person, a moment, or an arc. Use `idea_expansion_lens` instead when the idea is a claim or insight and you want a breadth of angles.

- The piece has a protagonist, a turning point, or a before/after — a story, not just a take.
- The user wants to "tell the story of…", "walk through how…", or "take people on the journey".
- A claim is true but feels flat; giving it a person and an arc would make it land.
- You are storyboarding a video, a narrative post, a case study, or a founder story.

Do not use for: pure claim/insight breadth (`idea_expansion_lens`); executing curiosity loops, rhythm, and tone in the actual draft (`story_driven_content_craft`); or channel/format strategy (`content_strategy_beyond_blogging`).

## Judgment

### Boundary vs story_driven_content_craft

This lens runs **before** drafting and decides _what shape the story takes and where it opens_. `story_driven_content_craft` runs **at draft time** and _executes_ that shape into prose with curiosity loops, pacing, and tone. Find the shape here; hand the shape there.

### Precondition

Frame must be done: a specific person, their pain, and the one-sentence idea. This lens additionally needs a **real anchor** — a true moment, experience, or person the story can stand on. If there is no real anchor and you would have to invent one, stop and route to `idea_expansion_lens` instead. Manufactured journeys read as fake.

### Move 1 — The Journey Map (5 beats)

Map how the person actually reaches the idea. Start where _they_ start, not at the conclusion.

1. **Situation** — where they are before they know any of this. The status quo and the quiet frustration they tolerate.
2. **Encounter** — the trigger: how they bump into the problem or the idea. A specific moment, not a general condition.
3. **Wrong path** — what they try first that fails, and why it is the _obvious_ thing to try. **This beat is mandatory** — it earns the turn. Skipping it makes the resolution feel unearned.
4. **Turn** — the realization or reframe that changes things. The pivot the whole piece exists to deliver.
5. **New state** — what is concretely different now. Specific, not "and everything got better".

Then name the **critical sequence**: the low-level steps that must happen in the _right order_. Getting the sequence right is the value — an overview alone is forgettable, and out-of-order steps are where people actually go wrong.

### Move 2 — Choose the Entry Point (the Pixar move)

A story has multiple legitimate openings. Where you enter changes the whole piece. Pick one deliberately:

- **Message-first** — open on the takeaway, then earn it backward. Best when the audience needs the point up front to keep watching/reading (low-patience feeds, busy execs).
- **Image-first** — open on a vivid, concrete picture and let meaning emerge. Best for visual mediums and curiosity hooks.
- **Gag / hook-first** — open on the funniest, most surprising, or most tension-loaded beat. Best for short-form where you have ~2 seconds.

Carry the **target medium** into this choice — short-form leans gag/image-first; essays and newsletters can afford message- or image-first.

### Thresholds (replace judgment with lookup)

- All **5 beats** present, or explicitly marked N/A with a reason. A missing wrong-path beat is a failure, not a shortcut.
- Exactly **one entry point** chosen, with a one-line reason tied to the audience and medium.
- The critical sequence has **2–5 ordered steps** — enough to be the value, not a full tutorial.
- Beats are **one line each** — this is a shape, not a draft.

## Procedure

1. Confirm Frame is done and a real anchor exists. If no anchor, route to `idea_expansion_lens`. → `idea_expansion_lens`
2. Fill the 5-beat journey map. Make the Encounter and Wrong-path beats concrete and specific.
3. Write the critical sequence (2–5 ordered steps).
4. Draft the three entry-point options (one opening line/beat each).
5. Recommend one entry point with a reason tied to audience + medium.
6. Return the shape and hand to Curate (then Draft, usually via `story_driven_content_craft`). Do not write the piece. → `story_driven_content_craft`

## Routing

This lens finds the shape; it does not draft, and it is not the right lens for every idea. Two hand-offs:

| Route to                     | What it owns                                                                  | Hand off when                                                           |
| ---------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `idea_expansion_lens`        | Claim/insight breadth — a breadth of angles on a claim or insight.            | The idea is a claim, not a story, **or** there is no real anchor.       |
| `story_driven_content_craft` | Drafting — executing the shape into prose with curiosity loops, pacing, tone. | The shape is done (beats + sequence + entry point) and drafting begins. |

## Contract

Return the shape:

```
PERSON: <concrete person + real anchor>

Journey:
  Situation   → <one line>
  Encounter   → <one line>
  Wrong path  → <one line>   (required)
  Turn        → <one line>
  New state   → <one line>

Critical sequence: <2–5 ordered steps>

Entry points:
  Message-first:  <opening beat>
  Image-first:    <opening beat>
  Gag/hook-first: <opening beat>
Recommended: <one>, because <audience + medium reason>

Next: hand the shape to Draft (execute via story_driven_content_craft).
```

## Policy

- Do not fabricate a journey. No real anchor → route to `idea_expansion_lens` and say why.
- Do not skip the wrong-path beat. If there genuinely was none, say so explicitly; do not paper over it.
- Do not return prose. This lens outputs a shape (beats + sequence + entry point), not a draft — hand drafting to `story_driven_content_craft`.
- Do not choose more than one entry point. Offering three and committing to none defeats the move.
- Do not open on the message by default. Match the entry point to the medium's patience, not habit.

## Examples

Reference (animation): Pixar's short "For the Birds" — a flock of small birds bicker on a wire; a big dopey bird tries to join; they mock and shove him off; he falls but takes their perches with him and launches them, featherless, into the air. Message: be kind. The same short could open three ways:

```
Entry points:
  Message-first:  "Be kind to people." → then the birds.
  Image-first:    Small birds bickering on a telephone wire at dawn.
  Gag/hook-first: A big goofy bird lands and the whole wire dips.
Recommended: Gag/hook-first — it's wordless short-form; the visual gag buys attention in 2 seconds.
```

BuildOS example (LinkedIn narrative post):

```
PERSON: a solo founder who trusted an agent on a real afternoon of work (real anchor: the looping session).

Journey:
  Situation   → Trusts AI agents; offloads a multi-step task and walks away.
  Encounter   → Comes back to find it looped on step 3 for an hour.
  Wrong path  → Rewrites the prompt three times, blames themselves.   (required)
  Turn        → Realizes the chat box can't hold the work's state — wrong container, not wrong prompt.
  New state   → Stops blaming the prompt; starts asking what environment the work needs.

Critical sequence: offload → walk away → return to a loop → re-prompt (fails) → see the container is the problem.

Entry points:
  Message-first:  "You didn't prompt it wrong. The container is broken."
  Image-first:    A screen frozen on the same step, timestamp an hour later.
  Gag/hook-first: "I let an AI agent cook for an hour. It made the same soup 40 times."
Recommended: Gag/hook-first — LinkedIn rewards a first-line that earns the scroll-stop; the absurd image lands the pain fast.

Next: hand the shape to Draft (execute via story_driven_content_craft).
```
