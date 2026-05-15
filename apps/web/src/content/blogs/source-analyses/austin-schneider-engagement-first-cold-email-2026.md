---
title: 'Engagement-First Cold Email: Lessons from Austin Schneider (Instantly)'
description: 'A deep read of Instantly''s "The New Way of Cold Emailing in 2026" — why AI spam filters killed the seven-touch playbook, the deliverability infrastructure floor (5 emails per domain, ~30/day each), micro-targeted value campaigns (the under-50-recipient reply-rate cliff), and the two-touch rule with non-responder recycling.'
author: 'DJ Wayne'
date: '2026-05-14'
lastmod: '2026-05-14'
changefreq: 'monthly'
priority: '0.7'
published: true
tags:
    [
        'source-analysis',
        'cold-email',
        'deliverability',
        'micro-targeting',
        'two-touch-rule',
        'sales-and-growth',
        'marketing-and-content'
    ]
readingTime: 11
excerpt: 'Gmail rolled out AI spam filters in 2024. Microsoft followed in 2025. The seven-touch, 10,000-emails-a-month playbook that worked in 2022–2023 now gets you flagged as a bulk sender. The 2026 version is engagement-first: deliverability infrastructure first, micro-targeted value campaigns second, a strict two-touch rule third — and the value in the email has to be an actual deliverable, not "worth a chat."'
sourceTitle: 'The New Way of Cold Emailing in 2026'
sourceCreator: 'Austin Schneider (Instantly)'
sourceUrl: 'https://www.youtube.com/watch?v=h8u840Wm-BI'
sourceChannelUrl: 'https://www.youtube.com/@InstantlyAI'
lineagePeople:
    - 'Austin Schneider'
    - 'Instantly'
lineageSources:
    - title: 'The New Way of Cold Emailing in 2026'
      creator: 'Austin Schneider'
      creatorType: 'Person'
      creatorUrl: 'https://www.instagram.com/theaustinschneider'
      channelName: 'Instantly'
      channelUrl: 'https://www.youtube.com/@InstantlyAI'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=h8u840Wm-BI'
relatedSkills:
    - 'cold-email-engagement-first-outreach'
path: apps/web/src/content/blogs/source-analyses/austin-schneider-engagement-first-cold-email-2026.md
---

# Engagement-First Cold Email: Lessons from Austin Schneider (Instantly)

A deep read of Instantly's [The New Way of Cold Emailing in 2026](https://www.youtube.com/watch?v=h8u840Wm-BI) (14:41), hosted by Austin Schneider. Instantly is the cold email tool category leader for unlimited-inbox outbound. This video reflects how Instantly's top users are running campaigns now that AI spam filters have rewritten the rules.

## Why this analysis exists

This is one of the source layers behind the BuildOS [`cold-email-engagement-first-outreach`](/blogs/agent-skills/cold-email-engagement-first-outreach) skill. It supplies the **2026-specific platform layer** — what filters now reward, the deliverability floor required to even reach the inbox, the under-50-recipient reply-rate math, and the two-touch rule that replaced the seven-touch sequence.

## Core thesis

The old playbook (10,000 emails/month, light personalization, seven-touch cadence) was built for 2022–2023 inboxes that scanned keywords. In 2024, Gmail and Yahoo rolled out AI-driven spam filters that detect **mass campaign patterns** — sender behavior, engagement rates, campaign structure. Microsoft followed in 2025. Result: average cold email reply rates dropped from 1% to 5% across the industry, and **inbox placement for bulk senders fell 10–27% from Q1 2024 to Q1 2025**.

The replacement is **engagement-first outreach**. Filters and recipients now reward (in this order):

1. **Domain reputation** — domains that act like legitimate senders, with warmed inboxes and spam complaint rates under 0.1%.
2. **Engagement quality** — positive replies, clicks, and reads. Low engagement is a future deliverability tax.
3. **Relevance** — buyers who can tell the email was meant for them respond. Buyers who recognize the spray-and-pray template delete.

The three-pillar system that operationalizes this: deliverability infrastructure, micro-targeted value campaigns, and the two-touch rule.

## Pillar 1: Deliverability infrastructure

Gmail's 2024 requirements made this non-negotiable: **SPF, DKIM, DMARC** authentication on every sending domain, and a **spam complaint rate under 0.1%**. Skipping setup tanks deliverability; emails land in spam or never reach the inbox.

The arithmetic floor for safe sending:

- **5 sending accounts per domain.**
- **30–50 emails per account per day** (Schneider recommends starting at 30).
- **~250 emails per day per domain**, max.
- **Two weeks** of automated warm-up before the inboxes are usable. Health score should hit 100% before campaigns ship.

To go beyond ~250/day, add more domains, not more emails per account. The math is intentionally conservative — overshooting the per-account ceiling is what gets a sender flagged.

The deliverability discipline Schneider names explicitly:

- Warm up _before_ sending. Sender reputation has to be built; it cannot be skipped.
- Use **inbox rotation** so no single account carries the full campaign load.
- Spam complaint rate under 0.1% means the recipient list quality and the offer quality both matter — complaints aren't only about deliverability tools.

This pillar exists because nothing else in the system matters if the email doesn't reach the inbox.

## Pillar 2: Micro-targeted value campaigns

The headline data point:

> "Campaigns under 50 recipients get a 5.8% reply rate versus 2.1% for campaigns with over 1,000 recipients. That's almost a three times difference. Not because of personalization, but because of relevance."

The mechanism is relevance, not personalization. A 50-person list naturally tightens the persona, which tightens the offer, which tightens the language. A 10,000-CEOs-of-agencies list cannot be specific enough about _anything_ to feel meant for the reader.

The 2026 way to keep volume _and_ keep relevance is to slice campaigns into micro-segments by signal:

- Job title × industry × company size
- Funding stage / recent funding
- Open job listings (and the specific job)
- Industry news / triggering events
- Geography / time zone

Each segment gets its own campaign, its own opener, and its own value offer.

**The AI-enrichment step is what makes it scale.** Use the prospect's LinkedIn headline, LinkedIn summary, company website, and industry as input columns. Feed those into a prompt (Schneider uses Claude inside Instantly's AI column tool) with a templatized email and clear direction. The output is a personalized line per recipient that pulls from real public context — not "saw your post" fake personalization.

The other half of relevance is **what's actually in the email**. Schneider's clearest rule:

> "Booking a call is not valuable. Sending a Loom video is not valuable in 2026. What we want to do is we want to solve the problem with an actual action."

The opener offers a **real free deliverable**:

- SEO agency → free Google Business Profile optimization
- Cold email agency → 100 verified leads and a sample sequence
- Branding agency → a free positioning teardown

The value has to be specific enough that the recipient can either say "yes, send me that" or self-disqualify. Loom videos and calendar links don't qualify.

## Pillar 3: The two-touch rule

The most counterintuitive shift. The 7-touch / 14-touch / 20-touch sequence is dead.

The data Schneider cites:

| Touch                     | Effect on reply rate                                    |
| ------------------------- | ------------------------------------------------------- |
| Email 1 (initial)         | Baseline                                                |
| Email 2 (first follow-up) | +49% replies                                            |
| Email 3                   | −20% replies vs. 2023 baseline (was +9% lift in 2023)   |
| Email 4+                  | −55% replies; trains filters to flag the sender as bulk |

The rule: **one initial + one follow-up, then stop.** Two reasons:

1. **More emails train spam filters** that the sender is a bulk operator. The deliverability cost outweighs the marginal reply.
2. **If they didn't reply by email 2, they're not interested in _this offer_** — they may be interested in a different angle.

The recovery move is **non-responder recycling**: pull the list of non-responders, build a new campaign with a different opener and a different value offer, and try again. Same domain reputation, fresh angle. This is the structural replacement for follow-ups #3–#7.

## What "engagement-first" means in operating terms

Schneider keeps coming back to the same loop:

- Filters reward engagement (replies, clicks, no complaints).
- Engagement comes from relevance plus a real value offer.
- Relevance comes from micro-segmentation × AI enrichment.
- Real value offers come from solving a small piece of the recipient's problem for free.
- Deliverability is the floor that lets any of this be visible to the recipient.

This stacks: infrastructure → list segmentation → enriched opener with real value → two-touch cadence → recycle non-responders. Each step is a pre-condition for the next.

## Where Schneider's system diverges from the rest of cold-email-internet

- **Inbox-placement math is explicit.** Most cold-email content treats deliverability as a black box. Schneider gives a number per account, per domain, and a warm-up window.
- **Reply rate has an arithmetic ceiling.** The under-50-recipient figure is the most useful data point — it explains why over-personalization arguments and over-volume arguments both miss the real driver, which is relevance.
- **Follow-ups are _not_ the meeting engine.** This is the most direct disagreement with the SDR-school consensus (e.g., Connor Murray's "70–80% of meetings come from follow-ups"). Schneider's data says past touch #2 you're harming deliverability faster than you're harvesting replies.
- **Loom videos are out.** A common 2023–2024 personalization tactic. He calls it dead in 2026.
- **Recycle, don't perpetuate.** Non-responders are a list to _re-campaign_, not a list to keep emailing.

## A reconciliation with the SDR-school view

The Murray and Schneider playbooks look like they disagree on follow-up cadence — Murray runs four touches, Schneider runs two. The reconciliation is **list scale and offer type**:

- Murray is running **strategic-account or enterprise volume** with a single sender identity, where each prospect is high-value and the follow-up cost per prospect is acceptable. His follow-up sequence is _short and assumptive_ (three notes that all redirect to the original), not a 14-touch carousel.
- Schneider is running **agency-scale volume** with rotated inboxes, where every extra touch is amortized across hundreds of thousands of recipients and any filter-flag is catastrophic.

The skill should let the agent ask which mode the campaign is in. For most BuildOS users running founder-led outreach, Schneider's 2-touch with recycled non-responders is the safer default. For strategic-account or high-trust founder relationships, Murray's 4-touch is more appropriate.

## What this layer contributes to the BuildOS skill

The Schneider analysis supplies the **deliverability floor, the relevance-via-segmentation math, the "value is a deliverable not a meeting" rule, and the two-touch cadence** of the skill. It is the platform-realist layer that prevents the agent from recommending tactics that work in theory but get the sender's domain torched in practice.
