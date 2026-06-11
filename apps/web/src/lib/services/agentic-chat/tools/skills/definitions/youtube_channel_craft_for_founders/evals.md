<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/youtube_channel_craft_for_founders/evals.md -->

# Evals — youtube_channel_craft_for_founders

Golden tasks per `../../EVALS_GUIDE.md`. This skill has no reference modules — Run B gets the full SKILL.md only.

---

## Task 1 — Channel diagnosis from described analytics (exercises the phase-gate refusal)

### Task prompt

> My YouTube channel isn't growing and I want a serious data-driven optimization plan — CTR targets, retention benchmarks, the works.
>
> Context: I'm a solo founder of a bookkeeping SaaS for freelancers. I've published **11 videos in 8 months**. Views: most sit between 80 and 250. One video hit **3.4K**. Lifetime CTR across the channel is 2.9% according to YouTube Studio.
>
> Recent videos (title — what the thumbnail shows):
>
> 1. "Quarterly reconciliation workflow update" — screenshot of the app's ledger screen
> 2. "New invoice tagging feature demo" — app UI with an arrow
> 3. "I left my accounting firm to build software for freelancers (8 months in)" — my face + "8 MONTHS" text — *this is the 3.4K one*
> 4. "Webhooks + Stripe payout matching explained" — a flow diagram
> 5. "Freelancer tax categories deep dive" — a spreadsheet
>
> What CTR and average view duration should I be targeting, and what should I optimize first?

### Delta markers

1. **M1 (phase classification):** Explicitly classifies the channel as **Phase 1 — Establishment**, citing the 30–50 video threshold against the 11 published (and/or the sub-weekly cadence).
2. **M2 (phase-gate refusal):** Declines the requested CTR/retention optimization program *because of the phase*, names the gate, and substitutes phase-appropriate work (consistency + packaging checklist). Building the requested benchmark/optimization plan anyway is a guardrail miss — record it explicitly.
3. **M3 (unsourced-benchmark guardrail):** Does NOT assert absolute CTR or AVD target bands as fact; any absolute number given is labeled an internal default / unsourced, with channel-relative comparison (vs channel median / outlier method) offered instead.
4. **M4 (first-hour CTR rule):** States that lifetime CTR (the 2.9%) is not the metric to read — CTR is predictive only in the first hour/first 24 hours and decays as impressions broaden.
5. **M5 (CCN tagging):** Tags the listed videos for CCN fit, identifying videos 1, 2, 4, 5 as Core-only and video 3 as the CCN-fit outlier, and states the Core-only ratio caps the ceiling at the existing niche audience.
6. **M6 (packaging checklist by name):** Audits at least 2 packaging units against named checks from the checklist (glance test, 3-element rule, thumbnail-first filter, one-storyline, exaggerate-one-element) with per-concept verdicts SHIP / FIX / KILL.
7. **M7 (outlier read):** Treats the 3.4K video as the channel's internal signal (journey/identity storyline travels; feature demos don't) — an Internal input to the idea funnel, not a fluke.
8. **M8 (identity audit):** Runs Identity × Emotion × Action and/or the word-of-mouth one-sentence test, and proposes a one-sentence channel description (and/or tagline candidate).
9. **M9 (next 3 videos):** Recommends exactly 3 next videos as 1-page idea stubs — working title + thumbnail described in words + reason it works — not a generic topic list.
10. **M10 (cadence call):** Makes an explicit uploads-per-week call (1–2/week for Phase 1) with a production-floor note that makes it sustainable.
11. **M11 (output contract):** Output follows the `## Output` shape: Phase → Packaging audit → CCN read → Positioning → Cadence → Next 3 videos → Analytics watchlist (with sourced / internal-default labels) → Escalations.
12. **M12 (honest negative — no sibling poaching):** Does NOT write hooks or scripts for the proposed videos; per-video work is escalated by name (`hook_craft_short_form` / `viral_video_script_structure`).

### Expected load path

- `skill_load(youtube_channel_craft_for_founders, full)` — the phase table, 8-point packaging checklist, analytics rules, and Worked Example live outside the short-format parsed sections; `short` loses the phase gate and the checklist.
- References: none exist; zero `skill_reference_load` calls.
- Should NOT load: `hook_craft_short_form`, `viral_video_script_structure`, `algorithm_aware_publishing` — the ask is channel-level diagnosis.

### Discovery probe

"My YouTube channel isn't growing — why aren't my videos getting views?" → catalog description matches on "why aren't my videos getting views", "grow my YouTube channel", channel-level diagnosis.

---

## Task 2 — Packaging audit of 3 title/thumbnail concepts

### Task prompt

> I'm planning my next batch of YouTube videos (I run a meal-prep coaching business, ~60 videos published, weekly uploads for over a year). Before I film anything, can you review these three title + thumbnail concepts and tell me which to make?
>
> **Concept A**
> Title: "My complete 2026 meal prep system: batch cooking, macro tracking, grocery automation, and how I meal prep for a family of 5 on $120/week"
> Thumbnail: me in the kitchen, 6 labeled containers, a grocery receipt close-up, a macro-tracking app screenshot, text "FULL SYSTEM 2026"
>
> **Concept B**
> Title: "Mise en place principles for thermal efficiency in batch protein preparation"
> Thumbnail: overhead shot of raw chicken breasts on a cutting board
>
> **Concept C**
> Title: "I meal prepped like a Michelin chef for a week (it broke me)"
> Thumbnail: my exhausted face + one plated dish, text "DAY 7"

### Delta markers

1. **M1 (phase classification first):** Classifies the channel as Phase 2+ (60 videos, consistent weekly cadence) before auditing — strategy-level work is in-phase, so no refusal fires.
2. **M2 (title + thumbnail as one unit):** Each concept is audited as a single packaging unit (title and thumbnail evaluated against the same promise), not as two separate review lists.
3. **M3 (one-storyline / 3-element fail on A):** Concept A is failed on the **one-storyline rule** (4+ stacked value-props in the title) AND the **3-element rule / glance test** (5 visual elements), with verdict FIX and a single-storyline repackage proposed.
4. **M4 (CCN / glance fail on B):** Concept B is failed as **Core-only** (jargon title a New viewer can't parse — the "would my mom click this" test) and/or glance-test fail, with verdict FIX or KILL and a universal repackage of the same content proposed.
5. **M5 (SHIP on C with named checks):** Concept C passes with named checks — glance test, one storyline, CCN fit, exaggerate-one-element (exhausted face / "DAY 7") — verdict SHIP.
6. **M6 (no-misleading guardrail):** Flags that Concept C's exaggeration ("it broke me") must match the video's actual payoff — curiosity gap yes, bait-and-switch no.
7. **M7 (thumbnail-first filter cited):** Applies or cites the thumbnail-first filter ("if you can't sketch the thumbnail, the idea isn't ready") somewhere in the audit — e.g., noting Concept B barely has a sketchable concept.
8. **M8 (time-box rule):** Advises time-boxing packaging work to 1–2 hours per video / against overthinking iterations.
9. **M9 (packaging non-linearity cited):** Justifies the audit's importance with the non-linear returns claim (a ~20% better title/thumbnail can mean a multiple — up to 100x — of views) and/or the 30–40% effort-on-packaging budget.
10. **M10 (output contract):** Per-concept verdicts use the SHIP / FIX / KILL vocabulary, and the response includes next-step ordering (which to make first) consistent with the `## Output` shape.
11. **M11 (honest negative — scope discipline):** Does NOT rewrite spoken hooks, script outlines, or retention beats for the chosen concept; if mentioned, that work is routed to `hook_craft_short_form` / `viral_video_script_structure` by name.
12. **M12 (honest negative — no benchmark invention):** Does NOT quote absolute CTR benchmarks the concepts "should" hit; any forward metric talk is first-hour CTR vs channel median, or labeled internal default.

### Expected load path

- `skill_load(youtube_channel_craft_for_founders, full)` — the 8-point packaging checklist and SHIP/FIX/KILL contract are outside the short-format sections.
- References: none; zero reference loads.
- Should NOT load: `hook_craft_short_form` — the ask is packaging, not opening seconds; `going_viral` — not a per-piece virality ask.

### Discovery probe

"Can you review my YouTube title and thumbnail ideas before I film?" → catalog description matches on "help with my titles and thumbnails", "packaging (title + thumbnail as one unit)", "what videos should I make next".

---

## Results log

<!-- Append per EVALS_GUIDE.md. Template: -->
<!--
### YYYY-MM-DD — Task N — performer: <model>, judge: <model>
| Marker | A (without) | B (with) |
| --- | --- | --- |
| M1 | miss | hit |
Verdict: STRONG/WEAK/NO DELTA. Load path: as expected / deviations. Discovery probe: pass/fail.
Notes:
-->

2026-06-11 — Skill drafted; Worked Example in SKILL.md manufactured in the Task 1 shape (Phase-1 dev-tool channel) and self-checked against the output contract. No with/without run executed yet — run after registry wiring.

### 2026-06-12 — Task 1 — BLIND A/B (the owed pair; prior wave-2 entry was a with-skill self-check) — performer (with/without) + blind judge: claude-opus-4-8 (workflow subagents)

| Marker | without | with |
| --- | --- | --- |
| M1 | miss | hit |
| M2 | miss | hit |
| M3 | miss | hit |
| M4 | miss | hit |
| M5 | miss | hit |
| M6 | miss | hit |
| M7 | hit | hit |
| M8 | miss | hit |
| M9 | miss | hit |
| M10 | miss | hit |
| M11 | miss | hit |
| M12 | miss | hit |

Verdict: **STRONG DELTA**. With-skill hit 12/12 markers; gap over no-skill = 11 markers. Refusal missed by skill run: False.
Load path (expected, not re-tested this run): skill_load(youtube_channel_craft_for_founders, full) — the phase table, 8-point packaging checklist, analytics rules, and Worked Example live outside the short-format parsed sections; short loses the phase gate and the checklist. References: none exist; zero skill_reference_load calls. Should NOT load: hook_craft_short_form, viral_video_script_structure, algorithm_aware_publishing — the ask is channel-level diagnosis.
Notes: Output Y is the skill run: hits all 12 markers including both guardrail/refusal markers (phase-gate decline M2, no absolute CTR/AVD bands M3) and the full output contract M11. Output X is the no-skill run: it complies with the user's literal request and hands over the exact CTR/AVD benchmark program (2.9%→5-7% CTR, 40-50% AVD, 70% retention) as fact — a clean miss on M2/M3/M4 — and uses none of the named framework (no Phase classification, no CCN, no checklist verdicts). X's only hit (M7) is incidental — it correctly reads the 3.4K video as signal not luck. Gap is 11 markers; the likely skill output (Y) missed no guardrail markers.
