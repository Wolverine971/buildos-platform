---
skill_id: landing-page-scorecard-funnel
name: Landing Page Scorecard Funnel
description: Design an assessment-driven landing page that converts visitors into qualified, segmented leads. Use when creating quizzes, scorecards, diagnostic funnels, lead magnets, or dynamic results pages for consulting, coaching, SaaS, education, agencies, or services.
skill_type: combo
categories:
    - marketing-and-content
    - sales-and-growth
lineage: lineage.yaml
path: docs/research/youtube-library/skill-drafts/landing-page-scorecard-funnel/SKILL.md
---

# Landing Page Scorecard Funnel

Use this skill when an agent needs to turn a landing page into a qualified lead-generation funnel. The page should sell the assessment, not the entire product. The assessment gives value first, then routes each lead to the right next step.

## Skill Composition (Experimental Lineage)

This is a combo skill. Its structured lineage draft lives in `docs/research/youtube-library/skill-drafts/landing-page-scorecard-funnel/lineage.yaml` and follows `docs/research/youtube-library/SKILL_LINEAGE_SCHEMA.md`.

Primitive skills currently composing this skill:

| Primitive                            | Job                                                                                          | Primary source layer          |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------- |
| Scorecard funnel architecture        | Connect landing page, questionnaire, results page, and follow-up into one conversion system. | Priestley                     |
| Mode selection                       | Decide whether the scorecard can stand alone or needs a setup layer first.                   | Priestley + Dunford synthesis |
| Assessment promise copy              | Sell the assessment with hook, question count, time cost, free price, and immediate payoff.  | Priestley                     |
| Setup layer positioning              | Prime considered buyers with market insight, alternatives, and a perfect-world scenario.     | Dunford                       |
| Alternatives-aware value proposition | Frame the three measured areas against the other options the buyer already considers.        | Dunford                       |
| Questionnaire signal design          | Capture contact data, score-driving answers, and qualification signals.                      | Priestley                     |
| Dynamic results personalization      | Convert answers into score, tailored insights, and a visible payoff.                         | Priestley                     |
| Lead segment routing                 | Route high-fit, middle-fit, and low-fit leads to different next steps.                       | Priestley                     |
| Credibility and trust                | Use evidence, creator background, and honest trade-offs without FOMO.                        | Priestley + Dunford           |

## When to Use

- Build an online assessment or diagnostic quiz
- Replace a generic lead magnet with a scorecard
- Qualify leads before a sales call
- Segment coaching, consulting, agency, SaaS, education, or service prospects
- Improve a landing page that collects emails but does not capture intent
- Create a personalized results page

Do not use this skill for a simple product homepage, a blog CTA, or a survey with no conversion path.

## Mode Selection (Run This First)

Two modes of this skill exist. Pick one before drafting.

- **Standalone scorecard.** Use when the buyer already feels the pain (info-product, coaching, fitness, services with self-evident category). The hook can name the frustration directly. The assessment carries most of the conversion work.
- **Setup-layered scorecard.** Use when the buyer needs the category framed before they will engage with an assessment. Common for B2B SaaS, considered-purchase tools, and any product where "why pick us over the alternatives" is non-obvious. Wrap the scorecard in a Setup → Follow-Through positioning layer (see _Setup Layer_ below).

Diagnostic: if the audience can answer "yes, I have this problem and I want to solve it" before they hit your page, use standalone. If they need to be taught how to evaluate the category first, use the setup-layered mode.

## Setup Layer (For B2B / Considered Purchases)

When in setup-layered mode, the page above the assessment runs a four-part positioning structure before the scorecard appears:

1. **Market Insight.** The unique perspective on how the category is changing or how the problem actually works. Not about your product. Frames how a smart buyer should think.
2. **Alternative Solutions Analysis.** Pros and cons of every current approach (including doing nothing). Name the alternatives explicitly. Honesty about trade-offs builds credibility.
3. **Perfect-World Scenario.** Description of an ideal solution, vendor-independent. This is where the buyer aligns with the value criteria you'll be measured on.
4. **Then the Scorecard.** Once the buyer is aligned with the worldview, the assessment becomes "let me see how I score against the ideal we just defined." Conversion rises because the scorecard is no longer the first ask.

Setup work usually lives in the page above the scorecard CTA, in a long-form essay that links to the scorecard, or in the email sequence that drives traffic to the scorecard. It does not have to live inside the scorecard page itself — but the buyer must encounter it before they take the assessment.

## Funnel Model

1. _(Setup-layered mode only)_ Setup positioning page primes the buyer.
2. Landing page sells the assessment.
3. Questionnaire captures contact info, best-practice answers, and qualification signals.
4. Dynamic results page gives a score, insights, and a tailored next step.
5. Follow-up uses answers to route leads instead of blasting everyone the same offer.

## Landing Page Structure

Build five sections in order:

1. **Hook.** Pick one of three forms based on buyer state:
    - **Frustration hook** (standalone mode, buyer feels the pain): "Frustrated that [outcome] is not happening even though you [do reasonable action]?"
    - **Readiness hook** (standalone mode, aspirational): "Are you ready to [aspirational outcome]?"
    - **Market Insight hook** (setup-layered mode, B2B / considered): "Here's what's changed about [category] — and what that means for how you should evaluate [solution type]." Used when the buyer needs the worldview shift before they will accept the frustration framing. Pair with the Setup layer above.
2. **Assessment promise.** State how many questions, what they will discover, and what they will know afterward.
3. **Differentiated-value proposition.** Name the three areas the assessment will measure and improve — and frame each one against the _alternatives the buyer already knows_. The question the value prop answers is not "what does this measure" but "why should I take this assessment instead of the other ones, the free articles, or just hiring a consultant?" In B2B, every "value proposition" line should imply a comparison.
4. **Credibility.** Explain who created the assessment, what experience it is based on, and what evidence supports the categories.
5. **CTA.** Stack action, time cost, price, and payoff: start the quiz, takes about 3 minutes, free, immediate recommendations. **Do not stack scarcity or FOMO** ("only 100 spots," "closing tonight"). FOMO produces buyers who feel manipulated and churn — the opt-in posture is what makes the scorecard's downstream segmentation worth running.

## Questionnaire Design

Use 15 questions in three buckets.

### Contact Capture

- Name: required
- Email: required
- Location: infer when possible, do not ask unless needed
- Phone: optional unless the business model requires it

### Best-Practice Questions

Ask 10 score-driving questions about whether the person follows known best practices in the domain. These should produce useful insights even before a sales call.

### Big 5 Qualification Questions

1. Current situation
2. Desired outcome in the next 90 days
3. Obstacle or failed prior attempt
4. Preferred solution type
5. Open-ended "anything else we should know?"

The preferred solution question is a budget and service-fit signal. A person asking for a book, course, software, coaching, or done-for-you help should not all receive the same next step.

## Dynamic Results Page

Include:

- Overall score with a clear visual metaphor
- Three personalized insights based on answers
- Next step based on qualification
- Footer with contact and trust links

Route leads:

- High fit: consult, demo, or 1-on-1 call
- Middle fit: webinar, group workshop, nurture path
- Low fit: educational content, book, video, or self-serve resource

## Guardrails

- Do not ask for more data than needed.
- Do not make phone mandatory unless the funnel truly depends on phone contact.
- Do not sell the product before the assessment promise is clear.
- Do not route every respondent to the same CTA.
- Do not call the results personalized if the page ignores the answers.
- Do not hide the payoff behind vague "learn more" language.
- **Do not use FOMO, scarcity, or urgency stunts in the CTA.** Manufactured urgency converts on the first taking but breaks the trust the segmentation step depends on. The scorecard's value comes from honest qualification; FOMO contradicts that posture.
- **Do not skip the Setup layer for B2B / considered purchases.** A scorecard that opens with a frustration hook on a buyer who hasn't accepted the category framing yet bounces hard. Either prime the buyer with the four-part Setup beforehand or use a Market Insight hook in mode-aware fashion.
- **Do not write feature-list value propositions.** The Value Proposition section names the three measured areas in terms that imply a comparison to alternatives, not in terms that recite the product's capabilities.

## Output

Return:

- **Mode** — standalone or setup-layered, with rationale.
- _(Setup-layered only)_ — Market Insight statement, named alternatives with trade-offs, perfect-world scenario.
- hook options _(by mode: frustration / readiness / market-insight)_
- three measured areas, each framed against the alternatives the buyer already considers
- 15-question outline
- scoring model
- lead segment rules
- results page outline
- next-step routing
- follow-up recommendations

## Source Attribution

Distilled from two sources at different layers of the funnel. Claim-level source mapping is captured in `lineage.yaml`.

- **Funnel mechanics layer:** Daniel Priestley's [The $1 Million Landing Page](https://www.youtube.com/watch?v=az1Zh-FNSno) — the five-section landing page, 15-question structure with three buckets, dynamic results page, and segmentation rules. Local analysis: `docs/marketing/growth/research/youtube-transcripts/2025-10-11-daniel-priestley-1m-landing-page-ANALYSIS.md`.
- **Positioning layer (setup-layered mode):** April Dunford's Sales Pitch framework on [Lenny's Podcast](https://www.youtube.com/watch?v=-VqmFI9vY7w) — the Setup → Follow-Through structure (market insight + alternatives + perfect-world scenario → differentiated value + proof + ask), the differentiated-value framing of value propositions, and the anti-FOMO posture. Local analysis: `docs/marketing/growth/research/youtube-transcripts/2026-04-29-april-dunford-sales-pitch-framework-ANALYSIS.md`.

Priestley supplies the _what to build_ (the assessment funnel itself); Dunford supplies the _what to write at each stage_ and the _whether to wrap it in a Setup layer_ — particularly for B2B and considered purchases where the scorecard alone is insufficient because the buyer hasn't yet accepted the category frame.
