---
doc_type: skill-reference
skill: cold-email-engagement-first-outreach
reference: internal-child-skill-source-development-plan
visibility: internal
publish: false
purpose: Private research and source-acquisition plan for turning cold email child skill stubs into source-backed deep skills.
path: docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/references/internal-child-skill-source-development-plan.md
---

# Internal Child Skill Source Development Plan

Status: private internal planning document. Do not publish publicly without a separate review and redaction pass.

This document is for an agent assigned to deepen one cold email child skill at a time. The root skill should remain good enough to plan, draft, audit, and route cold outreach on its own. Child skills should become deep source-backed modules for the cases where one part of the workflow needs serious work.

The root sequence stays:

```text
right person -> right moment -> right reason -> right offer -> right ask -> right follow-up
```

The north star stays:

```text
qualified conversations started per unit of market trust consumed
```

## Success Criteria

A fleshed-out child skill should have:

- A clear job that directly feeds the root outreach workflow.
- 3-7 high-quality source materials, with provenance recorded.
- At least one source-backed workflow, rubric, checklist, or decision tree.
- Concrete examples, including bad-to-good rewrites or pass/fail cases where relevant.
- Known failure modes and guardrails.
- A structured output contract the root skill can consume.
- A short runtime `SKILL.md` plus deeper reference material if the body becomes too large.
- A lineage update that explains which sources support which rules.

The root skill should not absorb all this depth inline. It should route into the child only when the user has a weak or missing input.

## Boundary Rules

Root skill:

- Owns the end-to-end outreach job.
- Chooses mode and checks the prime flow.
- Routes to child skills only when a specific input is weak.
- Compiles or audits the final campaign bundle.

Child skill:

- Deepens one optional but important part of cold outreach.
- Returns a structured artifact that the root skill can use.
- Is part of the cold email critical path for some jobs, but not all jobs.

Tangential skill:

- Supports relationship-building, trust, positioning, or GTM around outreach.
- May happen before, after, or beside cold email.
- Should not become a mandatory root step unless the current job needs it.

## Source Quality Ladder

Use this ladder when collecting material:

| Level | Source Type                                                                           | How To Use It                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 5     | Official rules, standards, platform docs, legal sources                               | Use for compliance, deliverability, DNS, privacy, and platform-specific requirements. These can change, so verify current versions. |
| 4     | Direct expert teardown, practitioner workflow, primary transcript, book chapter       | Use for workflows, rubrics, examples, and language patterns. Extract principles and concrete moves.                                 |
| 3     | Real campaign artifacts, reply corpora, call transcripts, CRM notes, customer reviews | Use for examples, buyer language, objections, and actual performance learning. Protect private data.                                |
| 2     | Vendor guides, benchmark reports, tool docs                                           | Use directionally. Treat benchmarks and claims as context, not truth.                                                               |
| 1     | Blog listicles, social posts, unsourced claims, generic templates                     | Use only to identify possible angles to verify elsewhere.                                                                           |

For deliverability, privacy, and legal/compliance, browse or otherwise verify current official sources when doing the actual sourcing work. Requirements change.

## Research Protocol For Each Child Skill

1. Start with the current child skill file and the root source map.
2. Write the child skill's unresolved questions before collecting sources.
3. Gather 3-7 strong sources specific to that child skill.
4. Create source analyses, not just notes. For each source, capture the author's claim, evidence, constraints, and what should or should not enter the skill.
5. Extract reusable primitives: workflow steps, scoring rubrics, templates, disqualifiers, failure modes, examples, and guardrails.
6. Resolve conflicts by outreach mode. High-volume, strategic, investor, recruiting, and PR/podcast outreach have different standards.
7. Update the child `SKILL.md` only with compact operating guidance.
8. Put long examples, source excerpts, checklists, and edge cases in child reference modules.
9. Update lineage with source IDs and which rule each source supports.
10. Add or update runtime tests if skill loading, references, metadata, or registry behavior changes.

## Current Child Skills To Deepen

These child skills already exist in BuildOS runtime and should be fleshed out first.

| Child Skill                           | Current Job                                                  | What It Needs Most                                                                     |
| ------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `cold_email_icp_signal_design`        | Define right person and right moment.                        | Signal scoring, disqualifiers, buying committee logic, segment testability.            |
| `cold_email_offer_lab`                | Create or repair the artifact offer and smallest useful yes. | Offer examples by mode, production-cost rules, proof constraints.                      |
| `cold_email_research_anchors`         | Mine a specific research anchor and bridge.                  | Research surface map, specificity ladder examples, privacy/invasiveness boundaries.    |
| `cold_email_outreach_compiler`        | Compile ready inputs into a finished bundle.                 | Mode-specific copy patterns, subject/preview rules, body linting, output schemas.      |
| `cold_email_taste_review`             | Review reputation risk and serious-human quality.            | Taste rubric, screenshot test, fake warmth detection, proof and trust checks.          |
| `cold_email_deliverability_readiness` | Check sender trust and volume readiness.                     | Current official sender requirements, DNS examples, caps, monitoring, troubleshooting. |
| `cold_email_reply_os`                 | Classify replies and choose next actions.                    | Reply taxonomy, objection routes, SLAs, examples, opt-out handling.                    |
| `cold_email_learning_review`          | Turn results into next tests.                                | Decision thresholds, metrics definitions, sample size caution, learning memo.          |

## Child Skill Briefs

### ICP and Signal Design

Deep job:

```text
Turn a broad target idea into one persona x one narrowing signal with clear disqualifiers and a testable timing thesis.
```

Source material to find:

- ICP, segmentation, and account-selection frameworks from sales strategy, RevOps, and GTM sources.
- Buying committee and stakeholder mapping sources.
- Jobs-to-be-Done or category-entry-point sources for why a buyer is in-market.
- Intent data and signal design docs from tools such as 6sense, Demandbase, Apollo, Clay, Cognism, or similar, treated directionally.
- Customer interview, CRM, call transcript, and closed-lost sources that reveal who actually feels the pain.

Questions to answer:

- What makes a signal strong enough to justify outreach now?
- How should signal freshness, source reliability, pain likelihood, and testability be scored?
- Which disqualifiers prevent illegible campaign results?
- How do we separate economic buyer, champion, user, blocker, and referral path?
- What is the minimum viable segment size for a test without mixing personas?

Artifacts to add:

- Segment definition schema.
- Signal scoring rubric.
- Disqualifier checklist.
- Buying committee role map.
- Examples of weak, acceptable, and strong segments.

First search prompts:

- `B2B ICP segmentation buying committee framework`
- `account based marketing intent signal scoring framework`
- `Jobs to be Done customer segmentation B2B outreach`
- `RevOps account scoring fit intent engagement model`

### OfferLab

Deep job:

```text
Turn a core business offer into a cold-safe artifact offer that is useful before a meeting.
```

Source material to find:

- Offer creation and value proposition sources, especially B2B service packaging and SaaS front-end offers.
- Positioning sources that clarify who the offer is for and what alternative it replaces.
- Direct response and sales sources on low-friction offers, but filter out list-email/newsletter logic unless clearly relevant.
- Proof, guarantee, and risk-reversal sources with strong caution around unsupported claims.
- Real cold email teardowns where a free audit, signal report, sample, benchmark, or teardown generated replies.

Questions to answer:

- What makes an artifact useful even if the recipient never buys?
- Which artifact types work by mode: high-volume, strategic, investor, recruiting, PR/podcast, partnership, customer research?
- How do we score production cost and delivery risk?
- When is a meeting ask acceptable, and when is it too expensive for cold trust?
- What proof can be used safely in a first email?

Artifacts to add:

- Artifact offer library by mode.
- Offer scoring rubric: specificity, usefulness, cost, proof, trust/ask ratio.
- Core offer vs front-end artifact distinction.
- Examples of meeting-first offers converted into cold-safe artifacts.
- Follow-up path after recipient says yes to the artifact.

First search prompts:

- `B2B service offer packaging free audit cold email`
- `April Dunford positioning value proposition target buyer`
- `Jobs to be Done offer design customer desired outcome`
- `cold email artifact offer teardown benchmark audit examples`

### Research Anchors

Deep job:

```text
Find one specific, real, recent reason for writing and bridge it to the outreach reason without fake personalization.
```

Source material to find:

- Sam McKenna "Show Me You Know Me" materials and similar research-led outreach sources.
- 30 Minutes to President's Club cold email teardown episodes and examples.
- Executive research workflows using LinkedIn, company sites, earnings calls, podcasts, public talks, job posts, and product announcements.
- PR/podcast pitch sources that focus on audience fit and editorial relevance.
- Recruiting sourcing sources that protect candidate dignity and context.
- Privacy and ethics material around using public but sensitive information.

Questions to answer:

- Which research surfaces are best by recipient type?
- What separates a Level 3 anchor from a Level 4 or 5 anchor?
- When does personalization become invasive, decorative, or irrelevant?
- How do we write a bridge that actually causes the outreach?
- How much research is enough for high-volume vs strategic vs single-target?

Artifacts to add:

- Research surface map by mode and recipient type.
- Specificity ladder examples.
- Bridge sentence patterns.
- Invasive/personal-data guardrail.
- Anchor grading worksheet.

First search prompts:

- `Sam McKenna Show Me You Know Me cold outreach`
- `30 Minutes to President's Club cold email teardown personalization`
- `executive account research sales email trigger examples`
- `podcast pitch host research audience relevance`

### Outreach Compiler

Deep job:

```text
Compile prepared inputs into subject, preview, body, CTA, cadence, and reply routes without reopening upstream strategy unless something is missing.
```

Source material to find:

- Cold email teardown sources focused on subject lines, preview text, body structure, and CTAs.
- Sales writing sources on concise language, direct asks, proof placement, and follow-up.
- Mobile email readability and plain-language guidance.
- Mode-specific examples: high-volume offer tests, strategic sales, investor, recruiting, PR/podcast, partnership, customer research.
- Internal examples of sent drafts and outcomes if available.

Questions to answer:

- What copy pattern should each mode use?
- What should the compiler reject before drafting?
- How should subject and preview be generated and audited together?
- What are the syntax, length, and formatting rules for mobile readability?
- What exact output schema should the root skill expect?

Artifacts to add:

- Mode-specific draft templates.
- Subject/preview packaging rules.
- Body lint checklist.
- Bad-to-good rewrite examples.
- Campaign bundle and per-email bundle schemas.

First search prompts:

- `cold email subject preview text examples teardown`
- `Jason Bay cold email rewrite framework`
- `B2B sales email concise writing CTA examples`
- `mobile readable email copy line length cold email`

### Taste Review

Deep job:

```text
Decide whether a serious sender should send the draft, revise it, or refuse to send it.
```

Source material to find:

- Expert teardown sources that explain why fluent copy still feels generic or unsafe.
- Brand and reputation-risk sources for executive communication.
- Plain English and editorial standards for direct, non-hype writing.
- Persuasion ethics sources and examples of manipulative or fake-personal cold outreach.
- Internal examples of emails that would be embarrassing if screenshotted.

Questions to answer:

- What is the taste rubric for serious-human quality?
- What is the threshold for pass, revise, and do-not-send?
- How do we detect fake warmth, decorative personalization, and over-automation?
- How do we score ask/trust mismatch?
- Which lines carry the most reputation risk?

Artifacts to add:

- Taste scorecard.
- Screenshot test.
- Fake-warmth detector.
- Proof integrity checklist.
- Highest-risk-line rewrite protocol.

First search prompts:

- `cold email teardown fake personalization examples`
- `sales email reputation risk executive communication`
- `plain English business writing persuasion ethics`
- `cold outreach bad email examples analysis`

### Deliverability Readiness

Deep job:

```text
Decide whether the sender can safely send at the planned volume and what must be fixed before scale.
```

Source material to find:

- Current Google sender requirements.
- Current Yahoo sender requirements.
- Microsoft/Outlook sender guidance.
- SPF, DKIM, and DMARC official or standards-based docs.
- M3AAWG and Spamhaus sender reputation guidance.
- ESP and deliverability vendor docs from Postmark, SendGrid, Mailgun, HubSpot, Instantly, Smartlead, or similar, treated directionally.
- Internal domain/inbox performance data if available.

Questions to answer:

- What are the current hard requirements for bulk senders?
- Which checks are official requirements vs practical cold-outreach heuristics?
- What daily caps should be conservative defaults by inbox/domain age and health?
- How should bounce, complaint, spam placement, and open-rate symptoms be interpreted?
- What is the troubleshooting path when performance drops?

Artifacts to add:

- Deliverability intake form.
- DNS checklist with SPF/DKIM/DMARC examples.
- Pass/blocked/manual-only decision tree.
- Conservative send-volume table.
- Monitoring and troubleshooting playbook.

First search prompts:

- `Google sender requirements 2026 SPF DKIM DMARC spam rate`
- `Yahoo sender requirements DMARC unsubscribe bulk sender`
- `Microsoft Outlook sender reputation best practices`
- `M3AAWG sender best practices email authentication`

Important: verify these sources at the time of sourcing. Do not rely on stale requirements.

### Reply OS

Deep job:

```text
Turn every reply or silence state into the next trust-preserving action.
```

Source material to find:

- Steli Efti/Close objection handling and numbered reply fork material.
- Sales response handling sources from Gong, Chorus, Close, HubSpot, or similar.
- Negotiation and objection handling sources such as Chris Voss-style tactical empathy, used carefully.
- Customer support tone and escalation guidance for angry or sensitive replies.
- Internal reply corpora, anonymized, with outcomes if available.

Questions to answer:

- What reply classes are exhaustive enough without becoming too complex?
- What is the correct next action for each reply class?
- Which replies require same-day response?
- When should the response send an artifact, ask a question, route to a call, refer internally, or stop?
- What are the no/opt-out and angry-reply rules?

Artifacts to add:

- Reply taxonomy.
- Route table by reply class.
- SLA matrix.
- Objection response bank.
- Numbered fork library and follow-up routes.
- Opt-out and negative-reply handling.

First search prompts:

- `Steli Efti 1 2 3 email hack objection handling`
- `Close sales email objection response examples`
- `Gong sales objection handling email replies`
- `cold email reply classification playbook`

### Learning Review

Deep job:

```text
Turn campaign results into a decision: scale, iterate, recycle, pause, or kill.
```

Source material to find:

- Experiment design and A/B testing sources for small samples and one-variable tests.
- Sales operations sources on outreach metrics and funnel diagnostics.
- Growth sources on learning loops and test logs.
- Cold email benchmark sources, with caveats.
- Internal campaign results, reply language, objections, opt-outs, and meeting outcomes.

Questions to answer:

- Which metrics diagnose sender, list, offer, body, cadence, and reply-handling problems?
- What sample-size warnings should prevent false conclusions?
- What thresholds should trigger scale, iterate, recycle, pause, or kill?
- How do we preserve buyer language for future OfferLab and copy work?
- How do we measure trust consumed, not just meetings booked?

Artifacts to add:

- Learning memo template.
- Metric diagnostic table.
- Stop/iterate/recycle decision tree.
- Buyer-language extraction worksheet.
- Next-test design template with one variable changed.

First search prompts:

- `sales outreach metrics positive reply rate meeting conversion diagnostic`
- `growth experiment design one variable test sample size`
- `cold email benchmark reply rate caveats`
- `A/B testing small sample decision rules marketing`

## Candidate Child Skills Not Yet Runtime

The internal architecture document lists several child-level modules that are not yet separate runtime skills. Build these only when repeated use proves they are needed.

| Candidate Child Skill        | Promote When                                                                    | Source Material To Find                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Source of Truth Builder      | Agents repeatedly need traceable account/person/proof data before drafting.     | CRM schemas, sales ops data hygiene, lead enrichment workflows, source citation patterns.             |
| Buyer-Language Mining        | Outreach quality depends on calls, reviews, transcripts, or community language. | Customer interview methods, Jobs-to-be-Done, review mining, sales call analysis, message mining.      |
| Proof Asset Selection        | Proof and claim safety become a frequent blocker.                               | Case study creation, claims substantiation, legal review, customer permission rules, proof hierarchy. |
| Sequence and Cadence Planner | Follow-up planning needs more depth than the root cadence rules.                | Sales sequence strategy, follow-up timing, channel mix, opt-out handling, mode-specific stop rules.   |

## Tangential Skill Source Queues

These are not cold email child skills by default. They are adjacent capabilities that may become their own root skills or reusable support skills.

| Tangential Skill                 | Source Material To Look For                                                                        | Relationship To Cold Outreach                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Relationship Building            | Founder relationship systems, chief-of-staff workflows, trust-building, thoughtful follow-through. | Helps continue trust after the cold start.                        |
| Founder-Led Content              | Founder-led sales, thought leadership, public expertise, creator-led B2B demand.                   | Warms the market and creates better reasons to reach out.         |
| Community Building               | Community strategy, member research, events, peer groups, rituals.                                 | Creates familiarity before direct outreach.                       |
| Customer Research Interviewing   | JTBD interviews, problem discovery, research ethics, interview synthesis.                          | Feeds ICP, signal, buyer-language, and OfferLab.                  |
| Positioning and Messaging        | Positioning, category design, value proposition, message testing.                                  | Clarifies why the recipient should care.                          |
| Case Study and Proof Creation    | Case study interviews, before/after evidence, proof permission, claims review.                     | Feeds proof slots and credibility.                                |
| CRM and Data Hygiene             | CRM design, account hygiene, enrichment, deduping, source attribution.                             | Prevents bad lists and bad learning.                              |
| Lead Enrichment and Verification | Email verification, public data sourcing, enrichment accuracy, privacy.                            | Improves right person, right moment, and bounce risk.             |
| Compliance and Privacy Review    | CAN-SPAM, GDPR, ePrivacy, CASL, privacy notices, consent, opt-outs.                                | Sets legal and reputation boundaries by region.                   |
| Analytics and Experiment Design  | Test design, attribution, funnel metrics, sample-size caution.                                     | Improves Learning Review and avoids false wins.                   |
| Warm Intro Strategy              | Network mapping, intro asks, referral etiquette.                                                   | Routes high-value contacts through trust paths before cold email. |
| Investor Narrative               | Fundraising narrative, YC fundraising discipline, deck clarity.                                    | Feeds investor mode when company story is unclear.                |
| Recruiting Strategy              | Candidate-centered outreach, role narrative, compensation clarity.                                 | Feeds recruiting mode and candidate dignity.                      |
| PR and Media Strategy            | Beat research, editorial fit, audience protection, media relations.                                | Feeds PR/podcast mode.                                            |
| Partnership Strategy             | Mutual leverage, partner qualification, channel strategy.                                          | Feeds partnership mode when the collaboration thesis is weak.     |

## Agent Deliverable Format

When an agent is assigned one child skill, ask for:

1. Source inventory with links, local paths, source type, and trust level.
2. Source analyses that extract useful rules and reject irrelevant material.
3. Updated child skill operating model.
4. Proposed reference modules for examples, rubrics, or long checklists.
5. Lineage updates mapping sources to rules.
6. Open questions and weak areas that need another research pass.
7. Validation notes, including tests run if runtime files changed.

## Definition Of Done

A child skill is source-backed when:

- It can be used by the root skill without extra explanation.
- It has a compact `SKILL.md` with a clear workflow, output contract, and guardrails.
- Long details live in references, not the main skill body.
- Its guidance is supported by specific source IDs or internal data.
- It includes examples or rubrics precise enough for another agent to apply.
- It names uncertainty instead of overclaiming.
- It preserves the trust-based north star.

## Do Not Do

- Do not dump raw transcripts into the child skill body.
- Do not rely on vendor benchmarks without caveats.
- Do not use opted-in newsletter/list-email advice as cold email advice unless the difference is explicit.
- Do not publish this internal plan or private operating-system notes.
- Do not make tangential skills mandatory root steps.
- Do not create a deep child skill unless it returns something the root workflow can use.
- Do not fabricate research, campaign data, examples, proof, or current deliverability requirements.
