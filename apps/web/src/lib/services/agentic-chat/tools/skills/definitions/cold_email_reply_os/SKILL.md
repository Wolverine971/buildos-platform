---
name: Cold Email Reply OS
description: Child skill for classifying cold outreach replies, routing objections, reviving silence, and preserving trust after a recipient responds or goes quiet.
parent_id: cold_email_engagement_first_outreach
depth: 1
legacy_paths:
    - cold_email_outreach.reply_os
    - cold_email_outreach.objection_handling
reference_modules:
    - id: cold_email_reply_os.tactical_empathy_routes
      name: Tactical Empathy Routes
      summary: Route table and label -> calibrated question patterns for objections, silence, skepticism, angry replies, and ambiguous replies.
      when_to_load:
          - When a reply is skeptical, tense, ambiguous, negative, silent, or objection-heavy.
      path: references/tactical-empathy-routes.md
      visibility: internal
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
2. Load [references/tactical-empathy-routes.md](references/tactical-empathy-routes.md) for objections, silence, skepticism, angry replies, or ambiguous replies.
3. Preserve the original promise. If they asked for info, send the artifact, not a brochure.
4. Choose the next trust-preserving action.
5. Draft a short response with one label, one answer or artifact, and one next step.
6. Set owner and SLA for hot replies.
7. If silent after meaningful time, use one respectful numbered fork.

## Output Contract

- Reply class
- Intent level
- Next action
- Response draft
- Label or summary used
- Artifact to send
- Owner/SLA if relevant
- Stop or follow-up rule

## Guardrails

- Honor a no.
- Do not guilt, pressure, or insult the recipient.
- Do not push a call after weak interest.
- Do not call without context in sensitive markets.
- Do not leave high-intent replies overnight when the motion depends on calls.
- Do not debate angry replies or continue after opt-out.
