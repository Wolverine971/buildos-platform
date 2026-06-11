---
name: Growth Diagnostics For Stalled Products
description: >-
    Root skill for diagnosing stalled SaaS, subscription, marketplace, or product-led growth with an ordered five-layer framework — logo churn and the growth ceiling, pricing and positioning, expansion and net revenue retention, channel saturation, and whether growth is still the goal. Use when growth has slowed or plateaued, new marketing or feature work is not moving revenue, or a founder, PM, or marketer needs the highest-leverage growth constraint identified before proposing tactics.
preserve_markdown: true
legacy_paths:
    - growth-diagnostics-for-stalled-products
    - docs/research/youtube-library/skill-drafts/growth-diagnostics-for-stalled-products/SKILL.md
reference_modules:
    - id: growth_diagnostics_for_stalled_products.diagnostic_layers
      name: Diagnostic Layers (1–5)
      summary: Threshold-bearing checks for all five layers — the growth-ceiling formula, churn-timing windows, cancellation research rules, pricing-as-positioning checks, the customer-value filter, channel-saturation evidence rules, the adjacency rule, and the end-state decision options.
      when_to_load:
          - When executing the diagnostic, before producing findings for any layer.
          - When the user's concern is churn, cancellations, pricing, expansion/NRR, channel decay, or whether to keep growing at all.
      path: references/diagnostic-layers.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/growth_diagnostics_for_stalled_products/SKILL.md
---

# Growth Diagnostics For Stalled Products

Use this skill when growth has slowed, plateaued, or become harder despite continued product and marketing effort. The discipline this skill enforces is **ordering**: diagnose the constraint layer by layer, and do not skip to acquisition, experiments, or new features until earlier constraints have been checked. The first broken layer usually makes later work low leverage.

The deep checks live in the reference module. The skill body holds the diagnostic sequence, the output contract, and the guardrails; load the reference before producing findings.

## When to Use

- Diagnose stalled SaaS, subscription, marketplace, or product-led growth.
- Find why new marketing or feature work is not moving revenue.
- Audit retention, cancellation, activation, pricing, expansion, or channel saturation.
- Decide whether to keep pushing growth, optimize for profit, build a second product, sell, or stop.
- Turn vague growth advice into a prioritized operating plan.

Do not use this skill for one-off campaign copy, early idea validation before any customers exist, or mature experimentation programs that already have trustworthy retention, pricing, NRR, and channel diagnostics.

## Workflow

1. Preflight. Confirm the product has real customers and enough history to diagnose: new customers per month, monthly cancellation rate, when cancellations happen, current pricing, and the dominant acquisition channel. Ask for whatever is missing rather than guessing — absent data is itself a finding.
2. Load `growth_diagnostics_for_stalled_products.diagnostic_layers` before producing findings for any layer.
3. Layer 1 — Check logo churn first. Calculate the growth ceiling, inspect churn timing and raw cancellation reasons per the reference rules. When the signal is unclear, prioritize onboarding: early churn is usually the most expensive churn because acquisition cost has been spent and value was never realized.
4. Layer 2 — Diagnose pricing and positioning. Treat pricing as positioning, not a separate monetization knob; check whether the current price accidentally selects the wrong market.
5. Layer 3 — Test expansion and customer value. Evaluate NRR (or the closest equivalent) and run every expansion, pricing, and feature proposal through the customer-value filter in the reference.
6. Layer 4 — Audit channel saturation. Apply the evidence rules and the adjacency rule from the reference. If the team cannot name which channels are saturated, assume the current channel portfolio is saturated until proven otherwise.
7. Layer 5 — Decide whether growth is still the goal. Separate the business question from the founder question.
8. Name the first broken layer as the highest-priority constraint. Still give every later layer a brief assessment (or an explicit "insufficient evidence") so the output covers the full stack.
9. Assemble the diagnosis using the Output contract below, ending with the next 3 to 5 actions in order.

## Output

Return:

- current growth ceiling calculation
- highest-priority broken layer
- evidence reviewed and evidence still missing
- retention and cancellation fixes
- pricing and positioning diagnosis
- expansion or NRR-equivalent opportunities
- channel saturation assessment
- recommendation on whether to pursue growth, profit, second product, sale, or maintenance
- next 3 to 5 actions in order

Stop conditions before returning: every layer has either a finding or an explicit "insufficient evidence" note; the highest-priority broken layer is named once, not hedged across layers; the next actions are ordered and attack the broken layer first.

## Guardrails

- Do not start with acquisition if churn or activation is broken.
- Do not use A/B testing to resolve strategy, market, positioning, or product-value problems.
- Do not trust tiny A/B wins without scale, holdouts, and long-term rechecks.
- Do not summarize cancellation data without preserving the specific raw details that make it actionable.
- Do not call a channel unsaturated without evidence.
- Do not treat investor pressure as proof that growth is required.
- Do not propose expansion that harms customer value.
- Do not recommend a price increase without naming the new buyer expectations it creates.
- Do not produce layer findings or the final diagnosis without loading the reference module first.

## Notes

- Reference module: `growth_diagnostics_for_stalled_products.diagnostic_layers` (all five layers' checks).
- Primary source: Jason Cohen (WP Engine) on Lenny's Podcast, "The surprising advice from a founder who built 2 unicorns."
- Maintainers: the canonical research draft lives at `docs/research/youtube-library/skill-drafts/growth-diagnostics-for-stalled-products/` (not available at runtime).
