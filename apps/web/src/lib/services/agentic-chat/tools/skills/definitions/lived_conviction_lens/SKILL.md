---
name: Lived Conviction Lens
description: Find the angle for a piece by mining the creator's own lived experience for an earned belief, the proof behind it, and the bridge to the reader. Use when the user has a hard-won opinion or personal stake and wants content that carries authority — not for drafting the essay (that is nonfiction_writing_from_lived_conviction) or mapping a narrative arc (storyboard_journey_lens).
parent_id: content_creation_pipeline
depth: 1
preserve_markdown: true
legacy_paths:
    - lived-conviction-lens
    - marketing-and-content.lived-conviction-lens.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/lived_conviction_lens/SKILL.md
---

# Lived Conviction Lens

Mine the creator's own experience for a belief they _earned_ — one that cost something to learn — and the proof that gives them standing to say it. This is an ideation framework at the pipeline's Expand stage. Its output is an **earned claim + proof + a bridge to the reader**, not prose and not a story arc.

Use this lens when the power of the piece is _authority_: the reader should believe it because of who is saying it and what they went through. Use `idea_expansion_lens` for breadth of angles on a neutral claim, and `storyboard_journey_lens` when the piece is carried by a narrative arc.

## When to Use

- The user has a strong opinion they came to the hard way and wants to say it with weight.
- A take would be generic from anyone else but is credible from _this_ person because of their experience.
- The user says "I've learned that…", "everyone gets this wrong and I know because…", or "I want to share what building X taught me".

Do not use for: a claim the creator has no personal stake in (`idea_expansion_lens`); a narrative arc (`storyboard_journey_lens`); executing the essay/thought-leadership draft (`nonfiction_writing_from_lived_conviction`); or channel strategy (`content_strategy_beyond_blogging`).

## Boundary vs neighbors

- **vs `nonfiction_writing_from_lived_conviction`** — that skill _executes_ the essay at draft time (structure, prose, rhythm). This lens _finds_ the earned claim and proof before drafting. Find it here; write it there.
- **vs `storyboard_journey_lens`** — that maps a journey into a narrative shape. This extracts a defensible belief and the receipts behind it; the output can be a flat strong-opinion piece with no arc at all.

## Precondition

Frame must be done, and the creator must have a **real personal stake** in this idea. If the belief is borrowed or untested — something they read, not something they lived — stop and route to `idea_expansion_lens`. Manufactured conviction is the most detectable fake in content.

## The Conviction Extraction (6 steps)

1. **The earned belief.** What does the creator believe _now_ that they didn't before? The version that cost time, money, failure, or pride to learn. State it as a sentence.
2. **The scar.** The specific moment or experience that taught it. Concrete: a date, a project, a number, a thing that went wrong. This is the proof they lived it.
3. **The receipts.** Evidence beyond the story that they are credible here — outcomes, artifacts, scale, scars repeated. (Not bragging; standing.)
4. **The permission check.** Do they have standing to state this as _the answer_? If yes, claim it. If the experience is real but thin, **downgrade the register** to "here's what I'm finding" rather than "here's the truth." Over-claiming burns trust faster than under-claiming.
5. **The universal translation.** Map the creator's specific scar to the reader's general pain. Without this the piece is a diary; with it, the reader sees themselves in the creator's experience.
6. **The claim.** Write the one earned sentence the creator can defend under pushback — the thesis the whole piece exists to land.

## Thresholds (replace judgment with lookup)

- Exactly **one earned claim** (the thesis). More than one means more than one piece.
- At least **one concrete scar** (a real, specific moment) — abstract "I've struggled with this" does not count.
- At least **one receipt** beyond the story, or an explicit register downgrade in step 4.
- The universal translation must be present — a piece with a scar but no bridge to the reader is a journal entry, not content.

## Workflow

1. Confirm Frame is done and the stake is real. If borrowed, route to `idea_expansion_lens`.
2. Run the 6-step extraction. Be ruthless about steps 2–3 (scar + receipts) — that is the whole differentiator.
3. Apply the permission check; downgrade register if the standing is thin.
4. Write the universal translation explicitly.
5. Return the earned claim + scar + receipts + bridge, and hand to Curate → Draft (execute via `nonfiction_writing_from_lived_conviction`). Do not write the essay.

## Guardrails

- Do not manufacture vulnerability or invent a scar. No real stake → route to `idea_expansion_lens` and say why.
- Do not over-claim authority. Thin experience → downgrade to "learning in public," never inflate to "the definitive answer."
- Do not return a diary. If there is a scar but no universal translation, the lens is incomplete — finish step 5.
- Do not return prose. Output the claim + proof + bridge; hand drafting to `nonfiction_writing_from_lived_conviction`.
- Do not stack multiple earned claims; one thesis per piece.

## Output

Return the conviction shape:

```
EARNED CLAIM: <the one defensible thesis sentence>

Scar:         <the specific moment that taught it>
Receipts:     <evidence beyond the story that gives standing>
Register:     <"the answer" | "what I'm finding"> (from the permission check)
Bridge:       <the creator's specific scar → the reader's general pain>

Next: hand to Draft (execute via nonfiction_writing_from_lived_conviction).
```

## Worked Example

Framed idea: "Founders over-trust AI agents on real work."

```
EARNED CLAIM: Don't hand an agent work you can't yet describe as a sequence of checkable steps — I learned this the expensive way.

Scar:         Spent an afternoon watching an agent loop on step 3 of a migration, re-prompting four times before realizing the chat box couldn't hold the job's state.
Receipts:     Built an agentic chat system end to end; have shipped and broken this exact pattern across ~28 real projects.
Register:     "what I'm finding" — strong direct experience, but the field is moving fast; claim it as a working rule, not a law.
Bridge:       My looping-migration afternoon → every founder who offloaded a task, walked away, and came back to a confident-sounding mess and blamed their own prompt.

Next: hand to Draft (execute via nonfiction_writing_from_lived_conviction).
```
