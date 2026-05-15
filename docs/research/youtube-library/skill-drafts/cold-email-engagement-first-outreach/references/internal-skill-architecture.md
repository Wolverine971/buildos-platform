---
doc_type: skill-reference
skill: cold-email-engagement-first-outreach
reference: internal-skill-architecture
visibility: internal
publish: false
purpose: Private map for organizing the cold outreach operating system into root skills, child skills, and tangential relationship-building skills.
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/references/internal-skill-architecture.md
---

# Internal Outreach Skill Architecture

Status: private internal planning document. Do not publish publicly without a separate review and redaction pass.

This document organizes the cold outreach operating system into three kinds of skills:

1. Root skill
2. Child skill
3. Tangential skill

The goal is to keep the root skill usable while making deep work available when needed.

## Definitions

### Root Skill

A root skill owns the user's primary job and orchestrates the workflow end to end.

For this system, the root skill is:

```text
cold-email-engagement-first-outreach
```

Its job:

```text
Plan, draft, audit, and route cold outreach using the sequence:
right person -> right moment -> right reason -> right offer -> right ask -> right follow-up
```

The root skill should:

- choose the outreach mode
- identify missing inputs
- route to child skills only when needed
- compile the final campaign or per-email bundle
- enforce guardrails
- preserve the trust-based north star

The root skill should not:

- contain every deep framework inline
- force OfferLab if the user already has a strong offer
- force deep research when the mode is high-volume
- turn tangential relationship strategy into mandatory cold email steps

### Child Skill

A child skill is a deep optional module inside the root workflow.

Use a child skill when:

- the root workflow has a missing or weak input
- the user asks to go deep on that input
- the output directly feeds the cold outreach bundle
- the skill is part of the critical path for some, but not all, outreach work

Examples:

- Offer creation is a child skill when the offer is missing or weak.
- Research is a child skill when the anchor is Level 0-2 or the recipient is high-value.
- Reply handling is a child skill after the campaign gets replies or goes quiet.

Child skills should return structured artifacts the root skill can consume.

### Tangential Skill

A tangential skill is an adjacent capability that improves relationship-building or go-to-market work but is not always part of the cold email workflow.

Use a tangential skill when:

- it supports trust, positioning, or relationships around outreach
- it may happen before, after, or alongside cold email
- its output may inform the root skill, but it is not required for every run
- it could serve many other root skills beyond cold email

Examples:

- community building
- founder-led content
- customer interviews
- case-study creation
- CRM hygiene
- compliance review

Tangential skills should not be buried inside the cold email root skill. They should be available to call when the situation needs them.

## Routing Rule

Use this decision path:

```text
Is this required to complete the current outreach job?
  yes -> Is it a deep optional module inside the outreach workflow?
      yes -> child skill
      no -> root skill step
  no -> Does it support relationship-building, trust, or GTM around outreach?
      yes -> tangential skill
      no -> out of scope
```

## Root Skill Responsibilities

The root skill owns the operating sequence:

```text
right person -> right moment -> right reason -> right offer -> right ask -> right follow-up
```

Root outputs:

- mode selection
- missing-input diagnosis
- campaign bundle
- per-email bundle
- audit report
- refusal note
- child-skill routing recommendation

Root guardrails:

- no sending without confirmation
- no fabricated research or proof
- no unverified volume sending
- no mixed-persona campaign
- no meeting-first cold offer by default
- no investor meeting-first ask
- no unbridged personalization
- no cadence beyond mode limits

## Proposed Child Skill Map

These are nested under the root outreach skill because they directly feed the outreach bundle.

| Child Skill                        | Use When                                                       | Input                                                              | Output                                                    |
| ---------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| ICP and Signal Design              | The recipient/list is vague or timing is weak.                 | Market thesis, customers, target market, constraints.              | Segment definition, signal rubric, disqualifiers.         |
| Source of Truth Builder            | Claims, accounts, people, and proof need structure.            | Account/person data, sources, CRM notes, proof assets.             | Traceable source-of-truth table/schema.                   |
| Research Anchor Mining             | The email needs a strong reason for writing.                   | Target person/account, public sources, mode.                       | Specific anchor, source URL, bridge, specificity score.   |
| Buyer-Language Mining              | Messaging needs to match how buyers describe pain.             | Calls, reviews, transcripts, comments, CRM notes.                  | Pain phrases, objections, desired outcomes, usable lines. |
| OfferLab / Artifact Offer Creation | The offer is missing, weak, or meeting-first.                  | ICP, pain, proof, capabilities, production constraints.            | Offer hypothesis, artifact spec, smallest yes.            |
| Proof Asset Selection              | The draft needs credible proof or claims review.               | Case studies, customer results, examples, permissions.             | Approved proof slot and allowed wording.                  |
| Outreach Compiler                  | The inputs are ready and need a finished bundle.               | Mode, recipient/segment, anchor, offer, proof, sender constraints. | Subject, preview, body, CTA, cadence, reply routes.       |
| Taste Review                       | Draft may be generic, pushy, or reputation-risky.              | Draft plus mode and recipient context.                             | Pass/revise/do-not-send verdict with fixes.               |
| Deliverability Readiness           | Campaign may use volume or cold domains.                       | Domain/inbox health, send volume, warmup, complaints.              | Pass/blocked/manual-only status and required fixes.       |
| Sequence and Cadence Planner       | Follow-up plan is unclear or mismatched to mode.               | Mode, offer, recipient risk, sender trust.                         | Touch map, stop rule, recycle rule.                       |
| Reply OS / Objection Handling      | Replies arrive, thread goes quiet, or objections are expected. | Reply text, campaign context, route map.                           | Reply class, next action, response draft, SLA.            |
| Learning Review                    | A test completed and should change the next run.               | Metrics, replies, objections, buyer language.                      | Learning record and next-test recommendation.             |

## Child Skill Boundaries

### OfferLab Boundary

OfferLab is not always required.

Call it when:

- the user has no offer
- the offer is "book a call"
- the offer is too large for cold trust
- the offer does not produce a useful artifact
- the segment is new and untested
- positive reply rate is low

Do not call it when:

- the user has a specific artifact offer
- the offer has proof and prior replies
- the task is only rewriting a known campaign

### Research Boundary

Research deep-dive is not always required.

Call it when:

- strategic, single-target, investor, recruiting, PR, or partnership mode is active
- the anchor is Level 0-2
- the recipient is high-value
- the bridge feels decorative

Do not overuse it for:

- high-volume offer tests where segment-level relevance is enough
- campaigns where the core issue is deliverability or offer quality

### Deliverability Boundary

Deliverability is a child skill for volume and cold-domain workflows, but a lighter root check for manual one-off outreach.

Call it deeply when:

- sending at scale
- using new domains or inboxes
- bounce/complaint/open rates are unhealthy
- recent domain health is unknown

### Reply OS Boundary

Reply OS is a child skill after sending or when planning response paths.

Call it when:

- a reply arrives
- the thread goes quiet
- the user needs objection responses
- the user wants to convert reply to call without pressure

## Tangential Skill Map

These are rich adjacent capabilities. They should be available around the root outreach skill but not forced into every cold email workflow.

| Tangential Skill                 | Why It Matters                                                    | Relationship To Outreach                                                                      |
| -------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Relationship Building            | Cold email is one way to start trust, not the whole relationship. | Helps with long-term nurture, follow-through, reciprocity, and non-transactional touchpoints. |
| Founder-Led Content              | Public expertise can warm targets before email.                   | Improves sender trust and creates better reasons to reach out.                                |
| Community Building               | Many relationships start outside direct outreach.                 | Creates context, familiarity, and social proof before the ask.                                |
| Customer Research Interviewing   | Better buyer understanding improves segmentation and offers.      | Feeds buyer-language mining, pain hypotheses, and artifact design.                            |
| Positioning and Messaging        | Weak positioning makes even good outreach unclear.                | Clarifies category, pain, value, and proof.                                                   |
| Case Study and Proof Creation    | Outreach often fails because proof is vague or unsupported.       | Creates approved proof assets and allowed claims.                                             |
| Sales Qualification              | Replies need fit assessment before calls.                         | Feeds back-end forms, qualification criteria, and reply routing.                              |
| CRM and Data Hygiene             | Bad data creates bad outreach and bad learning.                   | Keeps source-of-truth reliable.                                                               |
| Lead Enrichment and Verification | Signals and emails must be accurate.                              | Improves right person/right moment and reduces bounces.                                       |
| Compliance and Privacy Review    | Outreach can create legal and reputational risk.                  | Sets boundaries for data use, opt-outs, regulated claims, and regions.                        |
| Analytics and Experiment Design  | Learning loops require clean tests.                               | Prevents false conclusions from noisy campaigns.                                              |
| Event and Conference Networking  | Some outreach is best anchored in shared events.                  | Creates warm triggers and in-person follow-up paths.                                          |
| Warm Intro Strategy              | Some targets should not be cold emailed first.                    | Routes high-value contacts through trust paths before cold outreach.                          |
| Partnership Strategy             | Partnership asks need mutual leverage, not sales copy.            | Helps define the collaboration thesis before outreach.                                        |
| PR and Media Strategy            | Media outreach must protect the audience and beat.                | Helps decide whether a pitch belongs in PR/podcast mode.                                      |
| Recruiting Strategy              | Candidate outreach must be candidate-centered.                    | Clarifies role narrative, constraints, and why-this-person.                                   |
| Investor Narrative               | Fundraising outreach depends on company clarity.                  | Feeds investor email payload, deck, and contrarian insight.                                   |

## Child vs Tangential Examples

| Scenario                                                            | Skill Type                   | Why                                                            |
| ------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------- |
| "I need a better artifact offer for this RevOps segment."           | Child                        | Directly feeds the outreach CTA.                               |
| "Let's build a content strategy so buyers know us before outreach." | Tangential                   | Supports trust, but not required for the current email bundle. |
| "Find a real anchor from this founder's podcast."                   | Child                        | Directly feeds the email bridge.                               |
| "Design a community strategy around this buyer group."              | Tangential                   | Builds relationship surface outside cold email.                |
| "Classify this reply and draft the next response."                  | Child                        | Directly continues the outreach thread.                        |
| "Create a case study library from our customers."                   | Tangential, then child input | It is adjacent work, but its outputs become proof assets.      |
| "Check if these domains can send 1,000/day."                        | Child                        | Blocks or permits volume outreach.                             |
| "Interview five customers to understand their language."            | Tangential, then child input | Research work informs buyer-language mining and OfferLab.      |

## Promotion Rules

A tangential skill can become a child skill when:

- it is repeatedly required to complete outreach bundles
- it returns a structured artifact the root skill consumes
- the absence of that artifact blocks sending
- the workflow has cold-outreach-specific constraints

Example:

```text
Customer research interviewing is tangential.
Buyer-language mining from customer interviews is a child skill.
```

Another example:

```text
Case study creation is tangential.
Proof asset selection for a specific email is a child skill.
```

## Current Strengths

- The root philosophy is strong: trust-first, not send-volume-first.
- The mode separation is strong.
- The prime flow is strong and memorable.
- OfferLab is a major differentiator.
- Taste Layer protects reputation.
- Reply OS recognizes that sending is only half the system.
- The source-lineaged cold email primitives are already in place.
- The internal OS blueprint gives the work a real operating shape.

## Current Weaknesses To Convert Into Child Skills

| Weakness                             | Likely Child Skill Or Template     |
| ------------------------------------ | ---------------------------------- |
| No concrete source-of-truth template | Source of Truth Builder            |
| No signal scoring model              | ICP and Signal Design              |
| No offer examples by mode            | OfferLab / Artifact Offer Creation |
| No proof governance                  | Proof Asset Selection              |
| No formal taste score                | Taste Review                       |
| No deliverability intake template    | Deliverability Readiness           |
| No reply statuses/SLAs               | Reply OS / Objection Handling      |
| No campaign stop/recycle thresholds  | Sequence and Cadence Planner       |
| No learning review artifact          | Learning Review                    |

## Suggested Build Order

1. Source of Truth Builder
2. ICP and Signal Design
3. OfferLab / Artifact Offer Creation
4. Outreach Compiler
5. Taste Review
6. Reply OS / Objection Handling
7. Learning Review
8. Deliverability Readiness
9. Buyer-Language Mining
10. Proof Asset Selection

Reasoning: the first four make the system usable for manual tests. Taste Review prevents reputational damage. Reply OS and Learning Review capture what happens after sending. Deliverability, buyer-language, and proof deepen reliability once the manual workflow is running.

## Open Design Questions

- Should child skills live as separate skill folders or as references under the root until they stabilize?
- Should the root skill call child skills explicitly, or should an agent infer when to load references?
- What is the minimum schema that lets a child skill pass structured output back to the root?
- Which tangential skills are broad enough to become their own root skills?
- Should "relationship building" be a root skill above cold email, with cold email as one channel?
- How do we prevent the nested system from becoming too heavy for simple one-off emails?
