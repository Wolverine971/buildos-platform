---
title: 'Minimum Viable Segment: Lessons from Underscore VC (Michael Skok)'
description: 'A deep read of the Minimum Viable Segment (MVS) framework from Underscore VC and Michael Skok — the three criteria a segment must meet (Common Needs, Dominability, Viability with MVP), the disqualifiers that pull a segment out of scope, and why divergent needs are the real reason MVPs fail to land.'
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
        'segmentation',
        'minimum-viable-segment',
        'product-strategy'
    ]
readingTime: 6
excerpt: 'Most early-stage outreach fails not because the email was bad but because the segment was incoherent. The Minimum Viable Segment framework says a segment is valid only if it passes three tests: customers share a common need, the segment is small enough to dominate, and your current product can serve it without divergent customization. Cold outreach run against a segment that fails any of these is wasted.'
sourceTitle: 'Minimum Viable Segment (MVS) Framework'
sourceCreator: 'Underscore VC (Lily Lyman, Gabrielle McCarthy); concept by Michael Skok'
sourceUrl: 'https://underscore.vc/resources/minimum-viable-segment/'
sourceChannelUrl: 'https://underscore.vc/'
lineagePeople:
    - 'Lily Lyman'
    - 'Gabrielle McCarthy'
    - 'Michael Skok'
lineageSources:
    - title: 'Minimum Viable Segment (MVS) Framework'
      creator: 'Underscore VC'
      creatorType: 'Organization'
      creatorUrl: 'https://underscore.vc/'
      channelName: 'Underscore VC'
      channelUrl: 'https://underscore.vc/'
      sourceType: 'framework_page'
      url: 'https://underscore.vc/resources/minimum-viable-segment/'
    - title: 'Startup Secrets'
      creator: 'Michael Skok'
      creatorType: 'Person'
      sourceType: 'curriculum'
      url: 'https://www.startupsecrets.com/'
relatedSkills:
    - 'cold-email-engagement-first-outreach'
    - 'cold-email-icp-signal-design'
path: apps/web/src/content/blogs/source-analyses/underscore-vc-minimum-viable-segment.md
---

# Minimum Viable Segment: Lessons from Underscore VC

A deep read of the [Minimum Viable Segment (MVS) framework](https://underscore.vc/resources/minimum-viable-segment/) from Underscore VC (Lily Lyman and Gabrielle McCarthy), derived from Michael Skok's _Startup Secrets_ curriculum at Harvard.

## Why this analysis exists

This is one of the source layers behind the BuildOS [`cold-email-icp-signal-design`](/blogs/agent-skills/cold-email-icp-signal-design) child skill. It supplies the **segment-testability gate** — the three hard tests that decide whether a candidate segment is even valid before any timing signal, anchor, or offer work begins. A segment that fails the MVS check produces an uninterpretable campaign no matter how good the email is.

## Core thesis

> "Minimum Viable Segment is about focusing on a market segment of potential customers with the same needs. Without it, potential users who have divergent needs will quickly pull your MVP in many different directions."

The MVS framework's argument: when an MVP fails, the cause is usually a _segment_ failure, not a product failure. The product is being pulled in three directions because the segment contains three sub-groups with three different pains. The fix is not to add features — the fix is to cut the segment until the remaining customers share a single dominant need.

For cold outreach, the same logic applies. A segment with divergent needs produces uninterpretable reply data. Some replies confirm the offer; others reject it; others ask for something the offer does not promise. The campaign cannot be diagnosed because the segment was never coherent.

## The three MVS criteria

A segment is valid only if it passes all three:

### 1. Common Needs

> "Customers must have the same or as similar a need, pain, or problem as possible."

Emphasis: **needs, not features.** Customers think in pain. Two customers who "use the same tech stack" but have different jobs-to-be-done are not in the same segment. Two customers in entirely different industries with the same job-to-be-done _are_.

Examples Underscore VC cites:

- ✗ "Financial services" — too broad, customers have divergent needs.
- ✗ "PCI compliance across eCommerce + merchants + software providers" — same regulatory pain, but mixed buyer types and channels.
- ✓ "PCI compliance for eCommerce software providers" — single regulatory pain, single buyer type, shared channels.

### 2. Dominability (the "Minimum" part)

> "The segment must be small enough to dominate it."

This is the counterintuitive criterion. The right segment is not the biggest one you can plausibly serve — it is the smallest one you can _own_. Once dominated, the segment becomes a referenceable beachhead from which adjacent segments can be entered.

The test: can you become the _obvious_ choice for this segment? If the answer is "we'd be one option among many," the segment is too big.

### 3. Viability (the "Viable" part) — your MVP can actually serve it

> "Which segment will have the least product requirements?"

A segment is only viable if your **current** product, with **today's** support capacity, can serve it without significant customization. The right segment is the one that needs the _fewest_ features to convert.

This is the alignment point with Lincoln Murphy's "Able" dimension and Mark Roberge's LIR formula: the MVS is the segment where the current product can hit the activation event.

## Additional factors that strengthen a segment

Beyond the three required criteria, Underscore VC names four practical reinforcers:

- **Customer interconnectedness.** Members of the segment talk to each other — forums, trade associations, conferences, peer networks. Once one buys, others hear about it. Referenceability compounds.
- **Channel reachability.** All members are reachable through one consistent channel. A LinkedIn-discoverable segment is a coherent campaign target; a "spread across LinkedIn + traditional press + niche Reddit" segment is three campaigns.
- **Geographical proximity.** For high-touch or in-person motions, the segment is concentrated enough to visit, host an event for, or sponsor.
- **Shared vocabulary.** Members use the same language for their pain. If the segment uses three different phrases for the same problem, the cold email is fighting the segment's incoherence.

## Disqualifiers — what kicks a segment out of MVS

| Disqualifier                                                   | What it produces                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Too-broad vertical with no shared specific need                | Outreach reads as generic; reply data is mixed and uninterpretable.                      |
| Divergent needs across sub-groups                              | MVP gets pulled in multiple directions; cold outreach offer cannot match all sub-groups. |
| Channels and geographies require expensive, scattered outreach | Acquisition cost per qualified meeting is too high to support unit economics.            |
| Customization needs exceed MVP scope                           | "Win" customers become a service load that prevents serving the next ten.                |
| Members do not talk to each other                              | No word-of-mouth compounding; every customer is a fresh cold start.                      |

## What this contributes to the BuildOS ICP and Signal Design child skill

1. **Three-test segment gate.** Every segment definition the skill produces must pass the three MVS tests explicitly. The output contract has a `mvs_check: { common_needs: pass | fail, dominability: pass | fail, viability: pass | fail }` field. A single fail blocks the segment from outreach.
2. **The "size" inversion.** The skill defaults to recommending the _smallest_ dominable segment, not the largest serviceable segment. The compiler rejects "broader is better" framings.
3. **Channel reachability as a required field.** Segment definitions require a named, consistent reach channel (a LinkedIn search, an industry list, a trade publication, a specific community). "Mixed channels" is treated as a soft-fail and triggers a sub-segment proposal.
4. **Shared-vocabulary requirement.** The skill asks for the _exact language_ the segment uses for its primary pain. If the segment uses multiple incompatible phrasings, the segment is incoherent and gets split or recut.
5. **Reconciles the MVS-vs-TAM tension.** The skill explicitly separates "ICP for outreach this quarter" (must pass MVS) from "TAM over time" (the segments you graduate into after dominating MVS). The first is the skill's scope; the second is out of scope.

## How MVS interacts with the other source layers

- **Maurya (switching triggers)**: Trigger types describe _when_ a segment is in-market. MVS is the gate _before_ trigger analysis — a segment that fails MVS is not worth monitoring triggers for.
- **Murphy (seven dimensions)**: Murphy's "Able" dimension overlaps with MVS Viability. Murphy's "Acquisition Efficiency" overlaps with MVS Channel Reachability. MVS is the cleaner first-pass gate; Murphy is the deeper quality scorer.
- **Roberge (Green/Yellow/Red)**: A Green segment is by definition an MVS-passing segment that has passed LIR validation. MVS is necessary but not sufficient for Green status.

## Caveats

- **Practitioner framework, no peer-reviewed evidence (Level 4).** Derived from Michael Skok's Harvard _Startup Secrets_ curriculum and Underscore VC's portfolio observations. Widely adopted but not formally validated.
- **Built for early-stage, MVP-shaped products.** A post-PMF company with a mature product has more segments that satisfy Viability; the MVS criteria still apply but the gate is less restrictive.
- **Strongest for B2B SaaS and infrastructure plays.** Consumer products with low-AOV impulse buys do not need the Dominability criterion — the equivalent is "owning a specific use case in the algorithm," which is a different mechanic.

## Source

- **Framework page:** [Minimum Viable Segment (MVS) Framework](https://underscore.vc/resources/minimum-viable-segment/) — Underscore VC
- **Original curriculum:** Michael Skok, [_Startup Secrets_](https://www.startupsecrets.com/), Harvard
- **Authors of the Underscore VC version:** Lily Lyman, Gabrielle McCarthy
