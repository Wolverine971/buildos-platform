---
name: Cold Email ICP and Signal Design
description: Child skill for defining the right person, right moment, segment, buying signal, timing thesis, buying committee map, and disqualifiers before cold outreach. Returns a persona×signal×reason-now row, a graded signal scorecard, disqualifier kill-list results, and a committee map ready for the outreach compiler.
skill_type: strategy # procedure | reference | strategy | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
parent_id: cold_email_engagement_first_outreach
depth: 1
preserve_markdown: true
legacy_paths:
    - cold_email_outreach.icp_signal
    - cold_email_outreach.signal_design
reference_modules:
    - id: cold_email_icp_signal_design.public_campaign_gate
      name: Public Campaign Gate
      summary: Portable public checklist for approving or rejecting a cold-outreach segment before any email is written.
      when_to_load:
          - When using the portable bundle outside BuildOS.
          - When a target segment, timing signal, or buying committee map needs a fast public-facing approval gate.
      path: references/public-campaign-gate.md
      visibility: public
    - id: cold_email_icp_signal_design.signal_scoring_rubric
      name: Signal Taxonomy Deep-Dive
      summary: Trigger sub-classifiers behind the inline scorecard — Holland inbound/postbound/bridgebound sub-types, Elias A/B/C trigger families, Maurya switching-trigger types, the three-taxonomy cross-validation rule, and compound-relevance multipliers.
      when_to_load:
          - When the primary signal is trigger-based and needs sub-classification before scoring.
          - When two candidate signals on the same segment compete and the inline scorecard ties.
          - When a trigger is ambiguous and the Holland/Elias/Maurya cross-check must be run.
      path: references/signal-scoring-rubric.md
      visibility: internal
    - id: cold_email_icp_signal_design.buying_committee_map
      name: Buying Committee Map
      summary: Consolidated role map table (Champion, Economic Buyer, User, Blocker × what each email leads with), Mobilizer/Talker/Blocker behavioral cut, the six 30MPC multithreading rules, Golden Path sequencing, and mode-specific committee shapes.
      when_to_load:
          - When approving a multi-stakeholder B2B segment that needs a stakeholder map (skip for single-stakeholder modes — founder-to-founder, recruiting, PR, customer research).
          - When choosing who to write first in a committee.
          - When classifying a reply by role and deciding the next action.
      path: references/buying-committee-map.md
      visibility: internal
    - id: cold_email_icp_signal_design.segment_examples
      name: Segment Examples
      summary: Weak / acceptable / strong worked segment examples in full output-contract shape, each annotated with why it passes or fails.
      when_to_load:
          - When the user provides a candidate segment and wants it compared against graded examples.
          - When showing what good and bad segments look like.
      path: references/segment-examples.md
      visibility: internal
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_icp_signal_design/SKILL.md
---

# Cold Email ICP and Signal Design

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Examples → Provenance.
  skill_type: strategy — the weight is in Judgment (the signal scorecard + disqualifier kill-list are the decision
  spine). It also carries a strong procedural runbook (secondary: procedure). The Persona × Signal × Reason-Now
  schema is stable declarative grounding → Knowledge. Volatile deep-dives (signal taxonomy, buying-committee map,
  segment examples) already live in the reference modules, each self-provenanced.
-->

## Identity

This is a **strategy** skill at **domain** altitude (secondary: a procedural runbook): it supplies the decision
criteria — the graded signal scorecard, disqualifier kill-lists, and segment tiering — for qualifying a
cold-outreach segment before any draft work, while its Procedure sequences those decisions and its reference
modules hold the deep taxonomies.

The job: turn a broad target idea into one persona × one narrowing signal with a verified timing thesis, an MVS-passing segment, a buying committee map, and a clean disqualifier run — before any anchor, offer, or draft work begins. Every approved segment ships the four artifacts named in the output contract.

## Activation

Use this child skill when the root cold email workflow has a weak "right person" or "right moment."

- The target list is broad, mixed, or based only on job titles.
- The user cannot explain why this person should receive outreach now.
- Reply data would be hard to interpret because the segment is too noisy.
- The offer may be good, but the recipient or timing thesis is weak.
- A B2B segment has no committee map and a single-contact strategy.
- The signal is a static filter (firmographic / demographic only).

## Judgment

The decision spine. When the Procedure branches, this is what you reason with.

### Signal Scoring Rubric

Score the row's signal before any list-building. Two layers: type strength, then the four-dimension scorecard.

**Layer 1 — type strength** (Becc Holland's four-type relevance taxonomy; rank order is practitioner consensus, not experimental):

| Signal type                | Strength | Rule                                                                           |
| -------------------------- | -------- | ------------------------------------------------------------------------------ |
| Firmographic / Demographic | Weak     | A filter, not a signal. Alone it never passes — add a layer or do not send.    |
| Technographic              | Medium   | Implies a current job-to-be-done; still static.                                |
| Trigger-based              | Strong   | Time-sensitive. Sub-classify via the signal taxonomy reference before scoring. |

**Layer 2 — scorecard.** Score each dimension 0 / 1 / 2; total is 0–8. (Score bands and day windows are internal defaults, not sourced thresholds.)

| Dimension       | 0 — weak                                  | 1 — acceptable                      | 2 — strong                                                         |
| --------------- | ----------------------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| Freshness       | >90 days old, or static                   | Within 30–90 days                   | Within 30 days, or actively unfolding                              |
| Reliability     | Inferred or auto-generated; unverifiable  | Single source, manually verified    | Multiple sources confirm, or the prospect themselves stated it     |
| Pain likelihood | Speculative connection to a buying motive | Plausible link to a recognized pain | Buyer language or behavior directly confirms the pain              |
| Testability     | Reply data uninterpretable; mixed segment | Readable on a 25–50 person batch    | Readable on a sub-25 person batch (high-conviction micro-campaign) |

**Threshold rule: total must be ≥ 5 before list-building begins** (internal default). Verdict bands:

- 0–2 → `do_not_send`. Back to research.
- 3–4 → `low_volume_test_only`. One-variable experiment, no list-building beyond the test batch.
- 5–6 → `volume_approved`. List-building may begin.
- 7–8 → `high_conviction`. Manual per-account outreach and a Mafia-Offer-quality hook; do not waste it on volume automation.

### Disqualifier Kill-List

Binary kill-questions. Run every candidate segment through both tables after scoring.

**Hard kills — any NO blocks campaign mode and returns the segment to research:**

| #   | Group     | Kill question (answer YES to survive)                                                                                   |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Fit       | Does their tech stack support the product (or an integration path)? (Murphy: technical fit)                             |
| 2   | Fit       | Does the product solve their actual job-to-be-done? (functional fit)                                                    |
| 3   | Fit       | Do they have the time, headcount, and budget to deploy? (resource fit)                                                  |
| 4   | Fit       | Does their team have the skills to use the product correctly? (competence fit)                                          |
| 5   | Fit       | Do they know what good looks like in this category — not a first-time buyer judging on wrong criteria? (experience fit) |
| 6   | Fit       | Does how they work match how the product works? (cultural fit)                                                          |
| 7   | MVS       | Do the segment's customers share one single dominant need?                                                              |
| 8   | MVS       | Is the segment small enough to dominate, not just serve?                                                                |
| 9   | MVS       | Can the current product serve the segment without divergent customization?                                              |
| 10  | Signal    | Is the signal more than a firmographic or demographic filter?                                                           |
| 11  | Signal    | Is the signal fresh — within 90 days (internal default)?                                                                |
| 12  | Signal    | Is the signal verifiable from at least one external source?                                                             |
| 13  | Signal    | Does the signal have a plausible link to a recognized pain?                                                             |
| 14  | Signal    | Will reply data from this segment be interpretable on a 25–50 person batch?                                             |
| 15  | Committee | Is the committee size estimable from segment data? (B2B only)                                                           |
| 16  | Committee | Is there at least one identifiable champion role?                                                                       |
| 17  | Committee | Is McMahon's three-test (power + personal win + will fight for you) plausible for that champion role?                   |
| 18  | Committee | Is the likely Blocker named, not ignored?                                                                               |
| 19  | Committee | Is a mode-appropriate Golden Path chosen (Top-Down or Bottom-Up)?                                                       |

**Downgrades — any NO converts the campaign to a low-volume, one-variable experiment with explicit notes:**

| #   | Group   | Question (answer YES to keep campaign mode)                                                                 |
| --- | ------- | ----------------------------------------------------------------------------------------------------------- |
| 20  | Stage   | Is an LIR target defined for the segment — "P% of customers achieve E events every T days" (Roberge)?       |
| 21  | Stage   | Is the segment tier named, and is it Green? (Yellow → experiment only; Red → hard kill, return to PMF work) |
| 22  | Abel    | Is the segment cleanly SMB-shaped or enterprise-shaped — no "mid-market" framing?                           |
| 23  | Abel    | If enterprise ACV, is the pricing assumption at least $75–150k landed (Jen Abel)?                           |
| 24  | Persona | Does the segment lead with a switching trigger and desired outcome rather than demographics (Maurya)?       |
| 25  | Persona | Are the current solution and its pet peeves / workarounds / struggling moments named?                       |

## Procedure

1. **Fill one row of the `## Persona × Signal × Reason-Now Schema` below.** One persona, one narrowing signal, one reason-now sentence. Reject mixed-persona lists at this step — a second persona or second signal is a second row, which is a separate campaign.
2. **Score the signal with the inline `## Signal Scoring Rubric`.** If the signal is trigger-based, or two candidate signals compete, load `cold_email_icp_signal_design.signal_scoring_rubric` to sub-classify (Holland sub-type, Elias family, Maurya switching type) before scoring. Do not start list-building below a total of 5.
3. **Run the MVS check** — Common Needs, Dominability, Viability with MVP (Underscore VC / Skok). Reject segments that fail any of the three.
4. **Map the buying committee.** For multi-stakeholder B2B, load `cold_email_icp_signal_design.buying_committee_map` and return the role map table: Champion, Economic Buyer, User, Blocker, Adamson class tags, Golden Path, first outreach target. For single-stakeholder modes (founder-to-founder, recruiting, PR, customer research) use the collapsed shapes in that reference's mode table — no full map needed.
5. **Verify the timing thesis.** Cross-check the trigger with the three-taxonomy rule in the signal taxonomy reference (Holland sub-type vs Elias family vs Maurya switching type). If they disagree, the trigger is ambiguous — re-test before approving.
6. **Name the buyer-progress thesis** (Moesta): what struggle, current workaround, or desired progress makes this signal matter now. This is the substance behind the reason-now column.
7. **Tier the segment** (Mark Roberge): Green (PMF measured), Yellow (experiment only), Red (do not write). Reject Red segments. Run Yellow segments only as one-variable experiments.
8. **Run the inline `## Disqualifier Kill-List`.** Any NO in the hard-kill table blocks campaign mode and sends the segment back to research. Any NO in the downgrade table converts the campaign to a low-volume one-variable experiment.
9. **Return the four artifacts and the verdict** per the output contract: persona×signal×reason-now row, signal scorecard, kill-list results, committee map.

## Routing

When this skill returns, the root cold email workflow should pick up at the next stage:

- If the segment passes with `volume_approved` or `high_conviction`: route to `cold_email_offer_lab` (if offer is weak) or `cold_email_outreach_compiler` (if offer is ready).
- If the segment passes with `low_volume_test_only`: route to `cold_email_outreach_compiler` with mode set to single-variable experiment.
- If the segment fails: return the kill-list results and open questions to the user. Do not pretend the segment is shippable.

## Contract

Deliverables — every approved segment returns all four artifacts: (1) the completed persona×signal×reason-now row, (2) the signal scorecard with total and verdict, (3) the disqualifier kill-list results, (4) the buying committee map (full for multi-stakeholder B2B; collapsed shape otherwise).

```yaml
persona_signal_reason_now:
    persona: { role: string, seniority: string, tenure_band: string }
    signal: one observable event + source + date
    reason_now: '[signal] means [pain] means [action] is on the table this quarter'
segment_name: string
company_filters: list of strings
signal:
    description: string
    source: at least one verifiable external source
    type: firmographic | demographic | technographic | trigger_based
    trigger_sub_type: inbound | postbound | bridgebound | null
    trigger_family: A_awareness | B_bad_experience | C_change | null
    switching_trigger_type: bad_experience | change_in_circumstance | awareness | null
    freshness_days: integer
    why_now: one-sentence thesis linking signal → pain → buying motion
buyer_progress_thesis: current struggle or workaround this signal suggests
signal_scorecard:
    freshness: 0 | 1 | 2
    reliability: 0 | 1 | 2
    pain_likelihood: 0 | 1 | 2
    testability: 0 | 1 | 2
    total: 0-8 (must be >= 5 before list-building)
kill_list:
    hard_kill_fails: list of failed question numbers (empty = pass)
    downgrade_fails: list of failed question numbers
mvs_check:
    common_needs: pass | fail
    dominability: pass | fail
    viability: pass | fail
buying_committee:
    expected_size: integer
    roles: list of role objects (champion | economic_buyer | user | blocker, with adamson_class tags)
    golden_path: top_down | bottom_up
    first_outreach_target: role
    mobilizer_probability: high | medium | low
segment_tier: green | yellow | red
verdict: do_not_send | low_volume_test_only | volume_approved | high_conviction
open_questions: list of unresolved items
offerlab_prompt: optional follow-up if the offer is still unclear
```

Stop conditions: stop and return immediately when (a) the persona×signal×reason-now row cannot be completed, (b) the scorecard total is ≤ 2, or (c) any hard-kill question fails — do not continue polishing a dead segment.

## Policy

- Do not approve a mixed-persona list.
- Do not treat title match as timing.
- Do not invent buying signals or stack inferred triggers.
- Do not start list-building below a scorecard total of 5.
- Do not declare a segment ready if reply data would be illegible on a 25-50 person batch.
- Do not approve a multi-stakeholder B2B segment without a committee map.
- Do not approve a segment with a stale (>90 days) trigger as a "now" pitch.
- Do not call decorative AI-generated openers "personalization." Grade them as relevance with the four-type taxonomy.
- Do not approve a Red-tier segment for campaign mode. Send back to PMF work.
- Do not run a campaign-mode plan on a Yellow segment — convert to a one-variable experiment.
- Do not skip the McMahon three-test on the champion role for high-value strategic outreach.

## Knowledge

### Persona × Signal × Reason-Now Schema

The skill's core deliverable. Fill in one row per campaign — one row = one campaign, always.

Template (every cell is required; an empty cell blocks the segment):

| Column     | Fill in                                                                                     | Validity rule                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Persona    | One role + seniority + tenure band + company filters                                        | More than one persona → split into separate rows/campaigns.                                                         |
| Signal     | One observable event + at least one verifiable external source + date observed              | No verifiable source → row invalid. Static filters (industry, title) are not signals.                               |
| Reason-Now | Complete the sentence: "[signal] means [pain] means [action] is on the table this quarter." | If the sentence cannot be completed honestly, the segment is not approved. No stacked inferences (one hop maximum). |

Completed example row:

| Persona                                                                         | Signal                                                                                                               | Reason-Now                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CTO, hired in last 30–60 days, at Series A B2B SaaS, 30–150 employees, US-based | CTO joined within the last 30–60 days — source: LinkedIn job-change notification + press release, observed this week | New-in-role exec window (~70% of budget spent in first 100 days — Florin Tatulea, practitioner data) means they are auditing the stack with a political mandate, so a tooling change is on the table this quarter. |

## Examples

### User has a list with mixed personas

- The persona×signal×reason-now schema rejects the row at step 1; MVS fails Common Needs.
- Return a split proposal: separate Persona A and Persona B into two rows / two segments.
- Recommend running the strongest sub-segment first.

### User has a clear ICP but no signal

- Run the inline scorecard. Score 0-2 on every dimension.
- Verdict: `do_not_send`.
- Recommend a research pass to find a Bridgebound trigger before campaigning.

### User has a strong trigger but no committee map for a B2B segment

- Approve the signal.
- Block on kill-list questions 15-19. Return the role map table from [references/buying-committee-map.md](references/buying-committee-map.md).
- Request the committee shape before approving campaign-mode outreach.

### User has a high-conviction segment

- Scorecard totals 7-8; approve as `high_conviction`.
- Recommend manual outreach per account, not volume automation.
- Suggest a Mafia-Offer-quality hook and Top-Down Golden Path.

## Provenance

This skill draws from:

- `[PRIMARY]` **Ash Maurya** — switching-trigger taxonomy (bad experience / change in circumstance / awareness event), job-based ICP (trigger × outcome × current solution), three-bucket interview extraction.
- `[PRIMARY]` **Craig Elias** — A/B/C trigger families, first-in 75% win advantage, three-event buying model, monitoring surfaces.
- `[PRIMARY]` **Becc Holland** — four-type relevance taxonomy (firmographic / demographic / technographic / trigger-based), three trigger sub-types (inbound / postbound / bridgebound), "send to two people" test.
- `[PRIMARY]` **Lincoln Murphy** — seven ICP dimensions (Ready / Willing / Able / Success Potential / Acquisition / Ascension / Advocacy), six fit types.
- `[PRIMARY]` **Mark Roberge** — Leading Indicator of Retention formula, Green/Yellow/Red segment tiering, Quality × Engagement grid.
- `[PRIMARY]` **Underscore VC / Michael Skok** — Minimum Viable Segment (Common Needs / Dominability / Viability).
- `[PRIMARY]` **30MPC + Brent Adamson + John McMahon + Gartner** — buying committee map, Golden Path, Mobilizer/Talker/Blocker, McMahon Champion test, 6.8-buyer committee data.
- `[PRIMARY]` **Jen Abel** — no-mid-market rule, tier-1 logos as early adopters, discounting as inverted disqualifier signal.
- `[PRIMARY]` **April Dunford** — alternatives-naming, trade-off-led positioning as input to segment definition.
- `[PRIMARY]` **Bob Moesta** — buyer progress, struggling moments, current workaround, and demand-side timing.
- `[PRIMARY]` **Rob Fitzpatrick** — false-positive avoidance and past-behavior evidence for research-mode outreach.

Scorecard point bands, the ≥5 list-building threshold, and freshness day-windows are internal defaults (assembled, not sourced). `[internal-default]` Full provenance is in the source analyses under `apps/web/src/content/blogs/source-analyses/` and the root [source-map.md](../cold_email_engagement_first_outreach/references/source-map.md).
