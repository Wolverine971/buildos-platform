<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/build_quality_ui_ux/references/source-map.md -->

# Build Quality UI/UX Source Map

This file is the provenance map for the `build_quality_ui_ux` root skill and its child skills. Load it when expanding the skill family, checking evidence quality, or deciding which child skill needs deeper sourcing.

## Current Child Skill Architecture

| Child skill                         | Role                                                                                                               | Primary source anchors                                                                           | Local source state                                                                                               | Readiness                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `ui_ux_quality_review`              | General screen review for flow, hierarchy, clarity, consistency, states, charts, and responsive fit.               | Kole Jain, DesignSpo, Nesrine Changuel.                                                          | Draft exists at `docs/research/youtube-library/skill-drafts/ui-ux-quality-review/SKILL.md`; gap analysis exists. | Runtime-ready, keep improving with examples.                                   |
| `visual_craft_fundamentals`         | Deep visual polish and AI-generated UI correction.                                                                 | Steve Schoger, Erik Kennedy, Kole Jain, DesignSpo.                                               | Draft exists at `docs/research/youtube-library/skill-drafts/visual-craft-fundamentals/SKILL.md`.                 | Runtime-ready.                                                                 |
| `accessibility_inclusive_ui_review` | Inclusive component and screen behavior review.                                                                    | Heydon Pickering, Sara Soueidan, WCAG/WAI-ARIA as standards layer.                               | Draft exists at `docs/research/youtube-library/skill-drafts/accessibility-and-inclusive-ui-review/SKILL.md`.     | Runtime-ready.                                                                 |
| `marketing_site_design_review`      | Landing-page and public-site design review.                                                                        | DesignSpo, Daniel Priestley.                                                                     | Draft exists at `docs/research/youtube-library/skill-drafts/marketing-site-design-review/SKILL.md`.              | Runtime-ready.                                                                 |
| `calm_software_design_review`       | Calm, focused software quality and restraint.                                                                      | Karri Saarinen, Werner Jainek, Jason Fried, DHH, John Maeda, Steph Ango.                         | Draft exists at `docs/research/youtube-library/skill-drafts/calm-software-design-review/SKILL.md`.               | Runtime-ready.                                                                 |
| `delightful_product_review`         | Functional and emotional delight review.                                                                           | Nesrine Changuel, Dylan Field, Kole Jain.                                                        | Draft exists at `docs/research/youtube-library/skill-drafts/delightful-product-review/SKILL.md`.                 | Runtime-ready.                                                                 |
| `design_system_architecture_review` | Component hierarchy, token taxonomy, naming, governance, roadmap, adoption, migration, and product-outcome review. | Brad Frost, Nathan Curtis, Una Kravets, Steve Schoger, Karri Saarinen.                           | Existing consolidated analysis plus 2026-05-15 Frost and Curtis synthesis analyses.                              | Runtime v2-synthesized; next gap is adoption metrics and lightweight examples. |
| `information_architecture_review`   | Goal, conceptual model, affordance, signifier, convention, feedback, and recovery review.                          | Don Norman, Alan Cooper, Peter Morville.                                                         | Existing consolidated analysis and article summaries.                                                            | Usable but source-thin for YouTube; needs long-form transcript pull.           |
| `usability_quick_research`          | Right-sized discovery, stakeholder alignment, old-research audit, and usability testing cadence.                   | Steve Krug, Erika Hall, Sauro and Lewis, NN/g, Sara Soueidan/Heydon as accessibility cross-link. | Existing consolidated analysis plus 2026-05-15 Erika Hall synthesis analysis.                                    | Runtime v2-synthesized; needs Krug or NN/g practical-testing refresh.          |

## New Source Syntheses On 2026-05-15

| Source                                                                               | Why it matters                                                                                                              | Analysis artifact                                                                                          |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Brad Frost, "Beyond Consistency: From Design Systems to Product Outcomes"            | Upgrades design systems from consistency theater to product outcomes, adoption, ownership, migration, and AI-era judgment.  | `docs/research/youtube-library/analyses/2026-05-15_brad-frost_design-systems-product-outcomes_analysis.md` |
| Nathan Curtis, "Managing Design Systems: Features & Releases to Roadmaps & Backlogs" | Adds concrete design-system operations: features, release planning, backlog management, task workflows, and intake routing. | `docs/research/youtube-library/analyses/2026-05-15_nathan-curtis_design-systems-operations_analysis.md`    |
| Erika Hall, "Getting User Experience and Service Design Research Right at Scale"     | Strengthens quick research with goal clarity, bet sizing, stakeholder alignment, old-research audit, and participant logic. | `docs/research/youtube-library/analyses/2026-05-15_erika-hall_research-at-scale_analysis.md`               |

## Thought-Leader Map

Use these names to expand the corpus with intent, not as a generic reading list.

| Area                        | People and institutions                                                      | Expansion target                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Screen-level UI quality     | Kole Jain, DesignSpo, Steve Schoger, Erik Kennedy                            | More teardown-style videos with concrete before/after examples.                                     |
| Accessibility               | Heydon Pickering, Sara Soueidan, W3C/WAI, WCAG, Adrian Roselli               | Standards-backed implementation detail, especially focus management and dynamic UI.                 |
| Design systems              | Brad Frost, Nathan Curtis, Alla Kholmatova, Una Kravets, Dan Mall, Jina Anne | Operations, adoption, governance, tokens, contribution models, and cross-platform release practice. |
| IA and interaction          | Don Norman, Alan Cooper, Peter Morville, Abby Covert, Jared Spool            | Long-form videos on conceptual models, labels, wayfinding, task flow, and recovery.                 |
| Usability research          | Steve Krug, Erika Hall, Jakob Nielsen, NN/g, Jeff Sauro, Tomer Sharon        | Moderated testing, small-n research, research cadence, metrics, and synthesis.                      |
| Calm and craft              | Karri Saarinen, Werner Jainek, Jason Fried, DHH, John Maeda, Steph Ango      | Product restraint, defaults, motion budget, and quality operating systems.                          |
| Delight and product emotion | Nesrine Changuel, Dylan Field, Aarron Walter, Don Norman                     | Emotional design, motivators, payoff moments, and when delight is the wrong tool.                   |

## Remaining Gaps

- `information_architecture_review`: find at least two transcript-backed sources beyond article/book summaries. Prioritize Abby Covert, Peter Morville, Jared Spool, and long-form Don Norman material.
- `usability_quick_research`: add one current Steve Krug or NN/g practical testing video with transcript to deepen the evaluative side.
- `design_system_architecture_review`: add source coverage on adoption metrics, ROI dashboards, and small-team operating models.
- `ui_implementation_verification`: not registered yet as a child. It should be created only after the design-to-code sources and repo-native verification workflow are synthesized.

## Promotion Rule

A child skill is runtime-ready when it has a clear task boundary, at least two credible source anchors or one canonical source plus standards documentation, an explicit output contract, and honest coverage notes for gaps.
