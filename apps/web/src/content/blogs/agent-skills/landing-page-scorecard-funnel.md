---
title: 'Landing Page Scorecard Funnel: An Agent Skill For Qualified Lead Capture'
description: 'A portable agent skill for designing assessment-driven landing pages that sell the scorecard, capture useful signals, personalize results, and route leads by fit.'
author: 'DJ Wayne'
date: '2026-05-01'
lastmod: '2026-05-01'
changefreq: 'monthly'
priority: '0.9'
published: true
tags:
    [
        'agent-skills',
        'landing-pages',
        'scorecard-funnels',
        'lead-generation',
        'positioning',
        'sales-and-growth',
        'buildos'
    ]
readingTime: 8
excerpt: 'A scorecard funnel is not just a quiz. It is a landing page, questionnaire, dynamic results page, and routing system. This skill gives agents the operating playbook and cites the source lineage behind it.'
skillId: 'marketing-and-content/landing-page-scorecard-funnel'
skillType: 'combo'
skillCategory: 'marketing-and-content'
providers: ['YouTube source analysis', 'BuildOS YouTube library']
compatibleAgents: ['BuildOS-compatible agents', 'Claude Code', 'Codex', 'portable Agent Skills']
stackWith:
    [
        'marketing-site-design-review',
        'cold-email-contextual-outbound',
        'content-strategy-beyond-blogging'
    ]
skillSource: 'docs/research/youtube-library/skill-drafts/landing-page-scorecard-funnel/SKILL.md'
lineagePath: 'docs/research/youtube-library/skill-drafts/landing-page-scorecard-funnel/lineage.yaml'
lineagePeople:
    - 'Daniel Priestley'
    - 'April Dunford'
    - "Lenny's Podcast"
lineageStats:
    sources: 2
    primitives: 9
    sourceClaims: 8
    edges: 19
    candidateV2Sources: 2
lineageSources:
    - title: 'The $1 Million Landing Page'
      creator: 'Daniel Priestley'
      url: 'https://www.youtube.com/watch?v=az1Zh-FNSno'
      type: 'youtube_analysis'
      sourceRole: 'primary'
      localPath: 'docs/marketing/growth/research/youtube-transcripts/2025-10-11-daniel-priestley-1m-landing-page-ANALYSIS.md'
      usedFor:
          - 'funnel architecture'
          - 'landing page section order'
          - 'questionnaire structure'
          - 'dynamic results page'
          - 'lead segmentation'
    - title: 'April Dunford Sales Pitch Framework'
      creator: "April Dunford via Lenny's Podcast"
      url: 'https://www.youtube.com/watch?v=-VqmFI9vY7w'
      type: 'youtube_analysis'
      sourceRole: 'primary'
      localPath: 'docs/marketing/growth/research/youtube-transcripts/2026-04-29-april-dunford-sales-pitch-framework-ANALYSIS.md'
      usedFor:
          - 'setup-layered mode'
          - 'market insight'
          - 'alternatives analysis'
          - 'perfect-world scenario'
          - 'differentiated value'
          - 'anti-FOMO guardrail'
path: apps/web/src/content/blogs/agent-skills/landing-page-scorecard-funnel.md
---

# Landing Page Scorecard Funnel

Use this skill when an agent needs to turn a landing page into a qualified lead-generation funnel. The page should sell the assessment, not the entire product. The assessment gives value first, then routes each lead to the right next step.

## Skill Composition

This is a combo skill distilled from two source analyses: Daniel Priestley's scorecard funnel model and April Dunford's positioning-led sales pitch framework.

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

## Mode Selection

Two modes of this skill exist. Pick one before drafting.

- **Standalone scorecard.** Use when the buyer already feels the pain: info-product, coaching, fitness, or services with a self-evident category. The hook can name the frustration directly. The assessment carries most of the conversion work.
- **Setup-layered scorecard.** Use when the buyer needs the category framed before they will engage with an assessment. Common for B2B SaaS, considered-purchase tools, and any product where "why pick us over the alternatives" is non-obvious. Wrap the scorecard in a Setup -> Follow-Through positioning layer.

Diagnostic: if the audience can answer "yes, I have this problem and I want to solve it" before they hit your page, use standalone. If they need to be taught how to evaluate the category first, use setup-layered mode.

## Setup Layer

When in setup-layered mode, the page above the assessment runs a four-part positioning structure before the scorecard appears:

1. **Market Insight.** The unique perspective on how the category is changing or how the problem actually works. Not about your product. Frames how a smart buyer should think.
2. **Alternative Solutions Analysis.** Pros and cons of every current approach, including doing nothing. Name the alternatives explicitly. Honesty about trade-offs builds credibility.
3. **Perfect-World Scenario.** Description of an ideal solution, vendor-independent. This is where the buyer aligns with the value criteria you will be measured on.
4. **Then the Scorecard.** Once the buyer is aligned with the worldview, the assessment becomes "let me see how I score against the ideal we just defined."

Setup work usually lives in the page above the scorecard CTA, in a long-form essay that links to the scorecard, or in the email sequence that drives traffic to the scorecard. It does not have to live inside the scorecard page itself, but the buyer must encounter it before they take the assessment.

## Funnel Model

1. Setup positioning page primes the buyer, if the skill is in setup-layered mode.
2. Landing page sells the assessment.
3. Questionnaire captures contact info, best-practice answers, and qualification signals.
4. Dynamic results page gives a score, insights, and a tailored next step.
5. Follow-up uses answers to route leads instead of blasting everyone the same offer.

## Landing Page Structure

Build five sections in order:

1. **Hook.** Pick one of three forms based on buyer state:
    - **Frustration hook:** "Frustrated that [outcome] is not happening even though you [do reasonable action]?"
    - **Readiness hook:** "Are you ready to [aspirational outcome]?"
    - **Market insight hook:** "Here is what has changed about [category], and what that means for how you should evaluate [solution type]."
2. **Assessment promise.** State how many questions, what they will discover, and what they will know afterward.
3. **Differentiated-value proposition.** Name the three areas the assessment will measure and improve, and frame each one against the alternatives the buyer already knows.
4. **Credibility.** Explain who created the assessment, what experience it is based on, and what evidence supports the categories.
5. **CTA.** Stack action, time cost, price, and payoff: start the quiz, takes about 3 minutes, free, immediate recommendations. Do not stack scarcity or FOMO.

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
- Do not use FOMO, scarcity, or urgency stunts in the CTA.
- Do not skip the setup layer for B2B or considered purchases.
- Do not write feature-list value propositions.

## Output

Return:

- **Mode:** standalone or setup-layered, with rationale
- **Setup-layered only:** market insight statement, named alternatives with trade-offs, perfect-world scenario
- hook options by mode
- three measured areas, each framed against the alternatives the buyer already considers
- 15-question outline
- scoring model
- lead segment rules
- results page outline
- next-step routing
- follow-up recommendations

## Source Lineage

This skill is distilled from two source layers.

- **Funnel mechanics layer:** Daniel Priestley's [The $1 Million Landing Page](https://www.youtube.com/watch?v=az1Zh-FNSno), which supplies the five-section landing page, 15-question structure, dynamic results page, and segmentation rules.
- **Positioning layer:** April Dunford's sales pitch framework on [Lenny's Podcast](https://www.youtube.com/watch?v=-VqmFI9vY7w), which supplies the Setup -> Follow-Through structure, differentiated-value framing, and anti-FOMO posture.

Priestley supplies the assessment funnel mechanics. Dunford supplies the positioning layer and the decision rule for when the scorecard needs setup before the ask.
