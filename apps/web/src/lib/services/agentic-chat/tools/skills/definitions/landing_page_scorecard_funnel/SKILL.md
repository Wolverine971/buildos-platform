---
name: Landing Page Scorecard Funnel
description: >-
    Design an assessment-driven landing page that converts visitors into qualified, segmented leads. Use for quizzes, scorecards, diagnostic funnels, lead magnets, and dynamic results pages for consulting, coaching, SaaS, education, agencies, or services — including a setup-layered mode that wraps the scorecard in a positioning layer (market insight, alternatives, perfect-world scenario) for B2B and considered purchases.
preserve_markdown: true
legacy_paths:
    - landing-page-scorecard-funnel
    - docs/research/youtube-library/skill-drafts/landing-page-scorecard-funnel/SKILL.md
reference_modules:
    - id: landing_page_scorecard_funnel.setup_layer_positioning
      name: Setup Layer Positioning
      summary: Four-part positioning structure for setup-layered mode — market insight, alternative solutions analysis, perfect-world scenario, then the scorecard — plus where the setup work lives and the setup-layered output additions.
      when_to_load:
          - When mode selection lands on setup-layered (B2B SaaS, considered purchases, non-obvious "why pick us over the alternatives").
          - When a scorecard with a frustration hook is bouncing considered buyers who have not accepted the category framing.
      path: references/setup-layer-positioning.md
    - id: landing_page_scorecard_funnel.funnel_build_specs
      name: Funnel Build Specs
      summary: Threshold-bearing build rules — the five-section landing page with three hook forms, the CTA stack (plus waiting-list and group-registration CTA variants), the 15-question questionnaire (contact capture, 10 best-practice questions, Big 5 qualification), the dynamic results page, high/middle/low-fit lead routing, and the funnel KPI / scale-gate layer (LAPS dashboard, allowable cost per sale and per lead, paid-traffic ratchet, traffic prerequisites).
      when_to_load:
          - Before drafting or auditing the landing-page sections, questionnaire, results page, or lead routing.
          - Before measuring funnel performance, recommending paid traffic, or diagnosing a low-traffic scorecard page.
      path: references/funnel-build-specs.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/landing_page_scorecard_funnel/SKILL.md
---

# Landing Page Scorecard Funnel

Use this skill to turn a landing page into a qualified lead-generation funnel. The page should sell the assessment, not the entire product. The assessment gives value first, then routes each lead to the right next step.

The funnel is one conversion system:

1. _(Setup-layered mode only)_ Setup positioning page primes the buyer.
2. Landing page sells the assessment.
3. Questionnaire captures contact info, best-practice answers, and qualification signals.
4. Dynamic results page gives a score, insights, and a tailored next step.
5. Follow-up uses answers to route leads instead of blasting everyone the same offer.

## When to Use

- Build an online assessment or diagnostic quiz.
- Replace a generic lead magnet with a scorecard.
- Qualify leads before a sales call.
- Segment coaching, consulting, agency, SaaS, education, or service prospects.
- Improve a landing page that collects emails but does not capture intent.
- Create a personalized results page.

Do not use this skill for a simple product homepage, a blog CTA, or a survey with no conversion path. For general marketing-page persuasion review, use `marketing_site_design_review`.

## Workflow

1. **Mode selection (run this first).** Two modes of this skill exist; pick one before drafting.
    - **Standalone scorecard.** Use when the buyer already feels the pain (info-product, coaching, fitness, services with self-evident category). The hook can name the frustration directly. The assessment carries most of the conversion work.
    - **Setup-layered scorecard.** Use when the buyer needs the category framed before they will engage with an assessment. Common for B2B SaaS, considered-purchase tools, and any product where "why pick us over the alternatives" is non-obvious.
    - Diagnostic: if the audience can answer "yes, I have this problem and I want to solve it" before they hit your page, use standalone. If they need to be taught how to evaluate the category first, use the setup-layered mode.
2. If setup-layered, load `landing_page_scorecard_funnel.setup_layer_positioning` and draft the four-part positioning layer (market insight → alternatives analysis → perfect-world scenario → then the scorecard) before writing any scorecard copy.
3. Load `landing_page_scorecard_funnel.funnel_build_specs` and build the five landing-page sections in order: hook (form chosen by mode), assessment promise, differentiated-value proposition, credibility, CTA stack.
4. Design the questionnaire to the 15-question spec in the same reference: contact capture, 10 best-practice scoring questions, Big 5 qualification questions.
5. Design the dynamic results page and the high-fit / middle-fit / low-fit routing per the same reference.
6. Assemble the deliverable using the Output contract below.

## Output

Return:

- **Mode** — standalone or setup-layered, with rationale.
- _(Setup-layered only)_ — Market Insight statement, named alternatives with trade-offs, perfect-world scenario.
- Hook options _(by mode: frustration / readiness / market-insight)_.
- Three measured areas, each framed against the alternatives the buyer already considers.
- 15-question outline.
- Scoring model.
- Lead segment rules.
- Results page outline.
- Next-step routing.
- Follow-up recommendations.

Stop conditions before returning:

- Mode is stated with rationale; setup-layered outputs include all three setup artifacts (market insight, alternatives with trade-offs, perfect-world scenario).
- Every measured area is framed against a named alternative — not a recital of product capabilities.
- The questionnaire outline accounts for all 15 questions across the three buckets, with all Big 5 qualification questions present.
- Each lead segment routes to a different next step; no two segments share the same CTA.
- The CTA stacks action, time cost, price, and payoff — with no scarcity or FOMO line anywhere in the copy.

## Worked Example

Condensed from a full from-scratch funnel design for a solo operations consultant selling a $5,000 "Agency Ops Reset" (6 weeks) to owners of 10–25-person agencies drowning in client-delivery chaos; the input is in `evals.md` Task 1. Match this shape and rigor.

**Input (summary):** Buyer feels the pain daily and says so unprompted. Current site: one-pager with "Book a call." ~300 visits/month from LinkedIn (3 posts/week) + ~12 podcast guest spots. $1–2k/month available for ads; consultant planned an "only 5 client slots this quarter" urgency line.

**Mode: standalone scorecard.** Diagnostic applied: the buyer can already answer "yes, I have this problem and I want to solve it" before hitting the page — agency owners complain about delivery chaos unprompted, and ops consulting needs no category framing. A setup layer would add friction, not framing; `setup_layer_positioning` not loaded.

**Landing page (five sections, in order):**

1. **Hook (frustration form):** "Frustrated that client delivery still descends into chaos — even though you've hired good people and bought every PM tool?" _(Readiness alternate: "Are you ready to run a 20-person agency that doesn't need you in every Slack thread?")_
2. **Assessment promise:** "15 questions, about 3 minutes. You'll get your Agency Ops Score across the 3 systems that decide whether delivery runs without the owner — and the single fix to make first."
3. **Differentiated-value proposition** — three measured areas, each framed against an alternative the buyer already considers, not a capability recital:
    - _Delivery handoffs_ — vs. "buy another PM tool": tools don't fix undefined handoffs; the score shows whether your problem is process or software.
    - _Owner dependency_ — vs. "hire an ops director": a $90k hire inherits the same chaos; the score shows what must be systematized before a hire can stick.
    - _Capacity & scope visibility_ — vs. "just push harder / do nothing": shows the margin leaking through unpriced scope creep.
4. **Credibility:** who built the assessment, the engagements it distills, and the evidence behind the three categories.
5. **CTA stack:** "Get your Agency Ops Score → 15 questions, ~3 minutes, free, instant scorecard with your first fix." Action + time cost + price + payoff. **The planned "only 5 client slots this quarter" line is cut by rule** — manufactured scarcity converts the first taking but breaks the trust the segmentation step depends on.

**Questionnaire (15 questions, three buckets):**

- _Contact capture:_ name (required), email (required), location inferred — not asked; phone optional at capture (require it at call booking instead, where the funnel actually depends on it).
- _10 best-practice questions_ (score-driving, insight-bearing before any call): documented handoff checklist per project stage? capacity planned in hours or vibes? scope changes repriced or silently absorbed? weekly delivery review that runs without the owner? _(…6 more in the same shape, one per ops best practice.)_
- _Big 5 qualification:_ (1) current situation — team size and role mix; (2) desired outcome in the next 90 days; (3) what they've already tried that didn't stick; (4) preferred solution type — template/course, group program, 1:1 consulting, or done-for-you (the budget and service-fit signal); (5) open "anything else we should know?"

**Scoring model:** 10 best-practice questions × 0–2 = 0–20. Bands: 0–8 Firefighting, 9–14 Stabilizing, 15–20 Systematized. The score drives the insights; the Big 5 — not the score — drives the routing.

**Dynamic results page:** overall score on a Firefighting→Systematized gauge; three personalized insights generated from their three lowest-scoring areas (each names the missing practice); next step selected by qualification; footer with contact and trust links. The page is only called personalized because the insights actually use the answers.

**Lead routing (no two segments share a CTA):**

- **High fit** — 10–25-person agency + 90-day outcome matching the Reset + preferred solution "1:1 consulting"/"done-for-you" → book a 30-minute Ops Reset consult.
- **Middle fit** — right problem, smaller team or "group program" preference → monthly live workshop ("Fix your worst handoff in 60 minutes") + nurture keyed to their lowest-scoring area.
- **Low fit** — under 10 people, "template/course" preference, or already 15+ score → free Ops Reset checklist + video walkthrough; no call offered.

**Follow-up:** sequences branch on lowest-scoring area and Big 5 answers; the obstacle answer (q3) opens the high-fit outreach email. Nobody gets a generic blast.

**Funnel KPIs and scale gates:**

- **LAPS dashboard first** (a spreadsheet is enough): leads → appointments → presentations → sales, weekly, against the 100 → 15 → 10 → 3 baseline shape. Improve one stage per week.
- **Allowable-cost math:** ACPS = $5,000 × 15% = **$750**. ACPL = $750 × (3 sales ÷ 100 leads) = **$22.50** — replace the baseline ratio with tracked LAPS numbers once they exist.
- **Ads verdict: not yet.** The scale gate requires tracked CPL ≤ $22.50 and tracked cost per sale ≤ $750; with no LAPS history both are unknown, so paid traffic waits. When the gate opens, ratchet spend stepwise ($1k → $1.5k → $2k), re-verifying ACPL/ACPS at each step. ~$22.50/lead is attainable on Meta/LinkedIn; assessment IP often pulls leads under $10.
- **Traffic prerequisites:** _Noticed_ — 11 short-form impressions within 90 days; 3 LinkedIn posts/week clears the window with little slack, so protect the cadence. _Known_ — the ~12 podcast spots satisfy the 2–7 hours of long-form depth. _Rated_ — audit which ~4 names/brands appear around the funnel; they must match a $5k niche-expert price band.

## Guardrails

- Do not ask for more data than needed.
- Do not make phone mandatory unless the funnel truly depends on phone contact.
- Do not sell the product before the assessment promise is clear.
- Do not route every respondent to the same CTA.
- Do not call the results personalized if the page ignores the answers.
- Do not hide the payoff behind vague "learn more" language.
- **Do not use FOMO, scarcity, or urgency stunts in the CTA.** Manufactured urgency converts on the first taking but breaks the trust the segmentation step depends on. The scorecard's value comes from honest qualification; FOMO contradicts that posture.
- **Do not skip the Setup layer for B2B / considered purchases.** A scorecard that opens with a frustration hook on a buyer who hasn't accepted the category framing yet bounces hard. Either prime the buyer with the four-part Setup beforehand or use a Market Insight hook in mode-aware fashion.
- **Do not write feature-list value propositions.** The value-proposition section names the three measured areas in terms that imply a comparison to alternatives, not in terms that recite the product's capabilities.
- Do not draft landing-page sections, the questionnaire, or results-page outputs without loading `landing_page_scorecard_funnel.funnel_build_specs` first — and do not draft the setup layer without loading `landing_page_scorecard_funnel.setup_layer_positioning`.

## Notes

- Reference modules: `landing_page_scorecard_funnel.setup_layer_positioning` (Dunford positioning layer), `landing_page_scorecard_funnel.funnel_build_specs` (Priestley funnel mechanics).
- Primary sources: Daniel Priestley, "The $1 Million Landing Page" (five-section page, 15-question structure, dynamic results page, segmentation); Daniel Priestley, "Everyone Who Uses This Playbook Makes $1 Million" (LAPS dashboard, allowable cost per sale/lead, scale gates, traffic prerequisites); April Dunford's sales-pitch framework on Lenny's Podcast (Setup → Follow-Through structure, differentiated value, anti-FOMO posture). Priestley supplies _what to build_ and _how to measure and scale it_; Dunford supplies _what to write at each stage_ and _whether to wrap it in a Setup layer_.
- Maintainers: the canonical research draft with full claim-level lineage (`lineage.yaml`) lives at `docs/research/youtube-library/skill-drafts/landing-page-scorecard-funnel/` (not available at runtime).
