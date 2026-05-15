---
name: Build Quality UI/UX
description: Root source-backed skill architecture for UI/UX quality work, routing to child skills for general UI review, visual craft, accessibility, marketing pages, calm software, delight, design systems, information architecture, usability research, and implementation verification gaps.
path: docs/research/youtube-library/skill-drafts/build-quality-ui-ux/SKILL.md
---

# Build Quality UI/UX

This is the source-library draft for the runtime `build_quality_ui_ux` skill. The runtime skill is intentionally concise; this draft records the architecture and source coverage needed to keep the UI/UX skill family coherent as it expands.

## Child Skill Architecture

| Child skill                         | Status                       | Purpose                                                                             |
| ----------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `ui_ux_quality_review`              | promoted                     | General screen and flow quality review.                                             |
| `visual_craft_fundamentals`         | promoted                     | Visual polish and AI-generated UI repair.                                           |
| `accessibility_inclusive_ui_review` | promoted                     | Accessibility and inclusive component behavior.                                     |
| `marketing_site_design_review`      | promoted                     | Landing-page and public-site review.                                                |
| `calm_software_design_review`       | promoted                     | Quiet, focused, non-addictive software quality.                                     |
| `delightful_product_review`         | promoted                     | Emotional and functional delight.                                                   |
| `design_system_architecture_review` | promoted, needs v2 synthesis | Design-system hierarchy, tokens, governance, releases, adoption, and outcomes.      |
| `information_architecture_review`   | promoted, source-thin        | Conceptual model, labels, affordances, signifiers, feedback, and recovery.          |
| `usability_quick_research`          | promoted, needs v2 synthesis | Lightweight discovery and usability testing cadence.                                |
| `ui_implementation_verification`    | not promoted                 | Rendering, responsive, focus, screenshot, and implementation verification workflow. |

## Workflow

1. Classify the surface: app screen, marketing page, component system, research plan, IA problem, implementation verification, or broader skill architecture.
2. Route to one primary child skill and at most two secondary children.
3. Use the source map before expanding or publishing a child skill.
4. Add YouTube transcripts and analysis artifacts before upgrading a child from provisional to strong.
5. Promote only concise runtime instructions; keep source provenance in references and research docs.

## References

- Source map: `references/source-map.md`
- Child source plan: `references/child-skill-source-plan.md`
- Runtime root: `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/build_quality_ui_ux/SKILL.md`
