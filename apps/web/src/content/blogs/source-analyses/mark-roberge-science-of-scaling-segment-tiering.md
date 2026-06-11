---
title: 'Science of Scaling: Lessons from Mark Roberge'
description: 'A deep read of Mark Roberge''s revenue-growth framework — the aha-moment formula ("P% of customers achieve E events every T days"), the Green/Yellow/Red segment tiering, the Quality-x-Engagement lead grid, and why retention beats growth as the leading indicator of product-market fit.'
author: 'DJ Wayne'
date: '2026-05-15'
lastmod: '2026-05-15'
changefreq: 'monthly'
priority: '0.7'
published: true
tags:
    [
        'source-analysis',
        'cold-email',
        'icp',
        'segment-scoring',
        'product-market-fit',
        'sales-and-growth'
    ]
readingTime: 8
excerpt: 'Mark Roberge''s thesis is that most series-C failures are caused by scaling sales on top of an unfinished product-market-fit measurement. The fix is a single retention formula ("P% of customers achieve E events every T days") that becomes the leading indicator, a Green/Yellow/Red view of which segments actually have PMF, and a Quality × Engagement grid that rewards demo requests over ebook downloads. Cold outreach without a segment tier is wasted budget.'
sourceTitle: 'A Step-by-Step Guide to Revenue Growth (SaaStr Annual)'
sourceCreator: 'Mark Roberge (Stage 2 Capital / HBS)'
sourceUrl: 'https://www.youtube.com/watch?v=aIAbNeqn9K8'
sourceChannelUrl: 'https://www.youtube.com/@Saastr'
lineagePeople:
    - 'Mark Roberge'
lineageSources:
    - title: 'A Step-by-Step Guide to Revenue Growth with Mark Roberge, Harvard Business School'
      creator: 'Mark Roberge'
      creatorType: 'Person'
      creatorUrl: 'https://www.hbs.edu/faculty/Pages/profile.aspx?facId=1062358'
      channelName: 'SaaStr AI'
      channelUrl: 'https://www.youtube.com/@Saastr'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=aIAbNeqn9K8'
    - title: 'The Sales Acceleration Formula'
      creator: 'Mark Roberge'
      creatorType: 'Person'
      sourceType: 'book'
      url: 'https://www.markroberge.com/'
    - title: 'Stage 2 Capital — Science of Scaling'
      creator: 'Mark Roberge'
      creatorType: 'Person'
      sourceType: 'web_page'
      url: 'https://www.stage2.capital/science-of-scaling-book'
relatedSkills:
    - 'cold-email-engagement-first-outreach'
    - 'cold-email-icp-signal-design'
path: apps/web/src/content/blogs/source-analyses/mark-roberge-science-of-scaling-segment-tiering.md
---

# Science of Scaling: Lessons from Mark Roberge

A deep read of [A Step-by-Step Guide to Revenue Growth](https://www.youtube.com/watch?v=aIAbNeqn9K8) (31:49) from SaaStr Annual, given by Mark Roberge — Senior Lecturer at Harvard Business School, former CRO of HubSpot, author of _The Sales Acceleration Formula_, and founding partner at Stage 2 Capital.

## Why this segment tiering analysis exists

This is one of the source layers behind the BuildOS [`cold-email-icp-signal-design`](/agent-skills/cold-email-icp-signal-design) child skill. It supplies the **leading indicator of retention (LIR) formula**, the **segment-tier view of product-market fit**, and the **Quality × Engagement lead grid** that the skill uses to decide _which accounts get the manual cold-outreach treatment_ vs. which get inbound-only handling vs. which get disqualified.

## Core thesis

> "75% of series-C startups fail. We're screwing up the scale. The first slide of your board deck should not be revenue growth — it should be revenue retention."

Most startups misread product-market fit. They measure new ARR and growth rate and feel validated; they raise a Series C; they scale headcount; revenue actually goes _down_ because they were scaling on top of an unfinished foundation. The fix is to measure retention _as a leading indicator_ before scaling sales.

Three checkpoints, in order:

1. **Product-market fit** measured by customer value creation (leading indicator of retention).
2. **Go-to-market fit** measured by unit economics (LTV/CAC &gt; 3, payback &lt; 12 months).
3. **Scale** — added at a pace, not all at once.

Cold outreach (and SDR hiring) lives in checkpoint 3. Running it before checkpoint 1 is the Series-C failure pattern.

## The Leading Indicator of Retention (LIR) formula

Churn is a lagging indicator — by the time it shows up in the data, you have already wasted a year. The fix is a single sentence that defines the leading indicator:

> **"P% of customers achieve E event(s) every T days."**

Three slots:

- **P** = the percentage threshold (e.g., 70%).
- **E** = the activation event(s) that correlate with long-term value (Slack: team sends 2,000 messages; Dropbox: user adds a file in a folder on a device; HubSpot: customer uses 5 of 25 features).
- **T** = the window in which the event must happen (typically 30 or 60 days from signup).

Roberge's claim: this is the slide that should open the board deck. If the LIR is hitting target, the segment has product-market fit. If it is not, no amount of sales effort fixes the gap.

## Green / Yellow / Red — segment-level PMF

The bigger insight in the talk is that PMF is **never uniform across segments**. Roberge walks through a six-box grid: small business / mid-market / enterprise, each split by inbound and outbound.

> "We only had product-market and go-to-market fit in the top center. We really only knew how to sell mid-market companies through inbound demand gen."

The pattern he sees in nearly every company:

| Segment × Motion      | LIR     | LTV/CAC                          | Verdict                                     |
| --------------------- | ------- | -------------------------------- | ------------------------------------------- |
| Mid-market × Inbound  | 70%     | 5M / 8mo payback / 6% logo churn | **Green** — scale this.                     |
| Enterprise × Inbound  | Lower   | Payback too long                 | **Yellow** — experiment, do not scale.      |
| Mid-market × Outbound | Mixed   | SDR efficiency unproven          | **Yellow** — experiment, do not scale.      |
| SMB × Anything        | LIR low | Churn too high                   | **Red** — disqualify until product changes. |

The Series-C failure pattern: take the Series C money raised on Mid-market × Inbound performance and spend it adding outbound SDRs and enterprise reps in segments that have not earned PMF. The right play is to **scale only Green segments** and run small cross-functional teams to find PMF in the Yellow boxes.

For cold outreach: **Green = manual outreach worth doing. Yellow = experiment only. Red = do not write.**

## The Quality × Engagement lead grid

Roberge's HubSpot example for connecting marketing and sales. Two axes:

- **Quality** (company-side, A/B/C by company size, revenue, or fit). 10,000+ employees → A; 100–10,000 → B; under 100 → C.
- **Engagement** (action-side, A/B/C by signal strength). Demo request → A; ebook download → B; blog signup → C.

Marketing gets paid not on lead _count_ but on lead _value_, with prices attached to each cell of the 3×3 grid. An A/A lead might be worth $100 of credit; a C/C lead $10. Marketing's quota becomes a revenue-credit number, not a lead-count number.

Two implications for cold outreach:

1. **Inbound-converted demo requests** are higher-quality than blog-driven leads even when both come from the same account. Outbound prioritization should treat inbound engagement as a _signal_, not a downstream consequence of outbound.
2. **The 3×3 grid is the disqualifier rubric.** C/C leads are not "lower-priority outreach" — they are _out of ICP_ until the product or pricing changes. Treating them as a stretch tier is what produces unprofitable outbound.

## The hiring formula — coachability is the surprise

The other usable piece for the skill: when Roberge ran a regression on what predicted HubSpot rep success across 100+ hires, the top correlated trait was not closing ability or objection handling (both negatively correlated) but:

> "Coachability was the one. It was those reps who checked all the other boxes — huge success — but they showed up on the first day and said, 'Mark, thank you for the training but I'd been selling for five or 10 years, I'll just be in my cubicle.' And that was the issue."

Negatively correlated traits in his data: closing ability, convincing-ness, objection handling. Positively correlated: preparation, domain experience, intelligence, coachability, curiosity.

For the outreach skill this is a tangent — but it lands one durable point: **the skills that look like sales (closing, convincing) are anti-predictive of success in a consultative B2B motion.** Cold outreach that _sounds_ like sales is doing the same thing in writing.

## How to use segment tiering

Turn the talk into a prioritization discipline for your own outreach:

1. **Define an LIR target per segment.** "P% of customers hit E events every T days." If you can't write one, the segment is unproven — your outreach there is an experiment, not a scaled campaign.
2. **Tier segments Green / Yellow / Red.** Green earns manual, high-effort outreach. Yellow gets small-batch tests that change one variable. Red stays out of campaigns entirely.
3. **Let inbound signals upgrade an account.** A demo request, pricing-page visit, or trial signup matters more than company size — a small company that requested a demo is a stronger target than a big one that read a blog post.
4. **Only run volume against the slice with measured PMF.** Ask which slice of the ICP actually retains today, and point the campaign there. Everything else is a PMF experiment — label it as one before you scale it.

This is the PMF-validation layer of a three-part segment-targeting read: start with the [minimum viable segment gate](/blogs/source-analyses/underscore-vc-minimum-viable-segment) for a fast first pass, score fit with [Lincoln Murphy's ICP framework](/blogs/source-analyses/lincoln-murphy-ideal-customer-profile-framework), then use the Green/Yellow/Red tiering here to decide where real budget goes.

## Caveats

- **2019 talk, 31 minutes.** Roberge's later work — _The Science of Scaling_ book (2024) and the Stage 2 Capital podcast — formalizes more of this. The 2019 SaaStr talk has the cleanest single-slide articulation of LIR and the Green/Yellow/Red grid.
- **HubSpot-scale data.** The hiring-formula regression had 100+ rep observations. The PMF-by-segment pattern is observation across 25+ companies he has worked with, not formal research.
- **HubSpot-context bias.** The Quality × Engagement grid is built for inbound-heavy SaaS. For founder-led, recruiting, investor, or PR outreach, the inbound signal is weaker and the grid simplifies.

## Source

- **Transcript:** `2026-05-15-mark-roberge-science-of-scaling-hbs.md` (in-repo working transcript, unpublished)
- **Video:** [A Step-by-Step Guide to Revenue Growth](https://www.youtube.com/watch?v=aIAbNeqn9K8) (SaaStr AI, 2019-02-26, 31:49)
- **Book:** _The Science of Scaling_ — Stage 2 Capital ([book page](https://www.stage2.capital/science-of-scaling-book))
- **Earlier book:** _The Sales Acceleration Formula_ — Mark Roberge
- **Podcast:** [Science of Scaling](https://www.youtube.com/@ScienceofScaling)
