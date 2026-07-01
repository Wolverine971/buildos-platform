---
name: Idea Expansion Lens
description: Fan one idea out into a labeled spread of distinct angles so the user can pick the strongest path before drafting. Use when the user has a single claim or insight and asks "what else could I say about this", "give me angles", or "help me brainstorm takes" — not for drafting the piece itself.
skill_type: strategy # procedure | reference | strategy | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
parent_id: content_creation_pipeline
depth: 1
preserve_markdown: true
dependencies:
    - id: content_creation_pipeline
      owns: >-
          The Frame → Expand → Curate → Draft pipeline; Stage 4 drafting/execution of the chosen angle and the
          Curate-stage hand-back that this skill returns to.
    - id: story_driven_content_craft
      owns: Story- and person-driven content craft (story-shaped ideas escalate here instead of fanning out).
    - id: content_strategy_beyond_blogging
      owns: Choosing a channel or format for the idea.
    - id: hook_craft_short_form
      owns: Hook / opening craft (the opening of an inline-drafted claim shape escalates here).
legacy_paths:
    - idea-expansion-lens
    - marketing-and-content.idea-expansion-lens.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/idea_expansion_lens/SKILL.md
---

# Idea Expansion Lens

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Examples → Provenance.
  This file is skill_type: strategy (secondary shape: procedure). The six axes are the stable taxonomy (Knowledge);
  the thresholds are the decision spine (Judgment); the fan-out is the runbook (Procedure); ownership of the
  story / channel / hook / draft hand-offs is declared once in Routing.
-->

## Identity

Child skill under the Content Creation Pipeline. Take one idea and fan it out along six fixed axes into a spread of **distinct, labeled angles**. The job is breadth, then a clean hand-back so the user (or the pipeline's Curate stage) can choose one path. This skill does **not** draft the piece — producing prose here defeats its purpose.

This is a **strategy** skill at **domain** altitude: it supplies a fixed lens (the six axes) plus lookup thresholds for turning one framed idea into a spread of options, then hands the choice back to be drafted elsewhere.

<!-- secondary shape: procedure — the fan-out is a deterministic runbook whose thresholds deliberately "replace judgment with lookup." Dominant type is strategy (the lens + prioritization is the IP); not split. -->

## Activation

**When to Use:**

- The user has a single claim, insight, or take and needs options before committing.
- The pipeline reached the Expand stage with a claim-shaped idea (not a story-shaped one).
- The user explicitly asks for angles, takes, directions, or a brainstorm on one idea.

Do not use for: story- or person-driven pieces (escalate to `story_driven_content_craft`); choosing a channel or format (`content_strategy_beyond_blogging`); or writing the actual draft (return to `content_creation_pipeline` Stage 4). Full ownership map in **Routing**.

### Precondition

The idea must already be framed: a specific person, their pain, and a one-sentence idea. If any is missing, stop and return to Frame — fan-out on a fuzzy idea produces fuzzy angles.

## Judgment

### Thresholds (replace judgment with lookup)

- Generate **2–4 candidates per axis** during fan-out; do not self-censor, curate after.
- Ship a spread of **at least 6 angles total** across the axes, and **never fewer than one counter-turn**.
- Merge any two angles that are really the same; a padded spread is worse than a short sharp one.
- Each angle is **one line**, ≤ ~20 words — a direction, not a draft.

## Procedure

Ordered sequence and intent only. Routed hand-offs carry a `→ <id>` marker resolved in **Routing**; steps marked **[here]** are owned by this skill.

1. Confirm the idea is framed (person + pain + one sentence). If not, return to Frame. **[here]** → `content_creation_pipeline`
2. Fan out 2–4 candidates on each of the six axes (see **Knowledge → The Six Axes**). Quantity first. **[here]**
3. Drop weak or duplicate candidates; merge overlaps. **[here]**
4. Flag the 1–2 strongest angles and say _why_ (usually a consequence or a counter-turn that reframes the reader's situation). **[here]**
5. Return the labeled spread and hand the choice back to the Curate stage. Do not draft. → `content_creation_pipeline`

## Routing

Ownership map. The Procedure sequences; this table assigns. One concept, one owner — everyone else routes here.

| Concern (what)                | Owner (who)                           | This skill retains / note                                   |
| ----------------------------- | ------------------------------------- | ----------------------------------------------------------- |
| Story- / person-driven pieces | `story_driven_content_craft`          | this skill handles claim-shaped ideas only                  |
| Channel / format choice       | `content_strategy_beyond_blogging`    | nothing — pure escalate                                     |
| Framing a fuzzy/unframed idea | `content_creation_pipeline` (Frame)   | this skill refuses fan-out and routes to Frame              |
| Drafting the chosen angle     | `content_creation_pipeline` (Stage 4) | this skill hands the choice back; does not draft            |
| Hook / opening craft          | `hook_craft_short_form`               | the opening of an inline-drafted claim shape escalates here |

The chosen angle is drafted at `content_creation_pipeline` Stage 4. Note: a claim/argument shape has **no dedicated draft-execution craft skill yet** (unlike story or conviction shapes) — it is drafted inline, with the opening escalated to `hook_craft_short_form`. See the Stage 4 "Known gap" note.

## Contract

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

## Policy

- Do not return prose or a finished draft — only labeled one-line angles. If asked to "just write it", hand back to `content_creation_pipeline` Stage 4 with the chosen angle.
- Do not skip the counter-turn axis. If no honest reversal exists, say so explicitly rather than inventing a fake contrarian take.
- Do not fan out on an unframed idea — refuse and route to Frame.
- Do not staple multiple axes into one "mega-angle"; keep them separate so they can be chosen between.

## Knowledge

The closed vocabulary the fan-out runs on: six fixed axes — stable, central, and owned here (small enough to stay in SKILL.md; not a reference-extraction candidate). _[internal-default: BuildOS's own reasoned lens; no external source cited.]_

### The Six Axes

Run the idea through each axis in order. These are the closed vocabulary — name angles by their axis so the spread stays legible.

1. **Origin — where does this come from?** The cause, the backstory, the thing upstream that had to be true. ("Agents fail at long tasks" ← the chat box was built for messaging, not stateful work.)
2. **Consequence — where does this lead?** The downstream effect, the stakes, the so-what for the reader. Usually the strongest axis because it is about _them_, not the idea.
3. **Tangent — what is one hop adjacent?** A sibling problem, a parallel domain, the same pattern somewhere unexpected. Tangents are where surprise lives.
4. **Counter-turn — what is the twist?** Name the default belief explicitly, then the reversal. ("Everyone blames the model; the real culprit is the container.") **Always produce at least one** — this axis yields the most shareable angles.
5. **Detail — what is the sharpest concrete piece?** One example, moment, or number that carries the whole idea. Abstract ideas travel on concrete details.
6. **Audience cut — who feels this hardest?** The slice of the framed audience the idea lands on most; that cut becomes a tighter, higher-resonance piece.

## Examples

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

## Provenance

- **Framework provenance:** the six axes and the thresholds are _internal-default_ — BuildOS's own reasoned lens for idea expansion; no external source is cited in this skill.
- **Lineage:** child of `content_creation_pipeline` (Frame → Expand → Curate → Draft); this skill owns the Expand stage's claim-shaped fan-out and hands the chosen angle back for drafting at Stage 4.
