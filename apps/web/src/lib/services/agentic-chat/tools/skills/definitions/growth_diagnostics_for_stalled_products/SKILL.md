---
name: Growth Diagnostics For Stalled Products
catalog_line: 'Diagnose stalled SaaS or product growth with an ordered five-layer framework before proposing tactics.'
description: >-
    Root skill for diagnosing stalled SaaS, subscription, marketplace, or product-led growth with an ordered five-layer framework — logo churn and the growth ceiling, pricing and positioning, expansion and net revenue retention, channel saturation, and whether growth is still the goal. Use when growth has slowed or plateaued, new marketing or feature work is not moving revenue, or a founder, PM, or marketer needs the highest-leverage growth constraint identified before proposing tactics.
skill_type: procedure # procedure | reference | strategy | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
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

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Contract → Policy → Examples → Provenance.
  This file is skill_type: procedure. Procedure carries the weight (the ordered five-layer diagnostic);
  the threshold-bearing checks live in the reference module (`diagnostic_layers`), loaded before findings.
  Blocks not used here (Routing, Knowledge, Related Tools) are omitted: this is a standalone root with no
  sibling dependencies, and all durable declarative grounding lives in the reference module.
-->

## Identity

Ordered diagnostic for stalled SaaS, subscription, marketplace, or product-led growth, structured as a five-layer framework — logo churn and the growth ceiling, pricing and positioning, expansion and net revenue retention, channel saturation, and whether growth is still the goal. This is a **procedure** skill at **domain** altitude.

The deep checks live in the reference module. The skill body holds the diagnostic sequence, the output contract, and the guardrails; load the reference before producing findings.

## Activation

- Diagnose stalled SaaS, subscription, marketplace, or product-led growth.
- Find why new marketing or feature work is not moving revenue.
- Audit retention, cancellation, activation, pricing, expansion, or channel saturation.
- Decide whether to keep pushing growth, optimize for profit, build a second product, sell, or stop.
- Turn vague growth advice into a prioritized operating plan.

Do not use this skill for one-off campaign copy, early idea validation before any customers exist, or mature experimentation programs that already have trustworthy retention, pricing, NRR, and channel diagnostics.

## Judgment

Use this skill when growth has slowed, plateaued, or become harder despite continued product and marketing effort. The discipline this skill enforces is **ordering**: diagnose the constraint layer by layer, and do not skip to acquisition, experiments, or new features until earlier constraints have been checked. The first broken layer usually makes later work low leverage.

## Procedure

1. Preflight. Confirm the product has real customers and enough history to diagnose: new customers per month, monthly cancellation rate, when cancellations happen, current pricing, and the dominant acquisition channel. Ask for whatever is missing rather than guessing — absent data is itself a finding.
2. Load `growth_diagnostics_for_stalled_products.diagnostic_layers` before producing findings for any layer.
3. Layer 1 — Check logo churn first. Calculate the growth ceiling, inspect churn timing and raw cancellation reasons per the reference rules. When the signal is unclear, prioritize onboarding: early churn is usually the most expensive churn because acquisition cost has been spent and value was never realized.
4. Layer 2 — Diagnose pricing and positioning. Treat pricing as positioning, not a separate monetization knob; check whether the current price accidentally selects the wrong market.
5. Layer 3 — Test expansion and customer value. Evaluate NRR (or the closest equivalent) and run every expansion, pricing, and feature proposal through the customer-value filter in the reference.
6. Layer 4 — Audit channel saturation. Apply the evidence rules and the adjacency rule from the reference. If the team cannot name which channels are saturated, assume the current channel portfolio is saturated until proven otherwise.
7. Layer 5 — Decide whether growth is still the goal. Separate the business question from the founder question.
8. Name the first broken layer as the highest-priority constraint. Still give every later layer a brief assessment (or an explicit "insufficient evidence") so the output covers the full stack.
9. Assemble the diagnosis using the Output contract below, ending with the next 3 to 5 actions in order.

## Contract

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

## Policy

- Do not start with acquisition if churn or activation is broken.
- Do not use A/B testing to resolve strategy, market, positioning, or product-value problems.
- Do not trust tiny A/B wins without scale, holdouts, and long-term rechecks.
- Do not summarize cancellation data without preserving the specific raw details that make it actionable.
- Do not call a channel unsaturated without evidence.
- Do not treat investor pressure as proof that growth is required.
- Do not propose expansion that harms customer value.
- Do not recommend a price increase without naming the new buyer expectations it creates.
- Do not produce layer findings or the final diagnosis without loading the reference module first.

## Examples

Condensed from a full five-layer diagnosis of a field-service-scheduling SaaS stuck at $40k MRR for 9 months; the input is in `evals.md` Task 1. Match this shape and rigor.

**Input (summary):** $49/month single flat plan, self-serve, ~810 customers. ~57 new customers/month (70% Google Ads, 25% SEO, 5% referral; Google CAC up $180 → $310 in 12 months). Monthly logo churn 7%; ~60% of cancellations inside the first 30 days. Exit survey is a fixed dropdown; top answer "too expensive" (45%). No seats, add-ons, or annual plan — NRR ≈ 93%. Team is shipping features and pushing for influencer marketing and a second pricing tier.

**Growth ceiling (compute first):**

```text
maximum customer base = new customers/month ÷ monthly cancellation rate
                      = 57 ÷ 0.07 ≈ 814 customers ≈ $39.9k MRR at $49
```

They have ~810 customers. The plateau is not a marketing mystery — it is the ceiling, reached. At this churn rate, 10% more leads moves the ceiling to ~$44k and sticks again; no acquisition tactic changes the asymptote.

**Layer 1 — Logo churn: BROKEN (binding constraint).** 7% monthly churn with 60% of cancellations inside 30 days is an activation/onboarding failure — the most expensive churn, because CAC (now $310) is fully spent and value was never realized. The 45% "too expensive" dropdown answer is not accepted at face value: a fixed dropdown with a price option harvests its own confirmation. Required research: free-form "**What made you cancel?**" (not "why"); read raw responses before deciding what to fix; cluster themes but keep customer IDs and links to originals; inspect the delta between customers who reached first value and those with missing setup data or zero activity.

**Layer 2 — Pricing/positioning: suspect, second order.** $49 flat is positioning, not just a price: it selects price-sensitive small operators who churn easily and signals thin support. A higher tier may open a steadier market — but only with the new buyer expectations named (onboarding help, support promise, possibly integrations). Do not ship the second tier as a churn band-aid before Layer 1 research says which promise is failing.

**Layer 3 — Expansion/NRR: missing counterweight.** NRR ≈ 93% with zero expansion paths means churn has no offset that scales with the installed base. Candidate paths — crew/seat pricing, SMS-dispatch add-on, annual plans — each must pass the filter: _"Is this actually good for the customer, or only good for us?"_ An annual-plan discount fails the filter today: with 60% of churn inside 30 days it locks in customers who haven't reached first value. Sequence it after activation is fixed.

**Layer 4 — Channels: saturating, not the constraint.** CAC climbing $180 → $310 on the 70% channel is saturation evidence. But fixing acquisition while 60% of new customers churn in 30 days pours more into the leak. When the time comes, apply the adjacency rule — one foot in an existing strength (SEO content, field-service vocabulary), the other into buyer-native routes (trade associations, equipment dealers, bookkeepers who serve contractors). Influencer marketing is a pure greenfield move with no asset advantage: declined.

**Layer 5 — Is growth still the goal?** Insufficient evidence on founder intent. Note the separation: the business question (a ~$40k plateau can be a fine profit engine) is distinct from the founder question (needing a new challenge). Revisit after Layers 1–3 move.

**Verdict — highest-priority broken layer: Layer 1 (early churn / onboarding).** Evidence still missing: free-form cancellation responses, an activation-step funnel, cohort churn by signup month.

**Next actions, in order:**

1. Define first value and instrument the first-30-day journey; measure how many customers reach it.
2. Replace the dropdown exit survey with free-form "What made you cancel?"; read 50 raw responses before fixing anything.
3. Rebuild onboarding around the failure points found (target 7% → 4–5% monthly churn ⇒ ceiling ≈ 1,140–1,425 customers ≈ $56–70k MRR with zero new marketing).
4. Add one expansion path that passes the customer-value filter (likely crew seats; annual plans only after activation is fixed).
5. Only then revisit channels: hold Google Ads spend at current CAC; no influencer spend.

## Provenance

- Reference module: `growth_diagnostics_for_stalled_products.diagnostic_layers` (all five layers' checks).
- **PRIMARY** — Jason Cohen (WP Engine) on Lenny's Podcast, "The surprising advice from a founder who built 2 unicorns."
- **internal-default** — Maintainers: the canonical research draft lives at `docs/research/youtube-library/skill-drafts/growth-diagnostics-for-stalled-products/` (not available at runtime).
