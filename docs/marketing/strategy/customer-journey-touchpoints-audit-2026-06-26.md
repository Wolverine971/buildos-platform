<!-- docs/marketing/strategy/customer-journey-touchpoints-audit-2026-06-26.md -->

# The Customer Journey & Touchpoints — BuildOS Audit

> Created 2026-06-26. Codifies the 8-stage customer-journey model (Fig 3.1.1) and audits where BuildOS stands on each stage today, with prioritized next steps.

---

## Source: Fig 3.1.1 — "The Customer Journey & Touchpoints"

Transcribed from the reference diagram. A maker stands on one side, the customer on the other, and **all eight stages sit between them as the path the customer actually walks** — Product is just one node in the middle, not the whole journey.

| Stage           | Touchpoints                                                |
| --------------- | ---------------------------------------------------------- |
| **Awareness**   | PR · Search · Social media · Paid ads                      |
| **Education**   | Website · Email · Blog · Trial/Demo                        |
| **Acquisition** | Partners · Payment model · Up-sell/Cross-sell · Delivery   |
| **PRODUCT**     | Design · UX · Performance                                  |
| **Onboarding**  | Quick guide · Account creation · How-to videos · Tips      |
| **Usage**       | Reliability · Usability · Updates · Lifespan               |
| **Support**     | Troubleshooting · Knowledge base · Call center · Community |
| **Loyalty**     | New products · Newsletter · Promotions · Ratings/reviews   |

### The note (Fig 3.1.1 caption)

> _Makers often focus on the shiny object — the product they're building — and forget about the rest of the journey until they're almost ready to deliver it to the customer. But customers see it all, experience it all. They're the ones taking the journey, step by step. And they can easily stumble and fall when a step is missing or misaligned._

---

## The diagram (codified)

```
                         THE CUSTOMER JOURNEY & TOUCHPOINTS

                    ┌──────────────┐
                    │  AWARENESS   │   PR · Search · Social media · Paid ads
                    └──────────────┘
                    ┌──────────────┐
                    │  EDUCATION   │   Website · Email · Blog · Trial/Demo
                    └──────────────┘
                    ┌──────────────┐
  ┌───────┐         │ ACQUISITION  │   Partners · Payment model ·                ┌──────────┐
  │       │         └──────────────┘   Up-sell/Cross-sell · Delivery             │          │
  │ MAKER │  ─────╮   ╔════════════╗                                       ╭───  │ CUSTOMER │
  │       │       ├── ║  PRODUCT   ║   Design · UX · Performance      ──────┤    │          │
  └───────┘  ─────╯   ╚════════════╝                                       ╰───  └──────────┘
                    ┌──────────────┐
                    │  ONBOARDING  │   Quick guide · Account creation ·
                    └──────────────┘   How-to videos · Tips
                    ┌──────────────┐
                    │    USAGE     │   Reliability · Usability · Updates · Lifespan
                    └──────────────┘
                    ┌──────────────┐
                    │   SUPPORT    │   Troubleshooting · Knowledge base ·
                    └──────────────┘   Call center · Community
                    ┌──────────────┐
                    │   LOYALTY    │   New products · Newsletter ·
                    └──────────────┘   Promotions · Ratings/reviews

  THE MAKER sees the PRODUCT.   THE CUSTOMER walks ALL EIGHT STEPS, in order.
  A missing or misaligned step = the customer stumbles and falls.
```

**The thesis:** equal weight across all eight. The maker's instinct is to pour everything into the middle box (Product) and treat the other seven as afterthoughts. The customer doesn't experience the middle box — they experience the _whole staircase_. One broken step and they fall, regardless of how good the product is.

---

## Where BuildOS is right now (2026-06-26 audit)

Based on a direct repo audit (code, routes, services, content, marketing docs) by the growth-analyst and growth-activation-architect agents. Ratings judge **what is actually built/shipped**, not what is documented or planned.

| #   | Stage           | Rating     | Biggest gap                                                                                        | Highest-leverage next step                                                                         |
| --- | --------------- | ---------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | **Awareness**   | 🟡 Partial | All plan, no shipped proof assets; static sitemap drifts out of sync                               | Ship a recurring weekly demo asset (raw dump → structured project); generate sitemap dynamically   |
| 2   | **Education**   | 🟡 Partial | No demo / interactive proof; trial starts cold into a blank brain-dump box                         | Templated wedge starter brain-dump (= demo **and** activation fix)                                 |
| 3   | **Acquisition** | 🟡 Partial | No expansion revenue **+** signup→onboarding-completion leak (72–95% drop)                         | Fix onboarding completion _before_ pricing/tiers                                                   |
| 4   | **Product**     | 🟢 Strong  | Caching/infra perf graded C− (taxes the most-used surface, chat); brain-dump UI underweight        | Ship deferred chat-perf items + LLM prompt caching / SWR headers                                   |
| 5   | **Onboarding**  | 🟡 Partial | In-app education near-absent — persona guides live only on the blog, never routed to in-product    | Route intent (organize/plan/unstuck/explore) → matching persona guide from ReadyStep / empty state |
| 6   | **Usage**       | 🟢 Strong  | No user-facing "what's new" / update communication                                                 | `product.update` notification event + markdown changelog (reuse existing notification rail)        |
| 7   | **Support**     | 🔴 Weak    | No help/feedback at the moment of friction; no community                                           | In-app `?` help/feedback affordance in nav, reusing `/api/feedback`; deep-link to `/docs`          |
| 8   | **Loyalty**     | 🔴 Weak    | No loyalty loop _produces acquisition_ — no referral, no newsletter, no published real testimonial | Real testimonial→carousel pipeline from `rating ≥ 4` feedback rows                                 |

### Two patterns naming the whole picture

1. **Marketing side (stages 1–3, 8): strategy-rich, execution-poor.** The docs tree is deeper than the live funnel. The constraint isn't knowing what to do — it's shipping loops instead of plans. ("Queued ≠ shipped.")

2. **Product side (stages 4–7): engineering-strong, surface-weak.** The hard machinery (Inkprint design system, timezone-aware retention scheduler, project context persistence, reliability, branching email nurture) is mature. What's missing is the _connective in-app tissue_: routing built content into the product, surfacing what shipped, and giving stuck users an escape hatch. **Three of the four product next-steps are "wire existing assets into the running app," not "build something new."**

### The meta-gap behind every rating

There is **no product-analytics layer** (no PostHog/Mixpanel/GA4) and **no UTM/source capture on signup** (`users` has no `utm_source`/`signup_source`). You cannot currently measure which awareness touchpoint drives acquisition, or whether any change moves retention. **Until this is fixed, every rating above is partly inferred rather than measured.** This is the step _underneath_ the staircase.

> Reality-check on scale: per `docs/marketing/growth/growth-audit-2026-04-09.md` — 94 users, 1 paying, 4 WAU. Nothing in the lifecycle is validated by retention data yet. Strong ratings mean "well-built," not "proven to convert."

---

## Prioritized next steps — where to tighten up

Ordered by **leverage ÷ effort**, weighted toward the weakest steps and the cheap "wire what exists" moves.

### Tier 0 — Instrument first (you're flying blind without it)

- [x] **Add analytics + UTM capture.** ✅ **SHIPPED & deployed 2026-07-01** — PostHog Half A: 8 funnel events + first-touch UTM/`signup_source` capture. Status log + remaining items (migration apply, dashboards, Half B MCP) in the [runbook](../growth/posthog-analytics-workflow.md); engineering reference in `docs/architecture/POSTHOG_ANALYTICS_INTEGRATION.md`. Verify-events check-back due 2026-07-08 → 15.

### Tier 1 — Fix the two broken steps (Support 🔴, Loyalty 🔴)

- [ ] **In-app `?` help/feedback affordance** in `Navigation.svelte` → modal reusing `/api/feedback`, deep-linking to `/docs`. Near-zero new infra; catches stuck users mid-task. _(Support)_
- [ ] **Testimonial→carousel pipeline** from real `feedback`/`beta_feedback` rows with `rating ≥ 4`. Turns satisfied users into awareness assets — the cheapest loop that compounds. _(Loyalty → feeds Awareness)_

### Tier 2 — Close the activation leak (the highest-revenue seam)

- [ ] **Templated wedge starter brain-dump** (author / YouTuber) that guarantees a clean first parse. One build that fixes Education (the demo) _and_ Acquisition (the 72–95% onboarding drop). _(Education + Acquisition)_
- [ ] **Route intent → persona guide** from the dashboard empty state / ReadyStep. Reuses guides that already exist; no new content. _(Onboarding)_

### Tier 3 — Convert shipping velocity into visible momentum

- [ ] **`product.update` in-app changelog** on the existing notification rail. Makes "the product is alive" visible — a return-reason. _(Usage + Loyalty "new products")_
- [ ] **Recurring weekly proof asset** (raw dump → structured project recording) repurposed across platforms; generate the sitemap dynamically. _(Awareness)_

### Tier 4 — Don't do yet

- [ ] Pricing tiers / up-sell / expansion revenue — optimizing a downstream surface while the upstream pipe leaks. Post-PMF problem.
- [ ] Paid ads — correct to stay at zero for a solo-founder pre-PMF motion.

---

## Key files (for whoever picks this up)

- Funnel companion audit: `docs/marketing/growth/growth-audit-2026-04-09.md`
- Trial state machine: `apps/web/src/lib/config/trial.ts`
- Welcome email nurture: `apps/web/src/lib/server/welcome-sequence.service.ts` / `welcome-sequence.logic.ts` / `welcome-sequence.content.ts`
- SEO: `apps/web/static/robots.txt`, `apps/web/static/sitemap.xml`, `apps/web/src/lib/components/SEOHead.svelte`
- Onboarding: `apps/web/src/routes/onboarding/+page.svelte`, `apps/web/src/lib/config/onboarding.config.ts`, `apps/web/src/lib/server/onboarding.service.ts`
- Retention scheduler: `apps/worker/src/scheduler.ts`, `apps/worker/src/lib/briefBackoffCalculator.ts` (built but gated off — `ENGAGEMENT_BACKOFF_ENABLED`)
- Support surfaces: `apps/web/src/routes/help/+page.svelte`, `apps/web/src/routes/contact/+page.svelte`, `apps/web/src/routes/feedback/+page.svelte`, `apps/web/src/routes/api/feedback/+server.ts`
- Design system: `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`
- Partner layer (product strategy, not yet an acquisition channel): `docs/specs/buildos-corsair-plugin-priority-matrix-2026-05-21.md`
- Testimonial campaign (planned, unexecuted): `docs/marketing/strategy/local-creator-testimonial-hunt-2026-05-11.md`
