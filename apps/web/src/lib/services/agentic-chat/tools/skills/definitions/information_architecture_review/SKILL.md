---
name: Information Architecture Review
description: >-
    Child skill under Build Quality UI/UX for IA and interaction fundamentals: goals, conceptual models, labels, affordances, signifiers, conventions, feedback, recovery, and wayfinding.
parent_id: build_quality_ui_ux
depth: 1
legacy_paths:
    - product-and-design.information-architecture-and-interaction-fundamentals.skill
    - product-and-design/information-architecture-and-interaction-fundamentals
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/information_architecture_review/SKILL.md
---

# Information Architecture Review

Use this child before visual polish when the user's problem is orientation, meaning, or flow comprehension.

## When to Use

- Reviewing a feature, flow, navigation model, dashboard, workspace, settings area, builder, or multi-step task that feels confusing.
- The user asks about information architecture, labels, affordances, signifiers, conceptual models, navigation, wayfinding, feedback, or recovery.
- A screen looks acceptable but users may not know what to do, where they are, what changed, or how to recover.

## Workflow

1. State the user's goal and the system's conceptual model in plain language.
2. Check labels, grouping, navigation, and hierarchy against that model.
3. Review affordances and signifiers: what looks actionable, what action it implies, and whether feedback confirms the result.
4. Check conventions, error prevention, recovery paths, and state visibility.
5. Return structural fixes before visual fixes.

## Guardrails

- Do not start with color, typography, or spacing when users cannot understand the model.
- Do not invent new interaction patterns where conventions would reduce cognitive load.
- Mark source coverage honestly; this child needs deeper transcript-backed sourcing before a full v2.

## Notes

- Primary sources: Don Norman, Alan Cooper, and Peter Morville.
- Current backing is canonical article/book analysis. Next source pass should add transcript-backed Abby Covert, Peter Morville, Jared Spool, or long-form Don Norman material.
