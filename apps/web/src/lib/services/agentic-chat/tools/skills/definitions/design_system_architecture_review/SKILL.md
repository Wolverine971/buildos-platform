---
name: Design System Architecture Review
description: >-
    Child skill under Build Quality UI/UX for design-system architecture: component hierarchy, token taxonomy, naming, governance, releases, intake, adoption, and product outcomes.
parent_id: build_quality_ui_ux
depth: 1
legacy_paths:
    - product-and-design.design-system-architecture-review.skill
    - product-and-design/design-system-architecture-review
    - docs/research/youtube-library/skill-drafts/design-system-architecture-review/SKILL.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/design_system_architecture_review/SKILL.md
---

# Design System Architecture Review

Use this child when UI quality depends on the system behind the screen.

## When to Use

- Reviewing or creating a design system, component library, token system, Figma/code parity model, documentation site, release process, or contribution workflow.
- The user asks about Atomic Design, design tokens, system governance, component naming, adoption, roadmaps, or design-system ROI.
- A screen-level review keeps finding repeated inconsistencies that need systemic correction.

## Workflow

1. Map the system layers: foundations, tokens, components, patterns, templates, pages, documentation, release channels, and adoption surfaces.
2. Tie the work to product outcomes before architecture detail. Name what becomes faster, safer, clearer, more accessible, easier to migrate, or more coherent.
3. Classify the stage and migration path: keep template, customize, parity rebuild, flow-by-flow migration, or rebuild.
4. Check token and component taxonomy: semantic roles, naming, scope, variants, states, promotion rules, and cross-platform fit.
5. Review operations: feature definition, planning, specs, owners, library matrix, VQA, accessibility, release cadence, comms, roadmap, and intake routing.
6. Return findings with evidence, product value, owner, migration shape, and the next operating change.

## Guardrails

- Do not treat design systems as component inventories only. Workflow, trust, releases, and adoption are part of the system.
- Do not recommend broad token flexibility without naming and governance rules.
- Do not use consistency as the only success metric.
- Do not recommend component-by-component migration when a product-flow or page-area migration would produce clearer value and less visible fragmentation.
- Do not call a design-system feature done until the release path, docs, library status, VQA, and accessibility responsibilities are clear.

## Notes

- Primary sources: Brad Frost, Nathan Curtis, Una Kravets, Steve Schoger, and Karri Saarinen.
- 2026-05-15 synthesis: `docs/research/youtube-library/analyses/2026-05-15_brad-frost_design-systems-product-outcomes_analysis.md` and `docs/research/youtube-library/analyses/2026-05-15_nathan-curtis_design-systems-operations_analysis.md`.
- Use Frost for product-outcome and migration judgment. Use Curtis for operations, release, DRI, library matrix, and intake checks.
