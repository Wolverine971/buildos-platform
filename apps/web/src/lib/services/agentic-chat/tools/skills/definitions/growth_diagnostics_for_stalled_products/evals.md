<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/growth_diagnostics_for_stalled_products/evals.md -->

# Evals — growth_diagnostics_for_stalled_products

Golden tasks per `../../EVALS_GUIDE.md`. Run B gets the shell plus the single reference (`diagnostic-layers.md`) pasted verbatim.

---

## Task 1 — Full five-layer diagnosis (B2B SaaS flat at $40k MRR)

### Task prompt

> Our SaaS has been stuck at $40k MRR for 9 months and I can't figure out why. Diagnose it for me. Everything I know:
>
> - Product: field-service scheduling software for small contractors. Single plan, $49/month flat, self-serve signup. About 810 paying customers.
> - We add roughly 57 new customers a month, very steady. Mix: ~70% Google Ads, ~25% SEO/blog, ~5% referrals.
> - Google Ads CAC has climbed from ~$180 to ~$310 over the last 12 months.
> - We lose about 7% of customers each month. Roughly 60% of cancellations happen inside the first 30 days.
> - Exit survey is a dropdown (price / missing features / switched tools / other). Top answer: "too expensive" at 45%.
> - No seat pricing, no add-ons, no annual plan — nobody can spend more than $49. Net revenue retention is about 93%.
> - The team has been shipping features hard all year and is now pushing for influencer marketing and a second, higher pricing tier.
>
> What's actually wrong, and what should we do first?

### Delta markers

1. **M1 (growth-ceiling formula):** Computes the ceiling with the formula named and shown: 57 new/month ÷ 0.07 churn ≈ **814 customers** (≈ $40k MRR at $49) — and states that the plateau is the ceiling reached, not a marketing mystery.
2. **M2 (ordered-layer discipline):** Works the five layers **in order** (churn → pricing/positioning → expansion/NRR → channels → end state), each with a finding or an explicit "insufficient evidence" — no layer skipped, no jumping to tactics.
3. **M3 (churn-timing windows):** Inspects when cancellations happen against the named windows (first week / 30 / 60 / 90 days), flags the 60%-inside-30-days as early churn, and prioritizes onboarding with the skill's rationale: early churn is the most expensive churn because acquisition cost was spent and value was never realized.
4. **M4 (cancellation-research rules):** Refuses to take "too expensive" at face value; flags the fixed dropdown itself as a measurement problem and prescribes the rules: ask "**What made you cancel?**" (not "why"), prefer free-form responses, read raw responses before deciding what to fix.
5. **M5 (pricing-as-positioning):** Treats the $49 flat price as positioning — it may be selecting a churn-prone, price-sensitive market and signaling weak support/maturity — and any price-increase suggestion names the new buyer expectations it creates (does not propose the second tier as a standalone monetization knob).
6. **M6 (expansion counterweight + value filter):** Names zero expansion / ~93% NRR as the missing mechanical counterweight to churn, and runs proposed expansion paths through the customer-value filter ("Is this actually good for the customer, or only good for us?"), rejecting at least one path on it.
7. **M7 (channel saturation evidence + adjacency):** Cites the CAC climb ($180 → $310) as saturation evidence for the dominant channel, applies the adjacency rule (one foot in an existing strength) to any new-channel idea, and does NOT endorse influencer marketing as the fix.
8. **M8 (single binding constraint):** Names **one** highest-priority broken layer (Layer 1 — early churn/onboarding), stated once and not hedged across layers.
9. **M9 (output contract):** Output carries all contract fields: ceiling calculation, broken layer, evidence reviewed and evidence still missing, retention/cancellation fixes, pricing diagnosis, expansion opportunities, channel assessment, growth-vs-profit/second-product/sale/maintenance recommendation, and next 3–5 actions **in order**, attacking the broken layer first.
10. **M10 (honest negative — no tactics-first):** Does NOT recommend more acquisition spend, influencer marketing, A/B tests, or more feature shipping as primary actions — and explicitly subordinates the team's two pet proposals to the constraint.
11. **M11 (Layer 5 separation):** Addresses whether growth is still the goal and separates the business question (a plateau can be a fine profit engine) from the founder question (needing a new challenge), even briefly.

### Expected load path

- `skill_load(growth_diagnostics_for_stalled_products, full)` — the framing prose and `## Worked Example` live outside the short-format parsed sections.
- References: `growth_diagnostics_for_stalled_products.diagnostic_layers` once, at workflow step 2, **before** producing any layer finding (the shell's guardrail makes findings without the reference a compliance failure).
- Should NOT load: anything else — this skill has exactly one reference; a second load of any kind is an over-load.

### Discovery probe

"Our SaaS has been stuck at $40k MRR for 9 months no matter what we try — help me figure out why." → catalog description matches on "diagnosing stalled SaaS … growth has slowed or plateaued … highest-leverage growth constraint identified before proposing tactics."

---

## Task 2 — Trap task: user asks for marketing ideas, data says churn/pricing

### Task prompt

> We need fresh marketing ideas for our B2B invoicing SaaS. Growth has flatlined at $28k MRR and the stuff we've tried isn't landing — LinkedIn ads, two webinars, a referral program. Nothing moved the needle. Give me 10 creative marketing ideas to reignite growth.
>
> Quick numbers in case they're useful: average $59/month, about 480 customers. We add roughly 30 new customers a month and lose about 28–30. Most cancellations happen in the first six weeks. The exit survey mostly says "switched to a cheaper tool" or "never got fully set up." No annual plans, no add-ons.

### Delta markers

1. **M1 (refuses the framing):** Does NOT deliver the requested 10 marketing ideas — names the constraint first, citing the ordering discipline / the guardrail "do not start with acquisition if churn or activation is broken."
2. **M2 (growth-ceiling math):** Shows the formula: 30 new/month ÷ ~6% monthly churn (29/480) ≈ **500-customer ceiling** — at 480 customers they are effectively at it, so net adds are ~0–2/month and **no acquisition tactic can move revenue** until churn moves.
3. **M3 (churn-timing window):** Flags "most cancellations in the first six weeks" against the churn-timing windows (first week/30/60/90 days) and names onboarding/activation as the failure, with the most-expensive-churn rationale ("never got fully set up" = value never realized after CAC was spent).
4. **M4 (cancellation research):** Does not accept "switched to a cheaper tool" at face value — treats it as a proxy for unrealized value/positioning, and prescribes the research rules: free-form "What made you cancel?", raw responses read, no summary-only clustering.
5. **M5 (pricing-as-positioning):** Connects cheaper-tool churn + $59 price to the positioning check — competing on price in a segment that doesn't value the product, or failing to reach the value that justifies $59 — rather than proposing a discount.
6. **M6 (explains the tactic failures):** Explains _why_ LinkedIn ads, webinars, and the referral program didn't move revenue using the ceiling/leaky-bucket logic — new leads poured into ~equal cancellations — instead of critiquing the tactics' execution.
7. **M7 (constraint named once + ordered actions):** Names Layer 1 (early churn/onboarding) as the single binding constraint and gives next 3–5 actions in order, attacking it first; expansion (no annual/add-ons, the missing churn counterweight) is sequenced after activation, and marketing is explicitly last.
8. **M8 (honest negative — no smuggled tactics):** Does not smuggle in a tactics list anywhere ("but if you still want ideas, here are 10…" fails this marker), and does not propose A/B testing to resolve what is a strategy/value problem.
9. **M9 (contract despite the ask):** Despite the user's different ask, the output still follows the contract: every layer gets a finding or an explicit "insufficient evidence," and the growth-vs-profit/end-state question is at least touched.

### Expected load path

- `skill_load(growth_diagnostics_for_stalled_products, full)`.
- References: `diagnostic_layers` before any layer finding — same single-load path as Task 1. The trap is behavioral, not structural: the load path is identical; the delta is whether the agent obeys the ordering discipline against the user's explicit request.
- Should NOT load: any marketing/content skill (e.g. `marketing_content`) to fulfill the surface request — routing to tactics before the constraint is named is the exact failure this skill exists to prevent.

### Discovery probe

"Give me 10 creative marketing ideas to reignite growth for my stalled SaaS." → the hardest probe: surface vocabulary points at a marketing-ideas skill. The description's hook is "new marketing or feature work is not moving revenue" + "constraint identified **before proposing tactics**." Record which skill a fresh agent picks; a marketing-skill pick is a discovery finding worth logging, but the embedded numbers should pull a careful agent here.

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

### 2026-06-11 — Task 1 — exemplar manufacture (with-skill run only, no A/B pair)

Performed by Fable 5 with the shell + `diagnostic_layers` loaded per the expected load path (reference loaded before any layer finding, per the shell guardrail). Self-check against markers: **11/11 hit** (M1 ceiling formula 57÷0.07≈814; M2 all five layers in order, Layer 5 carries an explicit insufficient-evidence note; M3 60%-in-30-days → onboarding with most-expensive-churn rationale; M4 dropdown rejected, "What made you cancel?" prescribed; M5 $49 as positioning + new expectations named for a higher tier; M6 NRR counterweight + value filter rejecting a trap-style annual plan; M7 CAC climb as saturation evidence + adjacency rule, influencer marketing declined; M8 Layer 1 named once; M9 all contract fields incl. ordered actions; M10 no tactics-first; M11 business vs founder question separated).
Output trimmed to ~55 lines and embedded as `## Worked Example` in SKILL.md.
Verdict: n/a (no without-run; delta verdict pending a future A/B pair). Discovery probe: not run this pass.
Notes: the fixture is seeded so the ceiling math lands exactly on the current customer count (57 ÷ 0.07 ≈ 814 vs ~810 actual) — a without-skill run that computes any ceiling at all would be a surprising A-hit worth logging on M1.

### 2026-06-12 — Task 1 — BLIND A/B (the owed pair; prior wave-2 entry was a with-skill self-check) — performer (with/without) + blind judge: claude-opus-4-8 (workflow subagents)

| Marker | without | with |
| --- | --- | --- |
| M1 | hit | hit |
| M2 | miss | hit |
| M3 | hit | hit |
| M4 | miss | hit |
| M5 | miss | hit |
| M6 | miss | hit |
| M7 | miss | hit |
| M8 | hit | hit |
| M9 | miss | hit |
| M10 | hit | hit |
| M11 | miss | hit |

Verdict: **STRONG DELTA**. With-skill hit 11/11 markers; gap over no-skill = 7 markers. Refusal missed by skill run: False.
Load path (expected, not re-tested this run): skill_load(growth_diagnostics_for_stalled_products, full); then load reference growth_diagnostics_for_stalled_products.diagnostic_layers exactly once at workflow step 2, before producing any layer finding; should NOT load anything else (one reference only — a second load of any kind is an over-load).
Notes: X is a strong organic diagnosis but skips the formal 5-layer structure (M2), the exit-survey measurement critique with "What made you cancel?" phrasing (M4), the customer-value filter on expansion (M6), the adjacency rule for channels (M7), the full output contract (M9), and the growth-vs-founder question (M11). X also actively endorses the annual plan and second tier as later moves rather than running them through the value filter. Y executes all named rules explicitly: ceiling formula, ordered layers with insufficient-evidence calls, dropdown critique, positioning framing, value-filter rejection of the annual plan, adjacency-rule channel decline, and the business-vs-founder split. Both correctly refuse influencer marketing and subordinate the pet proposals (M10), so no guardrail miss by the stronger (Y/skill) output. Gap is ~7 markers including multiple named-rule and guardrail markers — clear STRONG DELTA.
