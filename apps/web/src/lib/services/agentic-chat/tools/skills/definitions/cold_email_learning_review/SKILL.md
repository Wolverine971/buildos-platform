---
name: Cold Email Learning Review
description: Child skill for converting cold outreach campaign results, replies, objections, and buyer language into next tests and stop/iterate/recycle decisions.
parent_id: cold_email_engagement_first_outreach
depth: 1
legacy_paths:
    - cold_email_outreach.learning_review
    - cold_email_outreach.campaign_review
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_learning_review/SKILL.md
---

# Cold Email Learning Review

Use this child skill when a campaign or test has results and the user needs to learn what to do next.

## When to Use

- A campaign has open, reply, positive reply, meeting, complaint, or objection data
- The user asks whether to scale, stop, recycle, or change the offer
- Replies contain useful buyer language
- The team needs a learning memo after a test

## Workflow

1. Separate open, reply, positive reply, meeting conversion, complaints, and bad-fit replies.
2. Identify whether the likely problem is sender, segment, offer, body, proof, cadence, or reply handling.
3. Extract buyer language and objection patterns.
4. Decide: scale, iterate, recycle, pause, or declare the segment dead.
5. Propose the next test with one variable changed.

## Output Contract

- Metrics summary
- Diagnosis
- Buyer-language findings
- Objection mix
- Winning/losing lines
- Trust-cost signals
- Decision
- Next test

## Guardrails

- Do not optimize a single composite reply rate.
- Do not scale from tiny or mixed samples.
- Do not treat opens as buying intent.
- Do not ignore negative replies, opt-outs, or complaints.
