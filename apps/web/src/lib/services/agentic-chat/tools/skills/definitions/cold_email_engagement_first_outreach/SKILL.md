---
name: Cold Email Engagement-First Outreach
description: Root skill for planning, drafting, auditing, and routing cold outreach to strangers across B2B sales, founder-led outreach, investor fundraising, recruiting, partnerships, PR, podcasts, and customer research. Use when the user needs a campaign bundle, one targeted email, reply handling, or a trust-preserving outreach operating workflow.
skill_type: orchestration # procedure | strategy | reference | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true # serve the raw body so Identity/Judgment/Routing/Knowledge reach the model (matches all 8 children; see report)
dependencies: # REQUIRED for orchestration — machine-readable routing to the eight child skills
    - id: cold_email_icp_signal_design
      owns: The right person, persona, timing signal, and disqualifier set; the segment definition and signal rubric before outreach.
    - id: cold_email_offer_lab
      owns: Creating or repairing the artifact offer and the smallest useful yes.
    - id: cold_email_research_anchors
      owns: Mining one specific, real, recent anchor and bridge for strategic or single-target outreach.
    - id: cold_email_outreach_compiler
      owns: Compiling prepared mode, segment, anchor, offer, proof, and sender constraints into a finished outreach bundle.
    - id: cold_email_taste_review
      owns: Reputation-risk review, bridge quality, proof integrity, and whether a serious person should send the draft.
    - id: cold_email_deliverability_readiness
      owns: Sender trust, cold-domain readiness, volume caps, warmup, bounce risk, and complaint safeguards.
    - id: cold_email_reply_os
      owns: Classifying replies, routing objections, reviving silence, and preserving trust after response.
    - id: cold_email_learning_review
      owns: Turning campaign metrics, objections, and buyer language into next tests.
legacy_paths:
    - cold_email_outreach
    - cold-email-engagement-first-outreach
    - sales-and-growth/cold-email-engagement-first-outreach
    - growth.cold_email.skill
    - docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/SKILL.md
child_skills:
    - id: cold_email_icp_signal_design
      name: Cold Email ICP and Signal Design
      summary: Deep child skill for defining the right person, right moment, segment, buying signal, and disqualifiers before outreach.
      when_to_load:
          - When the target list, ICP, persona, or timing signal is vague, mixed, or untested.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_icp_signal_design/SKILL.md
    - id: cold_email_offer_lab
      name: Cold Email OfferLab
      summary: Deep child skill for creating or repairing the artifact offer and smallest useful yes.
      when_to_load:
          - When the user has no offer, has a meeting-first offer, or needs to design a free useful artifact.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_offer_lab/SKILL.md
    - id: cold_email_research_anchors
      name: Cold Email Research Anchors
      summary: Deep child skill for mining one specific, real, recent anchor and bridge for strategic or single-target outreach.
      when_to_load:
          - When strategic, single-target, investor, recruiting, PR, podcast, or partnership outreach needs stronger research.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_research_anchors/SKILL.md
    - id: cold_email_outreach_compiler
      name: Cold Email Outreach Compiler
      summary: Deep child skill for compiling prepared mode, segment, anchor, offer, proof, and sender constraints into a finished outreach bundle.
      when_to_load:
          - When the inputs are ready and the user wants a finished email, campaign bundle, or audit rewrite.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_outreach_compiler/SKILL.md
    - id: cold_email_taste_review
      name: Cold Email Taste Review
      summary: Deep child skill for reputation-risk review, bridge quality, proof integrity, and whether a serious person should send the draft.
      when_to_load:
          - When a draft may be generic, pushy, over-automated, weakly bridged, or reputation-risky.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_taste_review/SKILL.md
    - id: cold_email_deliverability_readiness
      name: Cold Email Deliverability Readiness
      summary: Deep child skill for sender trust, cold-domain readiness, volume caps, warmup, bounce risk, and complaint safeguards.
      when_to_load:
          - When sending at scale, using cold domains, or diagnosing low opens, bounces, spam placement, or complaint risk.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_deliverability_readiness/SKILL.md
    - id: cold_email_reply_os
      name: Cold Email Reply OS
      summary: Deep child skill for classifying replies, routing objections, reviving silence, and preserving trust after response.
      when_to_load:
          - When a reply arrives, a thread goes quiet, objections are expected, or the user needs reply-to-call handling.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_reply_os/SKILL.md
    - id: cold_email_learning_review
      name: Cold Email Learning Review
      summary: Deep child skill for turning campaign metrics, objections, and buyer language into next tests.
      when_to_load:
          - When a campaign or test has results and the user needs to decide stop, iterate, recycle, or scale.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_learning_review/SKILL.md
reference_modules:
    - id: cold_email_engagement_first_outreach.public_mode_router
      name: Public Outreach Mode Router
      summary: Portable public routing guide for choosing the right cold-outreach mode, required inputs, child skill handoffs, and output shape.
      when_to_load:
          - When using the portable bundle outside BuildOS.
          - When the task needs a fast decision between campaign, strategic-account, single-target, investor, recruiting, PR, partnership, or customer-research outreach modes.
      path: references/public-mode-router.md
      visibility: public
    - id: cold_email_engagement_first_outreach.source_map
      name: Cold Email Source Map
      summary: Runtime source map for the cleaned source corpus, foundational source layers, tactical gap-fill sources, and local research lineage.
      when_to_load:
          - When the agent needs provenance, source conflicts, or links to deeper research documents.
      path: references/source-map.md
      visibility: internal
    - id: cold_email_engagement_first_outreach.internal_os
      name: Internal Outreach Operating System
      summary: Internal blueprint for right person -> right moment -> right reason -> right offer -> right ask -> right follow-up.
      when_to_load:
          - When designing the broader market-learning and relationship-starting operating system, not just one email.
      path: references/internal-operating-system.md
      visibility: internal
    - id: cold_email_engagement_first_outreach.skill_architecture
      name: Internal Skill Architecture
      summary: Internal map for separating root skills, child skills, and tangential relationship-building skills.
      when_to_load:
          - When building or reorganizing nested outreach skills.
      path: references/internal-skill-architecture.md
      visibility: internal
    - id: cold_email_engagement_first_outreach.child_skill_source_plan
      name: Child Skill Source Plan
      summary: Internal guide for sourcing and deepening the cold email child skills with real source material.
      when_to_load:
          - When another agent is assigned to flesh out a cold email child skill with source-backed detail.
      path: references/child-skill-source-plan.md
      visibility: internal
    - id: cold_email_engagement_first_outreach.source_acquisition_queue
      name: Source Acquisition Queue
      summary: Internal corpus status and remaining queue for experts, books, sites, videos, and official documents behind the full cold email architecture.
      when_to_load:
          - When an agent needs to collect or assign source materials for deepening the cold email architecture.
      path: references/source-acquisition-queue.md
      visibility: internal
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_engagement_first_outreach/SKILL.md
---

# Cold Email Engagement-First Outreach

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Examples → Provenance.
  This file is skill_type: orchestration — a family root. Judgment holds the operating sequence + north-star metric;
  Procedure is the root's own send-workflow with `→` markers; Routing declares which of the eight child skills owns
  each weak input, declared once. Knowledge is thin (only the stable mode taxonomy).
-->

## Identity

Root skill for trust-preserving cold outreach. This is an **orchestration** skill at **domain** altitude: it chooses
the send-mode, runs the operating sequence, and routes weak inputs to eight deep child skills — it does not re-teach
their mechanics. What lives _only_ here, owned nowhere else, is the operating sequence, the north-star metric, the mode
taxonomy, and the trust-preserving guardrails.

## Activation

- Plan or audit a cold email campaign
- Draft one high-value targeted cold email
- Choose between high-volume, strategic-account, single-target, reply-revival, investor, recruiting, PR, podcast, partnership, or customer-research modes
- Diagnose low opens, low replies, bad-fit replies, poor meeting conversion, objections, or deliverability risk
- Design the outreach operating workflow before sending
- Decide which child skill should handle a weak input such as ICP, signal, offer, research, taste, deliverability, reply handling, or learning review

## Judgment

The operating sequence is:

```text
right person -> right moment -> right reason -> right offer -> right ask -> right follow-up
```

The north star is qualified conversations started per unit of market trust consumed.

## Procedure

Ordered sequence and intent only. _Who owns each routed step's deep mechanics is in **Routing**, referenced by the `→`
marker._ Steps marked **[here]** are owned by this skill.

1. Choose exactly one mode from the mode taxonomy (see **Knowledge**). **[here]**
2. Check the prime flow in order: right person, right moment, right reason, right offer, right ask, right follow-up (see **Judgment**). **[here]**
3. Route to a child skill only if a specific input is missing or weak (see **Routing**). Do not load children automatically. **[here]**
4. Verify sender trust before any scaled sending. If deliverability is unknown, recommend manual or low-volume sending only. → `cold_email_deliverability_readiness`
5. Segment volume campaigns to one persona x one narrowing signal. Reject mixed lists. → `cold_email_icp_signal_design`
6. Require a specific research anchor and bridge for strategic, single-target, investor, recruiting, PR, podcast, partnership, and relationship-sensitive outreach. → `cold_email_research_anchors`
7. Prefer a useful artifact offer over a meeting ask: note, teardown, benchmark, signal report, sample, snapshot, deck, topic angles, or candidate slate. → `cold_email_offer_lab`
8. Draft subject and preview before the body. Reject promotional, vague, money-word, or generic packaging. → `cold_email_outreach_compiler`
9. Draft the body by mode and use one CTA: the smallest useful yes. → `cold_email_outreach_compiler`
10. Add proof only when true, relevant, and approved. → `cold_email_taste_review`
11. Plan cadence by mode and define reply routes before sending. → `cold_email_reply_os`
12. Return a campaign bundle, per-email bundle, audit report, or child-skill routing plan (see **Contract**). **[here]**

## Routing

Ownership map. The Procedure sequences; this table assigns. One concept, one owner — everyone else routes here.

| Child skill (single owner)            | Route here when                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `cold_email_icp_signal_design`        | the target, persona, timing signal, or disqualifier set is vague               |
| `cold_email_offer_lab`                | the offer is missing, meeting-first, too large, or not artifact-shaped         |
| `cold_email_research_anchors`         | a high-value email needs a better anchor or bridge                             |
| `cold_email_outreach_compiler`        | inputs are ready and the user needs the finished bundle                        |
| `cold_email_taste_review`             | reputation risk, weak specificity, or fake personalization is the main concern |
| `cold_email_deliverability_readiness` | scaled sending, cold domains, or inbox health matters                          |
| `cold_email_reply_os`                 | replies arrive, silence needs revival, or objections need routing              |
| `cold_email_learning_review`          | a test produces metrics, replies, objections, or buyer language                |

## Contract

- Campaign bundle: mode, segment, sender check, offer, subject, preview, body, proof slot, CTA, cadence, reply routes, tracking targets, and refusal note if needed.
- Per-email bundle: mode, anchor, bridge, subject, preview, body, CTA, proof, specificity grade, taste review, and follow-up plan.
- Audit report: mode mismatch, sender gap, subject/preview issue, segment/research gap, offer gap, passive language, missing bridge, proof issue, cadence violation, reply-routing gap, and 3 rewrite candidates.
- Routing plan: which child skill to load, why, and what artifact it should return to the root.

## Policy

- Do not send, schedule, or publish outreach without human confirmation.
- Do not fabricate research, proof, metrics, mutual contacts, customer names, or buyer-language claims.
- Do not generate the opening line with AI. As of 2026, AI-written openers are not just synthetic-sounding — they are actively detectable: recipients pattern-match the shared format and inbox providers flag the common structural skeleton as mass-send, hurting deliverability. AI belongs in list cleaning, segmentation, intent/signal aggregation, and enrichment only; a human writes the message.
- Do not run mixed personas in one campaign.
- Do not recommend volume sending without verified sender health.
- Do not use "worth a chat" as the offer.
- Do not use a Loom, deck, or calendar link as the cold value unless the mode specifically supports it.
- Do not leave preview text to chance.
- Do not use investor meeting-first cold emails.
- Do not stack multiple offers or CTAs.
- Do not exceed mode cadence limits.
- Do not spend market trust casually.

## Knowledge

- **Mode taxonomy** (`internal-default`) — the send-modes this root chooses between in **Procedure** step 1: high-volume offer test, strategic-account sales, single-target relationship, reply revival, investor fundraising, recruiting, PR/podcast, partnership, or customer research.

## Examples

### User has a list but no clear segment

- Load `cold_email_icp_signal_design`.
- Return a segment definition and signal rubric before drafting.

### User has a target and a weak offer

- Load `cold_email_offer_lab`.
- Return an artifact offer and smallest useful yes before compiling the email.

### User has a drafted email and asks whether it is good

- Load `cold_email_taste_review` if the risk is reputation/tone, or `cold_email_outreach_compiler` if the goal is a full rewrite.

## Provenance

- This is the runtime BuildOS skill. Public blog content may paraphrase it, but should point back to this file as the core skill source.
- Deeper research lineage and public source analysis live under `docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/`.
