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
3. Confirm the offer is artifact-first, buyer-progress-oriented, and alternatives-aware.
4. Draft subject and preview before body.
5. Draft the email in the mode-appropriate register.
6. Add proof only if credible, relevant, approved, and claim-matched.
7. For PR/podcast, package beat fit, audience reason, and source packet or angle list.
8. For strategic B2B, package the artifact so a Mobilizer could forward it internally.
9. Replace passive language and remove extra CTAs.
10. Attach cadence, reply routes, and tracking targets.
11. Return refusal notes for any precondition that remains weak.

## Output Contract

- Mode
- Subject and alternate
- Preview text
- Email body
- Proof slot or proof gap
- CTA and why it is the smallest useful yes
- Buyer progress / alternative being addressed
- Cadence map
- Reply routes
- Tracking targets
- Refusal or risk notes

## Guardrails

- Do not compile around missing critical inputs without naming the gap.
- Do not use multiple CTAs.
- Do not leave preview text to chance.
- Do not turn an artifact offer into a meeting-first ask.
- Do not compile PR/podcast outreach without audience fit.
- Do not compile strategic B2B outreach without a recipient or internal-consensus logic.
