---
skill_id: story-driven-content-craft
name: Story-Driven Content Craft
description: Structure non-fiction content as a sequence of curiosity loops with varied rhythm, conversational tone, written ending-first, on a non-obvious lens, with a visual hook. Use when drafting or rewriting blog posts, video scripts, social posts, founder essays, or pitch narratives where structural craft (not idea generation) is the bottleneck.
skill_type: combo
categories:
    - marketing-and-content
    - writing
parent_id: content_strategy_beyond_blogging
depth: 1
preserve_markdown: true
legacy_paths:
    - story-driven-content-craft
    - marketing-and-content.story-driven-content-craft.skill
    - docs/research/youtube-library/skill-drafts/story-driven-content-craft/SKILL.md
reference_modules:
    - id: story_driven_content_craft.public_story_audit
      name: Public Story Audit Checklist
      summary: Portable checklist for diagnosing the first broken retention rung, loop structure, lens quality, rhythm, and final-story readiness.
      when_to_load:
          - When using the portable bundle outside BuildOS.
          - When auditing or rewriting a draft essay, script, social post, or founder narrative.
          - When a piece feels flat and needs a structural diagnosis before line editing.
      path: references/public-story-audit.md
      visibility: public
lineage: lineage.yaml
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/story_driven_content_craft/SKILL.md
---

# Story-Driven Content Craft

Use this skill to make a non-fiction piece keep a reader past the first 5%, the first 30 seconds, the first 200 words. The traditional Freytag bell curve was built for captive audiences. On the internet there is no captivity — viewers re-decide whether to stay every few seconds. A story-craft agent's job is to detect where the climb breaks and rewrite that specific rung, not to "improve the writing."

A story works when **six craft moves** (dance, rhythm, tone, direction, lens, hook) pace a viewer up a **six-rung dopamine ladder** (stimulation → captivation → anticipation → validation → affection → revelation), with **seven specific failure modes** filtered out at the QA pass.

## When to Use

- Draft or rewrite a blog post, essay, video script, or social post that already has a thesis but is structurally flat.
- Audit a draft that "feels off" — diagnose which rung of the ladder fails first, then rewrite that rung.
- Convert a brain-dump or transcript into a structured piece.
- Stress-test a founder narrative, pitch deck, or fundraising story for retention craft.
- Generate candidate **lenses** when a topic is saturated and the founder needs a non-obvious angle.
- Build a long-form piece by stacking 3–7 nested curiosity loops instead of one long arc.

Do not use this skill for cold idea generation, voice/persona development, or the upstream "what to write about" decision. For that, pair with `nonfiction-writing-from-lived-conviction` (lived experience → inquiry) and `content-strategy-beyond-blogging` (intent → format). Use this skill on the structural layer between idea and ship.

## Core Principles

1. **The viewer is not captive.** Every paragraph or 5-minute window is a re-decision to stay. Earn it; don't assume it.
2. **Open loops before you close them.** Conflict opens loops. Context closes them. Stories perform when loops keep opening before they close.
3. **Rhythm is structural, not stylistic.** Uniform sentence length is what makes viewers swipe. Varied sentence length is what makes prose sing.
4. **Write the ending first.** You cannot construct the dance until you know where it lands.
5. **The lens beats the topic.** Anyone can cover a topic. Only one founder can cover it through their lived experience.
6. **Show before you tell.** Visual hooks beat audio-only hooks ~10×. For text, that means concrete image / number / scene before the abstraction.
7. **Stack rebuys, don't ride single peaks.** Solve a problem; immediately open a new one. After 3–4 cycles, the viewer feels you solved 4 problems but you really solved 1.
8. **Diagnose by ladder, not by feel.** When a piece flops, walk the six rungs in order, name the first failure, fix that one specifically.
9. **Craft requires reps.** Knowing the rules is easy. Applying them consistently is what separates 10× creators. Draft 1 is a diagnostic surface, not a ship bar.

## The Three Pillars

### Pillar 1: The Dopamine Ladder (the psychology spine)

Six rungs the viewer climbs in order. Each rung releases more dopamine than the last. Skipping a rung collapses the climb. Rungs 1–4 are scriptable per piece. Rungs 5–6 accumulate across many pieces and bind a viewer to the messenger.

| Rung         | Window          | Trigger                                                                                 | Dopamine size                            | Failure mode                                 |
| ------------ | --------------- | --------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| Stimulation  | 0–2s pre-cog    | Color, motion, contrast, brightness vs. surrounding feed                                | Smallest, mandatory                      | Looks like everything else; eye doesn't lock |
| Captivation  | 2–7s            | Open question implants in viewer's head                                                 | Largest in-loop until validation         | No question pops, or pops but irrelevant     |
| Anticipation | 7s → loop close | Controlled fact leak; viewer guesses answer in real time                                | Peaks just before validation             | Confusing facts; viewer can't anticipate     |
| Validation   | Loop close      | Non-obvious resolution — twist (entertainment) or counter-intuitive insight (education) | Substantial — only if non-obvious        | Predictable payoff or cliffhanger            |
| Affection    | Cross-piece     | Recognisable face/voice + likability levers                                             | Persistent — buys leash on future pieces | Faceless, inconsistent, performative         |
| Revelation   | Cross-channel   | Repeated non-obvious value in a defined problem area                                    | Maximum — fires on sight of name         | Topical drift; nice-to-have niche            |

Curiosity dopamine fires on **the question**, not the answer. Anticipation dopamine peaks **just before** the answer. Validation only releases dopamine if the payoff is non-obvious — predictable closes still count as a watch but produce little reward and don't drive return.

### Pillar 2: The Six Craft Moves (the construction blueprint)

Run these as ordered passes when constructing or rewriting a piece.

1. **Dance — alternate context and conflict using "but / therefore," never "and then."** Outline the piece as discrete beats. Between every two beats, force the insertion of `but` or `therefore` as a connector. Reject `and then`. Aim for 3–4 conflict loops in the first 30 seconds of short-form, 2–3 in the lede of a blog post. (Stone & Parker via Kallaway.)
2. **Rhythm — vary sentence length so the script sings.** Render the draft one sentence per line. Inspect the right-hand edge: a straight edge is dead rhythm. A jagged edge confirms varied rhythm. Mix short, medium, and one long crescendo sentence per major section. Read aloud (TTS) to surface monotony. (Gary Provost via Kallaway.)
3. **Tone — write to one named close friend, not "to camera."** Ask the founder to name the one person they're writing to. Persist the named reader across drafts. Reject broadcast phrasings (`In this article we will explore…`) and rewrite as direct address (`You probably know the feeling…`). (Steve Jobs / Casey Neistat / Emma Chamberlain via Kallaway.)
4. **Direction — write the last line first.** Force the ending before the body. Evaluate it against a memorability bar: would a stranger text this to a friend? For looping content, test whether the last line + first line read as a continuous loop. Treat last-line-first as a hard gate, not a polish step. (Christopher Nolan via Kallaway.)
5. **Lens — pick a non-obvious angle on the same topic.** For any topic, generate at minimum 5 candidate lenses ranked by obviousness. Default to the lens where the founder can be **category-of-one**. Refuse Tier 1 (saturated, descriptive) lenses unless a non-obvious proof is attached. Source the strongest lens from the founder's lived operating experience — pair with `nonfiction-writing-from-lived-conviction`. (Taylor Swift via Kallaway.)
6. **Hook — punchy first line that names the topic, paired with a visual that shows it.** First line names the topic in 6–8 words. Reject opaque openers (`Wait till you see this`, `You won't believe this`). For video, pair every hook with a visual cue that confirms the topic before the audio finishes. For blogs, the analog is a vivid concrete image, specific number, or verbatim quote in the first sentence — never a throat-clearing intro paragraph. (Epic Gardening via Kallaway.) For full hook craft, defer to `hook-craft-short-form`.

#### Lens stratification (Tier ladder)

- **Tier 1 (saturated):** Surface-level descriptive coverage everyone is doing. Reject by default.
- **Tier 2 (less common):** Predictions, comparisons, behind-the-scenes.
- **Tier 3 (rare):** Second-order systemic effects (business impact, structural shifts, mechanism).
- **Tier 4 (category-of-one):** Lens only this founder, with their lived experience, can credibly hold.

Default target: Tier 3 or Tier 4.

### Pillar 3: The Seven Mistakes (the QA reject pass)

Run these as a final filter before ship. If any mistake fires, route back to the corresponding craft move.

1. **The Traditional Story Arc.** Bell-curve buildup, single climax, late stakes. Loses 80% before rising action. → Replace with the **Kallaway Story Arc**: start at ~70/100 intensity, spike to ~90 within 1–2 minutes, release to ~30, re-peak to ~75 every 2–5 minutes.
2. **Jumbling The W's.** Leading with where/when ("It was a cold December night…"). Wastes the 30-second window. → Restack as **what + why → who + how → where + when**. Lead with the cake; demote the icing to position 3+.
3. **Single Hook, No Rebuy.** One peak then coast. Average view duration craters; algorithm punishes. → After every resolution, open a new loop within 30 seconds with bridge phrases like "but the truth is…", "the catch is…", "even with that solved, you still face…"
4. **Missing Villain.** Hero alone with no antagonist. No tension, no stakes. → Pick a thing/person/group/methodology/status quo/incumbent as the antagonist. Frame contrast as `they do X, but we do Y`.
5. **Nobody To Root For.** Stakes for the creator but not the audience. Viewer is a spectator without a team. → Insert explicit audience-mapping ("for entrepreneurs," "if you're a solo founder," "for people who…"). Name the viewer's situation; tie their stakes to the hero's.
6. **Lacking Atomic Shareability.** Story can't be compressed to a Paul-Revere-tier sentence. → Generate a 1-sentence atomic version (≤10 words). For complex points, **double-encode**: explain once for the colleague, restate once as a metaphor for the child.
7. **Not Painting The Picture.** Words alone, no visuals. Brain comprehension drops without visual anchors. → Annotate every line with a "needs visual?" tag. Generate b-roll briefs alongside the script. For abstract points without planned visuals, propose a metaphor or analogy that _can_ be drawn.

## Workflow: Generate A Piece From Scratch

Given a thesis, target reader, and content type:

1. **Source the inquiry first.** If the founder hasn't done the upstream work, defer to `nonfiction-writing-from-lived-conviction` to extract the lived material, contradiction, or hard-won opinion this piece will explore.
2. **Generate 5+ lenses.** Stratify by tier. Default to Tier 3 or Tier 4. Reject Tier 1 unless a non-obvious proof is attached.
3. **Write the last line.** "The last dab" — so memorable a stranger would text it to a friend. For looping content, write the first line at the same time and test continuity.
4. **Outline beats.** Discrete beats, not paragraphs. Between every two beats, insert `but` or `therefore`. Reject `and then`. Map the intensity curve: open at ~70/100, hit ~90 within the first 1–2 minutes (or first 200 words), release to ~30, re-peak every 2–5 minutes (or every 400–600 words).
5. **Restack the W's.** What + why first. Who + how second. Where + when last.
6. **Stack rebuys.** For each peak-and-release, open a new loop within 30 seconds (video) or one paragraph (blog). Aim for 3–4 closed-loop cycles across the piece.
7. **Name the one reader.** The founder writes to that one person, by name, in their head. Reread as if texting them.
8. **Run the ladder check.** State the question implanted at the 5-second mark (or first paragraph). State what the viewer is anticipating mid-piece. Verify the validation is non-obvious.
9. **Pair every point with a visual.** B-roll brief per beat for video. Hero image / scene / number / quote for blog. For abstract points without a visual, swap in a metaphor that can be drawn.
10. **Draft prose using rhythm rules.** One sentence per line. Mix short / medium / long. Read aloud. Confirm the right-edge jaggedness.
11. **Write the hook last.** Once the body and last line exist, write the opener. First line names the topic in 6–8 words. Defer to `hook-craft-short-form` for the full slot grammar / archetype / four-mistake diagnostic on the hook itself.
12. **Run the seven-mistake reject pass.** Walk the seven mistakes in order. On any fire, route back to the corresponding craft move.

## Workflow: Audit And Rewrite An Existing Draft

Given a draft the founder already wrote:

1. **Walk the dopamine ladder in order.** State explicitly:
    - Did the first 1–2 seconds (or first sentence) visually distinguish from the feed / noise?
    - At the 5-second mark (or first paragraph), what is the question implanted in the viewer's head? If you can't articulate it, captivation failed — fix that first.
    - Mid-piece, what is the viewer anticipating? If unclear, anticipation broke.
    - Is the payoff non-obvious? Could a smart viewer have written it before consuming?
    - Across the channel, is the persona / problem area consistent?
2. **Stop at the first failed rung.** Do not propose holistic rewrites. Fix that rung; re-evaluate.
3. **Run the seven-mistake reject pass.** If a mistake fires, route to the corresponding craft move.
4. **Rebuild the prose only after structure is clean.** Apply Rhythm and Tone passes last; they are surface-level relative to the ladder rungs and craft moves.

## Long-Form vs Short-Form Translation

Kane's mechanics are short-form-pilled. Translation table for blog posts and long-form essays:

| Short-form rule              | Blog / long-form analog                                             |
| ---------------------------- | ------------------------------------------------------------------- |
| 4 loops in first 30s         | 2–3 loops in the lede (first 200 words)                             |
| Visual hook in first second  | Concrete image, scene, number, or verbatim quote in first sentence  |
| Last-line "last dab"         | Final-paragraph kicker that survives in isolation                   |
| Looping last-to-first        | Final paragraph that recasts the opening claim with new evidence    |
| Right-edge jaggedness check  | Same — works in any rendered prose                                  |
| Re-peak every 2–5 minutes    | Re-peak every 400–600 words                                         |
| Visual b-roll per beat       | Pull-quote, sub-heading, image, code block, or table per major beat |
| Talking-head + captions only | Wall-of-text without sub-heads, images, or pull quotes              |

Loops within long-form should be **nested** (3–7 mini-loops inside the larger arc), not stretched into a single long anticipation curve.

## BuildOS Voice Translation

The Kallaway register skews toward shock and creator-economy hype ("0 to 100K subs," "the algorithm hates you"). BuildOS positions anti-AI, anti-feed, anti-hype. The mechanics hold; the register changes.

- **Default villain set** for BuildOS pieces: AI-everywhere autopilot, the productivity-app graveyard, context-switching, task-list theater, social-as-feed (vs. interest media), founder loneliness sold as hustle.
- **Default rooting interest:** the messy-thinker, the ADHD operator, the founder building complex things, the person making something who hates how AI tools sound. Audience-map explicitly in the opening.
- **Lens default = Tier 4** (category-of-one) sourced from the founder's actual operating experience. The conviction skill upstream is mandatory, not optional, for BuildOS philosophy posts.
- **Validation register check:** payoffs in BuildOS pieces should land as **relief** (the contradiction resolves into honest action) rather than **shock** (the viewer feels duped into agreeing). If the only way the payoff lands is "haha gotcha," reject it.
- **No manufactured rebuy stakes.** Each new loop must be a real stake the body can defend, not a manufactured cliffhanger to keep AVD up. Manipulative rebuys break the brand.
- **Don't perform "founder vulnerability."** Tone pass should produce direct address to one named reader, not confessional posture for engagement.

## Guardrails

- **No `and then` connectors between beats.** Reject any outline where every transition is additive.
- **No bell-curve intros.** Pieces opening below ~70/100 intensity (scene-setting, throat-clearing, "for years I've wondered…") fail by default.
- **No leading with where/when.** What + why first.
- **No single-loop pieces.** A piece with one peak and a slow descent will lose 80% before the descent finishes.
- **No hero without a villain.** If you can't name the antagonist (process, methodology, incumbent, status quo, idea), kill the draft.
- **No piece without explicit audience-mapping** in the first 30 seconds (video) or first paragraph (blog).
- **No "knowing-only" payoffs.** Predictable validation produces no dopamine. If a smart on-topic reader could have written your payoff, rewrite or layer in a counter-intuitive frame.
- **No talking-head-only video** longer than 60 seconds without at least one visual cue.
- **No prose without rhythm variation.** Apply the jagged-edge / read-aloud test: render one sentence per line and sentences must vary visibly in length (jagged right edge, not a straight one). Read aloud — a run of same-length sentences is the failure. A straight edge or a monotone run = rewrite.
- **No piece without a last line written first.** No exceptions; this is upstream of the body.
- **No Tier 1 lens** unless a non-obvious proof is attached.
- **No level-5/6 advice ("be more likable")** for creators who haven't fixed levels 1–4. And no level-1/2 advice ("strengthen your hook") for creators with traction but no fandom — they need consistency, not a better hook.
- **No personality forcing.** Recommend "increase concreteness of the problem solved + visible passion + reduce filler" — never "be more charismatic."
- **No drift from the channel's identity contract.** Every shipped piece reinforces the founder's defined problem area; flagged drift erodes Rung 6 (revelation).
- **No manipulative rebuy stacking.** Each new loop must be a real stake. Manufactured cliffhangers break trust faster than they extend AVD.

## Output

Return a structured piece bundle:

- **Inquiry / thesis** — sourced from `nonfiction-writing-from-lived-conviction` upstream
- **Lens** — chosen tier, why category-of-one for this founder, 3–4 alternates considered
- **Last line** — written first, memorability test passed
- **First line** — paired with the visual / image / scene / number / quote
- **Beat outline** — discrete beats, every transition tagged `but` or `therefore`
- **Intensity curve** — opening ≥70/100; first peak within 1–2 min or 200 words; re-peaks every 2–5 min or 400–600 words
- **W-stack** — what + why → who + how → where + when sequence in opening
- **Rebuy map** — each closed loop paired with the next loop opening
- **Audience map** — explicit "for X" statement and tie-in to viewer's stakes
- **Villain** — named antagonist (entity, process, methodology, status quo)
- **Atomic shareability line** — one Paul-Revere sentence, ≤10 words
- **Visual brief per beat** — what the reader/viewer sees during each
- **Tone audit** — named reader, broadcast phrasings stripped, direct address verified
- **Rhythm audit** — right-edge jaggedness confirmed, read-aloud pass logged
- **Ladder diagnostic** — implanted question at 5s/first-paragraph; mid-piece anticipation; non-obviousness rating on payoff
- **Seven-mistake reject pass** — each mistake marked clean or fail-with-fix
- **Identity-contract check** — does this piece reinforce the founder's defined problem area? If no, flag for drift

For audit-mode runs, replace the first set with a **diagnostic report**: the first failed rung, the corresponding craft-move fix, and the rewrite plan.

## Worked Example

Condensed gold-standard bundle for the eval Task 1 fixture (rambling solo-founder anecdote → ~600-word founder essay, overwhelmed-founder audience); input in `evals.md`. Match this shape.

- **Inquiry / thesis:** I did everything the productivity gospel says — six apps, real discipline — and still missed my own launch. The fix was the opposite of organizing. (Lived material supplied; no upstream skill load needed.)
- **Lens (5 candidates, tier-ranked):**
    - T1: "My two-year solo-building journey" — rejected, saturated.
    - T2: "Why I abandoned six note apps" — comparison, common.
    - T2: "Behind the scenes of shipping a feature I almost cut."
    - T3: "Productivity apps fail because they tax you at the moment of capture" — mechanism.
    - **T4 (chosen):** "I missed my own launch with the plan written down in three apps — so I stopped organizing." Category-of-one: only this founder has the missed-launch receipt AND built the product the inversion produced. Narrates into the T3 mechanism.
- **Last line (written first):** "The structure was never the work. The capture was." Stranger-text test: pass — survives with zero context.
- **First line (with visual analog):** "I missed my own launch deadline with the plan written down in three different apps." Concrete scene + number; names the topic; no throat-clearing. Loop test vs last line: capture→structure recast — continuous.
- **Atomic shareability line (≤10 words):** "It's not a discipline problem. It's a capture problem." (9 words)
- **Villain:** the "organize harder" doctrine — every app's demand that you file, tag, and sort at the moment of capture. They say more structure; the piece says structure was the tax.
- **Audience map (first paragraph):** "If you're a solo founder with notes in six apps and a plan that lives nowhere, this happened to you too — you just haven't named it yet."
- **Beat outline (every transition tagged; intensity / 100):**
    1. Missed launch; plan in three apps, nowhere real. (open ~75)
    2. **but** I'd done everything right — the apps, the systems, the discipline. (~90, first peak inside 200 words — implants the question: how does a prepared founder still miss?)
    3. **therefore** I assumed discipline failure and organized harder — and abandoned every app within three weeks. (release ~35)
    4. **but** the breaking point flipped the question: what if organizing was the tax, not the fix? (loop 2 opens)
    5. **therefore** I stopped organizing. Every morning, one raw ramble into one place. (~55)
    6. **but** then the strange part: structure showed up on its own. (re-peak ~80, ~word 420)
    7. **therefore** that became the product's core — and I almost cut it for feeling too simple. (~65)
    8. **but** users keep saying the same sentence back to me: "I thought it was discipline." (validation ~85)
    9. Last dab. (Dog-notebook line: cut — funny, off-plot.)
- **W-stack:** what + why = beats 1–2 (missed launch, the contradiction); who + how = beats 3–5; where + when ("two years," app inventory) demoted to beat 7's aside.
- **Rebuy map:** Loop 1 (prepared founder misses — how?) closes at beat 3 → Loop 2 (is organizing the tax?) opens beat 4, closes beat 6 → Loop 3 (why does structure emerge on its own?) opens beat 6, closes beat 8. Lede carries loops 1–2 inside the first 200 words.
- **Visual brief per beat:** 1 = screenshot grid of the three apps with the same plan fragmented; 2 = pull-quote; 5 = raw transcript excerpt; 6 = the structured board; 8 = verbatim user quote as block quote.
- **Tone audit:** written to Marcus (one named founder friend, two apps deep into his own graveyard); "In this post I'll share…" phrasing banned; direct address verified ("you just haven't named it yet").
- **Rhythm audit:** rendered one sentence per line; right edge jagged (4 / 18 / 7 / 22 / 3-word runs in the lede); read-aloud pass logged; one long crescendo sentence reserved for beat 6.
- **Ladder diagnostic:** implanted question at first paragraph = "how do you miss a launch you planned three times?"; mid-piece anticipation = "what replaced the organizing?"; validation = discipline→capture inversion — non-obvious, lands as relief, not gotcha.
- **Seven-mistake reject pass:** arc = clean (75→90→35→80 curve, not bell) · W's = clean · rebuy = clean (3 loops) · villain = clean ("organize harder" doctrine) · rooting = clean (audience-mapped) · atomic = clean (9 words) · picture = clean (visual per beat).
- **Identity-contract check:** reinforces the capture-first / thinking-environment problem area — no drift.

## Source Attribution

Distilled from three Kallaway videos plus the existing BuildOS conviction skill:

- [How To Become A Master Storyteller](https://www.youtube.com/watch?v=t5Z-Q1bg1tU) — six craft moves (dance, rhythm, tone, direction, lens, hook), Stone-Parker `but/therefore` rule, Gary Provost rhythm passage, "last dab" / write-the-ending-first, lens stratification (Taylor Swift), "show while you tell."
- [How to Become a Storytelling Genius (Dopamine Ladders)](https://www.youtube.com/watch?v=jtmstMt4WLc) — six-rung dopamine ladder (stimulation / captivation / anticipation / validation / affection / revelation), pre-cognitive 200ms processing, curiosity-fires-on-the-question, peak-just-before-the-answer, non-obvious-payoff requirement, video-level vs channel-level distinction, likability levers, the "edging of the storytelling world."
- [7 Storytelling Mistakes That Are KILLING Small Creators](https://www.youtube.com/watch?v=wgXGimZvDa4) — Kallaway story arc (replaces Freytag), W-stack reorder, rebuy/rehook mechanic, villain framing, audience-mapping for rooting interest, atomic shareability / Paul Revere test, double-encode tactic, "paint the picture."

Pairs upstream with `nonfiction-writing-from-lived-conviction` (lived experience → inquiry → contradiction) and downstream with `hook-craft-short-form` (final hook polish using slot grammar, three-beat structure, six archetypes, four-mistake diagnostic). Cross-link with `content-strategy-beyond-blogging` for the intent-to-format decision above the structural craft layer.

Underlying analyses live at:

- `docs/research/youtube-library/analyses/2026-04-29_kallaway_master-storyteller_analysis.md`
- `docs/research/youtube-library/analyses/2026-04-29_kallaway_storytelling-genius-dopamine-ladders_analysis.md`
- `docs/research/youtube-library/analyses/2026-04-29_kallaway_7-storytelling-mistakes_analysis.md`

Combo index: `docs/research/youtube-library/skill-combo-indexes/MARKETING_AND_CONTENT.md` ("Story-driven content craft").
