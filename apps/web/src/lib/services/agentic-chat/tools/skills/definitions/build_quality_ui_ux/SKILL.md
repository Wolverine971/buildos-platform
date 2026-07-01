---
name: Build Quality UI/UX
description: >-
    Root UI/UX skill for routing, sequencing, and source-backed quality work across product screens, generated UI, marketing pages, accessibility, visual craft, calm/delight posture, design systems, information architecture, usability research, and implementation verification.
skill_type: orchestration # procedure | strategy | reference | resource | policy | orchestration
altitude: meta # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true # serve the raw body so Identity/Judgment/Routing/Contract reach the model
dependencies:
    - id: ui_ux_quality_review
      owns: Foundational pass for hierarchy, flow, spacing, type, color, consistency, states, charts, and responsive fit.
    - id: visual_craft_fundamentals
      owns: Detailed visual polish lens for spacing, contrast, shadows, color systems, type, empty states, and AI-generated visual slop.
    - id: accessibility_inclusive_ui_review
      owns: Accessibility floor for semantics, keyboard navigation, focus management, ARIA restraint, reduced motion, charts, and dynamic regions.
    - id: marketing_site_design_review
      owns: Landing-page and marketing-section review for heroes, proof, benefits, sections, CTA clarity, trust, and visual fundamentals.
    - id: calm_software_design_review
      owns: Restraint lens for focused software, opinionated defaults, lower attention cost, motion budget, and non-addictive product quality.
    - id: delightful_product_review
      owns: Delight lens for functional and emotional motivators, moments of progress, surprise, and memorability.
    - id: design_system_architecture_review
      owns: Architecture lens for component hierarchy, tokens, naming, governance, releases, adoption, and product outcomes.
    - id: information_architecture_review
      owns: IA and interaction lens for goals, conceptual models, affordances, signifiers, conventions, feedback, and recovery.
    - id: usability_quick_research
      owns: Lightweight research lens for research questions, assumption checks, short interviews, monthly 3-user tests, and synthesis.
legacy_paths:
    - ui_ux
    - ui-ux
    - build-quality-ui-ux
    - product-and-design.build-quality-ui-ux.skill
child_skills:
    - id: ui_ux_quality_review
      name: UI/UX Quality Review
      summary: Foundational pass for hierarchy, flow, spacing, type, color, consistency, states, charts, and responsive fit.
      when_to_load:
          - When reviewing an app screen, dashboard, mobile flow, or AI-generated UI for practical UI quality issues.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/ui_ux_quality_review/SKILL.md
    - id: visual_craft_fundamentals
      name: Visual Craft Fundamentals
      summary: Detailed visual polish lens for spacing, contrast, shadows, color systems, type, empty states, and AI-generated visual slop.
      when_to_load:
          - When the core flow works but the UI looks amateur, generic, visually noisy, or not premium enough.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/visual_craft_fundamentals/SKILL.md
    - id: accessibility_inclusive_ui_review
      name: Accessibility and Inclusive UI Review
      summary: Accessibility floor for semantics, keyboard navigation, focus management, ARIA restraint, reduced motion, charts, and dynamic regions.
      when_to_load:
          - When reviewing component behavior, forms, modals, navigation, custom controls, or production-readiness.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/accessibility_inclusive_ui_review/SKILL.md
    - id: marketing_site_design_review
      name: Marketing Site Design Review
      summary: Landing-page and marketing-section review for heroes, proof, benefits, sections, CTA clarity, trust, and visual fundamentals.
      when_to_load:
          - When the surface is a public website, landing page, launch page, portfolio, or conversion page.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/marketing_site_design_review/SKILL.md
    - id: calm_software_design_review
      name: Calm Software Design Review
      summary: Restraint lens for focused software, opinionated defaults, lower attention cost, motion budget, and non-addictive product quality.
      when_to_load:
          - When the product should feel calm, useful, focused, quiet, or work-oriented rather than stimulating.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/calm_software_design_review/SKILL.md
    - id: delightful_product_review
      name: Delightful Product Review
      summary: Delight lens for functional and emotional motivators, moments of progress, surprise, and memorability.
      when_to_load:
          - When the product needs more emotional pull, celebratory moments, or B2C-style delight.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/delightful_product_review/SKILL.md
    - id: design_system_architecture_review
      name: Design System Architecture Review
      summary: Architecture lens for component hierarchy, tokens, naming, governance, releases, adoption, and product outcomes.
      when_to_load:
          - When reviewing or creating design systems, token architecture, component libraries, or design-system operations.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/design_system_architecture_review/SKILL.md
    - id: information_architecture_review
      name: Information Architecture Review
      summary: IA and interaction lens for goals, conceptual models, affordances, signifiers, conventions, feedback, and recovery.
      when_to_load:
          - When a screen or flow feels confusing before visual polish, copywriting, or accessibility details are the main issue.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/information_architecture_review/SKILL.md
    - id: usability_quick_research
      name: Usability Quick Research
      summary: Lightweight research lens for research questions, assumption checks, short interviews, monthly 3-user tests, and synthesis.
      when_to_load:
          - When the work needs user evidence, quick testing, research planning, or validation-risk reduction.
      path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/usability_quick_research/SKILL.md
reference_modules:
    - id: build_quality_ui_ux.source_map
      name: UI/UX Source Map
      summary: Source inventory, thought-leader map, transcript status, readiness by child skill, and remaining coverage gaps.
      when_to_load:
          - When building, deepening, validating, or publishing UI/UX child skills.
          - When the user asks where a UI/UX skill claim comes from.
      path: references/source-map.md
      visibility: internal
    - id: build_quality_ui_ux.child_skill_source_plan
      name: Child Skill Source Plan
      summary: Pipeline checklist for finding YouTube videos, fetching transcripts, analyzing sources, and promoting child skills.
      when_to_load:
          - When expanding the UI/UX skill family or deciding which child skill needs source work next.
      path: references/child-skill-source-plan.md
      visibility: internal
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/build_quality_ui_ux/SKILL.md
---

# Build Quality UI/UX

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Provenance.
  This file is skill_type: orchestration, so Routing carries the weight: the child skills own the deep
  UI/UX mechanics and this file only classifies the surface, sequences the lenses, states the evidence
  level, and preserves source provenance. Routing here is dynamic (surface → child), so the Procedure
  points to the Routing table rather than deferring to one fixed sibling per step.
-->

## Identity

Build Quality UI/UX is the router and operating frame for UI/UX work. Use it to choose the right child skill, preserve source provenance, and avoid treating UI quality as one generic checklist.

This is an **orchestration** skill at **meta** altitude — a pure router. Its own knowledge is intentionally small: the child skills hold the deep mechanics (foundational review, visual craft, accessibility, marketing, calm, delight, design systems, information architecture, research) and the reference modules hold the source provenance. What lives _only_ here is the routing frame — surface classification, the structure-to-polish review sequence, and evidence-level discipline.

## Activation

- The user asks to build, review, improve, audit, or source a UI/UX skill, UI screen, product flow, landing page, design system, or AI-generated interface.
- The work spans more than one UI/UX lens and needs a sequence: information architecture, usability, accessibility, visual craft, brand posture, and implementation verification.
- The user is asking for a skill architecture, gap analysis, source map, or child-skill expansion path for product/design quality.

Escalate straight to a child skill when the request is narrowly about one lens; the full ownership map is in **Routing**.

## Judgment

The routing frame. When the pipeline branches, this is what you reason with.

- **Sequence structure to polish.** Sequence the review from structure to polish: information architecture first, usability evidence next, accessibility floor, visual craft, context-specific posture, then implementation verification.
- **State the evidence level.** Separate source-backed rules, repo/design-system constraints, direct observation, and open gaps.

## Procedure

Ordered sequence and intent only. _Who owns each lens is in **Routing**; the decision rules are in **Judgment**._ Steps marked **[here]** are owned by this skill.

1. **Classify the surface and outcome. [here]** app screen, dashboard, onboarding flow, marketing page, component library, research plan, design-system work, or implementation verification.
2. **Choose one primary child skill and at most two secondary child skills** → the selected child skills (see **Routing**). Load the root source map (`build_quality_ui_ux.source_map`) only when provenance, gap analysis, or child-skill buildout is part of the task.
3. **Sequence the chosen lenses** structure to polish, per **Judgment** → the selected child skills.
4. **State the evidence level. [here]** per **Judgment**.
5. **Return the artifact the user needs. [here]** per the **Contract**.

## Routing

Ownership map. The Procedure classifies and sequences; this table assigns each lens to its single owner — everyone else routes here.

| Lens / surface                                                                                            | Owner (child skill)                 |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Foundational screen/flow quality — hierarchy, flow, spacing, type, color, states, charts, responsive fit  | `ui_ux_quality_review`              |
| Visual polish — premium feel, contrast, shadows, color systems, empty states, AI visual slop              | `visual_craft_fundamentals`         |
| Accessibility floor — semantics, keyboard, focus, ARIA restraint, reduced motion, charts, dynamic regions | `accessibility_inclusive_ui_review` |
| Public website / landing / launch / conversion page                                                       | `marketing_site_design_review`      |
| Calm / focused / quiet / non-addictive posture                                                            | `calm_software_design_review`       |
| Delight — emotional pull, moments of progress, surprise, memorability                                     | `delightful_product_review`         |
| Design systems — component hierarchy, tokens, naming, governance, releases, adoption                      | `design_system_architecture_review` |
| Structure-first — confusing flow, wrong user goal, IA/interaction (sequence first)                        | `information_architecture_review`   |
| User evidence — quick testing, research planning, validation-risk reduction                               | `usability_quick_research`          |

## Contract

Return the artifact the user needs: audit findings, redesign plan, child-skill routing plan, source gap analysis, or implementation checklist.

## Policy

- Do not flatten every UI/UX problem into visual polish. Confusing structure, wrong user goal, inaccessible behavior, and weak research all need different child skills.
- Do not load every child skill by default. Route narrowly, then add another lens only when the surface demands it.
- Treat partially sourced children as usable but provisional. Name missing source coverage instead of pretending the skill is complete.
- For implementation work, verify rendered behavior with the project tools whenever feasible; static code inspection is not enough for layout, responsiveness, focus, motion, or canvas-heavy UI.

## Provenance

- **Reference modules:** `build_quality_ui_ux.source_map` (source inventory, thought-leader map, transcript status, readiness by child skill, remaining coverage gaps) and `build_quality_ui_ux.child_skill_source_plan` (pipeline checklist for finding videos, fetching transcripts, analyzing sources, and promoting child skills). Both are internal-visibility. [internal-default]
- Current strongest children: `ui_ux_quality_review`, `visual_craft_fundamentals`, `accessibility_inclusive_ui_review`, `marketing_site_design_review`, `calm_software_design_review`, and `delightful_product_review`. [internal-default]
- Newly strengthened children: `design_system_architecture_review` and `usability_quick_research`, backed by fresh 2026-05-15 transcript pulls for Brad Frost, Nathan Curtis, and Erika Hall. [PRIMARY — Brad Frost, Nathan Curtis, Erika Hall transcripts, 2026-05-15]
- Structure-first child rebuilt 2026-06-15: `information_architecture_review` now carries a full structural-map Output contract, a worked example, and the `ia_heuristics` reference module (Norman gulfs/stages, Cooper model-gap, the IA-relevant Nielsen heuristics, Morville wayfinding). It is the holistic structure-before-polish lens; sequence it first. Source backing is canonical book/article analysis — a long-form transcript pass would deepen it further. [PRIMARY — Norman, Cooper, Nielsen, Morville canon]
