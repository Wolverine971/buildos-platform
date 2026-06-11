<!-- references/adoption-diagnosis.md -->

# Adoption Diagnosis: Distance, Virtuous Circle & Interface Inventory

Load when the review's bottleneck is **adoption** — "nobody's using the system," the system feels isolated, or the question is design-system ROI. The 2024 thesis (Frost, SmashingConf NY): a system fails not when it's badly built but when it's **isolated from the products that consume it**. Adoption IS the ROI problem — a system nobody uses returns nothing. Cite Frost 2015 (interface inventory) and Frost 2024 (virtuous circle, anti-poles).

## Root cause: distance between system and products

The #1 thing teams struggle with "the world over" is adoption. Root cause: the design-system team **went inward** — "stress over border-radius values," building components in isolation on headphones — while a **distance grew between the system and the products it serves**.

Reframe the team's job (Frost 2024): "The job of design-system designers is **not** to go inward and futz with border-radius values. It is to go **outwards**, be a service to the product organization — what do you need? How can we serve you?" Close the distance at the **tool level and above all at a real human level.**

Agent-checkable distance signals (each one is a flag):
- The system team has **no product surfaces it ships into** itself.
- No intake path from product teams back into the system (no contribution channel).
- The system's own roadmap is internal-only (border-radius, tokens, refactors) with **no product-driven items**.
- Consistency is used as the **only** success metric (the skill's existing guardrail) — adoption/reuse isn't measured at all.

## The virtuous circle (the fix — required check)

The governing model is the **virtuous circle / yin-yang**: the system **informs and influences products**, AND products **inform and influence the system**. Both directions, continuously. Get the loop right and adoption follows.

Binary check: does the loop run in **both** directions?
- **System → product** present? (teams build with the system)
- **Product → system** present? (teams contribute back, the system absorbs product reality)

If only one direction runs, the system is in one of the two failure poles below.

## The two failure poles (name which one)

| Pole | Definition | Tell |
| --- | --- | --- |
| **Pattern police** | System team enforces "you're not design-system compliant!" on the product. | Loop runs system→product only; compliance language; no contribution path. |
| **Product capture** | "You're mine now" — system swept up in whatever one product is doing. | Loop runs product→system only; system has no reusable independent value; changes serve one product's whims. |

Agent rule: a healthy review names **neither** pole present. If you observe one, name it explicitly and prescribe the missing loop direction. Don't recommend more governance theater to a pattern-police system — recommend service-orientation (go outward) instead.

## Interface inventory (the audit + buy-in tool — Frost 2015)

The first concrete audit move, and the buy-in device.

Protocol:
1. **Catalog every unique instance** of each pattern — screenshot **all** buttons, all form fields, all icons, all cards across the product(s).
2. **Surface the inconsistency** — the wall of mismatched buttons makes the problem visible without a designer explaining why it's a problem.
3. **Scope the refactor** — the inventory IS the merge/kill worklist (which variants collapse into one).
4. **Seed the shared vocabulary** — one agreed name per pattern (resolve "main button" vs "primary button" vs the dev's markup name in one room).
5. **Buy-in device** — "print it out, put it on the CEO's desk." Use it to get non-technical stakeholder financing for the system.

Agent-checkable: a review that recommends standardizing components **without first running (or referencing) an interface inventory** has skipped the audit — flag it. The inventory is also the ROI artifact: it converts "we have inconsistency" into a countable, fundable scope.

## Continuous improvement & agency (governance for adoption)

- **Set-and-forget is "a recipe for disaster"** (Frost 2024). "You set it up once and never touch it again" fails. Continuous improvement — releasing, iterating, vetting/testing changes — is **mandatory**. A design-system feature isn't done until its release path, docs, library status, VQA, and accessibility owners are clear (the skill's existing guardrail).
- **You have agency.** "You're allowed to do whatever the hell you want… you're a human being." Counter to rigid pattern-police governance. A/B test atoms, fold in new best practices **when proven** ("you've been doing that thing wrong — change"), with due diligence.
- **Native/OS controls win by default** — don't reinvent OS-level controls (date pickers, etc.) for vanity styling.
- **Performance is design** (a governance lever) — race the site against competitors (WebPageTest) when someone wants 4 fonts × many weights + 50 grays. "Design isn't how it looks, it's how it works" (Jobs, invoked by Frost). Interactivity, animation, performance, font-loading, browser quirks are **all part of the design** — the "rectangle creator" who ignores them is the failure mode.

## 2015 → 2024 as a diagnostic (what holds / what's new)

Use this to date a system's maturity and spot what it's missing.

**Holds (still true, "maybe more relevant"):**
- atoms→molecules→organisms→templates→pages taxonomy; straight-line traversal system→product page/state.
- Build through real production frontend (Pattern Lab → Storybook; same principle).
- Solve-once-and-reuse / DRY (includes → web components → Global Design System: same idea at three scales).
- Collaboration over silos; vocabulary is optional, the system isn't.

**New since 2015 (a system lacking these is dated):**
- the **"design system"** umbrella term (vs 2015 "pattern libraries / tiny Bootstraps").
- **design tokens** as a first-class layer (see token-taxonomy reference).
- **web components** as cross-framework single source of truth.
- core + child/recipe systems; connected Figma/code docs.
- **Global Design System** proposal (build the date picker once, for the world; Open UI / W3C-adjacent; un-styled + tokenized; HTML tags are "the dowel rods and screws of IKEA," not pre-fab components).
- **AI as two-way tooling** (see token-taxonomy reference).

**Corrects (what Frost would push back on now):**
- the **inward turn** — the very success of "design systems as a fundable thing" produced isolated teams; correction is outward service + adoption via the virtuous circle.
- **set-and-forget** governance — now explicitly a "recipe for disaster."
- **pattern-police rigidity** — softened to "you have agency."

Diagnostic use: if a system has the 2015 taxonomy but **none** of the 2024 layers (no tokens, no contribution loop, internal-only roadmap), it's a **2015-era system with a 2024 adoption problem** — prescribe tokens + the virtuous circle, not more components.

## Output shape for an adoption finding

For each adoption finding return: the **distance signal** observed, which **failure pole** (or "neither"), the missing **loop direction**, the **interface-inventory / retrofit** next move, the **owner**, and the **operating change** (what cadence/intake/service behavior changes). Adoption ROI = closing the system↔product distance, not shipping more components.
