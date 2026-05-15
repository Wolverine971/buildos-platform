---
name: Cold Email Deliverability Readiness
description: Child skill for checking sender trust, cold-domain readiness, inbox caps, warmup, bounce risk, and complaint safeguards before scaled cold outreach.
parent_id: cold_email_engagement_first_outreach
depth: 1
legacy_paths:
    - cold_email_outreach.deliverability
    - cold_email_outreach.sender_readiness
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
2. Check SPF, DKIM, DMARC, warmup, rotation, bounce risk, and complaint history.
3. Apply conservative caps: about 30 emails per inbox per day to start, 50 max without evidence, 5 inboxes per domain, about 250 per domain per day.
4. Decide status: pass, blocked, or manual-only.
5. Return required fixes before scale.

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
