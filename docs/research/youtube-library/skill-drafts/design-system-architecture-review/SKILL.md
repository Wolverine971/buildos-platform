---
name: design-system-architecture-review
description: Source-backed child skill for reviewing design-system hierarchy, tokens, governance, releases, intake, adoption, migration, and product outcomes.
path: docs/research/youtube-library/skill-drafts/design-system-architecture-review/SKILL.md
---

# Design System Architecture Review

Use this draft when turning source material into the runtime `design_system_architecture_review` child skill.

## When to Use

- Reviewing or creating a design system, component library, token architecture, release process, contribution model, or design-system roadmap.
- A product has repeated UI inconsistency that should be solved at the system level.
- The team is migrating from templates, Material/Bootstrap, one-off components, or a legacy UI into an owned system.

## Workflow

1. Map system layers: foundations, tokens, components, patterns, templates, pages, docs, and adoption channels.
2. Tie system work to product outcomes, not just consistency.
3. Classify stage and migration path: keep template, customize, parity rebuild, flow-by-flow migration, or rebuild.
4. Audit tokens and components for role-based naming, semantic scope, variants, states, ownership, and promotion rules.
5. Audit operations: feature definition, planning, specs, DRI map, library matrix, VQA, accessibility, release cadence, comms, roadmap, and intake.
6. Return findings with product value, owner, migration shape, and next operating change.

## Source Backbone

- Brad Frost, "Beyond Consistency: From Design Systems to Product Outcomes" - `docs/research/youtube-library/analyses/2026-05-15_brad-frost_design-systems-product-outcomes_analysis.md`
- Nathan Curtis, "Managing Design Systems: Features & Releases to Roadmaps & Backlogs" - `docs/research/youtube-library/analyses/2026-05-15_nathan-curtis_design-systems-operations_analysis.md`
- Earlier consolidated canon - `docs/research/youtube-library/analyses/2026-04-30_design-systems-canon_frost-curtis-kravets_analysis.md`

## Runtime Notes

This draft is promoted into `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/design_system_architecture_review/SKILL.md`.
