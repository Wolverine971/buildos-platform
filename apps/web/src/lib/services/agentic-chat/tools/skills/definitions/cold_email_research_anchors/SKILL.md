---
name: Cold Email Research Anchors
description: Child skill for mining and grading a specific, real, recent research anchor and bridge for high-value cold outreach.
parent_id: cold_email_engagement_first_outreach
depth: 1
legacy_paths:
    - cold_email_outreach.research_anchors
    - cold_email_outreach.smykm
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/cold_email_research_anchors/SKILL.md
---

# Cold Email Research Anchors

Use this child skill when strategic, single-target, investor, recruiting, PR, podcast, partnership, or founder-led outreach needs a stronger reason for writing.

## When to Use

- The anchor is only name, title, company, location, or generic industry
- The draft says "saw your recent post" without specifics
- The recipient is high-value or relationship-sensitive
- The bridge from research to offer feels decorative
- The user needs one excellent email, not a scale template

## Workflow

1. Identify the recipient type and best research surfaces.
2. Choose the correct anchor standard by mode:
    - Strategic account: business trigger, buyer struggle, Mobilizer signal, or internal-consensus risk.
    - PR/podcast: recent beat, episode, audience question, editorial focus, or source need.
    - Recruiting: candidate trajectory, work, role fit, and explicit constraint.
    - Customer research: real workflow, current workaround, or recent behavior.
3. Find one specific, real, recent, verifiable anchor.
4. Grade the anchor on the specificity ladder from 0 to 5.
5. Write the bridge: why this anchor causes the outreach and why the offer helps the recipient now.
6. Reject decorative personalization.
7. Return the best anchor, source, bridge, and any fallback anchors.

## Output Contract

- Recipient type
- Anchor source and date
- Exact detail or quote
- Specificity grade
- Why it matters
- Mode-specific standard used
- Bridge sentence
- Risk note if the anchor is too personal, stale, or unsupported

## Related Tools

- `util.web.visit`
- `util.web.search`

## Guardrails

- Do not invent research.
- Do not use personal facts without a business bridge.
- Do not ship Level 0-2 anchors for strategic or single-target outreach.
- Do not use obscure facts the recipient would find invasive.
- Do not pitch PR/podcast without audience or beat fit.
- Do not disguise a sales pitch as customer research.
