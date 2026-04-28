---
name: growth-diagnostics-for-stalled-products
description: Diagnose stalled SaaS or product growth with an ordered retention, pricing, expansion, channel, and strategic-growth framework. Use when a founder, PM, marketer, or agent needs to find the highest-leverage growth constraint before proposing tactics.
---

# Growth Diagnostics For Stalled Products

Use this skill when growth has slowed, plateaued, or become harder despite continued product and marketing effort. The agent must diagnose the constraint in order. Do not skip to acquisition, experiments, or new features until earlier constraints have been checked.

## When to Use

- Diagnose stalled SaaS, subscription, marketplace, or product-led growth
- Find why new marketing or feature work is not moving revenue
- Audit retention, cancellation, activation, pricing, expansion, or channel saturation
- Decide whether to keep pushing growth, optimize for profit, build a second product, sell, or stop
- Turn vague growth advice into a prioritized operating plan

Do not use this skill for one-off campaign copy, early idea validation before any customers exist, or mature experimentation programs that already have trustworthy retention, pricing, NRR, and channel diagnostics.

## Diagnostic Order

Work through these questions in order. The first broken layer usually makes later work low leverage.

1. Are customers leaving?
2. Is pricing and positioning correct?
3. Are existing customers growing in value?
4. Are acquisition channels saturated?
5. Do you actually need to keep growing this product?

## 1. Check Logo Churn First

Calculate the growth ceiling:

```text
maximum customer base = new customers per month / monthly cancellation rate
```

Example: 100 new customers per month with 5% monthly cancellation creates a hard ceiling near 2,000 customers. The larger the customer base gets, the larger the cancellation count gets. Marketing flow does not automatically grow with the customer base, so churn eventually overpowers acquisition.

Inspect:

- Monthly logo churn and cohort churn
- When cancellations happen: first week, first 30 days, first 60 days, first 90 days
- Cancellation reasons with raw responses, not only summaries
- Negative reviews, bad word of mouth, support escalations, inactive accounts, missing setup data, and customers who never reached first value
- The delta between successful customers and failed customers, not only traits shared by good customers

Cancellation research rules:

- Ask "What made you cancel?" instead of "Why did you cancel?"
- Prefer free-form responses over fixed dropdowns.
- Randomize dropdown choices if they must exist.
- Do not accept "too expensive" at face value. Ask what changed after purchase or what promise failed.
- Use AI to cluster themes, then require specific details, customer IDs, and links to original responses.
- Read raw responses yourself before deciding what to fix.

When the signal is unclear, prioritize onboarding. Early churn is usually the most expensive churn because acquisition cost has been spent and value was never realized.

## 2. Diagnose Pricing And Positioning

Treat pricing as positioning, not a separate monetization knob. The price, pricing metric, packaging, buyer, support promise, proof burden, and market segment all move together.

Check whether the current price accidentally selects the wrong market:

- A price that is too low can exclude serious buyers by signaling weak quality, weak support, or lack of maturity.
- Raising price can open a new market instead of simply lowering demand.
- A higher-priced market may require SOC 2, governance, integrations, procurement support, services, reliability, and different sales motions.
- The lower market may still be the right market if that is where the product's real differentiation matters.

Reframe value around what the buyer already wants more of:

- Prefer growth, revenue, market share, retention, risk reduction, or competitive advantage.
- Be careful with "saves time" or "cuts cost" positioning because savings cap willingness to pay.
- Ask what outcome the CEO, owner, or budget holder already values enough to fund.

Do not recommend a price increase without naming the new buyer expectations it creates.

## 3. Test Expansion And Customer Value

Expansion revenue is the mechanical counterweight to churn because it can scale with the customer base. New acquisition usually scales with marketing effort, not with installed base.

Evaluate:

- Net revenue retention or the closest equivalent
- Expansion paths: usage growth, seats, accounts, add-ons, services, premium support, second products, referrals, or customer-led acquisition
- Whether the product creates more value for the customer over time
- Whether the company has a trustworthy customer-value metric or at least interview-backed proxies

Use this filter for every expansion, pricing, and feature proposal:

```text
Is this actually good for the customer, or only good for us?
```

Reject plans that only improve internal metrics. Expansion should split newly created customer value, not extract value from a trapped customer.

## 4. Audit Channel Saturation

Assume every acquisition channel eventually decays. The curve is not a clean S-curve; channels often rise, plateau, then decline as audiences saturate, algorithms change, economics worsen, or the channel itself weakens.

Ask:

- Which channel currently drives most growth?
- Which channels are clearly saturated, still compounding, or unknown?
- What evidence proves a channel is unsaturated?
- Are small secondary channels distracting from the one channel that matters?
- Is the team trying to compensate for saturated distribution with more features?

If the team cannot name which channels are saturated, assume the current channel portfolio is saturated until proven otherwise.

For new channels, look for non-obvious but buyer-native routes:

- Partners, agencies, consultants, communities, workshops, creators, events, marketplaces, or embedded workflows
- Channels where the buyer already seeks help
- Motions that look unscalable at first but create trust or access competitors lack

Use the adjacency rule for new channels, markets, and products:

```text
Keep one foot planted in an existing strength, and move the other foot into the risky bet.
```

Avoid pure greenfield moves with no asset advantage and pure adjacent moves with no meaningful upside.

## 5. Decide Whether Growth Is Still The Goal

If retention, pricing, expansion, and channel saturation have all been honestly addressed, ask whether the product needs to keep growing.

Possible decisions:

- Optimize for profit, dividends, or cash flow instead of revenue growth.
- Optimize for mission, craft, team learning, or customer depth.
- Build a second product for the same market.
- Sell, sunset, or maintain the product.
- Accept a natural ceiling and stop treating it as failure.

Separate the business question from the founder question. The business may be fine at a plateau while the builder needs a new challenge.

## Guardrails

- Do not start with acquisition if churn or activation is broken.
- Do not use A/B testing to resolve strategy, market, positioning, or product-value problems.
- Do not trust tiny A/B wins without scale, holdouts, and long-term rechecks.
- Do not summarize cancellation data without preserving the specific raw details that make it actionable.
- Do not call a channel unsaturated without evidence.
- Do not treat investor pressure as proof that growth is required.
- Do not propose expansion that harms customer value.

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

## Source Attribution

Distilled from Jason Cohen's Lenny's Podcast episode, [The surprising advice from a founder who built 2 unicorns](https://www.youtube.com/watch?v=8xLquwfx6p0). Local source transcript and analysis live in `docs/marketing/growth/research/youtube-transcripts/2026-04-27-jason-cohen-wp-engine-2-unicorns-advice.md` and `docs/marketing/growth/research/youtube-transcripts/2026-04-27-jason-cohen-wp-engine-2-unicorns-advice-ANALYSIS.md`.
