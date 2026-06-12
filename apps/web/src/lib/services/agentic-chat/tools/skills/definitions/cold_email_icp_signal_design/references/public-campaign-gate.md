<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_icp_signal_design/references/public-campaign-gate.md -->

# Public Campaign Gate

Use this compact gate when the full BuildOS runtime references are unavailable. It decides whether a cold-outreach segment deserves drafting.

## Required Inputs

- One persona: role, seniority, tenure band, company filters.
- One signal: observable event, date observed, source URL or source note.
- One reason-now sentence: "`[signal]` means `[pain]`, so `[action]` is on the table this quarter."
- One committee shape: single stakeholder, founder-to-founder, or multi-stakeholder B2B.

## Pass Conditions

- The segment has one persona and one signal. Mixed personas or stacked signals become separate campaigns.
- The signal is fresh enough to explain timing, not just static firmographic fit.
- The signal can be verified from at least one source.
- Reply data from a 25-50 person test would be interpretable.
- The product can serve the segment without special-case customization.
- For multi-stakeholder B2B, the likely champion, economic buyer, user, and blocker are named.

## Reject Conditions

- The recipient is only a title on a list.
- The "why now" relies on more than one inference hop.
- The signal is a generic industry, job title, company size, or tech-stack filter with no timing event.
- The buying committee is ignored for a product that requires committee agreement.
- The campaign would produce ambiguous learning if replies are weak.

## Output

Return:

1. `verdict`: `approved`, `test_only`, or `reject`.
2. Persona x signal x reason-now row.
3. Signal score: freshness, reliability, pain likelihood, testability.
4. Committee shape and first outreach target.
5. Disqualifiers that blocked or downgraded the campaign.
