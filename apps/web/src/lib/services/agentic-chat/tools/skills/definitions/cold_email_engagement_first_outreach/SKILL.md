---
name: Cold Email Engagement-First Outreach
description: Root skill for planning, drafting, auditing, and routing cold outreach to strangers across B2B sales, founder-led outreach, investor fundraising, recruiting, partnerships, PR, podcasts, and customer research. Use when the user needs a campaign bundle, one targeted email, reply handling, or a trust-preserving outreach operating workflow.
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

Root skill for trust-preserving cold outreach. The operating sequence is:

```text
right person -> right moment -> right reason -> right offer -> right ask -> right follow-up
```

The north star is qualified conversations started per unit of market trust consumed.

## When to Use

- Plan or audit a cold email campaign
- Draft one high-value targeted cold email
- Choose between high-volume, strategic-account, single-target, reply-revival, investor, recruiting, PR, podcast, partnership, or customer-research modes
- Diagnose low opens, low replies, bad-fit replies, poor meeting conversion, objections, or deliverability risk
- Design the outreach operating workflow before sending
- Decide which child skill should handle a weak input such as ICP, signal, offer, research, taste, deliverability, reply handling, or learning review

## Workflow

1. Choose exactly one mode: high-volume offer test, strategic-account sales, single-target relationship, reply revival, investor fundraising, recruiting, PR/podcast, partnership, or customer research.
2. Check the prime flow in order: right person, right moment, right reason, right offer, right ask, right follow-up.
3. Route to a child skill only if a specific input is missing or weak. Do not load children automatically.
4. Verify sender trust before any scaled sending. If deliverability is unknown, recommend manual or low-volume sending only.
5. Segment volume campaigns to one persona x one narrowing signal. Reject mixed lists.
6. Require a specific research anchor and bridge for strategic, single-target, investor, recruiting, PR, podcast, partnership, and relationship-sensitive outreach.
7. Prefer a useful artifact offer over a meeting ask: note, teardown, benchmark, signal report, sample, snapshot, deck, topic angles, or candidate slate.
8. Draft subject and preview before the body. Reject promotional, vague, money-word, or generic packaging.
9. Draft the body by mode and use one CTA: the smallest useful yes.
10. Add proof only when true, relevant, and approved.
11. Plan cadence by mode and define reply routes before sending.
12. Return a campaign bundle, per-email bundle, audit report, or child-skill routing plan.

## Child Skill Routing

- Use `cold_email_icp_signal_design` when the target, persona, timing signal, or disqualifier set is vague.
- Use `cold_email_offer_lab` when the offer is missing, meeting-first, too large, or not artifact-shaped.
- Use `cold_email_research_anchors` when a high-value email needs a better anchor or bridge.
- Use `cold_email_outreach_compiler` when inputs are ready and the user needs the finished bundle.
- Use `cold_email_taste_review` when reputation risk, weak specificity, or fake personalization is the main concern.
- Use `cold_email_deliverability_readiness` when scaled sending, cold domains, or inbox health matters.
- Use `cold_email_reply_os` when replies arrive, silence needs revival, or objections need routing.
- Use `cold_email_learning_review` after a test produces metrics, replies, objections, or buyer language.

## Output Contracts

- Campaign bundle: mode, segment, sender check, offer, subject, preview, body, proof slot, CTA, cadence, reply routes, tracking targets, and refusal note if needed.
- Per-email bundle: mode, anchor, bridge, subject, preview, body, CTA, proof, specificity grade, taste review, and follow-up plan.
- Audit report: mode mismatch, sender gap, subject/preview issue, segment/research gap, offer gap, passive language, missing bridge, proof issue, cadence violation, reply-routing gap, and 3 rewrite candidates.
- Routing plan: which child skill to load, why, and what artifact it should return to the root.

## Guardrails

- Do not send, schedule, or publish outreach without human confirmation.
- Do not fabricate research, proof, metrics, mutual contacts, customer names, or buyer-language claims.
- Do not run mixed personas in one campaign.
- Do not recommend volume sending without verified sender health.
- Do not use "worth a chat" as the offer.
- Do not use a Loom, deck, or calendar link as the cold value unless the mode specifically supports it.
- Do not leave preview text to chance.
- Do not use investor meeting-first cold emails.
- Do not stack multiple offers or CTAs.
- Do not exceed mode cadence limits.
- Do not spend market trust casually.

## Examples

### User has a list but no clear segment

- Load `cold_email_icp_signal_design`.
- Return a segment definition and signal rubric before drafting.

### User has a target and a weak offer

- Load `cold_email_offer_lab`.
- Return an artifact offer and smallest useful yes before compiling the email.

### User has a drafted email and asks whether it is good

- Load `cold_email_taste_review` if the risk is reputation/tone, or `cold_email_outreach_compiler` if the goal is a full rewrite.

## Notes

- This is the runtime BuildOS skill. Public blog content may paraphrase it, but should point back to this file as the core skill source.
- Deeper research lineage and public source analysis live under `docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/`.
