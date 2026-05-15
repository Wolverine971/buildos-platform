---
name: Accessibility and Inclusive UI Review
description: >-
    Child skill under Build Quality UI/UX for accessibility and inclusive component behavior: semantics, keyboard support, focus, ARIA restraint, reduced motion, dynamic regions, charts, and forms.
parent_id: build_quality_ui_ux
depth: 1
legacy_paths:
    - product-and-design.accessibility-and-inclusive-ui-review.skill
    - docs/research/youtube-library/skill-drafts/accessibility-and-inclusive-ui-review/SKILL.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/accessibility_inclusive_ui_review/SKILL.md
---

# Accessibility and Inclusive UI Review

Use this child to establish the accessibility floor before calling a UI finished.

## When to Use

- Reviewing forms, dialogs, menus, tabs, accordions, tables, charts, custom controls, navigation, or dynamic app screens.
- The user asks about inclusive design, WCAG, keyboard navigation, screen readers, focus, reduced motion, color contrast, or accessible implementation.
- A UI change is ready for production verification.

## Workflow

1. Check native semantics first: headings, landmarks, labels, buttons, links, form fields, table structure, and list structure.
2. Verify keyboard path, visible focus, focus order, focus trapping where appropriate, and focus restoration after route or modal changes.
3. Review ARIA only after native semantics are exhausted. Remove misleading ARIA before adding more.
4. Check color contrast, non-color cues, motion sensitivity, dynamic updates, error messaging, and chart alternatives.
5. Return blockers separately from improvements, with implementation-level fixes.

## Guardrails

- Do not treat accessibility as a checklist after visual polish. Broken semantics or focus can block the experience.
- Do not recommend ARIA when native HTML or simpler structure solves the problem.
- Do not hide content from one modality unless the intended behavior is explicit and tested.

## Notes

- Source-backed draft: `docs/research/youtube-library/skill-drafts/accessibility-and-inclusive-ui-review/SKILL.md`.
- Primary sources: Heydon Pickering, Sara Soueidan, and standards-backed WCAG/WAI-ARIA references.
