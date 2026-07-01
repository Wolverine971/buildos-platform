<!-- .claude/commands/moodboard.md -->

# Moodboard — BuildOS Per-Persona/Campaign Art-Direction & Proof Pipeline

You lock the **visual vision** for a persona or campaign _before_ anyone builds a single asset. The output is a **moodboard doc**: a locked Inkprint vision (palette · texture logic · tone) + a ranked set of **workflow moments** (what this maker actually _lives_) + a directed **asset list** (card / before-after / storyboard per moment, with composition, accent, and the real receipt each one rides on) + finished production briefs. This doc then feeds a carousel/campaign and `/ideate` (and any other BuildOS asset build) so the visuals stop being flat, generic, or off-brand.

**The problem this fixes:** assets get made copy-first — you write the post, then bolt on a stock desk, a sparkle-AI render, or a flat quote card as an afterthought. Every visual ends up generic, and worse, off-brand for a company whose whole position is **receipts over vibes.** That violates the single most important rule in the decoded iklipse engine:

> **Don't prompt AI. Direct it.** The sequence is **Idea → Reference → Art Direction → Composition → Light → Build.** _The build comes later than you think._ (`references/iklipse-source/iklipse-dont-prompt-ai.md`, the account's #1 post.)

This command **is** the missing Art-Direction front-half. It runs _upstream_ of every asset build.

## What makes this BuildOS-native (the maker-POV engine)

The iklipse decks teach how to direct a generic subject. BuildOS adds the part they don't have: **the maker's real workflow.** We don't shoot a portrait _of_ a creator. We show **what the maker is holding** — the pile of scattered tools at the back of their mind, the muddy middle, the 20 minutes spent reloading their own brain, and then the relief of one structured place. One workflow, seen from inside it. That's the product thesis ("the project remembers what matters") rendered as an asset.

So every moodboard answers, for each moment: _Whose workflow are we inside, what pile are they holding, and what does it look like when BuildOS holds it for them?_ And every asset obeys the **Real Media Rule** — receipts, not synthetic spectacle.

## The brand law (read before anything)

BuildOS marketing is **real-media by default**: Inkprint cards, before/after **real-screenshot** compositions, **real** screen-recording / founder storyboards. Zero AI-generated images/video for anything that is or implies the product or the founder (`references/inkprint-card-system.md` §0). The **AI-scene lane** (`--ai-scene`, `references/ai-scene-lane.md`) is OFF by default and only for abstract, non-product mood frames, flagged as a deviation. Product UI and DJ are ALWAYS real.

---

## Input

**$ARGUMENTS** — a **persona** (`writer`, `youtuber`, `developer`, `TPM`, `adhd-founder`, `founder-creator`), or a **campaign** (`author-workflow-teardown`, `the-muddy-middle`), optionally with a focus (`the muddy middle`, `the return`, `tool sprawl`). Flags: `--ai-scene` (allow AI mood frames in the set), `--carousel` (target an Instagram carousel arc).

If no argument is provided, respond:

```text
Ready to art-direct a BuildOS moodboard. Give me a persona or a campaign.

I'll pitch a locked Inkprint vision (palette / texture logic / tone), then we'll mine
the real moments from this maker's workflow — the pile they're holding, the muddy
middle, the relief of one structured place — and direct an on-brand asset set
(cards / before-after real screenshots / storyboards) for a carousel or campaign.
Real media by default. You approve each stage.

Example: /moodboard writer
Example: /moodboard author-workflow-teardown --carousel
```

Then wait.

## Self-sufficiency

This command is **self-sufficient** — every framework it needs (the directing process, the maker-POV engine, the journey-stage model, the composition cheat sheet, the Inkprint identity, the asset skeletons, the brand rules, the litmus passes) is inlined below. The canonical references live in `docs/marketing/visual-assets/references/`; the brand source of truth in `docs/marketing/brand/`; the concept-anchored sibling is `.claude/commands/ideate.md`. You do not need to read those to run this.

## Pre-Approved Operations

- **Read / Glob / Grep**: all project files (to mine the persona's real workflow, pain docs, proof artifacts, existing posts)
- **WebSearch**: only if the persona's tooling/landscape is thin in-repo and you need real detail
- **Write**: `docs/marketing/visual-assets/moodboards/<persona-or-campaign-slug>-moodboard.md`
- **Bash**: `ls` / `mkdir -p` for the `moodboards/` dir only

## Task Tracking

Create these at the start (TaskCreate/TaskUpdate):

1. Resolve persona/campaign + mine the real workflow
2. **Gate A** — pitch + lock the Inkprint vision + journey stages + shared signature
3. **Gate B** — pitch workflow moments, user picks the strongest
4. **Gate C** — direct composition/type/accent per chosen moment
5. Write briefs + caption + variation/kill per asset
6. **Enrichment pass** — composition-first, then the real receipt (§13)
7. **Recognition + real-media litmus pass** (§14)
8. Write moodboard doc + report

---

# The Frameworks (inlined)

## 1. The directing process (the spine)

Run in order. Steps 1–4 are the _vision_; do not write a brief until they're locked. (Source: `iklipse-dont-prompt-ai.md` — "Composition = 50% of the result," "Same subject ≠ Same result," "Style = Identity.")

1. **Lock the Vision.** Mood · Inkprint palette · texture logic · tone · the through-line.
2. **Direct the Composition.** The dominant · the layout/angle · the pattern-break — chosen to _accentuate_ each moment's point.
3. **Control the Light/Finish.** Texture field + the single burnt-orange accent + (for photos) lighting.
4. **Choose the Style/Type.** The asset type each moment becomes (card / before-after / storyboard) and the shared identity the whole set wears.
5. **Generate Variations.** Per asset: push layout / accent / dominant; one variation isn't direction.
6. **Kill Weak Outputs.** Keep only strong composition, clear feeling, a real receipt, on-brand. Quantity is cheap; you supply quality.

## 2. The maker-POV engine (the heart — pick a lens per moment)

Every moment is one of these **perspective lenses**. Default to lenses 1–4 over a straight third-person shot.

| # | POV lens | What it shows | Feels like |
| --- | --- | --- | --- |
| 1 | **The pile they're holding** | the scattered stack — five tools, the notes, the tabs, the voice memo — all at once | overwhelm, "that's me" |
| 2 | **Their-eyes (first person)** | the frame _is_ their view — the cluttered desk, the wall of tabs, the blank page at 2am | you become the maker |
| 3 | **Over-the-shoulder of the screen** | watching the brain dump _become_ structure on the BuildOS screen | the transformation, live |
| 4 | **The return** | coming back days later and the project is still there, holding the next move | relief, trust, memory |
| 5 | **The maker mid-mess** | the person small inside their own workflow chaos (the writer at the desk of four note-places) | solitude, the muddy middle |

A flat centered quote card is the thing we're trying to escape. If a moment is just "a line on a background," redirect it to a POV lens (a real receipt, a before/after, a pattern-break) or kill it.

## 3. Moment mining (where workflow moments come from)

Pull from, in rough priority of charge:

- **The pile** (the scattered tools this persona actually uses — the writer's Google Doc + phone note + sticky + voice memo; the YouTuber's idea doc + Notion + comments + Frame.io notes).
- **The muddy middle** (the specific stuck-place — "the first 20 minutes spent remembering what I already figured out").
- **The forgotten decision** (the thing they solved once and lost — the continuity fix, the subplot change, the research thread).
- **The dump** (the moment they talk/brain-dump the mess into one place).
- **The structure** (what it looks like when it becomes a project with a plan and one next move).
- **The return** (coming back tomorrow / next week to context, not chaos).
- **The real receipt** — an actual BuildOS screenshot, a real before/after, a real founder workflow that proves the moment.

**Rank candidates by:** visual specificity (can I see one frame?) · emotional charge · non-genericness (could _only_ this persona own it?) · reveals-their-workflow (does it put me inside their day?) · **has a real receipt** (can we prove it with a real screen/footage?). Kill anything that's a generic "person looking productive."

## 4. Composition direction — the dominant + pattern-break (the cheat sheet)

Composition is 50% of the result. Pick the device that _accentuates the moment's feeling_ — never default to flat/centered.

**The two strongest devices (use one per asset where the moment allows):**
- **The dominant** — one thing the eye lands on first (the number, the hook line, the one lit panel). Commit; don't let three things tie.
- **The pattern-break** — a field of identical things and **one** that breaks it (five greyed dead tools, one lit BuildOS; rows of scattered notes, one pulled into a clean structured row). The eye finds the subject instantly; meaning lands without a caption.

**For storyboards, the camera→emotion table (ported from iklipse §4):** eye level (trust, DJ to camera) · top-down/bird's-eye (overwhelm, the desk-mess/chaos tray) · over-the-shoulder (immersion, the screen transformation) · close-up (the tell — the cursor, the hands, the one detail). Distance: close-up (the tell) · medium (the action) · wide (the workspace).

## 5. Light / finish — the texture field carries the mood

The Inkprint texture is the "lighting" of a card. Specify **one** per asset, weak/medium behind text:

- **Static** → overwhelm, noise, the scattered before.
- **Frame** → structure, canon, the after.
- **Thread** → connection, memory, "the project remembers."
- **Bloom** → the brain dump, newness, the idea.
- **Grain** → steady execution, the work getting done.
- **Pulse** → momentum, the next move, "today."

_The before→after texture shift (Static→Frame, or Static→Thread) IS the transformation, felt without words._ For photo/storyboard frames, name the real lighting (top-down desk lamp on the chaos tray; warm screen-glow on the return).

## 6. Style / type — choose the asset type + one shared identity

Each moment becomes one asset type (full menu in `/ideate` §6): **Inkprint card** (hook / pain-list / quote / transformation / DO-THIS-INSTEAD / diagram) · **before/after** (real screenshots) · **storyboard** (screen-recording or founder footage). The whole set shares **one** identity so it reads as a deliberate series.

**BuildOS through-line:** render **real work — a real receipt, a real screen, a real moment in this maker's day.** Do **NOT** overlay synthetic spectacle, stock desks, robot/sparkle-AI imagery, or fake product UI. The set coheres through a shared **Inkprint signature** (one burnt-orange accent + consistent texture logic + light chrome) — _not_ a repeated stock motif.

## 7. Per-persona vision anchors (persona → pile / muddy-middle / relief)

Start the Vision pitch from the persona, then bend it to the campaign's specifics.

| Persona | The pile they're holding | The muddy middle | The relief (after) |
| --- | --- | --- | --- |
| **Writer / author** | Google Doc + phone note + beta-reader sticky + voice memo | "the first 20 min remembering what I already figured out"; continuity bugs scattered | one revision plan, problems flagged, next move clear |
| **YouTuber / creator** | idea doc + Notion + comment screenshots + edit notes + thumbnails | a video idea split across six tools; momentum lost between sessions | one project: research → hooks → script → next step connected |
| **Developer** | issues + scratch notes + ChatGPT threads + a stale README | context paste-in to ChatGPT every time; the "where was I" reload | one project home that remembers the thread |
| **TPM / operator** | docs + tasks + decisions + the thing they're holding in their head | the plan lives in their head; status reload across tools | one connected project; decisions and next move visible |
| **ADHD / scattered mind** | tabs, notes apps, half-finished lists, "where did I put that" | blank-page chaos; the cost of restarting every sit-down | come back to context, not chaos; one clear next move |
| **Founder-creator** | the build + the marketing + five tabs + 2am brain dumps | juggling projects, none with a clean structure | BuildOS holding the project, building context over time |

## 8. Brand non-negotiables

- **Real media** unless `--ai-scene` is explicitly on (and then only abstract non-product frames, flagged). Product + founder are ALWAYS real screens/footage.
- **Burnt orange (`#b85416`)** is the single accent; ink-on-paper. **Never** the old 9takes amber/gold `#f59e0b`, never neon, never purple-AI sparkle, never robot imagery, never stock office.
- **One texture per card**, semantic; before = Static, after = Frame/Thread.
- **Light chrome** — small/unobtrusive mark (or none), consistent corner; handle/URL in caption, not on card.
- **One dominant** per asset; top-weighted; breathing room; survives the feed crop.
- **Reads in light or dark** as the same printed artifact.
- **Every asset rides a real receipt** — name the actual screen/footage/data it proves.

## 9. Inkprint identity (compressed — full spec in `references/inkprint-card-system.md`)

- **Palette (light "paper studio"):** bg `#fbfaf7` (`40 15% 98%`), ink `#16161a`, card `#f0ede8`, muted `#66666e`; **one accent: burnt orange `#b85416`**. Dark "ink room": bg `#1d1c1a`, text `#eae7e1`, accent `#ee8743`.
- **Texture (one per card):** Static/Frame/Thread/Bloom/Grain/Pulse per §5.
- **Type:** Inter (hooks/labels), IBM Plex Serif (quote/field-note). One dominant; uppercase **micro-label** eyebrow (`0.65rem`, `0.15em` tracking, often accent).
- **Chrome light; weight escalates toward the payoff slide** (Paper → Card → rarely Plate).

## 10. The asset skeletons (only after Gates A–C are locked)

Use the `/ideate` §9 skeletons verbatim — **(a)** Inkprint card → Canva / `gemini-imagegen`; **(b)** before/after real screenshots; **(c)** screen-recording / founder storyboard; **(d)** AI-scene (only `--ai-scene`, flagged). Emit every brief in a fenced code block. Each must encode its own moment's texture/accent while keeping the **shared signature**.

## 11. Variation + kill (per asset)

Per asset, emit the brief **plus a variation axis** (the one knob to spin) and a **kill rule** (keep only the version where the idea lands in 2 seconds, the composition is strong, and it rides a real receipt). Build the strongest first, lock its identity, reuse across the set.

## 12. Journey stages, per-moment palettes & the shared signature (the core model)

A persona is **not one mood across the whole journey.** The scattered _before_ is overwhelm (Static, cool, cluttered); the _dump_ is release (Bloom); the _structure_ is calm canon (Frame); the _return_ is warm trust (Thread, screen-glow). A single global palette flattens the arc. So:

- **Map the persona/campaign into 3–5 JOURNEY STAGES** first (the pile · the muddy middle · the dump · the structure · the return). Each stage gets a **one-line mood**.
- **Each asset is a moment inside one stage, carrying its OWN mini palette** (texture · accent placement · before-or-after feel) tuned to that stage. The before-mess and the after-structure should look genuinely different.
- **A thin SHARED SIGNATURE holds the set together as one BuildOS series.** Lock it once, apply to every asset:
  - the **burnt-orange accent** present in every frame (one element),
  - the **light chrome** (consistent corner mark / none),
  - the **Inkprint paper/ink finish** (a printed artifact, not a render),
  - **one dominant** per asset, **one texture**, and **a real receipt** behind every claim.

The per-moment palette is the **variable**; the shared signature is the **constant.** That's what keeps five stages reading as one deliberate set instead of five unrelated graphics.

## 13. The enrichment pass (always run after the first briefs are written)

After Step 4 writes the briefs, do a **second pass over every one** — enrich the **right layer**, in priority order, because the wrong "more detail" makes assets worse.

**Hard-won lesson (ported from iklipse §13):** specificity of **decoration ≠** a better asset. Specificity of **composition + a real receipt** does. A prop-stuffed card with no dominant collapses into noise; a clean card with one dominant and one real receipt lands. So enrich in this order:

1. **Composition & dominant first.** Is one thing unmistakably the subject? Commit to the pattern-break or the before/after; cut anything competing.
2. **The real receipt.** Name the **actual** screenshot / footage / data each asset rides (not "a BuildOS screen" — _which_ screen, _what_ data). This is the difference between proof and a vibe.
3. **The texture shift.** Confirm before→after carries the feeling (Static→Frame/Thread) without needing the caption.
4. **Then 2–4 real, citable details** that _carry_ feeling (the Marcus continuity bug, the voice memo never transcribed) — never set-dressing.
5. **Tool guardrails.** Low text counts for in-image card renderers; confirm before/after screenshots are real and legible at phone size; for AI-scene frames, the anti-yellow/shadow guardrails.

Keep it copy-pasteable; re-confirm the set still reads as one signature.

## 14. The recognition + real-media litmus (the final pass — run from inside the maker's head AND the brand's)

Before writing the doc, step **into the maker's shoes** and the **brand's rules** and judge every asset:

**Recognition (would the maker nod?):**
> **Would this persona recognize this as their own workflow?** Would the writer feel the specific four-places mess in their body — the boredom of the 20-minute reload, the dread of the continuity bug — not see a generic "busy creative"? If they wouldn't recognize themselves in it, the asset is wrong no matter how clean it looks.

**Real-media (would the brand ship it?):** run the `BUILDOS_REAL_MEDIA_POLICY.md` checklist on every asset:
- Real BuildOS / real DJ usage / clearly-explanatory Inkprint graphic?
- Could a viewer mistake it for product proof if it isn't? (fake UI = fail)
- Leads with relief, names BuildOS at the close, every claim on a real receipt?
- If `--ai-scene`: abstract, non-product, non-founder, flagged?

State a one-line verdict per asset in the report (e.g. "Asset 2 ✓ — a writer would recognize the four-places pile; before/after both real product states"). Only ship the set once every asset makes the maker nod **and** passes the real-media check.

## Step 0 — Resolve persona/campaign + mine the real workflow

Resolve `$ARGUMENTS`. Gather real material (do **not** invent):

1. The brand guide audience order + persona docs (`docs/marketing/brand/brand-guide-1-pager.md` — leads with authors + YouTubers).
2. Any campaign brief / post drafts named (e.g. `docs/marketing/growth/lead-campaigns/…`) — pull the real pile, the muddy middle, the proof artifact.
3. `BUILDOS_PROOF_AND_PRESENCE_DOCTRINE.md` — the 10 real-media scene ideas (mine for before/after + storyboard moments).
4. `FOUNDER_CONTEXT.md` — DJ's real stories/voice for any founder-POV moment.
5. Only if in-repo material is thin: one WebSearch pass for the persona's real tooling landscape.

Note the persona anchor (§7) and 3–6 concrete, real moments with receipts you can build assets from.

## Step 1 — Gate A: Persona overview + journey stages + shared signature

Pitch (≤1 screen), seeded from §7 and §12:
- **Persona overview:** who they are + 4–6 things worth showing about how they work (the pile, the muddy middle, the relief).
- **Journey stages:** 3–5 stages, each with a one-line **mood** (these are the palettes the assets draw from). Show the arc from overwhelm → relief.
- **Shared signature:** the thin constant across all assets (§12) — burnt-orange accent + light chrome + Inkprint finish + one dominant + one texture + a real receipt.

Then **stop and ask:** _"Lock the stages + signature, or adjust?"_ Do not proceed until approved.

## Step 2 — Gate B: Pitch workflow moments (tagged by stage)

Using §2 + §3, pitch **6–9 candidate moments**, each one line, **tagged with its stage**:

> **[Moment name]** — _stage: [which]_ — _POV lens [#]_ — "[the single frame: whose workflow, what pile / what structure]" — feeling: [x] — receipt: [the real screen/footage it rides].

Spread across stages so the set isn't all one mood. Rank them. Then **stop and ask:** _"Which do you want? (pick ~5–6, or swap in your own.)"_ Wait for the pick.

## Step 3 — Gate C: Build each asset's type + composition + mini palette

For each picked moment, write its **asset type + composition + own mini palette** (tuned to its stage) — still no brief:

> **Asset N — [name]** · _Stage:_ [which] · _Type:_ [card/before-after/storyboard]
> Palette: Texture [x] · Accent placement [x] · Before-or-after feel [x]
> Composition: dominant [the one thing] · layout/angle [x] · pattern-break [if any] · _accentuates:_ [the point]
> Receipt: [the real screen/footage/data it rides]

Confirm: (a) every asset applies the **shared signature**; (b) palettes differ across stages; (c) ≥2 of {dominant, layout, texture, accent, type} differ across every pair; (d) every asset has a real receipt. Then **stop and ask:** _"Approve the asset directions, or adjust?"_ Wait.

## Step 4 — Write story + caption + brief per asset

Each brief encodes **its own stage palette** while keeping the shared-signature accent. For each approved moment, write all three layers:

1. **Story (why this asset)** — 1–3 sentences of editorial intent tied to the maker's workflow.
2. **Caption / on-card copy** — DJ voice (interesting-guy + cheerleader, receipts over vibes), grounded in the real receipt.
3. **Brief** — the full §10 skeleton for its type, **in a fenced code block**, + variation axis + kill rule.

Mark which single asset is the **hero** (make first) and which is the **peak** (the payoff slide / the one bright high-contrast frame if a carousel).

## Step 5 — Enrichment pass (do NOT skip)

Run §13 over every brief, in priority order: composition & dominant first, then **the real receipt**, then the texture shift, then 2–4 real details, then tool guardrails. Decoration is last and least — don't prop-stuff. Re-confirm the set reads as one signature.

## Step 6 — Recognition + real-media litmus (the truth test — do NOT skip)

Run §14: judge every asset from inside the maker's head (_"would they recognize their own workflow?"_) AND against the Real Media Policy. Fix any asset that fails (usually by correcting composition/receipt, not adding decoration). Carry a one-line per-asset verdict into the report.

## Step 7 — Write the moodboard doc + report

Write `docs/marketing/visual-assets/moodboards/<slug>-moodboard.md` (template below) using the **enriched, litmus-checked** briefs. Then report — include the per-asset verdicts — and tell the user the next move: build the hero asset, approve it, reuse its identity; deepen any single moment with `/ideate`.

---

# Output Template

````markdown
<!-- docs/marketing/visual-assets/moodboards/<slug>-moodboard.md -->

# <Persona / Campaign> — BuildOS Moodboard

> Persona/Campaign: <name> · Target: <carousel / campaign / asset set> · Lane: <real-media / +AI-scene flagged>
> Source: <brand guide persona / campaign brief / post drafts>
> Status: STAGES + SIGNATURE LOCKED <date>

## The through-line

<the single idea the whole set proves about this maker — one sentence (a relief-out-of-overwhelm claim)>

## Persona overview

<4–6 bullets on how they work — the pile, the muddy middle, the relief>

## Journey stages (each asset draws its palette from one)

| Stage | Mood (one line) | Texture / accent cue |
| --- | --- | --- |
| The pile | <...> | Static, cluttered |
| The muddy middle | <...> | Static, cool |
| The dump | <...> | Bloom |
| The structure | <...> | Frame, calm |
| The return | <...> | Thread, warm screen-glow |

## Shared signature (the constant across every asset)

- Burnt-orange accent (one element) · light chrome (small mark/none) · Inkprint paper/ink finish · one dominant · one texture · a real receipt behind every claim · 1:1 or 4:5.

## Asset list

| # | Moment | Stage | Type | Dominant | Composition | Receipt | Peak? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | <name> | <stage> | <card/before-after/storyboard> | <the one thing> | <layout/angle> | <real screen/footage> | <✓ / —> |

## Assets (palette + story + caption + brief)

### Asset 1 — <name> · Stage: <which>

**Palette:** Texture <x> · Accent placement <x> · Before/after feel <x>
**Why this asset:** <1–3 sentences — how it reveals their workflow>
**Caption / on-card copy** (DJ voice, on a real receipt): <copy>
**Receipt:** <the actual screen/footage/data it rides>
**Brief** — in a fenced ``` block, built on the §10 skeleton for this type:

    <the brief>

_Vary: <the one axis>._ · _Kill rule: <keep only the version where ...>._ · _Refine in-tool; regenerate, don't overload._

[...one block per asset...]

## Recognition + real-media verdicts

- Asset 1 ✓ — <the maker would recognize ...>; <real graphic / real screens / flagged AI-scene>.
- ...

## Hand-off

Build the hero asset first (<Canva/gemini for a card · capture real screens · record for storyboard>), approve it, reuse its identity across the set.
Deepen any single moment into a full asset plan with `/ideate <that moment>`.
<if --carousel: map the peak asset to the carousel's single bright/high-contrast payoff slide.>
````

Then report to the user:

```text
## Moodboard locked: <Persona/Campaign>

**File:** docs/marketing/visual-assets/moodboards/<slug>-moodboard.md
**Through-line:** <one line>
**Assets:** <N> on-brand frames (<count by type>), hero = asset <X>, peak = asset <Y>
**Lane:** <real-media / +AI-scene flagged>
**Next:** build the hero, approve it, reuse its identity. /ideate to deepen any moment.
```

---

# Go Deeper

Self-sufficient by design. Distilled + retargeted from:

- `docs/marketing/visual-assets/references/inkprint-card-system.md` — the real-media visual identity (the spine of §5/§8/§9).
- `docs/marketing/visual-assets/references/ai-scene-lane.md` — the opt-in AI mood-frame lane.
- `docs/marketing/visual-assets/references/iklipse-source/` — the directing engine (the 6-step process, composition = 50%, the angle→emotion table).
- `docs/marketing/brand/brand-guide-1-pager.md` — audience order, voice, the Real Media Rule.
- `docs/marketing/brand/BUILDOS_PROOF_AND_PRESENCE_DOCTRINE.md` — 10 ready-made real-media scene ideas (mine for moments).
- `docs/marketing/social-media/FOUNDER_CONTEXT.md` — DJ's voice + real stories.
- `.claude/commands/ideate.md` — the concept-anchored sibling (deepen any single moment).
- `gemini-imagegen` skill — text-in-image card rendering.
