---
name: Cold Email Reply OS
description: Child skill for classifying cold outreach replies, routing objections, reviving silence, and preserving trust after a recipient responds or goes quiet.
parent_id: cold_email_engagement_first_outreach
depth: 1
legacy_paths:
    - cold_email_outreach.reply_os
    - cold_email_outreach.objection_handling
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_reply_os/SKILL.md
---

# Cold Email Reply OS

Use this child skill after sending, when a reply arrives, a thread goes quiet, or objections need routing.

## When to Use

- The user has a reply and needs the next response
- The prospect went silent after interest
- The user needs objection handling
- The user wants a low-friction numbered fork
- The user needs reply-to-call handling without pressure

## Workflow

1. Classify the reply: yes, no, not now, wrong person, already solved, send info, objection, referral, angry, ambiguous, or numbered response.
2. Preserve the original promise. If they asked for info, send the artifact, not a brochure.
3. Choose the next trust-preserving action.
4. Draft a short response with one next step.
5. Set owner and SLA for hot replies.
6. If silent after meaningful time, use one respectful numbered fork.

## Output Contract

- Reply class
- Intent level
- Next action
- Response draft
- Artifact to send
- Owner/SLA if relevant
- Stop or follow-up rule

## Guardrails

- Honor a no.
- Do not guilt, pressure, or insult the recipient.
- Do not push a call after weak interest.
- Do not call without context in sensitive markets.
- Do not leave high-intent replies overnight when the motion depends on calls.
