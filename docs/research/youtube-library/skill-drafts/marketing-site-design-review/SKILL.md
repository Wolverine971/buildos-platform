---
name: marketing-site-design-review
description: Review a marketing or landing page section by section against pro-vs-amateur heuristics, layout rules, typography and color guardrails, and a 4-pixel mathematical system. Use when auditing a homepage, landing page, pricing page, or product page for conversion-grade design quality.
path: docs/research/youtube-library/skill-drafts/marketing-site-design-review/SKILL.md
---

# Marketing Site Design Review

Use this skill to audit a marketing website (homepage, landing page, pricing page, comparison page, product page, contact page) section by section. The review distinguishes between an amateur-looking marketing site and a conversion-grade one without rebuilding from scratch.

This skill is the **public-facing sibling** of `ui-ux-quality-review` (which targets in-app product UI). They share foundational rules; this skill adds section-specific scorecards for the page types found on a marketing site.

## When to Use

- Audit a homepage, landing page, pricing page, or comparison page
- Diagnose why a marketing site converts poorly despite good traffic
- Improve a section the founder already knows is weak (hero, FAQ, demo, contact)
- Plan a redesign before writing copy
- Score a competitor's marketing site to learn what to copy or beat

Do not use this skill for in-app product UI (use `ui-ux-quality-review`), brand identity work, or assessment-funnel design (use `landing-page-scorecard-funnel`).

## Foundational Rules (Apply Everywhere)

These pre-conditions must hold across the whole site before section-level review is meaningful.

- **4-pixel system.** Every spacing, padding, gap, container width, and font size is a multiple of 4px (scale: 4, 8, 12, 16, 24, 32, 48, 64, 96). Type scale: 16, 20, 24, 28, 32, 40, 48, 64.
- **Type roles only.** Headings (2–3 levels), paragraphs, buttons, labels. No invented styles per section.
- **Line height inversely proportional to size.** ~1.0× for big headlines, ~1.5× for body. Never trust browser 125%.
- **Body text contrast ≥ 4.5:1**, ideally 7:1.
- **60/30/10 color proportion.** 60% dominant, 30% secondary, 10% accent (CTAs only).
- **Hierarchy ranking.** One primary, a few secondary, the rest uniform — per section _and_ across the page.
- **Layout effort uniform.** Hero, FAQ, testimonials, contact all get the same care. Dropping effort in any one section signals "template."

## Section Scorecard

Walk the page top to bottom. For each section present, run the matching review.

| Section                      | Amateur Tell                                                       | Pro Move                                                                                              |
| ---------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Hero                         | Stock photos + four-cell layout + corporate blue + generic tagline | Two zones (text + visual), real photo of real work, named customer, primary + secondary CTA           |
| Portfolio                    | Identical mockup template for every project; rigid grid            | Floating composition, varied mockups per project, individuality                                       |
| Case Study                   | Auto-generated keywords, sparse company-only blurb, small visuals  | Custom layout per case, bold visuals, explicit process and impact                                     |
| Benefit (60–70% of homepage) | Static screenshots with feature names + feature descriptions       | Animated/interactive visuals, in-line button-highlighter pattern, benefits over features              |
| FAQ                          | Plain-text default accordion; selling in the FAQ                   | Brand-consistent, fun design; real questions answered honestly; never use the FAQ to sell             |
| Features                     | Gray corporate background, HTML-list features                      | Bento-box grid, varied tile sizes, hand-holding through how the product works                         |
| Demo                         | AI voiceover, generic product video, no interactivity              | Interactive in-page demo; let the visitor try before signup                                           |
| Product (e-commerce)         | Stock images, no servings/sourcing/reviews, dense paragraph        | Real photos, benefits-first layout, full-width hero, magazine-style sub-hero, testimonials            |
| Comparison                   | Blog-post format, ambiguous yes/no, equal column weights           | Bold problem-led headline, visual problem-solution rows, your column visually emphasized, clear CTA   |
| Testimonial                  | Mixed tweets / handwritten / video / text in random order          | Full-width section, persona-segmented categories, clickable links to real sources                     |
| Contact                      | Generic form, double labels, no qualification fields               | Conversational labels embedded in copy, qualifying fields (work email, company), creative interaction |

## Per-Section Operating Lessons

### Hero (Above the Fold)

- One message, two compositional zones (text + visual). Never four cells.
- Headline must be visually dominant — when the graphic eats ~60% of the hero, it is amateur.
- Show a real photo of real work or a real product screen. No corporate-stock posing.
- Name the customer in copy: _"We're an agency for creators"_ > generic taglines.
- Primary + secondary CTA, side by side, same shape, different weights. Pull CTA color from a highlight already in the hero. Add an inner white highlight + outer drop shadow for tactile realism.

### Portfolio / Case Studies

- Break the grid intentionally. Float work into space; let it conform only at edges.
- Vary the mockup per project. Identical templates read as "templated."
- Each case study deserves a custom layout. Blurb-only pages with auto-keywords feel auto-generated.
- Treat the _presentation_ of work as important as the work itself.

### Benefit Section (Most Important Block on a Homepage)

- This is 60–70% of the page. Treat it as the main act.
- Lead with **benefits**, not feature names. The subtitle is the explanation, not the title.
- Use animated, interactive, or before/after visuals — never static thumbnails.
- "In-line button-highlighter" pattern: place buttons inside paragraph copy that swap the right-side visual when clicked.
- Cover the 1,000-foot view: explain the problem solved before the mechanism.

### FAQ

- The FAQ is _not_ a hidden benefit section. If you are using it to sell, copy upstream is broken.
- Match the FAQ's design energy to the rest of the site. A plain default accordion is a backstage Disney World moment.
- Answer the real objections honestly — saves customer-service time later.

### Features Page

- Bento-box grid with varied tile sizes signals the product's range.
- Long and dense beats short and sparse — visitors who reached this page want detail.
- Use icons or mini-visuals per feature; never fall back to an HTML unordered list.
- Sprinkle benefits at the end; close with a single clear CTA.

### Demo Section

- Interactive > video > screenshot. If you ship video, never use AI voiceover.
- Let visitors _try_ the product before signup; ask for the email at "publish" or save, not before.
- For complex products, hold the visitor's hand — under-explaining is the canonical mistake.

### Product Page (E-commerce)

- Real product photo, full width, professional. Stock + grainy bottle = abandon.
- Two-column benefits-first layout with breathing room.
- Magazine-style sub-hero between sections to break density.
- Bento-box features grid showing exactly what is in the box.
- Testimonials immediately after benefits, before secondary content.

### Comparison Page

- Lead with a bold problem statement: _"X solves N big problems with Y."_
- Visual problem-solution rows beat tabular yes/no checks.
- Your column gets distinct color, weight, or background. Never visually equal to competitors.
- Single bold CTA at the bottom. Do not be a fence-sitter on a comparison page.

### Testimonial Section

- Full-width, intentional, organized.
- Persona-segment testimonials by who would buy: founders, marketers, designers, etc. ("People like us _and_ people like you.")
- Every testimonial has quote + name + role + clickable link to source.
- Do not mix tweets, handwritten notes, videos, and plain text in random order — pick one format per section.

### Contact / CTA Section

- Conversational labels embedded in copy: "I'd like to talk about **_ for _**."
- Qualifying fields (work email, company name) pre-segment leads.
- Match the rest of the site's design energy. Never end on a generic form after a polished page.
- This is the last yard — full effort, no cutting corners.

## Cross-Cutting Layout Principles

- **Two zones beats four.** One message per hero, per section.
- **Break the grid intentionally.** Rigid grids read as templated; floating composition reads as bespoke.
- **Full-width sections** for testimonials, sub-heroes, and demos signal importance.
- **Vary tile sizes.** Bento-box grids beat 3×3 uniform grids for features.
- **Real visuals beat stock visuals**, every time, in every section.
- **Layout effort must be uniform** across sections. Effort drop-off is the strongest amateur signal.

## Output Format

Return findings as a structured scorecard:

```
Section: <name>
Amateur Tells Found: <bulleted list>
Pro Moves Missing: <bulleted list>
Specific Fixes: <numbered list, ordered by impact>
Priority: high | medium | low
```

Then a roll-up:

- Top 5 highest-impact fixes across the page
- Foundational rule violations (4-pixel scale, type roles, contrast, color proportion)
- Layout effort consistency score (1–5) — flag any section that visibly received less effort

## Guardrails

- Do not recommend a redesign when section-level fixes can move conversion.
- Do not suggest stock imagery, AI voiceover, or generic taglines as fixes.
- Do not allow off-scale spacing values (e.g., 13px, 27px) — every value must come from the 4-pixel system.
- Do not let the FAQ become a sales page; flag selling in the FAQ as a copy upstream problem.
- Do not equalize columns on a comparison page; visually emphasize your product.
- Do not allow effort drop-off in tail sections (FAQ, contact, footer).
- Do not invent type styles per section; reuse the four roles.
- Do not split complementary colors 50/50.
- Do not recommend "more whitespace" without specifying which scale value (8, 16, 24, 32) and where.

## Cross-Linked Skills

- `ui-ux-quality-review` — same foundational rules, applied to in-app screens.
- `landing-page-scorecard-funnel` — assessment-driven funnel structure when the page is meant to qualify leads via a quiz.

## Source Attribution

Distilled from six DesignSpo videos plus Daniel Priestley's $1M landing page video:

- DesignSpo — [The Complete Guide To Visual Hierarchy](https://www.youtube.com/watch?v=kK1TOpI948o)
- DesignSpo — [The ULTIMATE Guide To Typography For Beginners](https://www.youtube.com/watch?v=AXpxZMRM1EY)
- DesignSpo — [The ULTIMATE Color Theory Guide For Beginners](https://www.youtube.com/watch?v=tKCORDK0IZU)
- DesignSpo — [PRO Vs AMATEUR Website Design (With Examples)](https://www.youtube.com/watch?v=x8Vp8k3jXaA)
- DesignSpo — [PRO Vs AMATEUR Website Layouts (With Examples)](https://www.youtube.com/watch?v=L0Pk3OVbxRU)
- DesignSpo — [The Golden Rule Of Web Design](https://www.youtube.com/watch?v=CASPWJUsHPM)
- Daniel Priestley — [The $1 Million Landing Page](https://www.youtube.com/watch?v=az1Zh-FNSno)

Local analyses in `docs/research/youtube-library/analyses/` (six `2026-04-29_designspo-*_analysis.md` files) and `docs/marketing/growth/research/youtube-transcripts/2025-10-11-daniel-priestley-1m-landing-page-ANALYSIS.md`.
