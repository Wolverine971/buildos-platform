---
title: 'The $1 Million Landing Page: Lessons from Daniel Priestley'
description: 'A deep read of Daniel Priestley''s "$1 Million Landing Page" — the 3-part scorecard funnel (landing page sells the assessment, 15-question quiz in 3 buckets, dynamic results page), the Big 5 qualifying questions, and the 20–40% conversion benchmark.'
author: 'DJ Wayne'
date: '2026-05-04'
lastmod: '2026-05-04'
changefreq: 'monthly'
priority: '0.7'
published: true
tags:
    [
        'source-analysis',
        'lead-generation',
        'landing-page',
        'scorecard',
        'assessment-funnel',
        'conversion',
        'sales-and-growth',
        'marketing-and-content'
    ]
readingTime: 11
excerpt: 'Sell the assessment, not the product. The whole landing page is for one click — start the quiz. A 5-section landing page + 15 questions in 3 buckets + a dynamic results page produces a qualified, segmented sales pipeline with intent data baked in. Target: 20–40% of visitors start the quiz.'
sourceTitle: 'The $1 Million Landing Page'
sourceCreator: 'Daniel Priestley'
sourceUrl: 'https://www.youtube.com/watch?v=az1Zh-FNSno'
sourceChannelUrl: 'https://www.youtube.com/@DanielPriestley'
lineagePeople:
    - 'Daniel Priestley'
lineageSources:
    - title: 'The $1 Million Landing Page'
      creator: 'Daniel Priestley'
      creatorType: 'Person'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=az1Zh-FNSno'
relatedSkills:
    - 'landing-page-scorecard-funnel'
path: apps/web/src/content/blogs/source-analyses/daniel-priestley-1m-landing-page.md
---

# The $1 Million Landing Page: Lessons from Daniel Priestley

A deep read of Daniel Priestley's [The $1 Million Landing Page](https://www.youtube.com/watch?v=az1Zh-FNSno) (12:02). Priestley is the co-founder of ScoreApp and runs this scorecard system across agencies, software, education, coaching, and consulting businesses.

## Why this analysis exists

This is one of the source layers behind the BuildOS [`landing-page-scorecard-funnel`](/agent-skills/landing-page-scorecard-funnel) skill. The skill encodes the 3-part funnel mechanics, the 5-section landing page formula, and the Big 5 qualifying questions as agent-runnable rubrics. This post is the long form: the whole system, section by section.

## Core thesis

> "Everything is downstream from lead generation. If you can generate leads, you can solve all the other problems after that. But if you cannot generate leads, you are dead in the water."

Most landing pages try to sell the product. Priestley's argument: sell the **assessment**, not the product. The whole landing page is for one click — start the quiz. The quiz delivers value (insights + recommendations) before any sales conversation. You earn the right to make a tailored offer.

Target conversion: **20–40% of landing-page visitors start the quiz.**

## The 3-part system at a glance

1. **Landing page** — sells the assessment itself (not the product).
2. **Questionnaire** — 15 questions in 3 buckets (contact / best practices / qualifying "Big 5").
3. **Dynamic results page** — personalized score + insights + tailored next step.

Then send traffic (paid + organic) to the landing page.

## Part 1 — The landing page

The landing page has **5 sections, in this exact order.**

### Section 1 — The hook (top of page)

Two flavors. Pick one.

**A. Frustration hook**

Format: _"Feeling frustrated that [outcome] isn't happening **even though** you're [doing the right thing]?"_

Examples:

- "Frustrated you're not getting fitness results even though you work out every week"
- "Frustrated you're not getting investment returns even though you invest consistently every month"
- "Frustrated you can't scale your marketing even though you're willing to invest in ads"

Why it works: names the user's exact internal monologue.

**B. Results hook (readiness sentence)**

Format: _"Are you ready to [aspirational result]?"_

Examples:

- "Are you ready to run your first marathon?"
- "Are you ready to have the relationship of your dreams?"
- "Are you ready to protect your business from a cyber security threat?"

Why it works: people answer "I'm not sure if I'm ready — let me take the assessment to find out."

### Section 2 — The subheading (under the hook)

Hard-coded formula:

> _"Answer 15 questions to find out why you're experiencing this frustration and what to do about it."_

This single line directs the visitor into the funnel.

### Section 3 — Value proposition

Format: _"Take this assessment so we can measure and improve [3 key areas]."_

The 3 areas should be **stepping-stones to the big result** — things people would love to achieve along the way.

Sleep example:

- Sleep environment
- Sleep routine
- Sleep nutrition

### Section 4 — Credibility

After a strong hook + value prop, the visitor's brain says "this sounds too good to be true." Pre-empt:

- **Who created this** (you + your bio)
- **Your background** (what you've done)
- **Research / stats** that anchor the assessment
    - "85% of people struggle with X, Y, Z"
    - "A recent Harvard study found 15% of people are achieving X — this number can be dramatically improved"

### Section 5 — Call to action

Stack 4 things together:

1. **"Start the quiz"** (clear next step)
2. **"Only takes 3 minutes"** (low time cost)
3. **"Completely free"** (low money cost)
4. **"Get immediate recommendations on how to improve"** (instant payoff)

> Get this right and **20–40% of landing page visitors start the quiz.**

## Part 2 — The questionnaire (15 questions in 3 buckets)

### Bucket 1: Contact capture (gate before quiz starts)

| Field        | Required?    | How                      |
| ------------ | ------------ | ------------------------ |
| Name         | Yes          | User enters              |
| Email        | Yes          | User enters              |
| Location     | Auto         | Pulled from IP address   |
| Phone number | **Optional** | User enters if they want |

**Trick:** Don't make phone mandatory — friction kills completion. You'll get phone numbers from the highly motivated.

### Bucket 2: 10 "best practices" questions (these drive the score)

Ask 10 yes/no-ish questions about whether they're doing the things they _should_ be doing in your domain.

- **Sleep example:** Do you go to bed at the same time? Do you avoid screens before bed?
- **Fitness example:** Do you track calories? Do you work out 3–4×/week?

These answers feed the score on the results page.

### Bucket 3: The "Big 5" qualifying questions

These are the moneymakers — they let you qualify and segment leads.

**Q1 — Current situation**

> "Which best describes your current situation?"

- Multiple choice with 4–5 options.
- Examples: student / first 5 years of career / manager / senior leader / executive.
- Or: never run a marathon / 1–3 marathons / seasoned runner.

**Q2 — Desired outcome**

> "Which describes the desired outcome you'd like to achieve in the next 90 days?"

Tells you their **#1 driver** for the buying decision.

**Q3 — Obstacle**

> "What is the obstacle you think is stopping you?" _(or "What have you tried that hasn't worked?")_

Tells you what objections to handle.

**Q4 — Preferred solution** (this one is sneaky-good)

> "Which solution do you think would suit you best?"

- Options: book / education & training / 1-on-1 coaching / software / done-for-you.
- **This implies budget.** A "book" person = $10–$20. A "done-for-you" person = $10K–$20K.

**Q5 — Open box**

> "Is there anything else you think we need to know about?"

Free-text field. People volunteer wild gold here:

- "I've already read your book and want to get started"
- "I have a budget but have to spend it by end of month"

By Q15, they've invested 14 questions of effort — they're primed to spill.

## Part 3 — The dynamic results page

The reason it's called "dynamic": **the page changes based on how they answered.**

### Page structure (top to bottom)

1. **The big reveal** — overall score
    - Speedometer (75/100), thermometer (cold/warm/hot), or any visual metaphor.
    - Copy adapts: "Congratulations, you scored well" / "You've got strong foundations but room to improve" / "You've got a lot of room to improve"

2. **Three insights** — what to know based on how they answered.

3. **Next steps** — segmentation pays off here:

| Lead quality            | Next step offered                             |
| ----------------------- | --------------------------------------------- |
| Highly qualified        | 1-on-1 meeting / sales call                   |
| Middle of the pack      | Group event / webinar / group presentation    |
| Wrong fit / unqualified | Content (video, podcast, book recommendation) |

4. **Footer** — contact info, social links, website.

### Back-end dashboard

Per lead, you see:

- All 15 answers
- Their score
- Geo location
- Whether contact info is real
- The recommended next step the system fired

You're not just collecting emails — you're collecting a **qualified, segmented sales pipeline** with intent data baked in.

## Distilled tips & tricks

### Strategic

- **Sell the assessment, not the product.** The whole landing page is for one click — start the quiz.
- **Give first.** The quiz delivers value before any sales conversation.
- **Score-then-segment beats capture-then-blast.** You earn the right to make a tailored offer.
- **Treat the 5th open question as a sales asset.** It's the most underrated field on the internet.

### Copy

- **Frustration hooks beat aspirational hooks** when the audience is suffering. Use "even though" — it names the paradox they live with.
- **Readiness language** ("are you ready to…") triggers a "let me check" reflex.
- **Stack 4 things in your CTA**: action + time + price + payoff.
- **Pre-empt skepticism** with credibility _before_ the CTA, not after.

### Funnel mechanics

- **Make phone optional, name + email required.** Friction kills.
- **Geo from IP** — never ask for a city.
- **The "preferred solution" question is a covert budget qualifier.** Use it to route leads.
- **15 questions is the right length.** Long enough to qualify, short enough to finish (3 mins).
- **Promise 3 minutes** in the CTA — the brain decides yes/no on time cost.

### Conversion benchmark

- **20–40% of landing-page visitors → start the quiz** if the page is built right. Use this as your north-star metric.

## Notable quotes

> "Everything is downstream from lead generation."

> "The juice is worth the squeeze because this thing produces so many high-quality leads."

> "Someone who only wants a book is probably going to spend $10 or $20. Someone who says 'I want it all done for me,' they're probably thinking $10,000 to $20,000."

## How BuildOS uses this

This source informs how the [`landing-page-scorecard-funnel`](/agent-skills/landing-page-scorecard-funnel) skill structures assessment-driven funnels. Specific applications:

- The skill uses Priestley's 5-section landing page as the **default page structure** for any BuildOS-derived assessment funnel.
- The Big 5 qualifying questions (especially Q4 — preferred solution) are encoded as agent-runnable templates that translate budget signals into routing decisions.
- The 20–40% start-rate is treated as the **conversion benchmark**: any BuildOS funnel that under-performs gets a structural audit before any copy revision.
- Pair with the positioning layer from [April Dunford's Sales Pitch Framework](/blogs/source-analyses/april-dunford-sales-pitch-framework) — Priestley supplies the funnel mechanics, Dunford supplies the worldview the funnel runs on top of.

## Related

- Skill: [`landing-page-scorecard-funnel`](/agent-skills/landing-page-scorecard-funnel) — uses this 3-part funnel as the operating spine.
- Companion source analysis: [The Sales Pitch Framework: Lessons from April Dunford](/blogs/source-analyses/april-dunford-sales-pitch-framework) — positioning layer that determines whether the scorecard's hook lands.
- Tool referenced: [ScoreApp](https://scoreapp.com) (Priestley's own scorecard tool).
