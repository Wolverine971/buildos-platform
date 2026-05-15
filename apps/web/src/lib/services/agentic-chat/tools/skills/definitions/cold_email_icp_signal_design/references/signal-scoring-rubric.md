---
doc_type: skill-reference
skill: cold_email_icp_signal_design
reference: signal-scoring-rubric
visibility: internal
publish: false
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_icp_signal_design/references/signal-scoring-rubric.md
---

# Signal Scoring Rubric

Use when a segment definition is being graded for outreach readiness, or when an agent is choosing between competing signals.

A segment is approved for outreach only when it has at least one signal scoring `acceptable` or higher on the rubric below. Segments anchored on a `weak` signal are downgraded to research mode, not campaign mode.

## Layer 1 — Signal Type (Becc Holland's four-type taxonomy)

Grade the segment's primary signal by type. Higher types are stronger.

| Type          | Description                                                  | Strength | Notes                                                                     |
| ------------- | ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------- |
| Firmographic  | Industry, company size, revenue band, region, funding stage. | Weak     | Every competitor is sending the same firmographic email. Static, generic. |
| Demographic   | Role, seniority, function, tenure band.                      | Weak     | Same problem as firmographic. Add a second layer or do not send.          |
| Technographic | Tech stack, integrations, current vendor.                    | Medium   | Stronger because it implies current job-to-be-done. Still static.         |
| Trigger-based | Recent observable event tied to a buying moment.             | Strong   | Time-sensitive. Use the trigger-event sub-classifier below.               |

Compound multipliers: a Trigger-based hook on a Technographic match in a Demographic role at a Firmographic-fit account is the strongest possible cold-outreach configuration.

## Layer 2 — Trigger Sub-type (Becc Holland)

If the signal is Trigger-based, identify which sub-type:

| Sub-type    | Description                                                                                                             | Cold-outreach value                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Inbound     | Hand-raiser actions: demo request, contact-us form, pricing-page visit.                                                 | Strongest. Treat as warm.                                   |
| Postbound   | Non hand-raising marketing actions: content download, webinar attendance, newsletter click.                             | Medium. Treat as soft warm.                                 |
| Bridgebound | Public actions unrelated to your marketing: new hire, funding, public statement, conference talk, earnings, job change. | Highest cold-outreach value. Most cold campaigns live here. |

## Layer 3 — Trigger Family (Craig Elias's A/B/C)

For Bridgebound triggers, identify which family:

| Family             | What it is                             | Example                                                                                                                            |
| ------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A — Awareness      | They learned something new.            | Recently downloaded a category guide, attended a relevant event.                                                                   |
| B — Bad experience | Their current solution broke.          | Incumbent vendor lawsuit, salesperson change at the vendor (drives 28-33% of vendor changes), product end-of-life, public failure. |
| C — Change         | Internal change in the prospect's org. | New decision maker (highest leverage), new location, new priority, M&A, funding round.                                             |

Notes:

- New-in-role hires (C-trigger) are statistically more likely to be Mobilizers. Tag accordingly in the committee map.
- A single C-trigger (a job change) typically fires four opportunities: destination company, origin company, vendors of the destination, vendors of the origin.

## Layer 4 — Switching-Trigger Type (Ash Maurya)

Cross-validate the trigger against why the buyer is actually shopping:

| Type                           | Description                             | Where it surfaces in cold outreach                             |
| ------------------------------ | --------------------------------------- | -------------------------------------------------------------- |
| Bad experience trigger         | Existing solution stopped working.      | Buyer language about workarounds and pet peeves. Highest pain. |
| Change in circumstance trigger | Life or business context shifted.       | New role, new team size, new product launch.                   |
| Awareness trigger              | New information reframed the situation. | Industry report, regulatory shift, executive statement.        |

If the Holland sub-type, Elias family, and Maurya type all agree, the trigger is verified. If they conflict, the trigger is ambiguous and should be re-tested.

## Layer 5 — Signal Quality Scorecard

For the chosen signal, score on four dimensions. Each dimension is `weak (0)` / `acceptable (1)` / `strong (2)`. Sum is 0-8.

| Dimension       | Weak (0)                                            | Acceptable (1)                                        | Strong (2)                                                                              |
| --------------- | --------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Freshness       | More than 90 days old, or static.                   | Within 30-90 days.                                    | Within 30 days, or actively unfolding.                                                  |
| Reliability     | Inferred or auto-generated; unverifiable.           | Single source, manually verified.                     | Multiple sources confirm, or the prospect themselves stated it.                         |
| Pain likelihood | Speculative connection to a buying motive.          | Plausible connection to a recognized pain.            | Buyer language or behavior directly confirms the pain.                                  |
| Testability     | Reply data would be uninterpretable; mixed segment. | Reply data would be readable on a 25-50 person batch. | Reply data would be readable on a sub-25 person batch (high-conviction micro-campaign). |

Score totals:

- 0-2: Do not send. Send back to research.
- 3-4: Acceptable for low-volume experimentation only. One-variable test.
- 5-6: Approved for volume outreach.
- 7-8: High-conviction segment. Manual touch and Mafia-Offer-quality hook recommended.

## Layer 6 — Common Failure Modes

Reject the segment if any of these apply:

- **Title-match treated as timing.** "VP of Sales at SaaS companies" is not a signal. It is a filter on top of a list.
- **AI-generated personalization labeled as personalization.** Anything generated from a template prompt is relevance, not personalization. Grade it by relevance type, not personalization.
- **Compound mixed-persona campaign.** If the list includes more than one persona (e.g., VP of Sales _and_ VP of Marketing), split it. Reply data will be uninterpretable.
- **Trigger older than 90 days for a "now" pitch.** Buyers move on. A 6-month-old funding round is not a current event.
- **Inferred trigger with no source.** "We assume they are evaluating because their competitor just bought X" is speculation. Convert to a verifiable signal or drop.
- **Buying signal where you cannot articulate why this matters now.** If the agent cannot complete the sentence "We are writing because [signal] which means [pain] which means [action] is on the table this quarter," the segment is not approved.

## Layer 7 — Output Contract

When this rubric is used, return:

```yaml
signal_grade:
    primary_type: firmographic | demographic | technographic | trigger_based
    trigger_sub_type: inbound | postbound | bridgebound | null
    trigger_family: A_awareness | B_bad_experience | C_change | null
    switching_trigger_type: bad_experience | change_in_circumstance | awareness | null
    scorecard:
        freshness: 0 | 1 | 2
        reliability: 0 | 1 | 2
        pain_likelihood: 0 | 1 | 2
        testability: 0 | 1 | 2
    total: 0-8
    verdict: do_not_send | low_volume_test_only | volume_approved | high_conviction
    notes: short justification or open question
```
