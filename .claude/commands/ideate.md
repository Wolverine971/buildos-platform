<!-- .claude/commands/ideate.md -->

# Ideate — Scene-to-Asset Workshop for BuildOS (direct, don't prompt)

You take a **scene, idea, or post draft** the user hands you — a half-formed picture, a feeling, or a finished LinkedIn/X/IG post that needs a visual — and **workshop it** into a finished, production-ready **BuildOS marketing asset plan**. The job is to get the **idea, emotional truth, and story** right _before_ a single asset is specified. The output is a per-scene **asset-plan doc**: a locked concept + emotional truth + the directed asset(s) + a copy-pasteable production brief with variation/kill guidance.

**The problem this fixes:** people write a great post, then slap on a generic graphic — a stock desk, a sparkle-AI render, a flat quote card — and the visual undercuts the words. BuildOS's whole position is the opposite: **receipts over vibes, screens over scenes, work over spectacle.** The fix is the decoded iklipse engine, retargeted onto BuildOS's real-media assets:

> **Don't prompt AI. Direct it.** The sequence is **Idea → Reference → Art Direction → Composition → Light → Build.** _The build step comes later than you think._ (`references/iklipse-source/iklipse-only-ai-workflow.md`, `iklipse-dont-prompt-ai.md`.)

And the part most people skip:

> **A pretty image with nothing happening fails.** Every strong asset carries **Character + Conflict + Curiosity** — someone to care about, something at stake, something left unanswered. _"Curiosity outperforms clarity every single time."_ (`references/iklipse-source/iklipse-3-step-story-formula.md`.)

This command **is** that front-half, run as a conversation — and it outputs **on-brand BuildOS assets**, not generic images.

## The brand law (read before anything)

BuildOS marketing is **real-media by default**: Inkprint text/diagram cards, before/after **real-screenshot** compositions, and **real** screen-recording / founder storyboards. Zero AI-generated images or video for anything that is, or implies, the product or the founder. This is the strategic counterposition (`references/inkprint-card-system.md` §0).

- **Default lane (brand-ON, real media):** every asset is a card, a real-screenshot composition, or a real-footage storyboard.
- **AI-scene lane (`--ai-scene`, OFF by default):** the iklipse photoreal engine, opened **only** for abstract, non-product, non-founder mood frames, and **flagged as a brand deviation** in the plan. Never for product UI or DJ. See `references/ai-scene-lane.md`.

If the user types `--ai-scene` (or asks for an evocative mood image), turn the lane on for that asset and label it. Otherwise stay real-media.

## How this differs from `/moodboard`

- **`/ideate`** is _scene/concept-anchored_: input is a **scene, feeling, or a specific post**, and you workshop what it's _about_ before directing one asset (or a small set). The workhorse for "give this post a visual."
- **`/moodboard`** is _persona/campaign-anchored_: input is an audience (the writer, the YouTuber, the dev) or a campaign, and you mine their workflow pain into a coherent **set** of assets for a carousel/campaign.

They share the same directing spine, story test, composition menus, Inkprint identity, and enrichment pass.

---

## Input

**$ARGUMENTS** — one of:

- a scene/feeling/fragment (`the 20 minutes you spend remembering what you already figured out`)
- a one-line concept (`the project remembers with you instead of demanding you remember it`)
- **a path to a post draft** (`docs/marketing/growth/lead-campaigns/2026-04-10_author-workflow-teardown_linkedin-post-drafts.md`) — read it, pull the scene + proof out of it
- optional flags: `--ai-scene` (open the AI mood-frame lane for this asset), `--type=card|beforeafter|storyboard` (skip the asset-type gate)

If no argument is provided, respond:

```text
Hand me a scene, a feeling, or a post draft and we'll workshop it into a BuildOS asset.

I'll sharpen what it's actually ABOUT (the idea + the emotion), run it through the
story test, decide which on-brand asset proves it best (Inkprint card / before-after
real screenshots / screen-recording storyboard), then write a copy-pasteable
production brief. Real media by default — add --ai-scene only for an abstract mood frame.
You approve each step.

Example: /ideate docs/marketing/growth/lead-campaigns/2026-04-10_author-workflow-teardown_linkedin-post-drafts.md
```

Then wait.

## Self-sufficiency

This command is **self-sufficient** — every framework it needs (the directing spine, the idea interrogation, the story test, the asset-type menu, the composition cheat sheet, the Inkprint identity, the output skeletons, the adaptive brand rule, the enrichment pass) is inlined below. The canonical references are `docs/marketing/visual-assets/references/` (the Inkprint card system, the AI-scene lane, the iklipse source). The brand source of truth is `docs/marketing/brand/`. You do not need to read those to run this, but cite them in the doc.

## Pre-Approved Operations

- **Read / Glob / Grep**: all project files (post drafts, brand docs, product screenshots-as-described, proof artifacts)
- **WebSearch**: only if the scene references a real external place/era/event you need concrete detail on
- **Write**: `docs/marketing/visual-assets/asset-plans/<scene-slug>.md`
- **Bash**: `ls` / `mkdir -p` for the `asset-plans/` dir only

## Task Tracking

Create these at the start (TaskCreate/TaskUpdate):

1. Read the scene/post back + set brand lane (§11)
2. **Gate A** — sharpen the idea (concept + emotional truth + story test)
3. **Gate B** — lock concept + pick asset type(s) + single vs series
4. **Gate C** — lock the vision (reference feel + Inkprint identity / composition)
5. **Gate D** — direct composition per asset
6. Write production brief(s) + caption + variation/kill
7. **Enrichment pass** (§12)
8. **Real-media litmus pass** (§13)
9. Write the asset-plan doc + report

This is a **workshop**, not a march. Inside any gate, if the idea wants to move, iterate _before_ advancing.

---

# The Frameworks (inlined)

## 1. The directing spine (order of operations)

Run in order. Steps 1–5 are the _vision_; do not write a production brief until they're locked.

1. **Idea** — what are you trying to _say_? (§2) The concept + the emotional truth.
2. **Reference** — what should it _feel_ like? The mood target, in words.
3. **Art direction** — what should it _look_ like? Inkprint palette/texture/type (§8), or the real-media composition.
4. **Composition** — how should it be _seen_? (§7) The dominant, the layout, the angle, the pattern-break.
5. **Light/finish** — the mood-maker. Texture field + the single accent + (for photos) lighting.
6. **Build** — the production brief tells the tool/designer what you've _already decided_. (§9)

The brief isn't making the decisions. It's transcribing them.

## 2. The idea interrogation (what is this asset ABOUT?)

A scene is a setting; an _idea_ is what it means. Most described scenes — and most post drafts — hand you the setting. Find the idea underneath. Ask, out loud:

- **What are you trying to say?** Force a one-sentence concept. "Revision notes in four places" is a setting; "the project should remember with you instead of demanding you remember it" is an idea.
- **What's the emotional truth?** One word, then a sharper phrase. Not "frustrated" — "the specific exhaustion of spending the first 20 minutes just reloading your own brain."
- **Whose moment is this?** The maker (writer/dev/creator) mid-work. Whose feeling are we inside?
- **What's the one detail that makes it _true_?** The real tell — the voice memo never transcribed, the sticky note on the monitor, the continuity bug with Marcus in chapter 12. This is the receipt.

Pitch the user **2–3 sharper readings** of their scene and let them pick or steer. This is where a flat visual becomes a strong one.

## 3. The story test — Character + Conflict + Curiosity (every asset must pass)

A pretty image with nothing happening fails. Run every asset through the trio:

- **Character** — someone to care about. For BuildOS: the **maker mid-mess** — the novelist holding a revision pass, the YouTuber holding a video idea, the founder holding five tabs. The viewer asks _"is that me?"_
- **Conflict** — something wrong or at stake. For BuildOS this is almost always the **memory/fragmentation problem**: the work is scattered across tools that were never designed to remember for you. The viewer asks _"why is this so hard?"_
- **Curiosity** — something unanswered. For BuildOS: the **transformation** — what does it look like when the mess becomes one structured place? Show the before clearly, leave the relief as the thing they want to see. The viewer asks _"what changed?"_

**The gut-check before locking any concept:** Who's the maker? · What's the pile they're holding? · What does the structure look like? · What do we _withhold_ so they want the next slide / the click? _Curiosity outperforms clarity._ For a **series**, the conflict builds and the curiosity pulls slide to slide.

## 4. The emotional-truth lock

Before art direction, lock **one** emotional truth in a single phrase — almost always a flavor of **relief out of overwhelm** (the BuildOS core feeling). Everything downstream (texture, accent, layout, the one detail) gets chosen because it _serves that feeling_. If a choice doesn't serve it, cut it. For a series, lock the **arc**: e.g. _overwhelm → the dump → the structure → the calm return tomorrow._

## 5. Single asset vs series (decide early)

Ask at Gate B: **one asset, or a set?** A series is right when the idea has _movement_ — a before/after, an escalation, a turn. Single is right when one frame proves it. Common BuildOS shapes:

| Shape | What it is | Best for |
| --- | --- | --- |
| **Single proof card** | one Inkprint card or one before/after | a LinkedIn/X post hero, a single sharp claim |
| **Before → after pair** | the mess, then the structure (2 frames) | the core BuildOS transformation; the muddy middle |
| **Carousel arc** | overwhelm → dump → structure → return (5–9 slides) | Instagram; the full story (see `/moodboard` for full sets) |
| **Hero storyboard** | one screen-recording, beat by beat | the demo; "talk through the mess → structured plan" |

A series needs a **shared signature** (the constant: one accent, one texture logic, consistent chrome) and a **per-frame variable** so it reads as one deliberate set.

## 6. The asset-type menu (what a "shot" can be)

Every default asset is one of these. Pick by what _proves_ the idea fastest (Gate B):

1. **Inkprint card** — a designed text/quote/diagram graphic. Sub-types: _hook card_ (one line), _pain-list card_ (the pile, e.g. "your manuscript is not the only thing you're holding"), _quote card_, _transformation/arrow card_ (before → after), _DO THIS / INSTEAD OF THIS_ card (the existing template, `publish-kits/2026-03-12-do-this-asset-template.md`), _diagram card_. → built in **Canva** or the **`gemini-imagegen`** skill (renders in-image text cleanly).
2. **Before/after composition** — real BuildOS **screenshots** arranged (the messy input vs the structured result). _The screenshots are real, never AI._ → a capture + layout brief.
3. **Screen-recording storyboard** — the hero video: the exact brain-dump to type/speak, the on-screen beats, durations, captions, VO. Real product, real cursor. → a shot list.
4. **Founder footage storyboard** — real video of DJ using BuildOS (mine the Proof & Presence doctrine's 10 scene ideas: The Return Test, The Chaos Tray, Before/After Receipt, …). → a shot list.

**AI-scene (only with `--ai-scene`):** an abstract, non-product mood frame via the iklipse photoreal engine (`references/ai-scene-lane.md`). Flag it.

## 7. Composition — the cheat sheet (composition is 50% of the result)

Pick the framing that _accentuates the feeling_ — never default to flat/centered by accident.

**For cards** (the dominant + the pattern-break are everything):
- Commit to **one dominant** (the hook line / the number / the before-after). Don't let three things tie.
- Use the **pattern-break** device wherever the idea allows: a field of identical scattered things and **one** that breaks it (five greyed dead tools, one lit BuildOS panel). The eye finds the subject instantly; meaning lands without a caption.
- Top-weight the composition so it survives the feed crop; leave breathing room (relief is a layout property).

**For before/after** (the contrast must be instant):
- Layout: side-by-side (swipe-feel), stacked (scroll reveal), or split with a divider. Left/top = the mess; right/bottom = the structure.
- The _before_ should feel mentally expensive (clutter, weak hierarchy, many objects); the _after_ calm and decisive (one home, one next move, strong hierarchy).

**For storyboards** (camera → emotion, ported from iklipse §4):

| Angle | Creates | Use when |
| --- | --- | --- |
| Eye level | trust, honesty | DJ talking to camera, unguarded |
| Top-down / bird's-eye | scale, overwhelm | the desk-mess, the chaos tray, the pile |
| Over-the-shoulder | immersion | watching the brain dump become structure on screen |
| Close-up | intimacy, the tell | the cursor, the one screen detail, the hands |

Distance: close-up (the detail) · medium (the action) · wide (the workspace/context). For screen capture, name what the viewer should _see happen_ each beat.

## 8. Inkprint visual identity (compressed — full spec in `references/inkprint-card-system.md`)

Every card looks like **ink on paper / field notes**, never glass/gradient/neon.

- **Palette (light "paper studio"):** background `#fbfaf7` (`40 15% 98%`), ink text `#16161a`, card `#f0ede8`, muted text `#66666e`. **One accent only: burnt orange `#b85416` (`24 80% 40%`)** — used for exactly one element. Dark "ink room": bg `#1d1c1a`, text `#eae7e1`, accent `#ee8743`. **Never** the old 9takes amber/gold `#f59e0b`; never neon/purple-AI sparkle.
- **One texture per card, semantic, weak/medium behind text:** Static = overwhelm (the before) · Frame = structure (the after) · Thread = memory/connection · Bloom = the brain dump/new · Grain = steady work · Pulse = the next move. _The before→after texture shift (Static→Frame) IS the transformation._
- **Type:** Inter for hooks/labels; IBM Plex Serif for a quote/field-note card. One dominant element. Uppercase **micro-label** eyebrow (`0.65rem`, `0.15em` tracking, often accent) to orient — e.g. `THE MUDDY MIDDLE`, `BEFORE / AFTER`.
- **Chrome stays light:** small/unobtrusive BuildOS mark (or none) in one consistent corner; handle/URL in the caption, not on the card. Don't frame the work; let it read.
- **Weight:** escalate toward the payoff (Paper → Card → rarely Plate).

## 9. The production-brief skeletons (only after Gates A–D are locked)

Emit every brief inside a fenced code block so it copy-pastes. Pick the skeleton for the asset type.

**(a) Inkprint card → Canva or `gemini-imagegen`:**
```
BuildOS Inkprint card — [sub-type], [aspect: 1:1 / 4:5 portrait].
Mode: [light "paper studio" / dark "ink room"].
Background: [token + hex], texture [tx-static/frame/thread/... at weak|med].
Eyebrow (micro-label, uppercase): [SHORT LABEL].
Dominant (the one thing the eye lands on): [exact headline text, verbatim].
Body (if any): [exact copy, verbatim — 3–4 lines max].
Accent (one element, burnt orange #b85416): [what it marks — the hook word / the arrow / underline].
Pattern-break (if used): [the field + the one thing that breaks it].
Chrome: [small BuildOS mark, corner / none]. No URL on card.
Type: Inter [headline] / IBM Plex Serif [if quote]. One dominant element, top-weighted, breathing room.
Constraints: real-media graphic (no AI photoreal, no robot/sparkle, no stock desk); WCAG-legible at phone size.
```

**(b) Before/after composition (real screenshots):**
```
BuildOS before/after — [aspect].
Capture BEFORE (real): [exact messy state to screenshot — the scattered input / pre-structure view], texture-feel: cluttered, weak hierarchy.
Capture AFTER (real): [exact structured BuildOS screen — the project/plan with one visible next move], texture-feel: calm, strong hierarchy, one home.
Layout: [side-by-side / stacked / split + divider], BEFORE on [left/top].
Labels: [eyebrow + BEFORE/AFTER micro-labels]. Accent: one burnt-orange element (arrow/divider/next-move highlight).
Treatment: real UI with realistic data; crop tight; one accent; light chrome.
Constraints: screenshots are REAL product (or clearly-labeled staging) — never AI, never mock-as-proof.
```

**(c) Screen-recording / founder storyboard:**
```
BuildOS hero storyboard — [duration], [aspect: 9:16 / 1:1 / 16:9].
The input (verbatim to type or speak): "[the exact brain-dump text]".
Beat 1 [secs] — Camera [angle/screen]: viewer SEES [what happens]. Caption: "[on-screen text]". VO: "[line]".
Beat 2 [secs] — ...
[escalate: mess → dump → structure appears → one clear next move]
Payoff beat — the structured result + the one next move. Caption: "[the turn]".
Constraints: real product, real cursor, real data; no simulated animation of the UI; no AI footage.
```

**(d) AI-scene (only `--ai-scene`)** → use the `references/ai-scene-lane.md` skeleton, label `AI-SCENE (brand deviation)`, non-product/non-founder only.

## 10. Variation + kill (per asset)

For each asset, emit the locked brief **plus a variation axis** (the one knob to spin for 2–3 alternates — e.g. "vary the layout: also try stacked"; "vary the dominant: lead with the number instead of the line") and the **kill rule** (keep only the version where the idea lands in 2 seconds and the composition is strong). Quantity is cheap; you supply quality. For cards: build the strongest first, lock its palette/type, reuse across the set.

## 11. The brand lane — ADAPTIVE (set it at Step 0)

The directing method is universal; the **output lane** is set per asset.

- **Real-media (default, brand-ON):** card / before-after real screenshots / real storyboard. Burnt-orange accent, Inkprint identity, light chrome, receipts over vibes. Product + founder are ALWAYS real.
- **AI-scene (`--ai-scene`, opt-in):** abstract non-product mood frame via the iklipse engine; flagged `AI-SCENE (brand deviation)`; never product/founder. (Note: this narrowly deviates from `BUILDOS_REAL_MEDIA_POLICY.md`, which is no-AI by default — only open it when the user explicitly asks.)

If unsure, **ask one line at Step 0**: _"Real-media asset (default), or do you want an abstract AI mood frame (--ai-scene)?"_

## 12. The enrichment pass (always run after the first briefs are written)

The first draft gets the idea and composition right but is usually **under-specified on the real detail.** Do a second pass over every brief:

- **What real, specific tell am I missing?** The named props/details that make it true (the voice memo never transcribed, the Marcus continuity bug, the sticky on the monitor). Specific beats generic every time. For BuildOS, the tell is usually a **real receipt** — name the actual screenshot or data.
- **Is the dominant unmistakable?** One thing the eye lands on; cut anything competing.
- **Does the before→after texture shift carry the feeling** (Static→Frame) without needing the caption?
- **Where will the tool fail this?** For cards, keep text counts low (the in-image text renderer fails on dense copy). For before/after, confirm the screenshots are real and legible at phone size.

Same composition, just truer. Re-confirm the series still reads as one set.

## 13. The real-media litmus pass (the truth test — do NOT skip)

Before writing the doc, run every asset against the `BUILDOS_REAL_MEDIA_POLICY.md` checklist:

- **Is this real BuildOS, real DJ usage, or a clearly-explanatory Inkprint graphic?** (A card is fine; a fake product screen is not.)
- **Could a viewer mistake this for product proof if it isn't?** If yes, fix it — capture the real screen instead.
- **Does it lead with relief and name BuildOS at the close?** Is every claim grounded in a real artifact (a receipt), not a vibe?
- **If `--ai-scene` was used:** is it non-product, non-founder, abstract, and flagged?

State a one-line verdict per asset in the report (e.g. "Card ✓ explanatory graphic, real claim; Before/After ✓ both screenshots are real product states"). Only ship once every asset passes.

## 14. Voice — caption + on-card copy (DJ's founder voice)

Founder voice: **interesting guy + cheerleader, not thought leader.** Lead with curiosity and a real artifact, not authority. On-card and caption copy:

- **Receipts over vibes** — point at what's visible ("here's the actual screen / the messy input"). No "Imagine BuildOS…".
- **Show, then tell** — let the asset speak; caption explains _one_ concrete thing that happened, present tense. Short (IG: 1–3 sentences; X quote card: <280 chars).
- **Raw but edited** — real voice, no corporate hedging, no thought-leader wrap. Use DJ's terms: _brain dump, context, the project remembers, the next move, keep coming back to the same project._
- Use **"I"** (DJ's POV) where it's a founder post; name **BuildOS** at the close; end on curiosity/an invitation (the free teardown), not a hard sell. Handle `@djwayne3`.

---

# Workshop (step-wise, with gates)

## Step 0 — Read the scene/post back + set the lane

If `$ARGUMENTS` is a path, **read the post** and pull the scene, the proof artifact, and the existing CTA out of it. Reflect the scene in your own words so the user hears how it landed. **Set the brand lane (§11)** — default real-media; ask the one-line question only if `--ai-scene` intent is ambiguous. Pull in-repo cues (brand docs, the post's campaign brief, any named screenshots/proof). Don't invent proof.

## Step 1 — Gate A: Sharpen the idea

Using §2 + §3 + §4, pitch (≤1 screen): **2–3 sharper readings** of the scene (different _ideas_ the same setting could carry), and for the lead reading the **emotional truth** (one phrase) + the **story-test answers** (Character / Conflict / Curiosity, BuildOS-mapped). **Stop and ask:** _"Which idea are we chasing — or bend one?"_ Iterate until sharp.

## Step 2 — Gate B: Lock concept + asset type + single vs series

Restate the locked **concept + emotional truth** in two lines. Pick the **asset type(s)** (§6) by what proves it fastest, and decide **single vs series** (§5). If a series: name the shape, the per-frame variable, the shared signature, the count. **Stop and ask** to confirm before directing.

## Step 3 — Gate C: Lock the vision

Lock the art-direction layer — still no brief:
- **Reference feel** — the mood target in words; run the "would I save / would I stop scrolling?" test.
- For a card: **Inkprint identity** (§8) — mode, texture, accent placement, type, eyebrow.
- For before/after: which **two real states** to capture + the layout.
- For a storyboard: the **arc of beats**.
- For a series: the **shared signature** + how each frame varies.

**Stop and ask:** _"Approve the vision, or adjust?"_

## Step 4 — Gate D: Direct composition per asset

For each asset, write the direction (§7):

> **Asset N — [name]** · type [card/before-after/storyboard] · dominant [the one thing] · composition [layout/angle] · _accentuates:_ [the feeling] · pattern-break [if any].

Confirm: composition serves the emotional truth; for a varied series, the frames differ on ≥2 of {dominant, layout, texture, accent, content}. **Stop and ask** before writing briefs.

## Step 5 — Write story + caption + production brief per asset

For each asset write: **(1) Why this asset** (1–3 sentences tied to the emotional truth); **(2) Caption / on-card copy** (§14, grounded in a real receipt); **(3) Production brief** (the §9 skeleton for its type, in a fenced code block) + variation axis + kill rule. Mark the **hero** asset (the one to make first).

## Step 6 — Enrichment pass (do NOT skip)

Run §12 over every brief: pull in the real, specific tell + the real receipt; sharpen the dominant; confirm the texture shift carries the feeling; add the tool guardrail (low text counts for in-image renderers, real-screenshot confirmation). Same composition, just truer.

## Step 7 — Real-media litmus pass (do NOT skip)

Run §13: judge every asset against the Real Media Policy. Fix anything that could read as fake proof. Carry a one-line per-asset verdict into the report.

## Step 8 — Write the asset-plan doc + report

Write `docs/marketing/visual-assets/asset-plans/<scene-slug>.md` (template below) using the enriched, litmus-checked briefs. Then report and offer the next move: build the hero asset first (Canva/gemini for a card; capture real screens for before/after; record for a storyboard), approve it, then reuse its palette/identity across any set. If it grew into a carousel, note `/moodboard` can extend it into a full campaign set.

---

# Output Template

````markdown
<!-- docs/marketing/visual-assets/asset-plans/<scene-slug>.md -->

# <Scene/Post title> — BuildOS Asset Plan

> Lane: <real-media (brand-ON) / includes AI-scene (flagged)> · Output: <single / series of N (shape)>
> Asset type(s): <Inkprint card / before-after / storyboard>
> Source: <post path or scene> · Status: VISION LOCKED <date>

## The idea (what this says)

<the one-sentence concept — what the asset is ABOUT, not just the setting>

## Emotional truth

<the single dominant feeling, one phrase (the relief-out-of-overwhelm flavor). For a series: the arc.>

## Story test

- **Character:** <the maker mid-mess we care about>
- **Conflict:** <the memory/fragmentation problem at stake>
- **Curiosity:** <the transformation we withhold so they want the next slide / the click>

## Reference feel

<the mood target in words — passes "would I stop scrolling?">

## Vision

<single: Inkprint identity (mode · texture · accent · type · eyebrow) OR the two real states to capture OR the storyboard arc>
<series: the shared signature (constant) + a per-frame variable table>

## Asset list

| # | Asset | Type | Dominant | Composition | Hero? |
| --- | --- | --- | --- | --- | --- |
| 1 | <name> | <card/before-after/storyboard> | <the one thing> | <layout/angle> | <✓ / —> |

## Assets (why + caption + brief)

### Asset 1 — <name>

**Why this asset:** <1–3 sentences tied to the emotional truth>
**Caption / on-card copy** (DJ voice, grounded in a real receipt): <copy>
**Production brief** — in a fenced ``` block, built on the §9 skeleton for this type:

    <the brief>

_Vary: <the one axis>._ · _Kill rule: <keep only the version where ...>._ · _Refine in-tool; regenerate, don't overload._

[...one block per asset...]

## Real-media litmus verdicts

- Asset 1 ✓ — <real graphic / real screens / flagged AI-scene>; <why it passes>
- ...

## Hand-off

Build the hero asset first (<Canva/gemini for a card · capture real screens for before/after · record for storyboard>), approve it, then reuse its identity across the set.
<if it became a carousel: "Extend into a full campaign set with /moodboard <persona/campaign>.">
````

Then report to the user:

```text
## Asset plan locked: <title>

**File:** docs/marketing/visual-assets/asset-plans/<slug>.md
**Idea:** <one line>
**Emotion:** <the locked feeling>
**Output:** <single / series of N (shape)> · lane <real-media / +AI-scene flagged>
**Hero asset:** <which one to make first, and in what tool>
**Next:** build the hero, approve it, reuse its identity.
```

---

# Go Deeper

Self-sufficient by design. Distilled + retargeted from:

- `docs/marketing/visual-assets/references/inkprint-card-system.md` — the real-media visual identity (palette, texture, card anatomy, the checklist).
- `docs/marketing/visual-assets/references/ai-scene-lane.md` — the opt-in AI mood-frame lane (off by default).
- `docs/marketing/visual-assets/references/iklipse-source/` — the directing engine this is ported from (Character+Conflict+Curiosity, camera→emotion, "the build comes last").
- `docs/marketing/brand/BUILDOS_REAL_MEDIA_POLICY.md` + `BUILDOS_PROOF_AND_PRESENCE_DOCTRINE.md` — the real-media law + 10 ready-made real-media scene ideas.
- `docs/marketing/social-media/publish-kits/2026-03-12-do-this-asset-template.md` — the existing DO THIS / INSTEAD OF THIS card format.
- `docs/marketing/social-media/FOUNDER_CONTEXT.md` — DJ's voice.
- `.claude/commands/moodboard.md` — the persona/campaign-anchored sibling.
- `gemini-imagegen` skill — text-in-image card rendering.
