---
title: 'Newsletter Email Marketing in 39 Minutes: Lessons from Alex Hormozi'
description: 'A deep read of Alex Hormozi''s "Learn Email Marketing in 39 Minutes" — the reward-every-action loop, the templated newsletter structure (subject → quote → tactic → CTA → P.S.), the 3x/week cadence question, the segmentation 791% Roi anecdote, and the deliverability discipline (plain text, mobile, money-language hygiene).'
author: 'DJ Wayne'
date: '2026-05-14'
lastmod: '2026-05-14'
changefreq: 'monthly'
priority: '0.6'
published: true
tags:
    [
        'source-analysis',
        'newsletter-email',
        'list-marketing',
        'lifecycle-email',
        'email-craft',
        'sales-and-growth',
        'marketing-and-content'
    ]
readingTime: 12
excerpt: "This is *not* a cold email playbook. Hormozi is teaching how to email a list of people who opted in — the average ROI is 35–45x because the cost of acquisition was already paid. The frame is content-via-email: reward every action in the chain (open, read, click, reply), template the format so readers know what they're getting, and treat the email like a published artifact (plain text, mobile, no money-language, one CTA per audience)."
sourceTitle: 'Learn Email Marketing in 39 Minutes!'
sourceCreator: 'Alex Hormozi'
sourceUrl: 'https://www.youtube.com/watch?v=pLhQOYMGa88'
sourceChannelUrl: 'https://www.youtube.com/@AlexHormozi'
lineagePeople:
    - 'Alex Hormozi'
lineageSources:
    - title: 'Learn Email Marketing in 39 Minutes!'
      creator: 'Alex Hormozi'
      creatorType: 'Person'
      creatorUrl: 'https://www.youtube.com/@AlexHormozi'
      channelName: 'Alex Hormozi'
      channelUrl: 'https://www.youtube.com/@AlexHormozi'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=pLhQOYMGa88'
path: apps/web/src/content/blogs/source-analyses/hormozi-newsletter-email-marketing-39-minutes.md
---

# Newsletter Email Marketing in 39 Minutes: Lessons from Alex Hormozi

A deep read of [Learn Email Marketing in 39 Minutes!](https://www.youtube.com/watch?v=pLhQOYMGa88) (39:18) by Alex Hormozi. Acquisition.com sent ~10M emails over a 90-day window across its portfolio and generated tens of millions in revenue from them; this video walks through Hormozi's own _Mozi Money Minute_ newsletter and the ten tactics that drive that economics.

## Why this analysis exists

This is **not** part of the BuildOS [`cold-email-engagement-first-outreach`](/agent-skills/cold-email-engagement-first-outreach) skill. The audience matters. Hormozi is talking about emailing **people who already opted in** — newsletter, lifecycle, and list-to-customer email — not strangers receiving cold outreach.

The economics are different (the cost of acquiring the contact is already sunk), the deliverability physics are different (a warm list with healthy engagement has more headroom than a cold sender), and the unit of measurement is different (open rate / click-through rate / lifetime conversion, not reply-to-meeting-booked). Many of the principles transfer to cold outreach — preview text, mobile optimization, single clear CTA, plain-text discipline — but the _operating frame_ is fundamentally about content delivered through email, not interruption sent to strangers.

This post stands on its own and may seed a future BuildOS skill on list/lifecycle email.

## Core thesis

Email is one of the most under-used high-ROI channels because the lead acquisition cost is already paid. Hormozi cites the industry-standard 35–45x ROI per dollar spent on email. The reason people skip it is not economics; it is friction in starting and a vague fear of unsubscribes.

His operating frame: **treat every email as content, and reward every step the reader takes in the chain.** Reward them for opening (a great preview/subject). Reward them for reading (a fast hook at the top). Reward them for clicking (deliver real value at the link). When every step pays the reader back, future engagement compounds and deliverability stays healthy.

The newsletter has a strict template (subject → hook quote → one tactic, ~200 words → clear CTA → P.S.) because predictability — like a McDonald's Big Mac — builds the brand of the newsletter itself.

## The framework

### 1. Reward every action in the chain

Behavior is reinforced by what happens _after_ it, not what happens before. So the email's job is to pay the reader for every action they just took:

- They opened → reward with a fast, high-value hook (a quote, a stat, a punchy line) within the first sentence.
- They read → the one tactic in the body has to be immediately applicable, ideally in under 60 seconds of reading.
- They clicked the CTA → the destination has to deliver real value (a blog post worth their time, a workshop application, a tool).

If any link in the chain disappoints, the next email's open rate drops. One bad email after four good ones can break a newsletter.

### 2. The templated newsletter structure

Hormozi's _Mozi Money Minute_ is templated by design. Every issue follows the same shape:

1. **Subject line.** Builds the newsletter brand ("Mozi Money Minute: [headline]") so over time the brand alone earns the open.
2. **Hook quote / stat.** A line of immediate reward at the top — the smallest unit of value possible.
3. **One tactic, ~200 words.** Under a minute of reading. One concept, not three. Whenever a second concept tries to slip in, cut it.
4. **Clear CTA.** Contextual to the tactic, not boilerplate. If the email is about testimonials, the CTA should bridge to testimonials, not generically to a workshop.
5. **P.S. statement.** Often a meme, sometimes an alternate CTA. The P.S. is the second-most-read part of the email after the headline — "not having a P.S. statement is P.S. stupid."

Predictability is a feature. Readers know what they'll get. The variety lives in the _tactic_ slot; the structure is constant.

### 3. The unsubscribe is good

Hormozi's most counter-intuitive position. Making unsubscribe easy is correct, because:

- Dormant subscribers hurt deliverability more than unsubscribes do.
- An unsubscribe means the reader knows you exist — they may still buy through a different channel.
- The first time you re-engage a stale list, the unsubscribe rate spikes ("shaking the tree"). That's healthy churn pulled forward.

The implication: don't fear culling. A small list of engaged subscribers ships more revenue than a big list that ignores you.

### 4. Segmentation is the 791% ROI lever

HubSpot's study cited: segmenting lists produced a **791% increase in ROI** for the same emails. Mechanism is obvious — a beginner email to advanced subscribers fails not because the email is bad but because the audience is wrong.

Use the qualifiers from opt-in (revenue band, business stage, role, market) to slice the list and send the right content to the right segment. Acquisition.com's segments include `$0–$100K`, `$500K+`, and `$5M+`. The same email tailored to each band performs dramatically better than a generic version to all.

### 5. Deliverability discipline

The technical hygiene rules:

- **Plain text, max 1–2 links.** Image-heavy emails get pattern-matched into the promo tab. Hormozi's emails are intentionally written to look like normal emails between two people, not a digital marketing brochure.
- **Mobile optimization.** 58–60% of email traffic is mobile; the email has to look right on a phone first.
- **Remove money language from titles.** Money words ("$10K," "make more," etc.) increase the chance of landing in the promo tab. Keep the dollar talk inside the body, not the subject.
- **Optimize preview text.** Don't let the email client auto-fill the first 150 characters of the body — write the preview deliberately to extend curiosity from the subject.
- **Reply-yes mechanic.** Asking subscribers to reply "yes" to get a bonus tells the email provider's algorithm that this sender is high-engagement, which lifts future deliverability. Acquisition.com uses this to gate a bonus chapter at opt-in.
- **B2B has a 16.99% inbox-failure floor.** A lot of marketing email never even gets to the promo tab — domain authority and engagement signals are what move that floor.

### 6. Cadence — three a week, but only if you have something to say

The "perfect" cadence Hormozi heard from the best email marketers he knew is roughly **three times per week**. He notes a sharp caveat: he doesn't commit to a cadence himself. "I'd rather have a quality threshold."

If starting from zero, the unlock is:

1. Block out the time to write 12–24 emails in a sitting.
2. Realize "I just emailed my list for a year in a half-day."
3. Commit to _minimum_ once a month, layer in extra emails when motivated.

The bar he holds: never send an email worse than the average of the previous four. One bad email can break a newsletter.

### 7. The 391% speed-to-contact tactic

Worth noting because Hormozi uses it as a sample tactic inside the newsletter, and it crosses domains. **Calling inbound leads within 60 seconds of opt-in produces a 391% increase in sales** (Harvard Business Review). The point is not the call itself — it's the prioritization argument: if there is one move that can quadruple sales, the staff to execute it is justified by the lift.

The lesson for the agent: when the newsletter or list email surfaces a high-intent action (form submission, demo request, content download), speed of follow-up is the single highest-leverage variable.

### 8. Mobile-optimized format

Roughly 60% of email is read on mobile. The check is simple — preview both desktop and mobile before sending. The failure mode is e-commerce-style image-heavy emails that collapse on a phone screen.

### 9. Time-of-day and day-of-week

The data Hormozi cites from Neil Patel:

- **B2C:** Mondays and Tuesdays open ~18% higher than baseline.
- **B2B:** Wednesdays are the lift day (consumers are distracted Mon/Tue; business buyers are catching breath by midweek).
- **Time of day:** 10–noon and 1–3pm local. Avoid first-thing-in-the-morning when real business email is competing.

He warns these are _golden BBs_, not magic. A bad email at the optimal time still underperforms a great email at any time.

### 10. A/B test the subject (and only the subject)

Send the A/B to a small slice, then send the winning subject to the rest. Same logic as YouTube thumbnail A/B testing. Worth doing because subject + preview text together drive the open rate, and the rest of the system can't work if the email doesn't get opened.

## A craft note: testimonial hook collection

A side tactic worth keeping. Reviewing 2,500 testimonials for a gym brand, Hormozi found the top four all started with a **pain-based moment hook**:

- "We were two months away from shutting our doors."
- "We were barely making enough to survive."
- "I pay all my expenses every month, work all day, and end up with $0 of profit."
- "I'd finished the month with $0 of profit."

Two of the top four name "$0 of profit." Specific dollar amounts and physical moments beat generic adjectives ("things were hard").

When collecting testimonials, **don't ask "what was life like before working with you?"** — that produces a long story with no usable hook. **Ask "what was your worst moment?"** Moments are what make hooks. Details are what make them powerful.

This is a content-craft tactic that travels far outside email — applies to ads, landing pages, case studies, and demo videos.

## What transfers to cold outreach (and what doesn't)

A handful of Hormozi's principles transfer cleanly to cold outreach:

- **Plain text, max 1–2 links.** Same physics.
- **Mobile-first formatting.** Same.
- **Single contextual CTA per email.** Same.
- **Preview text optimization.** Same.
- **Subject line A/B testing.** Same.
- **Money-language hygiene in subject lines.** Same.

What does **not** transfer:

- **Reward-loop framing.** Cold recipients have no prior relationship to reward; the first email has to earn the relationship.
- **3x/week cadence.** Cold cadences run for 2–4 touches and stop. Repeated weekly emails to strangers torch the sender's reputation.
- **Templated newsletter brand.** Cold emails should _not_ look templated; they should look like a real person typed them.
- **Reply-yes deliverability mechanic.** Asking a stranger to reply "yes" without context is friction; asking a subscriber to reply yes for a bonus chapter is value.

For the cold outreach skill, the safer move is to fold the _technical_ principles (mobile, preview, plain text, money language) and skip the _content-loop_ principles. Those belong in a future list/newsletter skill.

## Where Hormozi's system diverges from typical newsletter advice

- **Quality over cadence.** Most newsletter advice prescribes a fixed schedule; Hormozi rejects it for a quality bar.
- **Unsubscribes are pro-list-health.** Most marketers fear them.
- **Templated structure beats variety.** Most newsletter advice tells you to surprise the reader; Hormozi argues the McDonald's-Big-Mac predictability is the brand.
- **Email is content.** The frame collapses the wall between "content" and "email." Same craft, different distribution.

## Suggested follow-on

This source-analysis stands alone for now. A future BuildOS skill could combine it with:

- An audience-acquisition source on growing the list (lead magnets, opt-in pages, lead magnet design).
- A list-segmentation source on how to slice and re-segment.
- A lifecycle-trigger source on event-driven email (post-onboarding, post-purchase, churn save).
- A re-engagement source on waking up dormant subscribers without nuking domain reputation.

The Hormozi piece would supply the **email-as-content layer** of any such future skill.
