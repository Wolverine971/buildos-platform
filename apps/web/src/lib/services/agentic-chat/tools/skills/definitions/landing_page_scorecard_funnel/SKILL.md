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
      summary: Threshold-bearing build rules — the five-section landing page with three hook forms, the CTA stack, the 15-question questionnaire (contact capture, 10 best-practice questions, Big 5 qualification), the dynamic results page, and high/middle/low-fit lead routing.
      when_to_load:
          - Before drafting or auditing the landing-page sections, questionnaire, results page, or lead routing.
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
- Primary sources: Daniel Priestley, "The $1 Million Landing Page" (five-section page, 15-question structure, dynamic results page, segmentation); April Dunford's sales-pitch framework on Lenny's Podcast (Setup → Follow-Through structure, differentiated value, anti-FOMO posture). Priestley supplies _what to build_; Dunford supplies _what to write at each stage_ and _whether to wrap it in a Setup layer_.
- Maintainers: the canonical research draft with full claim-level lineage (`lineage.yaml`) lives at `docs/research/youtube-library/skill-drafts/landing-page-scorecard-funnel/` (not available at runtime).
