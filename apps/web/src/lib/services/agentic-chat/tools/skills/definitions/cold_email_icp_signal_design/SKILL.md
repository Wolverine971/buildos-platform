---
name: Cold Email ICP and Signal Design
description: Child skill for defining the right person, right moment, segment, buying signal, timing thesis, buying committee map, and disqualifiers before cold outreach. Returns a segment definition that passes MVS, has a graded signal, and includes a committee map ready for the outreach compiler.
parent_id: cold_email_engagement_first_outreach
depth: 1
legacy_paths:
    - cold_email_outreach.icp_signal
    - cold_email_outreach.signal_design
reference_modules:
    - id: cold_email_icp_signal_design.signal_scoring_rubric
      name: Signal Scoring Rubric
      summary: Four-type relevance taxonomy, trigger sub-classifiers, and the freshness/reliability/pain/testability scorecard.
      when_to_load:
          - When grading a candidate signal for outreach approval.
          - When choosing between competing signals on the same segment.
      path: references/signal-scoring-rubric.md
      visibility: internal
    - id: cold_email_icp_signal_design.buying_committee_map
      name: Buying Committee Map
      summary: Role taxonomy (Champion, Economic Buyer, User, Blocker), Mobilizer/Talker/Blocker behavioral cut, Golden Path sequencing, and mode-specific committee shapes.
      when_to_load:
          - When approving a B2B segment that needs a stakeholder map.
          - When choosing who to write first.
          - When classifying a reply by role and deciding the next action.
      path: references/buying-committee-map.md
      visibility: internal
    - id: cold_email_icp_signal_design.segment_examples
      name: Segment Examples and Disqualifier Checklist
      summary: Weak/acceptable/strong worked examples plus the full disqualifier checklist for fit, MVS, signal, committee, stage, and persona checks.
      when_to_load:
          - When the user provides a candidate segment and needs grading.
          - When showing what good and bad segments look like.
          - When walking through the disqualifier checks.
      path: references/segment-examples.md
      visibility: internal
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_icp_signal_design/SKILL.md
---

# Cold Email ICP and Signal Design

Use this child skill when the root cold email workflow has a weak "right person" or "right moment."

The job: turn a broad target idea into one persona × one narrowing signal with a verified timing thesis, an MVS-passing segment, a buying committee map, and a disqualifier checklist — before any anchor, offer, or draft work begins.

## When to Use

- The target list is broad, mixed, or based only on job titles.
- The user cannot explain why this person should receive outreach now.
- Reply data would be hard to interpret because the segment is too noisy.
- The offer may be good, but the recipient or timing thesis is weak.
- A B2B segment has no committee map and a single-contact strategy.
- The signal is a static filter (firmographic / demographic only).

## Workflow

1. **Convert the market thesis into one persona × one narrowing signal.** Reject mixed-persona lists at this step.
2. **Score the signal** against the four-type relevance taxonomy and trigger sub-classifiers in [references/signal-scoring-rubric.md](references/signal-scoring-rubric.md). Reject signals scoring 0-2 on the four-dimension scorecard.
3. **Run the MVS check** — Common Needs, Dominability, Viability with MVP. Reject segments that fail any of the three.
4. **Identify the buying committee** using [references/buying-committee-map.md](references/buying-committee-map.md). For B2B, name Champion, Economic Buyer, User, and Blocker; choose Top-Down or Bottom-Up Golden Path; tag Mobilizer probability.
5. **Apply the six fit-type disqualifiers** (Lincoln Murphy): Technical, Functional, Resource, Competence, Experience, Cultural.
6. **Verify the switching-trigger type** (Ash Maurya): bad experience, change in circumstance, or awareness event. Cross-check against the Holland sub-type and Elias family. If they disagree, the trigger is ambiguous.
7. **Name the buyer-progress thesis** (Moesta): what struggle, current workaround, or desired progress makes this signal matter now.
8. **Tier the segment** (Mark Roberge): Green (PMF measured), Yellow (experiment only), Red (do not write). Reject Red segments. Run Yellow segments only as one-variable experiments.
9. **Run the full disqualifier checklist** in [references/segment-examples.md](references/segment-examples.md). Any single fail in Fit / MVS / Signal / Committee blocks the segment from campaign mode.
10. **Return the segment definition, signal grade, committee map, disqualifier results, and verdict.**

## Output Contract

```yaml
segment_name: string
persona: { role: string, seniority: string, tenure_band: string }
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
    total: 0-8
fit_check:
    technical: pass | fail
    functional: pass | fail
    resource: pass | fail
    competence: pass | fail
    experience: pass | fail
    cultural: pass | fail
mvs_check:
    common_needs: pass | fail
    dominability: pass | fail
    viability: pass | fail
buying_committee:
    expected_size: integer
    roles: list of role objects
    golden_path: top_down | bottom_up
    first_outreach_target: role
    mobilizer_probability: high | medium | low
disqualifiers: list of any fails from the checklist
segment_tier: green | yellow | red
verdict: do_not_send | low_volume_test_only | volume_approved | high_conviction
open_questions: list of unresolved items
offerlab_prompt: optional follow-up if the offer is still unclear
```

## Guardrails

- Do not approve a mixed-persona list.
- Do not treat title match as timing.
- Do not invent buying signals or stack inferred triggers.
- Do not declare a segment ready if reply data would be illegible on a 25-50 person batch.
- Do not approve a B2B segment without a committee map.
- Do not approve a segment with a stale (>90 days) trigger as a "now" pitch.
- Do not call decorative AI-generated openers "personalization." Grade them as relevance with the four-type taxonomy.
- Do not approve a Red-tier segment for campaign mode. Send back to PMF work.
- Do not run a campaign-mode plan on a Yellow segment — convert to a one-variable experiment.
- Do not skip the McMahon three-test on the champion role for high-value strategic outreach.

## Routing Back to the Root

When this skill returns, the root cold email workflow should pick up at the next stage:

- If the segment passes with `volume_approved` or `high_conviction`: route to `cold_email_offer_lab` (if offer is weak) or `cold_email_outreach_compiler` (if offer is ready).
- If the segment passes with `low_volume_test_only`: route to `cold_email_outreach_compiler` with mode set to single-variable experiment.
- If the segment fails: return the disqualifier results and open questions to the user. Do not pretend the segment is shippable.

## Examples

### User has a list with mixed personas

- Run the MVS check; fail Common Needs.
- Return a split proposal: separate Persona A and Persona B into two segments.
- Recommend running the strongest sub-segment first.

### User has a clear ICP but no signal

- Run the signal scorecard. Score 0-2 on every dimension.
- Verdict: `do_not_send`.
- Recommend a research pass to find a Bridgebound trigger before campaigning.

### User has a strong trigger but no committee map for a B2B segment

- Approve the signal.
- Block on committee. Return the role map template from [references/buying-committee-map.md](references/buying-committee-map.md).
- Request the committee shape before approving campaign-mode outreach.

### User has a high-conviction segment

- Approve as `high_conviction`.
- Recommend manual outreach per account, not volume automation.
- Suggest a Mafia-Offer-quality hook and Top-Down Golden Path.

## Source Lineage

This skill draws from:

- **Ash Maurya** — switching-trigger taxonomy (bad experience / change in circumstance / awareness event), job-based ICP (trigger × outcome × current solution), three-bucket interview extraction.
- **Craig Elias** — A/B/C trigger families, first-in 75% win advantage, three-event buying model, monitoring surfaces.
- **Becc Holland** — four-type relevance taxonomy (firmographic / demographic / technographic / trigger-based), three trigger sub-types (inbound / postbound / bridgebound), "send to two people" test.
- **Lincoln Murphy** — seven ICP dimensions (Ready / Willing / Able / Success Potential / Acquisition / Ascension / Advocacy), six fit types.
- **Mark Roberge** — Leading Indicator of Retention formula, Green/Yellow/Red segment tiering, Quality × Engagement grid.
- **Underscore VC / Michael Skok** — Minimum Viable Segment (Common Needs / Dominability / Viability).
- **30MPC + Brent Adamson + John McMahon + Gartner** — buying committee map, Golden Path, Mobilizer/Talker/Blocker, McMahon Champion test, 6.8-buyer committee data.
- **Jen Abel** — no-mid-market rule, tier-1 logos as early adopters, discounting as inverted disqualifier signal.
- **April Dunford** — alternatives-naming, trade-off-led positioning as input to segment definition.
- **Bob Moesta** — buyer progress, struggling moments, current workaround, and demand-side timing.
- **Rob Fitzpatrick** — false-positive avoidance and past-behavior evidence for research-mode outreach.

Full provenance is in the source analyses under `apps/web/src/content/blogs/source-analyses/` and the root [source-map.md](../cold_email_engagement_first_outreach/references/source-map.md).
