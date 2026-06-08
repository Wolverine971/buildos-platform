---
title: 'Cold Email ICP And Signal Design: An Agent Skill For Right-Person Outreach'
description: 'A source-lineaged child skill for defining the right person, right moment, segment, buying signal, timing thesis, buying committee map, and disqualifiers before cold outreach.'
author: 'DJ Wayne'
date: '2026-05-15'
lastmod: '2026-06-01'
changefreq: 'monthly'
priority: '0.8'
published: true
tags:
    [
        'agent-skills',
        'cold-email',
        'icp',
        'signal-design',
        'buying-committee',
        'b2b-sales',
        'sales-and-growth',
        'buildos'
    ]
readingTime: 8
excerpt: 'Before an agent writes cold outreach, it needs to prove the recipient, timing signal, segment, committee map, and disqualifiers are coherent. This skill turns vague target lists into approved segment definitions or refuses to ship.'
skillId: 'sales-and-growth/cold-email-icp-signal-design'
skillType: 'child'
skillCategory: 'sales-and-growth'
parentSkill: 'cold-email-engagement-first-outreach'
providers: ['BuildOS runtime skill', 'BuildOS YouTube library', 'source analysis corpus']
compatibleAgents: ['BuildOS-compatible agents', 'Claude Code', 'Codex', 'portable Agent Skills']
stackWith:
    ['cold-email-engagement-first-outreach', 'cold-email-offer-lab', 'cold-email-outreach-compiler']
skillSource: 'apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_icp_signal_design/SKILL.md'
lineagePath: 'docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/lineage.yaml'
lineagePeople:
    - 'Ash Maurya'
    - 'Craig Elias'
    - 'Becc Holland'
    - 'Lincoln Murphy'
    - 'Mark Roberge'
    - 'Michael Skok'
    - 'Nick Cegelski'
    - 'Armand Farrokh'
    - 'Brent Adamson'
    - 'John McMahon'
lineageSources:
    - title: 'Minimum Viable Segment'
      creator: 'Underscore VC / Michael Skok'
      creatorType: 'Organization'
      sourceType: 'framework'
      url: 'https://underscore.vc/'
    - title: 'Trigger Event Selling'
      creator: 'Craig Elias'
      creatorType: 'Person'
      sourceType: 'framework'
    - title: 'Personalization To Relevance'
      creator: 'Becc Holland'
      creatorType: 'Person'
      sourceType: 'framework'
    - title: 'Ideal Customer Profile Framework'
      creator: 'Lincoln Murphy'
      creatorType: 'Person'
      sourceType: 'framework'
    - title: 'The Science Of Scaling'
      creator: 'Mark Roberge'
      creatorType: 'Person'
      sourceType: 'framework'
    - title: 'How to Multithread and Get to Power in Sales'
      creator: "30 Minutes to President's Club"
      creatorType: 'Organization'
      sourceType: 'newsletter'
      url: 'https://www.30mpc.com/newsletter/how-to-multithread-and-get-to-power-in-sales'
relatedSkills:
    - 'cold-email-engagement-first-outreach'
path: apps/web/src/content/blogs/agent-skills/cold-email-icp-signal-design.md
---

# Cold Email ICP And Signal Design

Use this child skill when the root cold email workflow has a weak "right person" or "right moment."

The job is to turn a broad target idea into **one persona x one narrowing signal** with a verified timing thesis, an MVS-passing segment, a buying committee map, and a disqualifier checklist before any anchor, offer, or draft work begins.

This is the pre-writing skill. It decides whether a campaign deserves to exist.

## When to use ICP and signal design

- The target list is broad, mixed, or based only on job titles.
- The user cannot explain why this person should receive outreach now.
- Reply data would be hard to interpret because the segment is too noisy.
- The offer may be good, but the recipient or timing thesis is weak.
- A B2B segment has no committee map and a single-contact strategy.
- The signal is a static filter: firmographic, demographic, or title-only.

Do not use this skill to draft the email. Use it to approve or reject the segment that the email would be written for.

## Workflow

1. **Convert the market thesis into one persona x one narrowing signal.** Reject mixed-persona lists immediately.
2. **Score the signal** against relevance type, trigger type, freshness, reliability, pain likelihood, and testability. Reject weak or stale signals.
3. **Run the MVS check:** Common Needs, Dominability, Viability with MVP. Reject segments that fail any of the three.
4. **Identify the buying committee.** For B2B, name Champion, Economic Buyer, User, and Blocker; choose Top-Down or Bottom-Up Golden Path; tag Mobilizer probability.
5. **Apply six fit-type disqualifiers:** Technical, Functional, Resource, Competence, Experience, Cultural.
6. **Verify the switching trigger:** bad experience, change in circumstance, or awareness event. If the trigger family and relevance type disagree, the timing thesis is ambiguous.
7. **Name the buyer-progress thesis:** what struggle, current workaround, or desired progress makes this signal matter now.
8. **Tier the segment:** Green, Yellow, or Red. Green can run; Yellow is experiment-only; Red does not get campaign mode.
9. **Return the segment definition, signal grade, committee map, disqualifier results, and verdict.**

## Output Contract

```yaml
segment_name: string
persona: { role: string, seniority: string, tenure_band: string }
company_filters: list of strings
signal:
    description: string
    source: at least one verifiable external source
    type: firmographic | demographic | technographic | trigger_based
    trigger_sub_type: inbound | postbound | bridgebound | null
    switching_trigger_type: bad_experience | change_in_circumstance | awareness | null
    freshness_days: integer
    why_now: one-sentence thesis linking signal -> pain -> buying motion
buyer_progress_thesis: current struggle or workaround this signal suggests
signal_scorecard:
    freshness: 0 | 1 | 2
    reliability: 0 | 1 | 2
    pain_likelihood: 0 | 1 | 2
    testability: 0 | 1 | 2
    total: 0-8
fit_check:
    technical: pass | fail
    functional: pass | fail
    resource: pass | fail
    competence: pass | fail
    experience: pass | fail
    cultural: pass | fail
mvs_check:
    common_needs: pass | fail
    dominability: pass | fail
    viability: pass | fail
buying_committee:
    expected_size: integer
    roles: list of role objects
    golden_path: top_down | bottom_up
    first_outreach_target: role
    mobilizer_probability: high | medium | low
disqualifiers: list of any fails from the checklist
segment_tier: green | yellow | red
verdict: do_not_send | low_volume_test_only | volume_approved | high_conviction
open_questions: list of unresolved items
offerlab_prompt: optional follow-up if the offer is still unclear
```

## What The Skill Checks

### 1. Persona x signal coherence

A cold campaign needs one person type and one reason now. "B2B SaaS founders" is not enough. "Seed-stage B2B SaaS founders hiring their first sales leader in the last 30 days" is closer because it combines persona, company stage, and timing.

If the segment mixes CFOs, CMOs, founders, and RevOps leaders, the skill fails Common Needs before writing starts. A mixed list produces illegible replies: you will not know whether the offer failed, the persona failed, or the signal failed.

### 2. Signal quality

The signal must be more than a static filter. Title, industry, and headcount can define a market, but they do not explain timing.

Strong signals are recent, observable, pain-linked, and testable. Examples:

- A new executive joined and inherited a broken process.
- A company opened a role that implies a known operational gap.
- A team adopted a technology that creates a predictable migration or enablement problem.
- A prospect publicly described the problem the offer helps solve.

Weak signals are generic:

- "They are in SaaS."
- "They use LinkedIn."
- "They probably care about productivity."
- "They fit our ICP."

### 3. Minimum viable segment

The MVS check asks three questions:

| Test         | Pass Condition                                                                        |
| ------------ | ------------------------------------------------------------------------------------- |
| Common Needs | The segment shares one painful, recognizable problem.                                 |
| Dominability | You can reach enough of them through a focused channel or list source.                |
| Viability    | The segment is big and valuable enough to justify a campaign or small enough to test. |

Fail one and the segment moves back to research.

### 4. Buying committee map

For B2B outreach, a single named contact is rarely the whole buyer. The skill requires a committee map before approving campaign mode.

At minimum, name:

- **Champion:** has the personal win and enough influence to move the deal.
- **Economic Buyer:** can create or reallocate budget.
- **User:** feels the workflow pain and validates the solution.
- **Blocker:** resists the change, owns the incumbent process, or controls procurement.

Then choose the path:

- **Top-Down:** start with executive power, request stakeholder loop-ins, circle back with recommendations.
- **Bottom-Up:** win a champion, move horizontally to department leads, then drive upward to power.

The first email target changes depending on this map.

### 5. Fit disqualifiers

The skill applies six disqualifier types:

| Fit Type   | Failure Example                                                           |
| ---------- | ------------------------------------------------------------------------- |
| Technical  | They cannot run or integrate the offer.                                   |
| Functional | The offer does not solve the job they need done.                          |
| Resource   | They lack budget, time, team, or authority.                               |
| Competence | They cannot execute the change even if they want it.                      |
| Experience | Their prior context makes success unlikely or support costs too high.     |
| Cultural   | Their operating style conflicts with the service, product, or sales path. |

A segment with a clean timing signal can still fail because it is a poor fit.

## Guardrails

- Do not approve a mixed-persona list.
- Do not treat title match as timing.
- Do not invent buying signals or stack inferred triggers.
- Do not declare a segment ready if reply data would be illegible on a 25-50 person batch.
- Do not approve a B2B segment without a committee map.
- Do not approve a segment with a stale trigger as a "now" pitch.
- Do not call decorative AI-generated openers personalization. Grade them as relevance.
- Do not approve a Red-tier segment for campaign mode.
- Do not run a campaign-mode plan on a Yellow segment. Convert it to a one-variable experiment.
- Do not skip the Champion test for high-value strategic outreach.

## Routing Back To The Root Skill

When this skill returns, the root [`cold-email-engagement-first-outreach`](/agent-skills/cold-email-engagement-first-outreach) workflow should pick up at the next stage:

- If the segment passes with `volume_approved` or `high_conviction`, route to offer design or the outreach compiler.
- If the segment passes with `low_volume_test_only`, compile a single-variable experiment.
- If the segment fails, return the disqualifier results and open questions. Do not pretend the segment is shippable.

## Source Lineage

This child skill draws from:

- **Ash Maurya** — switching-trigger taxonomy, job-based ICP, and three-bucket interview extraction.
- **Craig Elias** — trigger-event selling, first-in advantage, three-event buying model, and monitoring surfaces.
- **Becc Holland** — relevance taxonomy, trigger sub-types, and the "send to two people" test.
- **Lincoln Murphy** — ICP dimensions and six fit types.
- **Mark Roberge** — Leading Indicator of Retention, Green/Yellow/Red segment tiering, and Quality x Engagement grid.
- **Underscore VC / Michael Skok** — Minimum Viable Segment: Common Needs, Dominability, Viability.
- **30MPC, Brent Adamson, John McMahon, and Gartner** — buying committee map, Golden Path, Mobilizer/Talker/Blocker, Champion test, and committee-size data.
- **Bob Moesta and Rob Fitzpatrick** — buyer progress, struggling moments, current workaround, and past-behavior evidence.

### Deep-read source analyses

These source-analysis posts explain the logic behind this child skill:

- [Minimum Viable Segment: Lessons from Underscore VC](/blogs/source-analyses/underscore-vc-minimum-viable-segment)
- [Science Of Scaling Segment Tiering: Lessons from Mark Roberge](/blogs/source-analyses/mark-roberge-science-of-scaling-segment-tiering)
- [Ideal Customer Profile Framework: Lessons from Lincoln Murphy](/blogs/source-analyses/lincoln-murphy-ideal-customer-profile-framework)
- [Trigger Event Selling: Lessons from Craig Elias](/blogs/source-analyses/craig-elias-trigger-event-selling)
- [Personalization To Relevance: Lessons from Becc Holland](/blogs/source-analyses/becc-holland-personalization-to-relevance)
- [Multithreading And The Buying Committee: Lessons from 30MPC and Brent Adamson](/blogs/source-analyses/30mpc-multithreading-buying-committee)
