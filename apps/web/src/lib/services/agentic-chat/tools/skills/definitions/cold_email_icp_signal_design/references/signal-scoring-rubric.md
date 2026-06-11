---
doc_type: skill-reference
skill: cold_email_icp_signal_design
reference: signal-scoring-rubric
visibility: internal
publish: false
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_icp_signal_design/references/signal-scoring-rubric.md
---

# Signal Taxonomy Deep-Dive

Load when the primary signal is trigger-based and needs sub-classification, when two candidate signals on the same segment compete and the inline scorecard ties, or when a trigger is ambiguous and needs the three-taxonomy cross-check.

The four-dimension scorecard, the 0–8 point bands, and the **≥ 5 before list-building** threshold live inline in the shell (`## Signal Scoring Rubric`) — they are not repeated here. This reference carries the classification machinery that feeds those scores.

## Layer 1 — Signal Type (Becc Holland's four-type taxonomy)

Grade the segment's primary signal by type. Higher types are stronger. (Rank order is practitioner consensus, not experimental data.)

| Type          | Description                                                  | Strength | Notes                                                                     |
| ------------- | ------------------------------------------------------------ | -------- | ------------------------------------------------------------------------- |
| Firmographic  | Industry, company size, revenue band, region, funding stage. | Weak     | Every competitor is sending the same firmographic email. Static, generic. |
| Demographic   | Role, seniority, function, tenure band.                      | Weak     | Same problem as firmographic. Add a second layer or do not send.          |
| Technographic | Tech stack, integrations, current vendor.                    | Medium   | Stronger because it implies current job-to-be-done. Still static.         |
| Trigger-based | Recent observable event tied to a buying moment.             | Strong   | Time-sensitive. Use the trigger-event sub-classifier below.               |

Compound multipliers: a Trigger-based hook on a Technographic match in a Demographic role at a Firmographic-fit account is the strongest possible cold-outreach configuration. When two candidate signals tie on the inline scorecard, prefer the one that compounds more layers.

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
| B — Bad experience | Their current solution broke.          | Incumbent vendor lawsuit, salesperson change at the vendor (drives 28-33% of vendor changes — Elias, practitioner-grade), product end-of-life, public failure. |
| C — Change         | Internal change in the prospect's org. | New decision maker (highest leverage), new location, new priority, M&A, funding round.                                             |

Notes:

- New-in-role hires (C-trigger) are statistically more likely to be Mobilizers. Tag accordingly in the committee map.
- A single C-trigger (a job change) typically fires four opportunities: destination company, origin company, vendors of the destination, vendors of the origin.
- The first vendor in — before the buyer finishes defining the problem — wins roughly 75% of the time (Elias, practitioner-grade). Freshness is the whole game for C-triggers.

## Layer 4 — Switching-Trigger Type (Ash Maurya)

Cross-validate the trigger against why the buyer is actually shopping:

| Type                           | Description                             | Where it surfaces in cold outreach                             |
| ------------------------------ | --------------------------------------- | -------------------------------------------------------------- |
| Bad experience trigger         | Existing solution stopped working.      | Buyer language about workarounds and pet peeves. Highest pain. |
| Change in circumstance trigger | Life or business context shifted.       | New role, new team size, new product launch.                   |
| Awareness trigger              | New information reframed the situation. | Industry report, regulatory shift, executive statement.        |

## The Cross-Validation Rule

If the Holland sub-type, Elias family, and Maurya type all agree (e.g., Bridgebound + C-change + change-in-circumstance), the trigger is verified — score it on the inline scorecard with confidence.

If they conflict (e.g., the signal looks Bridgebound but the Maurya read says the buyer is shopping from a bad experience the signal doesn't capture), the trigger is ambiguous: cap reliability at 1 on the inline scorecard and add the disagreement to `open_questions`. Re-test before campaign mode.

## Return

Classification feeds the shell's output contract fields directly: `signal.type`, `signal.trigger_sub_type`, `signal.trigger_family`, `signal.switching_trigger_type`. Scoring, verdict bands, and the list-building threshold are applied in the shell.
