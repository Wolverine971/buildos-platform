<!-- docs/research/youtube-library/skill-combo-indexes/README.md -->

# Skill Combo Indexes

These category indexes answer a different question than `INDEX.md`.

`INDEX.md` asks: what videos do we have?

These docs ask: which videos should be combined into reusable agent skills because the stacked insights create a better workflow than any single source?

## Categories

- [Sales and Growth](SALES_AND_GROWTH.md)
- [Product Strategy](PRODUCT_STRATEGY.md)
- [Marketing and Content](MARKETING_AND_CONTENT.md)
- [Product and Design](PRODUCT_AND_DESIGN.md)
- [Technology and Agent Systems](TECHNOLOGY_AND_AGENT_SYSTEMS.md)
- [Founder Ops and Career](FOUNDER_OPS_AND_CAREER.md)
- [Writing](WRITING.md)
- [Psychology, Agency, and Philosophy](PSYCHOLOGY_AGENCY_AND_PHILOSOPHY.md)

## Readiness Terms

- `ready-to-draft`: enough source material exists to create a `SKILL.md`.
- `needs-synthesis`: source material exists, but the skill should combine several sources before drafting.
- `already-drafted`: a draft skill exists, but the combo may still improve it later.
- `needs-analysis`: at least one important source needs analysis before synthesis.
- `internal-only`: useful for BuildOS work, but not a public skill candidate right now.

## How To Use

When a single video is not strong enough on its own, check the matching category doc:

1. Find the closest combo candidate.
2. Add the source if it strengthens a workflow, guardrail, decision rule, or failure mode.
3. Avoid combining videos just because they share a topic.
4. Draft the skill only when the combined sources produce a concrete agent behavior.

Before drafting a combo into a public skill, run `/skill-gap-audit <combo-file>` to identify missing source coverage, expert search targets, and draft readiness. Store category-level audit files beside the combo index using `<NAME>_GAP_AUDIT.md`.
