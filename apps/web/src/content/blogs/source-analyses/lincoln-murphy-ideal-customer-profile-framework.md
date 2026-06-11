---
title: 'Ideal Customer Profile: Lessons from Lincoln Murphy'
seoTitle: 'Ideal Customer Profile: Lincoln Murphy'
description: "A deep read of Lincoln Murphy's canonical ICP framework — the seven dimensions (Ready, Willing, Able, Success Potential, Acquisition Efficiency, Ascension, Advocacy), the six fit types inside Success Potential, why the ICP describes a situation rather than a permanent customer type, and how it differs from a buyer persona."
author: 'DJ Wayne'
date: '2026-05-15'
lastmod: '2026-05-15'
changefreq: 'monthly'
priority: '0.7'
published: true
tags: ['source-analysis', 'cold-email', 'icp', 'segmentation', 'signal-design', 'sales-and-growth']
readingTime: 7
excerpt: "Lincoln Murphy's ICP is the framework most other ICP frameworks descend from. It is not a buyer persona, not a list of titles, not a TAM number. It is a seven-dimension description of the customer who can succeed with your product right now — and the six fit types that decide whether they can succeed at all. Cold outreach without this is a list, not an ICP."
sourceTitle: 'The Ideal Customer Profile (ICP) Framework'
sourceCreator: 'Lincoln Murphy (Sixteen Ventures)'
sourceUrl: 'https://www.sixteenventures.com/ideal-customer-profile/'
sourceChannelUrl: 'https://www.sixteenventures.com/'
lineagePeople:
    - 'Lincoln Murphy'
lineageSources:
    - title: 'The Ideal Customer Profile (ICP) Framework'
      creator: 'Lincoln Murphy'
      creatorType: 'Person'
      creatorUrl: 'https://www.sixteenventures.com/about'
      channelName: 'Sixteen Ventures'
      channelUrl: 'https://www.sixteenventures.com/'
      sourceType: 'blog'
      url: 'https://www.sixteenventures.com/ideal-customer-profile/'
relatedSkills:
    - 'cold-email-engagement-first-outreach'
    - 'cold-email-icp-signal-design'
path: apps/web/src/content/blogs/source-analyses/lincoln-murphy-ideal-customer-profile-framework.md
---

# Ideal Customer Profile: Lessons from Lincoln Murphy

A deep read of Lincoln Murphy's canonical [Ideal Customer Profile framework](https://www.sixteenventures.com/ideal-customer-profile/) on Sixteen Ventures. Murphy has been writing about Customer Success and ICP design since 2009; his framework is the one Mark Roberge, Aaron Ross, and most modern RevOps practitioners cite or extend.

## Why this ideal customer profile analysis exists

This is one of the source layers behind the BuildOS [`cold-email-icp-signal-design`](/agent-skills/cold-email-icp-signal-design) child skill. It supplies the **seven-dimension ICP rubric** and the **six-fit-type taxonomy** that the skill uses to score whether a prospect is worth writing at all — before any trigger, anchor, or offer work begins.

## Core thesis

> "You actually get to choose your customers. When unfocused, companies end up making a connection with no one."

An ICP is not a TAM number, not a buyer persona, and not a job title. It is a **description of the customer who can succeed with your product right now**. The customer who _cannot_ succeed is not "out of scope" — they are an active drain. The ICP is the gate that keeps them out.

The framework is built for empowerment, not exclusion. You are not narrowing because you are afraid; you are narrowing because the right customer is more findable, more activatable, more retainable, and more likely to refer than a generic prospect.

## ICP vs. Buyer Persona — they are not the same

Murphy is explicit:

> "You simply cannot know what the personas look like… until you are clear on your Ideal Customer Profile."

| Layer       | What it describes                                                            |
| ----------- | ---------------------------------------------------------------------------- |
| **ICP**     | The _company_ (or situation) where your product can deliver value right now. |
| **Persona** | The _individual decision-maker_ inside an ICP-fit company.                   |

A persona — _"HR Henry, 35–45, oversees a team of 12, reads Lenny's newsletter"_ — is meaningless until the ICP question is answered. A perfectly-rendered persona at a company with no fit produces nothing.

This is the most common cold-outreach failure mode: rich personas painted on top of unqualified accounts.

## The seven ICP dimensions

Murphy's framework has seven dimensions. The first three are gates — the prospect either passes or they are not in your ICP. The next four are quality dimensions — they tell you _how good_ an ICP-fit account is.

| #   | Dimension                  | What it asks                                                                                       |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | **Ready**                  | Is the customer aware of the problem and feeling urgency about it now?                             |
| 2   | **Willing**                | Are they action-oriented? Is something forcing them to change (the catalyst)?                      |
| 3   | **Able**                   | Do they have the financial means, the authority, and a buying process that can actually close?     |
| 4   | **Success Potential**      | Can they realistically achieve the desired outcome with your product? (Six fit types — see below.) |
| 5   | **Acquisition Efficiency** | Are they cost-effective to reach and onboard at this stage of your company?                        |
| 6   | **Ascension Potential**    | Can they expand inside the account — more seats, more product, more spend?                         |
| 7   | **Advocacy Potential**     | Will they refer, give referenceable case studies, or generate word-of-mouth?                       |

The first three (Ready, Willing, Able) are the cold outreach gates. If any of the three is missing, the outreach is mis-timed regardless of how good the email is. This maps directly onto Craig Elias's three-event model: Ready ≈ Event 1 (they want to change), Willing ≈ catalyst between Event 1 and Event 2, Able ≈ Event 2 (they can change) + Event 3 (they can justify it).

## The six Success Potential fit types

The most underused part of the framework. Success Potential decomposes into six sub-fit types, each of which can independently disqualify a prospect:

| Fit type           | What it means                                                            | What disqualifies                                                                  |
| ------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| **Technical fit**  | Their tech stack, infrastructure, and integrations support your product. | Wrong CRM, no API access, on-prem when you are cloud-only.                         |
| **Functional fit** | The product solves their actual job-to-be-done.                          | They want a feature you don't have; they want it for a use case you don't support. |
| **Resource fit**   | They have the time, headcount, and budget to deploy and use the product. | Solo founder evaluating an enterprise tool.                                        |
| **Competence fit** | Their team has the skills to use the product correctly.                  | A tool that requires SQL fluency offered to a non-technical team.                  |
| **Experience fit** | They have the maturity to know what good looks like.                     | First-time buyer of a category — likely to evaluate on the wrong criteria.         |
| **Cultural fit**   | The way they work matches how the product works.                         | "Move fast" culture buying a slow, governance-heavy tool.                          |

For cold outreach, each fit type maps to a _disqualifier in the segment definition_. A segment is not "VPs of Sales at 50–200-employee SaaS companies." It is that, _minus_ the accounts that fail one of the six fit checks.

## Situational awareness — the ICP is a situation, not a forever-customer

> "ICP targets a situation, not all future business."

Murphy's most clarifying move: the ICP is the customer who can succeed in a **defined time frame** (typically 3–6 months) with a **specific goal** (revenue target, customer count, advocate count) given your **current capabilities** (today's product maturity, today's support capacity).

When the company grows, the situation changes, and the ICP changes with it. A startup at $1M ARR has a different ICP than the same company at $10M ARR — and _both_ are different from a generic "lifetime ideal customer."

This is the FOMO antidote. The ICP is not "the only customer you will ever take." It is "the customer this quarter who pays back the most growth-per-effort." Adjacent accounts are not lost forever; they are next quarter's ICP after the product, the team, and the support capacity grow.

## How to apply the ICP framework

Turn the framework into a working segment scorecard:

1. **Score on the seven dimensions.** Treat Ready / Willing / Able as pass/fail gates; treat Success Potential / Acquisition / Ascension / Advocacy as quality multipliers on the segments that clear those gates.
2. **Build a disqualifier checklist from the six fit types.** For each fit type, write the one thing that disqualifies an account on that dimension. The checklist is faster to run than re-scoring every account from scratch.
3. **Define the ICP before the persona.** The person you email only matters once you know the company that can succeed. A draft built on a persona with no ICP behind it is guessing.
4. **Treat every ICP as time-bound.** Re-test it every three to six months, and write down the company-stage assumptions it rests on. An ICP from a year ago describes a company you no longer are.

Murphy's situation-bound ICP answers _which company_ can succeed; a trigger-based read answers _when_ that company is actually shopping. You want both — fit scoring tells you who to pursue, timing tells you when the email will land.

This is the deep fit-scoring layer of a three-part segment-targeting read: run the [minimum viable segment gate](/blogs/source-analyses/underscore-vc-minimum-viable-segment) as the fast first pass, score the survivors with Murphy's seven dimensions here, then validate with the PMF-by-segment tiering in [Mark Roberge's science of scaling](/blogs/source-analyses/mark-roberge-science-of-scaling-segment-tiering).

## Caveats

- **Long-form blog post**, last updated 2017. Murphy's framework is foundational; the post has not been refreshed for the intent-data era. Use as the scoring spine, not as the timing layer.
- **B2B SaaS framing.** Some dimensions (Ascension, Advocacy) assume a multi-year customer relationship. For one-time-transaction sales, Ascension collapses.
- **Practitioner-grade evidence (Level 4).** No experimental data behind the seven-dimension cut — the framework is opinion-by-experience, widely adopted but not formally validated.

## Source

- **Framework page:** [Ideal Customer Profile (ICP) Framework](https://www.sixteenventures.com/ideal-customer-profile/) — Lincoln Murphy, Sixteen Ventures.
- **Author profile:** [Lincoln Murphy / Sixteen Ventures](https://www.sixteenventures.com/about)
- **Companion framework:** Murphy's separate post on the six Success Potential fit types is the canonical deep-dive.
