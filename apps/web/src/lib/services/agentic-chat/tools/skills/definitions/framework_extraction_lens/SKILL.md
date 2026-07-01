---
name: Framework Extraction Lens
description: Find the shape of a piece by turning a messy practice into a named, repeatable framework, or by tearing down an example to extract transferable principles. Use when the user wants to teach "how to do X", systematize tacit knowledge, or dissect why something worked or failed — not for breadth of angles (idea_expansion_lens) or narrative arcs (storyboard_journey_lens).
skill_type: strategy # procedure | strategy | reference | resource | policy | orchestration
altitude: task # task | domain | meta
activation: progressive # always_on | progressive | invoked
parent_id: content_creation_pipeline
depth: 1
preserve_markdown: true
legacy_paths:
    - framework-extraction-lens
    - marketing-and-content.framework-extraction-lens.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/framework_extraction_lens/SKILL.md
---

# Framework Extraction Lens

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Related Tools → Examples → Provenance.
  This file is skill_type: strategy — a two-mode ideation lens. Judgment carries the mode-choice + the
  lookup thresholds; Procedure holds the two mode step-sequences; Routing declares which sibling owns each
  adjacent job (breadth, narrative, single-experience, format choice, draft craft).
-->

## Identity

Turn tacit knowledge or a worth-studying example into a **named, repeatable structure**. This is an ideation framework at the pipeline's Expand stage. It has two modes — **Extract** (systematize how you do something) and **Teardown** (dissect an example to extract principles) — and its output is a labeled framework or teardown, not prose.

This is a **strategy** skill at **task** altitude. Use this lens when the value is _transfer_: the reader should be able to do the thing after reading. Use `idea_expansion_lens` for breadth of angles on one claim, and `storyboard_journey_lens` for narrative.

## Activation

- The user wants to teach a repeatable method ("how I actually do X", "my system for Y").
- The user wants to dissect a specific example — a campaign, a product, a post, a decision — and pull out lessons.
- The user says "make this a framework", "break down why this worked", or "turn this into steps people can follow".

Do not use for: breadth of angles (`idea_expansion_lens`); a story arc (`storyboard_journey_lens`); deciding what format/channel to publish (`content_strategy_beyond_blogging`); or executing the draft's craft (`hook_craft_short_form`, `story_driven_content_craft`).

## Judgment

### Pick the mode

- **Extract** — the source is the creator's own tacit practice. Goal: name and sequence what they do on autopilot.
- **Teardown** — the source is an external example with a known outcome. Goal: isolate the moves that caused the outcome and make them transferable.

### Thresholds (replace judgment with lookup)

- A framework has **3–7 components**. Fewer than 3 is a tip, not a framework; more than 7 will not be remembered — consolidate.
- Extraction requires **≥3 real instances**; do not build a framework from one example.
- Teardown requires a **real, specific example with a real outcome** — no hypothetical teardowns.
- **3 real components beat 7 padded ones.** Never invent steps to hit a round number.
- Every framework states at least **one boundary** (where it breaks); every teardown separates **signal from noise** explicitly.

## Procedure

### Mode A — Extract a framework

1. **Gather instances.** Recall **at least 3** times the creator did the thing. Fewer than 3 and there is no pattern yet — route to `lived_conviction_lens` (a single experience) or `idea_expansion_lens` (a single claim).
2. **Cluster the moves.** What is common across the instances? Group the repeated actions.
3. **Sequence.** Put the moves in order. The order _is_ the value — most people get the steps right but the sequence wrong.
4. **Name it.** Give the framework and each step a memorable, closed-vocabulary label (short, concrete, reusable). A weak model and a reader can both recall what they can name.
5. **Stress-test.** Name where the framework breaks — the boundary condition or the case it does not cover. A framework with no stated limits reads as snake oil.

### Mode B — Teardown an example

1. **Pick the example and state the outcome** plainly (it worked / it failed / it surprised). Be specific about what happened.
2. **Isolate the causal moves.** What did they actually do that drove the outcome? List the few that mattered.
3. **Separate signal from noise.** Which moves are transferable vs incidental to that exact situation (timing, luck, audience)? Say which is which honestly.
4. **Extract the principle(s).** State the 1–3 transferable lessons as reusable rules.
5. **Apply-to-you bridge.** Show how the reader applies the principle in their own context.

### Workflow

1. Confirm Frame is done and choose the mode (Extract vs Teardown — see **Judgment → Pick the mode**).
2. Run that mode's steps. Be honest at the integrity step (stress-test / signal-vs-noise).
3. Name the framework and its components with a closed, memorable vocabulary.
4. Return the labeled framework or teardown and hand to Curate → Draft (→ `content_creation_pipeline`). Do not write the piece.

## Routing

One concept, one owner — this lens finds the shape; adjacent jobs route to their owners.

| When                                        | Route to                           | What it owns                     |
| ------------------------------------------- | ---------------------------------- | -------------------------------- |
| Only one claim / breadth of angles wanted   | `idea_expansion_lens`              | breadth of angles on one claim   |
| A narrative arc, not a structure            | `storyboard_journey_lens`          | narrative                        |
| A single lived experience, not ≥3 instances | `lived_conviction_lens`            | a single experience              |
| Deciding what format / channel to publish   | `content_strategy_beyond_blogging` | format / channel choice          |
| Drafting the framework's opening            | `hook_craft_short_form`            | the escalated opening            |
| Craft rewrite of a story shape              | `story_driven_content_craft`       | draft-execution for story shapes |
| Drafting the framework itself               | `content_creation_pipeline`        | Stage 4 draft-execution          |

The framework is drafted at `content_creation_pipeline` Stage 4. Note: a framework/teaching shape has **no dedicated draft-execution craft skill yet** (unlike story or conviction shapes) — it is drafted inline, with the opening escalated to `hook_craft_short_form`. See the Stage 4 "Known gap" note.

## Contract

Return one of:

```
FRAMEWORK: <named framework>
  1. <Named step> — <one line>
  2. <Named step> — <one line>
  3. <Named step> — <one line>   (3–7 total)
Breaks when: <boundary condition>

— or —

TEARDOWN: <example> → <outcome>
  Causal moves: <the few that mattered>
  Signal vs noise: <transferable> | <incidental to that situation>
  Principle(s): <1–3 reusable rules>
  Apply to you: <how the reader uses it>

Next: hand to Curate → Draft.
```

## Policy

- Do not fabricate a framework from a single instance — route to `lived_conviction_lens` or `idea_expansion_lens`.
- Do not pad to a round number; 3 real components beat 7 invented ones.
- Do not present a framework with no boundary, or a teardown with no signal/noise split — both read as fake authority.
- Do not tear down a hypothetical; require a real example with a real outcome.
- Do not return prose. Output the labeled structure; hand drafting to the relevant craft skill.

## Examples

### Worked Example (Extract mode)

Framed idea: "There's a repeatable way to take one idea to a shipped post."

```
FRAMEWORK: The Idea-to-Ship Spine
  1. Frame — lock the specific person, the pain, the one idea, the medium.
  2. Expand — pick a framework and find the shape (angles, journey, conviction, or structure).
  3. Curate — choose one path; bank the rest.
  4. Draft — write the plain spine; escalate craft as needed.
  5. Enhance — reinforce 2–4 beats with a second sensory channel.
  6. Tailor — reshape into one medium's native format.
Breaks when: you have no single idea yet (it's still a topic) — frameworks can't rescue an unframed idea.

Next: hand to Curate → Draft.
```
