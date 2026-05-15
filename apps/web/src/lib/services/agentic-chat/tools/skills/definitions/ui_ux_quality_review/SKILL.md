---
name: UI/UX Quality Review
description: >-
    Child skill under Build Quality UI/UX for foundational screen and flow review across hierarchy, clarity, spacing, type, color, consistency, states, charts, and responsive fit.
parent_id: build_quality_ui_ux
depth: 1
legacy_paths:
    - product-and-design.ui-ux-quality-review.skill
    - product-and-design/ui-ux-quality-review
    - docs/research/youtube-library/skill-drafts/ui-ux-quality-review/SKILL.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/ui_ux_quality_review/SKILL.md
---

# UI/UX Quality Review

Use this as the general-purpose UI review child. It catches practical issues before deeper specialty lenses are needed.

## When to Use

- Reviewing an app screen, dashboard, mobile flow, product workflow, modal, form, table, or AI-generated UI.
- The user asks for a UI/UX audit without naming accessibility, marketing, design systems, research, calm, or delight as the main lens.
- You need a compact findings list with severity, evidence, and concrete fixes.

## Workflow

1. Identify the user goal, primary action, secondary actions, and critical state changes.
2. Review structure first: information hierarchy, navigation, grouping, labels, task order, and obvious dead ends.
3. Review visual fundamentals: spacing rhythm, alignment, type scale, contrast, color roles, icon meaning, density, and empty/loading/error states.
4. Check interaction quality: affordances, feedback, validation, destructive action handling, keyboard path, and responsive behavior.
5. Return findings ordered by user impact, with a recommended fix and the child skill to load next if deeper work is needed.

## Guardrails

- Do not over-index on personal taste. Tie each issue to comprehension, task completion, confidence, accessibility, or maintainability.
- Escalate to `information_architecture_review` when the flow is conceptually confusing before it is visually weak.
- Escalate to `visual_craft_fundamentals` when the screen works but lacks polish.
- Escalate to `accessibility_inclusive_ui_review` when semantics, focus, keyboard, charts, or dynamic behavior are involved.

## Notes

- Source-backed draft: `docs/research/youtube-library/skill-drafts/ui-ux-quality-review/SKILL.md`.
- Primary sources: Kole Jain, DesignSpo visual hierarchy/typography/color/spacing sources, and cross-links to Nesrine Changuel for delight moments.
