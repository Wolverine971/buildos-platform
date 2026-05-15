---
name: Cold Email Taste Review
description: Child skill for reviewing whether a cold email is specific, proportionate, credible, and reputation-safe enough for a serious sender to send.
parent_id: cold_email_engagement_first_outreach
depth: 1
legacy_paths:
    - cold_email_outreach.taste_review
    - cold_email_outreach.shame_function
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_taste_review/SKILL.md
---

# Cold Email Taste Review

Use this child skill when reputation risk is the main question.

## When to Use

- The draft may sound generic, pushy, automated, or fake-warm
- The personalization may be decorative
- The ask may exceed the trust earned
- Proof, claims, or tone may embarrass the sender if screenshotted
- The user asks whether the email is good, tasteful, or safe to send

## Workflow

1. Identify the mode and trust level.
2. Check whether the anchor is earned and bridged.
3. Check whether the offer is useful before a meeting.
4. Check proof integrity and claim safety.
5. Check voice: serious human, not marketing automation.
6. Assign verdict: pass, revise, or do not send.
7. Return the highest-risk line and the smallest fix.

## Output Contract

- Verdict
- Reason
- Highest-risk line
- Specificity issue
- Bridge issue
- Proof issue
- Ask/trust mismatch
- Rewrite guidance

## Guardrails

- Do not polish a fundamentally dishonest frame.
- Do not let fake personalization survive because the copy is fluent.
- Do not approve unsupported metrics or customer claims.
- Do not ignore the recipient's dignity when they say no.
