---
name: Cold Email Deliverability Readiness
description: Child skill for checking sender trust, cold-domain readiness, inbox caps, warmup, bounce risk, and complaint safeguards before scaled cold outreach.
parent_id: cold_email_engagement_first_outreach
depth: 1
legacy_paths:
    - cold_email_outreach.deliverability
    - cold_email_outreach.sender_readiness
reference_modules:
    - id: cold_email_deliverability_readiness.provider_requirement_matrix
      name: Provider Requirement Matrix
      summary: Current provider, sender, and compliance gates for pass/blocked/manual-only readiness decisions.
      when_to_load:
          - When deciding whether scaled cold email is allowed, blocked, or manual-only.
      path: references/provider-requirement-matrix.md
      visibility: internal
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_deliverability_readiness/SKILL.md
---

# Cold Email Deliverability Readiness

Use this child skill when scaled sending, cold domains, inbox health, or low opens matter.

## When to Use

- The user wants to send at volume
- Sending domains or inboxes are new
- SPF/DKIM/DMARC, warmup, complaints, bounces, or spam placement are unknown
- Open rate dropped or replies disappeared
- The campaign may exceed manual one-off sending

## Workflow

1. Identify sender identity, domains, inboxes, and planned volume.
2. Load `references/provider-requirement-matrix.md` when making a scaled-send readiness decision.
3. Check SPF, DKIM, DMARC, sender identity, unsubscribe/suppression, warmup, bounce risk, complaint history, recipient geography, and consent posture.
4. Apply conservative caps: about 30 emails per inbox per day to start, 50 max without evidence, 5 inboxes per domain, about 250 per domain per day.
5. Decide status: pass, blocked, or manual-only.
6. Return required fixes before scale.

## Output Contract

- Status
- Domain/inbox inventory
- Daily cap
- Warmup status
- Complaint/bounce risk
- Missing checks
- Required fixes
- Manual-only recommendation if needed

## Guardrails

- Do not recommend volume sending without verified sender health.
- Do not increase volume to fix low replies.
- Do not ignore complaints or bounce warnings.
- Do not use deliverability as a substitute for relevance.
