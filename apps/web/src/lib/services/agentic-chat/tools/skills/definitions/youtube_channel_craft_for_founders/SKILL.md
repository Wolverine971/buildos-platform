---
skill_id: youtube-channel-craft-for-founders
name: YouTube Channel Craft For Founders
description: Diagnose and grow a founder-led YouTube channel at the channel level — "grow my YouTube channel", "why aren't my videos getting views", "help with my titles and thumbnails", "what videos should I make next", "how often should I upload", "channel strategy". Covers packaging (title + thumbnail as one unit), phase-appropriate strategy, format and series design, upload cadence vs quality, channel positioning, and analytics-driven iteration. Not for single-video hooks or scripts — those route to the hook and script sibling skills.
skill_type: strategy # procedure | strategy | reference | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
categories:
    - marketing-and-content
preserve_markdown: true
legacy_paths:
    - youtube-channel-craft-for-founders
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/youtube_channel_craft_for_founders/SKILL.md
---

# YouTube Channel Craft For Founders

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Examples → Provenance.
  This file is skill_type: strategy (secondary flavors: procedure — the channel-audit workflow — and policy —
  the phase-gate and benchmark refusals). Judgment carries the decision spine (principles, three-phase gate,
  packaging rubric, idea funnel, positioning frameworks); Procedure is the ordered channel-audit workflow with
  routing pulled out into Routing.
-->

## Identity

Use this skill when the optimization unit is the **channel**, not the video. The sibling skills make one video better (hook, script, story); this skill decides what the channel is, which phase it is in, what its packaging discipline looks like, and which 3 videos to ship next. The two governing facts: **packaging returns are non-linear** (a 20% better title/thumbnail can produce 2x–100x more views — Galloway), and **strategy is phase-gated** (applying optimization tactics to a channel that hasn't done its reps wastes years — Galloway's three phases).

This is a **strategy** skill at **domain** altitude; the dominant verb is _decide_ (phase classification, idea-funnel filters, packaging heuristics, positioning). It carries a secondary procedure (the channel-audit workflow) and a secondary policy layer (the phase-gate and benchmark refusals), but it is one coherent channel-level skill, not a split.

## Activation

- "Why aren't my videos getting views?" — diagnose a channel from described analytics or a list of recent videos.
- Audit titles + thumbnails as packaging units (concepts, drafts, or published videos).
- Decide what the channel _is_: positioning, recurring format, series design, tagline.
- Choose upload cadence and the volume-vs-quality tradeoff for the channel's current phase.
- Plan a founder's first videos or the next 3 videos to ship.
- Run the idea funnel: turn a topic list into ranked 1-page ideas.
- Decide when to broaden the channel's topic and when to stay narrow.

Do **not** use this skill to write or polish the first 5 seconds of one video (`hook_craft_short_form`), structure one script end-to-end (`viral_video_script_structure`), fix a flat narrative (`story_driven_content_craft`), choose between platforms or score a single piece for ship/kill (`algorithm_aware_publishing`), or set content strategy above the channel — content games, cross-platform identity (`content_strategy_beyond_blogging`). Full ownership map in **Routing**.

## Judgment

### Core Principles

1. **Packaging is non-linear.** Better title → higher CTR → more impressions → compounding algorithmic distribution. A 20% better title can mean 2x–100x views. Budget at least **30–40% of total effort** on packaging (most creators spend ~5%). (Galloway)
2. **The channel is phase-gated.** Phase 1 = reps, Phase 2 = strategy, Phase 3 = optimization. Tactics applied out of phase are wasted or harmful. Always classify phase before recommending anything.
3. **CCN fit caps the ceiling.** A video that only works for Core viewers caps at the existing niche audience. Core + Casual + New unlocks the rest of YouTube. (Galloway)
4. **Lessons are commodity; your relationship to the lessons is the moat.** A founder channel competes on POV, not information. If the videos are interchangeable with the experts they cite, there is no channel. (Colin & Samir / Jerome)
5. **Volume buys data, not identity.** Reps deliver growth; positioning delivers a brand. 1,200 videos without a one-sentence identity is a plateau, not a strategy. (Jerome case)
6. **Word of mouth beats algorithm hacks.** If a fan can't describe the channel in one sentence over coffee, the positioning isn't tight enough. (Colin & Samir)
7. **There is no meta.** Long slow essays and fast-cut retention videos thrive simultaneously. Pick the format that fits the founder's identity, then apply CCN and packaging discipline to it. Never prescribe MrBeast-grade production to a founder. (Galloway)
8. **Start narrow, expand outward — never reverse.** Monkey-bar into adjacent niches once the narrow audience is real. Broad → narrow loses the audience you trained. (Galloway)

### The Three-Phase Model (classify first, always)

| Phase                 | Trigger                                      | What to do                                                                                               | What to refuse                                                                                                                  |
| --------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Establishment** | Fewer than **30–50 published videos**        | Consistency only: **1–2 videos/week**, build editing/thumbnail/storytelling reps, make what calls to you | Refuse analytics deep-dives, A/B packaging programs, niche-TAM agonizing. Allow only the lightweight packaging checklist below. |
| **2 — Improvement**   | 30–50+ videos published consistently         | Layer in strategy: idea funnel, Identity × Emotion × Action, series design, retention-curve reading      | Refuse heavy per-video optimization rituals that slow cadence below weekly                                                      |
| **3 — Optimization**  | Consistent cadence + Phase 2 systems running | Analytics-driven iteration: outlier study, first-hour CTR tracking, packaging A/B, TAM expansion         | Refuse format pivots driven by one video's data                                                                                 |

**Phase-gate rule:** when a user in Phase 1 asks for Phase 3 work ("optimize my CTR", "deep analytics audit"), name the phase, explain the gate, deliver the phase-appropriate version instead (e.g. the packaging checklist, not an optimization program). This is the skill's most important refusal.

### Packaging: Title + Thumbnail As One Unit

Title and thumbnail are one decision, evaluated together against the same idea. Run every concept through this checklist:

1. **Thumbnail-first filter.** If you cannot sketch the thumbnail before filming, the idea isn't ready. "You don't have an amazing idea then." Kill or repackage. (Galloway viral-trait 3)
2. **Glance test.** Viewers decide in **under one second**. Anything that requires reading, decoding, or context fails. (Galloway)
3. **3-element rule.** Maximum **1–3 visual elements** (face, one prop, one short text). More = clutter = glance-test fail. (Galloway)
4. **Exaggerate one element.** Keep the design simple but exaggerate exactly one thing — contrast, scale, expression, shine. Zero exaggeration doesn't stop the scroll; two crosses into clickbait. (Galloway)
5. **CCN title test.** Would a New viewer (the "would my mom click this?" test) understand the title and want to click? Core-only titles ("Brain dump → context tree workflow in BuildOS") cap the video; universal titles ("How I run a one-person startup without losing my mind") don't.
6. **One storyline.** The title/thumbnail promises exactly one storyline — the most universal one. Multiple value-props stacked into one package means the viewer can't choose what to care about. Drip the rest inside the video. (Colin & Samir)
7. **No misleading gap.** The exaggerated element must be true to the video's payoff. Curiosity gap yes, bait-and-switch no.
8. **Time-box.** Packaging gets **1–2 hours max** per video. Overthinking past that is a named small-creator failure. (Galloway)

Verdict per concept: **SHIP / FIX (name the failing check) / KILL (can't be thumbnailed or Core-only with no repackage)**.

### The Idea Funnel (what to make next)

Inputs from three sources: **Internal** (what worked on this channel), **External** (what worked for competitors / adjacent niches), **Innovation** (new approaches). Then five elimination filters, in order:

1. CCN fit?
2. Feasible to execute at this founder's production level?
3. Can you write the title + sketch the thumbnail right now?
4. Is the founder genuinely excited? (Test on a "YouTube council" of 2–3 peers if unsure.)
5. Survivors → **1-page ideas**: working title, thumbnail sketch (described in words), logline, 1–3 reasons it works.

Batch ~10 one-page ideas (1–2 hours of work), gather feedback, ship the top 3–4. The 1-page idea is the cheap artifact that prevents the expensive mistake (filming a video that fails CCN).

### Format, Series, and Channel Positioning

- **Identity × Emotion × Action worksheet** (Colin & Samir) — run it at the channel level, then per video: _Who is watching? What should they feel? What should they do?_ If the last 5 videos return scattered answers, the positioning is scattered — that's the diagnosis, not the packaging.
- **Decentralized sitcom.** Viewers return for the personality they bonded with, not the information. Make the founder a character with stakes; make recurring collaborators/customers recurring characters.
- **Knock-them-off-the-list series structure.** Give the audience a visible mission with a finite list (experts to learn from, problems to solve, milestones to hit) and knock one off per video. Each episode plants the next ("how do I get to X?").
- **Stakes before skill.** Before showing the founder doing the impressive thing, seed why it matters and what's at risk — otherwise a demo is just a demo.
- **The tagline mechanic.** Bake the one-sentence identity into a repeated phrase that closes every video. It trains viewers and word-of-mouth on what the channel stands for.
- **Future-headline exercise.** "What headline does [relevant publication] write about this founder in 12 months?" Reverse-engineer the channel from that line.
- **Production floor, not ceiling (Phase 1).** Phone + plug-in mic + recut method (pause silently holding eye contact, cut silences in post) + **re-shoot the intro at the end when warm** is enough. Candor outperforms studio polish for founder channels; escalate per-video talk-to-camera craft to `viral_video_script_structure`. (Oren John)
- **Broaden vs narrow:** stay on the narrow starting niche until it's clearly won, then monkey-bar to the adjacent niche. Diagnose "started broad, now narrowing" as a positioning error to correct by re-anchoring narrow.

## Procedure

Ordered channel-audit sequence. Routed steps carry a `→` marker and state intent only; _who owns each escalated layer is declared once in **Routing**, never re-taught here._

1. **Inventory.** List the videos (or last ~10): titles, thumbnail descriptions, views, upload dates. Note total published count and cadence.
2. **Classify phase** from the table above. State it. Gate every later recommendation on it.
3. **Packaging audit.** Run the 8-point checklist on the 3–5 most recent packaging units. Verdict each: SHIP / FIX / KILL.
4. **CCN audit.** Tag each recent video Core-only / Core+Casual / CCN. A channel that is >80% Core-only has found its growth cap.
5. **Identity audit.** Run Identity × Emotion × Action across the recent videos; run the word-of-mouth one-sentence test; check for a tagline and a visible series mission. Scattered answers → positioning diagnosis.
6. **Analytics read (Phase 2+ only).** Apply the outlier method to the best- and worst-performing videos; check first-hour CTR habits. In Phase 1, skip and say why.
7. **Prescribe.** Cadence call for the phase, one positioning fix, and the **next 3 videos** as 1-page ideas from the idea funnel.
8. **Escalate per-video work** by name. → `hook_craft_short_form`, `viral_video_script_structure`, `story_driven_content_craft`, `algorithm_aware_publishing` — see **Routing** for which layer each owns.

## Routing

Escalation is by **tag, not load** — name the sibling, don't inline its work. One concept, one owner; this skill retains the channel level and routes every per-video and above-channel layer.

| Concern (what to escalate)                                             | Owner (who)                        |
| ---------------------------------------------------------------------- | ---------------------------------- |
| Per-video hooks / first seconds                                        | `hook_craft_short_form`            |
| Script structure                                                       | `viral_video_script_structure`     |
| Narrative / retention shape inside a draft                             | `story_driven_content_craft`       |
| Platform choice, topic discipline, ship/kill scoring, brand dual-audit | `algorithm_aware_publishing`       |
| Strategy above the channel (content games, cross-platform)             | `content_strategy_beyond_blogging` |

## Contract

Return, in order:

- **Phase:** 1/2/3 + evidence (video count, cadence) + any phase-gate refusal applied
- **Packaging audit:** per concept — failing/passing checks by name, verdict SHIP / FIX / KILL
- **CCN read:** per-video tags + Core-only ratio + what it caps
- **Positioning:** Identity × Emotion × Action answers, one-sentence word-of-mouth description, tagline candidate, series/format recommendation
- **Cadence call:** uploads/week for the current phase and the production floor that makes it sustainable
- **Next 3 videos:** 1-page idea stubs (working title, thumbnail described in words, logline, 1–3 reasons it works)
- **Analytics watchlist:** what to measure next, each item labeled _sourced_ or _internal default — unsourced_
- **Escalations:** named sibling skills for any per-video work surfaced

Stop conditions: do not write hooks or scripts; do not produce more than 3 next-video ideas in full; do not output an analytics program for a Phase 1 channel.

## Policy

- **Phase gate (primary refusal):** refuse Phase 2/3 tactics for a Phase 1 channel (< 30–50 videos). Name the phase, deliver the phase-appropriate substitute.
- **Never quote absolute CTR/AVD benchmarks as fact.** They are unsourced here; give channel-relative rules and label any absolute number "internal default — unsourced".
- **No manufactured vulnerability.** Structure honest stakes into the video; never invent a sob story. (Colin & Samir)
- **No MrBeast-ification.** Do not prescribe production upgrades, trend-chasing, or "the meta" to a founder channel; format follows identity.
- **No misleading packaging.** Exaggerate one element, but the promise must match the payoff.
- For BuildOS-owned channels, the anti-AI "lead with relief" stance applies: titles promise relief and stakes, not AI features.

## Knowledge

**Analytics-Driven Iteration.** (This is the skill's largest declarative block and a reference-extraction candidate once `youtube_channel_diagnostics` is acquired — see Provenance.)

**Sourced rules** [practitioner — Paddy Galloway]:

- **First-hour (to first-24h) CTR is the only strongly predictive CTR window.** Track it religiously; ignore lifetime CTR after week one — it naturally decays as impressions broaden. (Galloway) [practitioner]
- **Outlier comparison method.** To learn from data, compare two same-niche videos with very different views and check, in order: concept novelty (borrowed from another niche?), demographics shift, device type (TV behaves differently), new-vs-returning ratio, view trajectory (spike vs build), traffic sources (search vs recommended vs external). Data narrows the hypothesis; taste completes it. [practitioner]
- **TAM check (4 steps):** search the niche → filter out Shorts → sort by views → read the top-10 ceiling. If the ceiling is 1M+, the market exists and the constraint is execution. Use this to retire "my niche is too small." [practitioner]

**Internal defaults — UNSOURCED, label them as such when used** [internal-default]: absolute CTR bands (e.g. "browse CTR 4–8% is healthy") and average-view-duration bands (e.g. "≥40% AVD at midpoint") are **not** in this skill's source stack. If the user asks for them, give relative rules instead (compare each video against the channel's own median; investigate >2x deviations via the outlier method) and say the absolute bands are internal defaults pending sourced diagnostics. **Named acquisition gap:** `youtube_channel_diagnostics` (retention-curve reading, CTR/AVD benchmarks, A/B thumbnail testing — Tier 2 of the gap plan; Tom from Spotter / vidIQ / Creator Insider sources queued).

## Examples

**Task:** "I'm a dev-tool founder. 14 videos in 6 months, all under 300 views except one at 2.1K. Why isn't my channel growing? Should I be optimizing my CTR?" Recent titles: "v0.4 changelog walkthrough", "Setting up our CLI with Docker", "Why we switched our queue architecture", "I quit my FAANG job to build a terminal tool (here's month 6)" (the 2.1K one), "Schema migrations deep dive".

**Output (contract shape):**

- **Phase:** 1 — Establishment (14 videos < 30–50 threshold; cadence ~0.5/week, below the 1–2/week floor). **Phase gate applied:** declining the CTR-optimization ask — that is Phase 3 work; at 14 videos the lever is reps and packaging hygiene, not analytics. (Sourced: Galloway three-phase model.)
- **Packaging audit (3 most recent):**
    - "v0.4 changelog walkthrough" — Glance test FAIL (no idea what/why), CCN: Core-only, one-storyline N/A. Verdict: KILL as packaging; the content can live inside a CCN-framed video.
    - "Schema migrations deep dive" — Thumbnail-first filter FAIL (nothing to sketch but a diagram), CCN: Core-only. Verdict: FIX — repackage as a story ("The database mistake that cost me a weekend").
    - "I quit my FAANG job to build a terminal tool (month 6)" — Glance test PASS, CCN: Core+Casual+New, one storyline, exaggerable element = founder's face + "month 6" text. Verdict: SHIP. **This outlier is the channel's signal:** the only CCN-fit package is the only video that traveled (internal/external/innovation funnel input: Internal).
- **CCN ratio:** 4/5 recent videos Core-only → ceiling = current niche audience. (Sourced: CCN framework.)
- **Identity audit:** Identity × Emotion × Action returns scattered answers (changelog viewers ≠ journey followers). Word-of-mouth test FAILS — no one-sentence description exists. Proposed sentence: "A FAANG engineer documenting whether a one-person dev tool can beat the giants." Tagline candidate to close every video: "Still building."
- **Cadence call:** 1/week minimum, lower production bar (talk-to-camera + screen capture, recut method, re-shoot intro at the end) to make weekly sustainable through video 30–50.
- **Next 3 videos (1-page idea stubs):**
    1. _"Month 7: my terminal tool made its first $1,000 (or didn't)"_ — thumbnail: face + phone showing a number; works because it continues the proven journey storyline (CCN pass).
    2. _"I asked 5 staff engineers to break my tool"_ — thumbnail: founder + one reviewer mid-grimace; knock-them-off-the-list series seed (list the 5 on screen, one per episode).
    3. _"Why I turned down a $150K consulting offer to keep building"_ — thumbnail: face + crossed-out number; stakes-before-skill, universal storyline.
- **Analytics watchlist:** none yet — Phase 1. From video ~30 on: first-hour CTR per upload (sourced) and outlier comparison vs channel median (sourced). Absolute CTR/AVD bands: not provided — unsourced; pending `youtube_channel_diagnostics`.
- **Escalations:** opening seconds of video #1 → `hook_craft_short_form`; full script for the "5 staff engineers" episode → `viral_video_script_structure`.

## Provenance

- **Sources:** Paddy Galloway [practitioner] — YouTube packaging strategy (CCN, TAM, phases, packaging non-linearity, idea funnel, first-hour CTR, broaden-vs-narrow) — `docs/marketing/growth/research/youtube-transcripts/2026-04-29-paddy-galloway-youtube-packaging-ANALYSIS.md`. Colin & Samir / Jerome (Creator Support, 1,200 videos) [practitioner] — identity vs volume, Identity × Emotion × Action, one-storyline, word-of-mouth test, tagline, series-mission, stakes — `docs/marketing/growth/research/youtube-transcripts/2026-04-25-jerome-creator-support-1200-videos-ANALYSIS.md`. Oren John (Art of Yapping) [practitioner] — Phase 1 production floor: recut method, re-shoot intro, candor over polish — `docs/marketing/growth/research/youtube-transcripts/2026-04-27-art-of-yapping-talking-on-video-ANALYSIS.md`.
- **Honestly thin:** retention-curve diagnostics (reading drop points), absolute CTR/AVD benchmark bands, and thumbnail A/B testing procedure are not covered by the source stack. Named acquisition gap: `youtube_channel_diagnostics` (gap plan Tier 2 row 13 — Tom from Spotter, vidIQ/Creator Science packaging episodes, YouTube Creator Insider queued). Do not pad these areas; route or label.
- **Canonical origin:** combo index row "YouTube channel craft for founders" in `docs/research/youtube-library/skill-combo-indexes/MARKETING_AND_CONTENT.md` + the three analyses above. No docs skill-draft mirror exists; this runtime file is canonical.
- **Maintainer:** drafted 2026-06-11 under `AUTHORING_GUIDE.md` (first skill born under the guide). Enrich with Tier 2 diagnostics sources when acquired; re-run evals after enrichment.
