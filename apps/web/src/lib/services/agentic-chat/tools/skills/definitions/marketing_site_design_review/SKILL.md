---
name: Marketing Site Design Review
description: >-
    Child skill under Build Quality UI/UX for landing page review and marketing site audits: hero section quality, offer clarity, proof and trust, CTA hierarchy, section sequencing, and conversion-focused design feedback. Walks the page section by section against amateur-vs-pro scorecards and site-wide visual rules, returning per-section findings with evidence, severity, and concrete fixes plus a top-5 fix roll-up.
skill_type: procedure # procedure | reference | strategy | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
parent_id: build_quality_ui_ux
depth: 1
preserve_markdown: true
legacy_paths:
    - product-and-design.marketing-site-design-review.skill
    - docs/research/youtube-library/skill-drafts/marketing-site-design-review/SKILL.md
reference_modules:
    - id: marketing_site_design_review.foundation_rules
      name: Foundation Rules (site-wide)
      summary: Pre-conditions that must hold across the whole site before section findings are meaningful — 4-pixel spacing/type scales, type roles, contrast floor, 60/30/10 color proportion, hierarchy ranking, uniform layout effort — plus cross-cutting layout principles (two zones beats four, intentional grid-breaking, full-width sections, bento variation, real visuals over stock).
      when_to_load:
          - When starting any marketing-site review, before producing any finding.
          - When the user's concern is overall visual quality — the site looks amateur, templated, or inconsistent — rather than one section.
      path: references/foundation-rules.md
    - id: marketing_site_design_review.section_scorecards
      name: Section Scorecards (per-section)
      summary: Amateur-tell vs pro-move scorecard table plus operating lessons for each marketing-page section — hero, portfolio, case study, benefit block, FAQ, features, demo, e-commerce product page, comparison, testimonials, contact/CTA.
      when_to_load:
          - Before producing findings for any individual page section during a full top-to-bottom review.
          - When the user asks about one specific section (hero, FAQ, demo, pricing, comparison, testimonials, contact).
      path: references/section-scorecards.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/marketing_site_design_review/SKILL.md
---

# Marketing Site Design Review

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Provenance.
  This file is skill_type: procedure — the Procedure (a top-to-bottom section-by-section walk) carries the
  weight, with a Routing block for out-of-scope escalation to siblings. The deep rules live in two
  self-provenanced reference modules, so Knowledge is deliberately thin.
-->

## Identity

Conversion-grade marketing review child. This is a **procedure** skill at **domain** altitude — a
section-by-section runbook for landing pages and marketing sites whose deep rules live in reference modules.
Use this child when the surface is selling, positioning, explaining, or converting rather than helping an
existing user complete an app task.

## Activation

- Reviewing a landing page, homepage, pricing page, comparison page, product page, portfolio, case-study page, or launch page.
- Diagnosing why a marketing site converts poorly despite good traffic, or whether a page communicates value, looks credible, and has a strong hero and CTA path.
- Improving a section the owner already knows is weak (hero, FAQ, demo, contact).
- Scoring a competitor's marketing site to learn what to copy or beat, or planning a redesign before writing copy.
- A general UI review would miss offer clarity, proof, trust, and section-level conversion issues.

## Judgment

The discipline this skill enforces is **section-by-section honesty**: a marketing page is a sequence of sections each with a known amateur tell and a known pro move, and the strongest amateur signal is effort drop-off — polishing the hero while the FAQ and contact form stay default.

Severity rubric:

- **high** — visitor cannot tell what is offered or for whom from the first viewport; missing or buried primary CTA; broken trust signal (stock-faked proof, contrast below 4.5:1); a section actively contradicting the offer.
- **medium** — a section showing its amateur tell instead of its pro move; effort drop-off; off-scale spacing or invented type styles; selling in the FAQ.
- **low** — stylistic preference; a pro move missing where the section is otherwise functional.

## Procedure

1. Preflight. Identify the page goal, audience, promise, primary CTA, and proof standard in one or two sentences — if unclear, ask before reviewing. Capture or request screenshots of the full page (mobile and desktop if available) and note which section types are present.
2. Load `marketing_site_design_review.foundation_rules` and run the site-wide pass first: 4-pixel scales, type roles, contrast, 60/30/10 proportion, hierarchy ranking, and uniform layout effort. Foundational violations repeat in every section — report them once here, not per section.
3. Load `marketing_site_design_review.section_scorecards` and walk the page top to bottom. For each section present, run the matching scorecard row and operating lessons: amateur tells found, pro moves missing, specific fixes ordered by impact. Skip scorecards for section types not on the page.
4. For a targeted single-section question ("review my hero"), load `marketing_site_design_review.section_scorecards` and run only that section's checks — but still flag any site-wide foundational violation you notice, and load `marketing_site_design_review.foundation_rules` before citing one.
5. Check copy posture: heroes must name the customer and the concrete offer, benefit sections lead with benefits over feature names, FAQs answer objections honestly instead of selling. For BuildOS surfaces, copy follows the anti-AI doctrine — lead with relief, not AI capabilities.
6. Tag out-of-scope findings for escalation instead of dropping them → `ui_ux_quality_review`, `visual_craft_fundamentals`, `accessibility_inclusive_ui_review` (who owns which is in **Routing**).
7. Assemble the report using the **Contract** below: per-section findings top to bottom, then the roll-up.

## Routing

Out-of-scope findings route to siblings instead of being dropped:

- in-app product UI screens → `ui_ux_quality_review`
- works-but-lacks-polish craft execution (shadows, gradients, image treatment) → `visual_craft_fundamentals`
- semantics, focus, keyboard, or screen-reader behavior → `accessibility_inclusive_ui_review`
- When the page under review is (or should be) an assessment, quiz, or scorecard funnel rather than a standard landing page — or the user needs lead qualification and routing, not just conversion polish — escalate to `landing_page_scorecard_funnel`.

## Contract

Every finding follows this canonical shape:

```
Section: <hero | portfolio | case-study | benefit | faq | features | demo | product | comparison | testimonial | contact | site-wide>
Finding: <named rule violated, e.g. "Four-cell hero" or "Effort drop-off in tail sections">
Evidence: <specific element, copy excerpt, region, or measurement on the page>
Severity: <high | medium | low>
Fix: <concrete copy, layout, or scale-value change — ordered by impact when multiple>
Delegated: <optional sibling skill id if the fix is out of this skill's scope>
```

Then a roll-up:

- Top 5 highest-impact fixes across the page, ranked.
- Foundational rule violations (4-pixel scale, type roles, contrast, 60/30/10 proportion).
- Layout effort consistency score (1–5) — flag any section that visibly received less effort.

Stop conditions before returning: every section present on the page has findings or an explicit "no issues"; the top 5 fixes are ranked by conversion impact; every finding carries Evidence and Severity; out-of-scope concerns are tagged Delegated, not dropped.

## Policy

- A finding without evidence is not a finding — if it cannot be tied to a specific element, copy excerpt, region, or measurement, do not include it.
- Do not produce findings without loading the matching reference module first.
- Do not judge a marketing page only as an app UI — selling pages need value clarity and proof, and visual polish stays tied to conversion trust, not decoration.
- Do not recommend a redesign when section-level fixes can move conversion.
- Do not suggest stock imagery, AI voiceover, or generic taglines as fixes — the visitor should understand the category and concrete offer quickly.
- Do not allow off-scale spacing values (e.g., 13px, 27px), invented per-section type styles, or 50/50 complementary color splits.
- Do not recommend "more whitespace" without specifying which scale value (8, 16, 24, 32) and where.
- Do not let the FAQ become a sales page — flag selling in the FAQ as a copy upstream problem.
- Do not equalize columns on a comparison page; visually emphasize your product.
- Do not allow effort drop-off in tail sections (FAQ, contact, footer).

## Knowledge

Deliberately thin. The deep rules live in reference modules. The skill body holds the sequence, the output contract, and the escalation map; load the references before producing findings. The durable declarative content — site-wide foundation rules and per-section amateur-vs-pro scorecards — lives in the two reference modules named under **Provenance**, not here.

## Provenance

- Reference modules: `marketing_site_design_review.foundation_rules` (site-wide pre-conditions and layout principles), `marketing_site_design_review.section_scorecards` (per-section amateur tells, pro moves, and operating lessons).
- This is the public-facing sibling of `ui_ux_quality_review` — same foundational visual rules, applied to selling surfaces with section-specific conversion scorecards layered on top.
- **Primary sources** [practitioner]: DesignSpo visual/web-design series (pro-vs-amateur websites and layouts, visual hierarchy, typography, color theory, golden rule) and Daniel Priestley's $1M landing page material.
- Maintainers: the canonical research draft with full lineage lives at `docs/research/youtube-library/skill-drafts/marketing-site-design-review/` (not available at runtime).
