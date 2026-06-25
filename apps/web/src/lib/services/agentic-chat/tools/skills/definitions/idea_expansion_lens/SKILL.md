---
name: Idea Expansion Lens
description: Fan one idea out into a labeled spread of distinct angles so the user can pick the strongest path before drafting. Use when the user has a single claim or insight and asks "what else could I say about this", "give me angles", or "help me brainstorm takes" — not for drafting the piece itself.
parent_id: content_creation_pipeline
depth: 1
preserve_markdown: true
legacy_paths:
    - idea-expansion-lens
    - marketing-and-content.idea-expansion-lens.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/idea_expansion_lens/SKILL.md
---

# Idea Expansion Lens

Take one idea and fan it out along six fixed axes into a spread of **distinct, labeled angles**. The job is breadth, then a clean hand-back so the user (or the pipeline's Curate stage) can choose one path. This skill does **not** draft the piece — producing prose here defeats its purpose.

## When to Use

- The user has a single claim, insight, or take and needs options before committing.
- The pipeline reached the Expand stage with a claim-shaped idea (not a story-shaped one).
- The user explicitly asks for angles, takes, directions, or a brainstorm on one idea.

Do not use for: story- or person-driven pieces (escalate to `story_driven_content_craft`); choosing a channel or format (`content_strategy_beyond_blogging`); or writing the actual draft (return to `content_creation_pipeline` Stage 4).

## Precondition

The idea must already be framed: a specific person, their pain, and a one-sentence idea. If any is missing, stop and return to Frame — fan-out on a fuzzy idea produces fuzzy angles.

## The Six Axes

Run the idea through each axis in order. These are the closed vocabulary — name angles by their axis so the spread stays legible.

1. **Origin — where does this come from?** The cause, the backstory, the thing upstream that had to be true. ("Agents fail at long tasks" ← the chat box was built for messaging, not stateful work.)
2. **Consequence — where does this lead?** The downstream effect, the stakes, the so-what for the reader. Usually the strongest axis because it is about _them_, not the idea.
3. **Tangent — what is one hop adjacent?** A sibling problem, a parallel domain, the same pattern somewhere unexpected. Tangents are where surprise lives.
4. **Counter-turn — what is the twist?** Name the default belief explicitly, then the reversal. ("Everyone blames the model; the real culprit is the container.") **Always produce at least one** — this axis yields the most shareable angles.
5. **Detail — what is the sharpest concrete piece?** One example, moment, or number that carries the whole idea. Abstract ideas travel on concrete details.
6. **Audience cut — who feels this hardest?** The slice of the framed audience the idea lands on most; that cut becomes a tighter, higher-resonance piece.

## Thresholds (replace judgment with lookup)

- Generate **2–4 candidates per axis** during fan-out; do not self-censor, curate after.
- Ship a spread of **at least 6 angles total** across the axes, and **never fewer than one counter-turn**.
- Merge any two angles that are really the same; a padded spread is worse than a short sharp one.
- Each angle is **one line**, ≤ ~20 words — a direction, not a draft.

## Workflow

1. Confirm the idea is framed (person + pain + one sentence). If not, return to Frame.
2. Fan out 2–4 candidates on each of the six axes. Quantity first.
3. Drop weak or duplicate candidates; merge overlaps.
4. Flag the 1–2 strongest angles and say _why_ (usually a consequence or a counter-turn that reframes the reader's situation).
5. Return the labeled spread and hand the choice back to the Curate stage. Do not draft.

## Guardrails

- Do not return prose or a finished draft — only labeled one-line angles. If asked to "just write it", hand back to `content_creation_pipeline` Stage 4 with the chosen angle.
- Do not skip the counter-turn axis. If no honest reversal exists, say so explicitly rather than inventing a fake contrarian take.
- Do not fan out on an unframed idea — refuse and route to Frame.
- Do not staple multiple axes into one "mega-angle"; keep them separate so they can be chosen between.

## Output

Return a labeled spread:

```
IDEA: <the one framed sentence>

Origin:        <angle> · <angle>
Consequence:   <angle> · <angle>
Tangent:       <angle>
Counter-turn:  <angle>            ← required
Detail:        <angle>
Audience cut:  <angle>

Strongest: <1–2 angles, with one line on why>
Next: pick one to draft; the rest are banked as future pieces.
```

## Worked Example

IDEA: "Agents fail at long tasks because the chat box collapses all of work into one broken primitive — not because you prompted wrong."

```
Origin:        Chat was built for messaging, not stateful work · The primitive predates agents by a decade
Consequence:   A smarter model won't fix it — you need a different environment · Teams keep buying models when they need tools
Tangent:       Same pattern as email becoming a task manager it was never meant to be
Counter-turn:  Everyone blames the model or their own prompt; the real culprit is the container   ← required
Detail:        The hour-long loop on a single step — the moment everyone recognizes
Audience cut:  Solo founders who trusted an agent on real work and quietly lost confidence

Strongest:
- Counter-turn — it removes the reader's self-blame, which is the emotional hook.
- Consequence ("smarter model won't fix it") — reframes a buying decision, high stakes.
Next: pick one to draft; the rest are banked as future pieces.
```
