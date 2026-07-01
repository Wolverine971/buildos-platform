---
name: Content Creation Pipeline
description: Take one chosen idea from raw thought to a ship-ready draft. Use when the user says "I have an idea, help me turn it into a post / video / essay", wants to expand a half-formed thought into content, or needs a step-by-step path from idea to drafted piece. Not for broad channel/format/distribution strategy — route that to content_strategy_beyond_blogging.
skill_type: orchestration # procedure | strategy | reference | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true
legacy_paths:
    - content-creation-pipeline
    - marketing-and-content.content-creation-pipeline.skill
child_skills:
    - id: idea_expansion_lens
      name: Idea Expansion Lens
      summary: Fan one idea out into a labeled spread of angles (origin, consequence, tangent, counter-turn, detail, audience cut) so the user can curate the strongest path before drafting.
      when_to_load:
          - When the idea is single and raw and you need a spread of distinct angles to choose from.
          - When the user says "what else could I say about this", "give me angles", or "help me brainstorm takes".
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/idea_expansion_lens/SKILL.md
    - id: storyboard_journey_lens
      name: Storyboard Journey Lens
      summary: Find the shape of a story-driven piece by mapping the audience's journey to the idea (situation, encounter, wrong path, turn, new state) and choosing an entry point (message-, image-, or gag-first).
      when_to_load:
          - When the piece is carried by a person, a moment, or an arc rather than a bare claim.
          - When the user says "tell the story of", "walk through how", or "take people on the journey".
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/storyboard_journey_lens/SKILL.md
    - id: lived_conviction_lens
      name: Lived Conviction Lens
      summary: Mine the creator's own experience for an earned belief, the proof behind it, and the bridge to the reader, when the piece's power is authority.
      when_to_load:
          - When the creator has a hard-won opinion or personal stake and wants the piece to carry authority.
          - When the user says "I've learned that", "everyone gets this wrong and I know because", or "what building X taught me".
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/lived_conviction_lens/SKILL.md
    - id: framework_extraction_lens
      name: Framework Extraction Lens
      summary: Turn a messy practice into a named, repeatable framework, or tear down an example to extract transferable principles.
      when_to_load:
          - When the user wants to teach a repeatable method or systematize tacit knowledge.
          - When the user says "make this a framework", "break down why this worked", or "turn this into steps".
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/framework_extraction_lens/SKILL.md
    - id: sensory_double_tap
      name: Sensory Double-Tap
      summary: Reinforce the key beats of an approved draft through a second sensory channel (visual cue, demo, concrete example), bounded by what the target medium can carry.
      when_to_load:
          - When a draft spine is approved and you are adding visuals, demos, diagrams, or concrete examples.
          - When the user says "make this hit harder", "what should I show here", or "add visuals".
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/sensory_double_tap/SKILL.md
    - id: medium_tailoring
      name: Medium Tailoring
      summary: Reshape an approved, enhanced draft into one target medium's native format and apply that medium's amplification levers, using a per-medium reference module (LinkedIn, Instagram, X, YouTube, blog, newsletter).
      when_to_load:
          - When the draft is written and you are fitting it to a specific medium.
          - When the user says "format this for X", "turn this into a thread", or "make it a carousel".
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/medium_tailoring/SKILL.md
dependencies:
    - id: idea_expansion_lens
      owns: Breadth of angles from one idea — a labeled spread to curate before drafting.
    - id: storyboard_journey_lens
      owns: Story shape + entry point (before drafting) — the journey map.
    - id: lived_conviction_lens
      owns: Earned belief + proof from lived experience.
    - id: framework_extraction_lens
      owns: Naming a framework or tearing down an example.
    - id: story_driven_content_craft
      owns: Executing narrative craft in the draft (storyboarded shape).
    - id: nonfiction_writing_from_lived_conviction
      owns: Executing an essay from lived conviction (conviction-shaped draft).
    - id: hook_craft_short_form
      owns: The opening / hook / first line.
    - id: viral_video_script_structure
      owns: Video body / retention structure.
    - id: sensory_double_tap
      owns: Adding visuals / demos / examples (the Enhance stage).
    - id: medium_tailoring
      owns: Fitting a draft to a specific medium's native format (the Tailor stage).
    - id: algorithm_aware_publishing
      owns: Platform fit, cadence, algorithm strategy (upstream of formatting).
    - id: content_strategy_beyond_blogging
      owns: Channel / format / distribution strategy.
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/content_creation_pipeline/SKILL.md
---

# Content Creation Pipeline

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Examples.
  This file is skill_type: orchestration, so Judgment + Procedure + Routing carry the weight. The pipeline
  branches in exactly two places (Expand, Draft); Judgment holds the branch reasoning, Routing holds the
  ownership map, and Knowledge is thin (only the per-medium length defaults, which are owned nowhere else).
  No Provenance block: the source content carried no source-attribution notes to preserve.
-->

## Identity

Take **one chosen idea** from raw thought to a draft that is ready to tailor and ship. This skill owns the _process_ — the ordered path and the human gates — and routes craft work to the specialist content skills. It does not pick channels (that is `content_strategy_beyond_blogging`) and it does not post.

This is an **orchestration** skill at **domain** altitude — thin on its own craft, heavy on sequencing the siblings; the one thing owned _only_ here is the pipeline itself: the fixed ordered path and its three human gates.

The pipeline is fixed; only two things vary: the **lens** you pick at Expand, and the **target medium** you carry from the start. Run the stages in order. Do not skip a gate.

## Activation

- The user has an idea, take, or half-formed thought and wants it turned into a concrete piece.
- The user asks "help me write/make a post / thread / essay / video / newsletter about X".
- The user has a topic but no angle yet, or an angle but no draft.
- A strategy conversation produced an idea and now needs an actual artifact.

Do not use when: the user needs a channel/format/distribution decision (route to `content_strategy_beyond_blogging`); only needs an opening rewritten (route to `hook_craft_short_form`); or only needs a finished draft edited for voice (that is an edit pass, not this pipeline).

## Judgment

The decision spine. The pipeline branches in exactly two places — at **Expand** (which framework) and at **Draft** (which spine, which executor) — and this is what you reason with there.

### Choosing a framework (Expand)

A **framework** is a way to find the piece's shape from the framed idea. Pick by the _shape of the idea_, or combine.

| If the idea is…                                                            | Use framework                       | Output                                  |
| -------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------- |
| A claim or insight; you want breadth of angles                             | `idea_expansion_lens` (child)       | a labeled spread of angles              |
| Carried by a person, moment, or arc; you want the journey + an entry point | `storyboard_journey_lens` (child)   | a journey map + chosen entry point      |
| An earned belief the creator lived; the power is authority                 | `lived_conviction_lens` (child)     | an earned claim + proof + reader bridge |
| A repeatable practice or an example worth dissecting                       | `framework_extraction_lens` (child) | a named framework or a teardown         |

If unsure which framework fits, ask: _is this a point to argue, a story to walk through, a belief I've earned, or a method to teach?_

### Translating a shape into a spine (Draft)

The framework finds the shape; **execution happens at Draft**. A storyboarded shape is usually executed via `story_driven_content_craft`; a lived-conviction shape via `nonfiction_writing_from_lived_conviction`.

**Translate the lens output into a spine.** Each Expand lens produces a different shape; each shape implies a different spine and (where one exists) a different craft skill to execute it.

| Curated shape (from Expand)                         | Spine structure to write                                                   | Execute via                                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Chosen angle — a claim/insight (`idea_expansion`)   | claim → support → counter-turn → so-what (argument shape)                  | ⚠️ no specialist skill — draft inline; escalate the opening to `hook_craft_short_form`. _(gap, see below)_ |
| Journey map + entry point (`storyboard_journey`)    | open at the chosen entry point → situation → wrong path → turn → new state | `story_driven_content_craft`                                                                               |
| Earned claim + scar + bridge (`lived_conviction`)   | scar → earned claim → receipts → universal bridge                          | `nonfiction_writing_from_lived_conviction`                                                                 |
| Named framework / teardown (`framework_extraction`) | name it → sequence the steps (or causal moves → principle) → apply-to-you  | ⚠️ no specialist skill — draft inline; escalate the opening to `hook_craft_short_form`. _(gap, see below)_ |

> **Known gap — missing draft executors.** Story-shaped and conviction-shaped drafts each have a dedicated craft skill (`story_driven_content_craft`, `nonfiction_writing_from_lived_conviction`). Claim/argument-shaped and framework/teaching-shaped drafts do **not** — today they are drafted inline with only `hook_craft_short_form` for the opening. Two craft skills should be built to close this: an **argument / POV craft** skill (execute a curated angle into a persuasive piece) and a **teaching / how-to craft** skill (execute a framework or teardown into a instructional piece). Until they exist, draft these two shapes inline and say so.

## Procedure

Eight stages, three human gates (🚦). Frame is inline here because it fires on every run. Expand routes to a framework, Enhance routes to `sensory_double_tap`, Tailor routes to `medium_tailoring`; Ship hands off. Routed steps carry a `→` marker; who owns each is resolved in **Routing**.

```
1. FRAME      Who exactly, what pain, the ONE idea, the target medium.   🚦 confirm
2. EXPAND     Choose a framework → find the shape.                       (route)
3. CURATE     Choose one path. Bank the rest.                            🚦 confirm
4. DRAFT      Write the core spine in the chosen structure.
5. APPROVE    Show the spine before polish.                              🚦 confirm
6. ENHANCE    Sensory double-tap, medium-aware.                          (route)
7. TAILOR     Fit one medium's native format + amplification.            (route)
8. SHIP       Post / save / schedule.                                    → hand off
```

### Stage 1 — Frame (inline, mandatory)

Lock four things before generating anything. Do not pass the gate with vague answers — every downstream stage inherits this specificity.

- **Who, specifically.** Not a category ("founders") but an imaginable person at a moment ("a solo founder who just watched an agent burn an afternoon"). If you cannot picture them, keep narrowing.
- **Their pain or situation.** What is true and uncomfortable for _that_ person right now, in their words.
- **The ONE idea.** A single declarative sentence. If it needs an "and", it is two pieces — split it. It must be arguable or surprising, not a truism.
- **Target medium.** LinkedIn, IG, X, YouTube, blog, newsletter, etc. Carry it forward as a constraint; it shapes the lens, the draft length, and the enhancement.

🚦 Read all four back and get a yes before expanding.

### Stage 2 — Expand (choose a framework) → `idea_expansion_lens` / `storyboard_journey_lens` / `lived_conviction_lens` / `framework_extraction_lens`

All frameworks assume Frame is done and share one rule: get specific on the person and the real story before drafting. Produce a shape — a spread of angles or a journey map — and **do not draft yet**. Choose the framework by the _shape of the idea_ → see **Judgment** (Choosing a framework).

### Stage 3 — Curate (gate)

From the spread, choose **one path**. Name what you are killing or **banking** (banked angles are future pieces — say so explicitly so they are not lost). A great piece is one axis done deep, not all of them stapled together.

🚦 Confirm the chosen angle and intended structure before drafting.

### Stage 4 — Draft → `story_driven_content_craft` / `nonfiction_writing_from_lived_conviction` / `hook_craft_short_form` / `viral_video_script_structure`

This is the hinge of the pipeline: every lens converges here, and the curated shape becomes prose. Write the core **spine** in the structure the chosen lens implies — plain prose, no platform formatting, no hook-polish yet. Match the user's voice if samples exist; otherwise write clean and flag that a voice pass is needed.

Translate the curated shape into a spine → see **Judgment** (Translating a shape into a spine). Set a length budget from the carried medium → see **Knowledge** (length budgets).

**Craft escalations:**

- If the opening is the hard part, escalate to `hook_craft_short_form`.
- If it is a video and the body structure is the work, escalate to `viral_video_script_structure`.

### Stage 5 — Approve (gate)

Show the spine. 🚦 This is the cheapest place to change direction — get sign-off before investing in enhancement and tailoring.

### Stage 6 — Enhance (route) → `sensory_double_tap`

Load `sensory_double_tap`. Reinforce the 2–4 load-bearing beats through a second channel the medium can carry (visual cue, demo, diagram, concrete example). Restraint is the rule: enhancing everything emphasizes nothing.

### Stage 7 — Tailor (route) → `medium_tailoring` (strategy → `algorithm_aware_publishing`)

Load `medium_tailoring` and load the one reference module for the target medium (LinkedIn, Instagram, X, YouTube, blog, newsletter). It reshapes the approved + enhanced draft into that medium's native format, places the hook in the attention slot, lands the enhancement cues in the medium's asset slots, and sets one CTA. For _strategic_ publishing decisions (which channel, cadence, algorithm fit), escalate to `algorithm_aware_publishing` — that is upstream of formatting.

### Stage 8 — Ship (hand off) → `content_strategy_beyond_blogging`

This skill stops owning the work here. Hand off cleanly:

- **Voice / final edit** → the user's editor pass.
- **Post / save / schedule** → the relevant platform tooling.
- **Distribution / what-comes-next** → `content_strategy_beyond_blogging`.

State plainly what is done and what is handed off, e.g. "Tailored LinkedIn post ready — handing to your voice pass, then publish."

## Routing

Ownership map. The Procedure sequences; this table assigns. Escalations are tags, not loads — name the skill and move; only load when that lens becomes the active work.

| Need                                        | Route to                                   |
| ------------------------------------------- | ------------------------------------------ |
| Breadth of angles from one idea             | `idea_expansion_lens` (child)              |
| Story shape + entry point (before drafting) | `storyboard_journey_lens` (child)          |
| Earned belief + proof from lived experience | `lived_conviction_lens` (child)            |
| Name a framework or tear down an example    | `framework_extraction_lens` (child)        |
| Execute narrative craft in the draft        | `story_driven_content_craft`               |
| Execute an essay from lived conviction      | `nonfiction_writing_from_lived_conviction` |
| Opening / hook / first line                 | `hook_craft_short_form`                    |
| Video body / retention structure            | `viral_video_script_structure`             |
| Add visuals / demos / examples              | `sensory_double_tap` (child)               |
| Fit a draft to a specific medium's format   | `medium_tailoring` (child)                 |
| Platform fit, cadence, algorithm strategy   | `algorithm_aware_publishing`               |
| Channel / format / distribution strategy    | `content_strategy_beyond_blogging`         |

## Contract

Return, in order:

- **Frame**: who (specific person), pain, the one-sentence idea, target medium.
- **Chosen angle**: the single path selected, plus a one-line note of which angles were banked.
- **Draft spine**: the core piece, plainly written, in the chosen structure.
- **Enhancement notes**: the 2–4 beats marked with their second-channel cue (e.g. `[VISUAL: …]`, `[EXAMPLE: …]`).
- **Hand-off line**: what is done and exactly which skill/tool the user takes it to next.

Stop after the hand-off line. Do not tailor for a platform or post — those are downstream skills.

## Policy

- Do not skip Frame. A draft built on "founders" with no specific person and no one-sentence idea will be generic — refuse to draft until the four Frame fields are concrete.
- Do not generate a draft at the Expand stage. Expand produces a spread of angles to choose from; drafting before Curate wastes the gate.
- Do not staple multiple angles into one piece. One path per piece; bank the rest by name.
- Do not enhance an unapproved spine. Polish before sign-off is rework waiting to happen.
- Do not silently re-implement craft that a specialist skill owns. Escalate to `hook_craft_short_form`, `story_driven_content_craft`, `viral_video_script_structure`, or `algorithm_aware_publishing` by name.
- Do not pick the channel for the user. Medium is an input to Frame; channel _strategy_ belongs to `content_strategy_beyond_blogging`.

## Knowledge

_The length budgets below are BuildOS internal defaults (internal-default) — reasoned drafting heuristics, no external source. Owned only here._

**Set a length budget from the carried medium.** The Frame medium is a length constraint here, not just at Tailor. Draft the spine to roughly **70%** of the medium's budget — Enhance and Tailor add the rest. Rough budgets:

- **X / Twitter:** single post 1–3 sentences; thread ~5–9 beats.
- **LinkedIn:** ~150–250 words (~900–1,500 chars).
- **Instagram carousel:** 6–10 slides, one beat per slide.
- **YouTube:** Short ~120–150 spoken words (~60s); long-form as ordered segments.
- **Blog:** 800–2,000 words. **Newsletter:** 300–800 words.

## Examples

User: "I keep thinking about how agents are bad at long tasks. I want to post about it on LinkedIn."

**Frame**

- Who: a solo founder who just watched an AI agent loop on the same step for an afternoon and felt stupid for trusting it.
- Pain: suspects the failure is their fault (bad prompt) and is quietly losing confidence in agents.
- One idea: "Agents fail at long tasks because the chat box collapses all of work into one broken primitive — not because you prompted wrong."
- Medium: LinkedIn post.

🚦 Confirmed with user.

**Expand** (loaded `idea_expansion_lens`)

- Origin: the chat box was built for messaging, not for work that has state.
- Consequence: you can't fix this with a smarter model; you need a different environment. ← strongest
- Counter-turn: everyone blames the model or their prompt; the real culprit is the container.
- Detail: the afternoon-long loop is the concrete moment everyone recognizes.
- (tangent, audience-cut banked)

**Curate** — chose the **counter-turn** path (blame the container, not yourself), opening on the **detail** (the loop). Banked: origin angle → future piece on "why chat won the wrong way." 🚦 Confirmed.

**Draft spine** (plain)

> You watched it loop for an hour. You assumed you prompted it wrong. You didn't. The agent failed because it's working inside a chat box — a primitive built for messages, not for work that has to hold state, branch, and come back. A smarter model won't fix a broken container. (…3–4 more sentences in the same shape…)

🚦 Approved.

**Enhance** (loaded `sensory_double_tap`)

- Beat "it looped for an hour" → `[VISUAL: screenshot of the repeating agent steps, lightly annotated]`
- Beat "broken container" → `[EXAMPLE: one-line contrast — same task in a chat box vs. in a tool with real state]`

**Hand-off**

> Spine + 2 enhancement cues ready, targeted at a LinkedIn post. Next: your voice pass, then `algorithm_aware_publishing` for LinkedIn formatting and the first-line hook. The banked "why chat won" angle is saved as a future post.
