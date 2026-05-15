---
name: Cold Email Outreach Compiler
description: Child skill for compiling prepared mode, segment, anchor, offer, proof, and sender constraints into a finished cold outreach bundle or audit rewrite.
parent_id: cold_email_engagement_first_outreach
depth: 1
legacy_paths:
    - cold_email_outreach.compiler
    - cold_email_outreach.drafting
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_outreach_compiler/SKILL.md
---

# Cold Email Outreach Compiler

Use this child skill when the core inputs are ready and the user wants the finished email, sequence, or audit rewrite.

## When to Use

- Mode, target/segment, offer, and sender constraints are already known
- The user asks to draft, rewrite, or package the outreach
- The user wants a campaign bundle or per-email bundle
- The root skill has routed weak inputs to other child skills already

## Workflow

1. Restate the mode and why it is the right mode.
2. Confirm the input chain: person, moment, reason, offer, ask, follow-up.
3. Draft subject and preview before body.
4. Draft the email in the mode-appropriate register.
5. Add proof only if credible and relevant.
6. Replace passive language and remove extra CTAs.
7. Attach cadence, reply routes, and tracking targets.
8. Return refusal notes for any precondition that remains weak.

## Output Contract

- Mode
- Subject and alternate
- Preview text
- Email body
- Proof slot or proof gap
- CTA and why it is the smallest useful yes
- Cadence map
- Reply routes
- Tracking targets
- Refusal or risk notes

## Guardrails

- Do not compile around missing critical inputs without naming the gap.
- Do not use multiple CTAs.
- Do not leave preview text to chance.
- Do not turn an artifact offer into a meeting-first ask.
