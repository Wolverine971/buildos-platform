---
doc_type: skill-reference
skill: cold_email_engagement_first_outreach
reference: internal-skill-architecture
visibility: internal
publish: false
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_engagement_first_outreach/references/internal-skill-architecture.md
---

# Internal Skill Architecture

Root skill:

- Owns the user's primary outreach job.
- Orchestrates the end-to-end sequence.
- Routes to child skills only when a specific input is weak or missing.

Child skill:

- Optional deep module inside the root workflow.
- Directly feeds the outreach bundle.
- Returns a structured artifact the root can consume.

Tangential skill:

- Adjacent relationship-building or GTM capability.
- Supports outreach, but is not required for every cold email run.
- May become its own root skill or feed a child skill later.

Routing rule:

```text
Is this required to complete the current outreach job?
  yes -> Is it a deep optional module inside the outreach workflow?
      yes -> child skill
      no -> root skill step
  no -> Does it support relationship-building, trust, or GTM around outreach?
      yes -> tangential skill
      no -> out of scope
```

Runtime child skills currently registered:

- `cold_email_icp_signal_design`
- `cold_email_offer_lab`
- `cold_email_research_anchors`
- `cold_email_outreach_compiler`
- `cold_email_taste_review`
- `cold_email_deliverability_readiness`
- `cold_email_reply_os`
- `cold_email_learning_review`

Tangential skills to consider later:

- Relationship building
- Founder-led content
- Community building
- Customer research interviewing
- Positioning and messaging
- Case study and proof creation
- CRM and data hygiene
- Lead enrichment and verification
- Compliance and privacy review
- Analytics and experiment design
- Event and conference networking
- Warm intro strategy
- Partnership strategy
- PR and media strategy
- Recruiting strategy
- Investor narrative

Canonical full internal architecture map:

`docs/research/youtube-library/skill-drafts/cold-email-engagement-first-outreach/references/internal-skill-architecture.md`
