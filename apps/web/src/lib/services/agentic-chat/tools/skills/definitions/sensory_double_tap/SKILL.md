---
name: Sensory Double-Tap
description: Reinforce the load-bearing beats of an approved draft through a second sensory channel — visual cue, demo, diagram, or concrete example — bounded by what the target medium can carry. Use when a draft spine is approved and you are adding visuals or demonstrations; not for writing the draft or the opening hook.
parent_id: content_creation_pipeline
depth: 1
preserve_markdown: true
legacy_paths:
    - sensory-double-tap
    - marketing-and-content.sensory-double-tap.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/sensory_double_tap/SKILL.md
---

# Sensory Double-Tap

People understand and retain an idea better when it arrives twice through two channels — said _and_ shown, claimed _and_ demonstrated. This skill takes an approved draft and reinforces its key beats with a second channel, bounded by what the medium can actually carry. It is enhancement, not rewriting: the spine does not change.

## When to Use

- A draft spine is approved and you are adding imagery, demos, diagrams, or concrete examples.
- The user says "make this hit harder", "what should I show here", "add visuals", or "storyboard the cues".
- A piece reads as all-telling with nothing to see or demonstrate.

Do not use for: writing the draft (return to `content_creation_pipeline` Stage 4); the opening hook specifically (`hook_craft_short_form`); or narrative restructuring (`story_driven_content_craft`).

## Precondition

The spine must be approved. Do not double-tap an unapproved or still-changing draft — the cues will be wasted when the spine moves.

## The Principle

For each **load-bearing beat** (the few that carry the idea — not every sentence), ask: _what is the other channel that drives this home?_ Then mark a cue, do not rewrite the line.

| Primary channel              | Double-tap with                                    |
| ---------------------------- | -------------------------------------------------- |
| A spoken claim (video)       | an on-screen visual / demo at that moment          |
| A written claim (post, blog) | a concrete example, image, or diagram at that line |
| A stat or abstraction        | a specific instance that makes it real             |
| A concept                    | an analogy or a picture the reader can see         |

## Bounded by the Medium

You can only reinforce with channels the medium carries. Never promise a channel the medium lacks.

- **Long-form writing (blog):** images, diagrams, pull quotes, worked examples at each claim.
- **Short text (X, LinkedIn):** one concrete image or example; one vivid detail per idea. Restraint beats clutter.
- **Carousel (Instagram):** every slide is already a double-tap — text beat + matching visual. Make them reinforce, not repeat.
- **Video (YouTube, Shorts):** on-screen cue, b-roll, or demo synced to the spoken beat. Mark as `[VISUAL: …]` in the script.
- **Audio-only:** no visual to lean on; reinforce with a sound, a vivid concrete example, or a restated analogy.

## Thresholds (replace judgment with lookup)

- Reinforce **2–4 beats per piece**. Fewer than 2 and the enhancement adds nothing; more than 4 and emphasis flattens.
- Each cue is **one annotation**, not a paragraph — name the channel and the content (`[VISUAL: …]`, `[EXAMPLE: …]`, `[DEMO: …]`).
- A cue must reinforce a _claim already in the spine_. If it introduces a new point, it belongs back in the draft, not here.

## Workflow

1. Confirm the spine is approved and note the target medium.
2. Identify the 2–4 load-bearing beats (the claims the piece would fail without).
3. For each, choose the strongest second channel the medium can carry.
4. Write a one-line cue per beat, inline at the beat, in the medium's notation.
5. Drop any cue that merely repeats the text in another form (repetition ≠ reinforcement).
6. Return the annotated spine and hand back to the pipeline's Tailor stage.

## Guardrails

- Do not rewrite the draft. If a beat needs new words, that is a Draft-stage change — flag it, do not silently edit.
- Do not promise a channel the medium cannot carry (no audio cue for a tweet, no video for a blog paragraph).
- Do not double-tap every sentence. If everything is emphasized, nothing is — cap at 4 beats.
- Do not introduce a new argument inside a cue. Cues reinforce existing claims only.

## Output

Return the approved spine with inline cues:

```
Beat: "<claim from the spine>"
  [VISUAL: <what to show>]

Beat: "<claim from the spine>"
  [EXAMPLE: <the concrete instance>]

Medium: <target medium>
Hand-off: annotated spine ready for the Tailor stage.
```

## Worked Example

Approved spine (LinkedIn post): an argument that agents fail at long tasks because of the chat-box container, not the model.

```
Beat: "You watched it loop for an hour."
  [VISUAL: screenshot of the repeating agent steps, lightly annotated with a red loop arrow]

Beat: "A smarter model won't fix a broken container."
  [EXAMPLE: one-line contrast — same task in a chat box (loses state) vs. in a tool with persistent state (completes)]

Medium: LinkedIn post (carries text + 1 image)
Hand-off: annotated spine ready for the Tailor stage. Only 2 beats reinforced — the other lines are
connective and do not need a visual.
```
