<!-- docs/research/youtube-library/SKILL_LINEAGE_HANDOFF.md -->

# Skill Lineage Handoff

This document explains the current BuildOS skill-lineage direction for another
agent. It is intentionally practical: read this before editing skill drafts,
adding new lineage manifests, or proposing a database model.

## Core Idea

BuildOS is treating a skill as a composition of smaller primitive skills.

Example:

- `landing-page-scorecard-funnel` is a combo skill.
- It is made from primitive skills like assessment promise copy, questionnaire
  signal design, setup-layer positioning, dynamic results personalization, and
  lead segment routing.
- Those primitive skills cite specific source claims from source markdown files.

The current model is graph-shaped, but we are not starting with a graph database.
We are starting with explicit markdown/YAML conventions that can later migrate
into database tables or graph storage if the workflow proves useful.

## Why This Matters

Skill lineage lets BuildOS answer:

- What is this skill made from?
- Which source claims support each primitive?
- Which source markdown files should an agent inspect for deeper context?
- Which outputs or guardrails depend on which primitive skills?
- If a source or claim changes, which skills might be affected?
- Which primitive skills are reusable across multiple combo skills?

The goal is not academic taxonomy. The goal is operational traceability for
agent behavior.

## Current Files

Primary convention docs:

- `docs/research/youtube-library/SKILL_LINEAGE_SCHEMA.md`
- `docs/research/youtube-library/skill-drafts/README.md`
- `docs/research/youtube-library/SKILL_LINEAGE_HANDOFF.md`

First fully wired example:

- `docs/research/youtube-library/skill-drafts/landing-page-scorecard-funnel/SKILL.md`
- `docs/research/youtube-library/skill-drafts/landing-page-scorecard-funnel/lineage.yaml`

Source analyses used by that example:

- `docs/marketing/growth/research/youtube-transcripts/2025-10-11-daniel-priestley-1m-landing-page-ANALYSIS.md`
- `docs/marketing/growth/research/youtube-transcripts/2026-04-29-april-dunford-sales-pitch-framework-ANALYSIS.md`

Candidate v2 sources for that skill:

- `docs/marketing/growth/research/youtube-transcripts/2026-04-24-lucky-saini-1000-hours-marketing-funnels-ANALYSIS.md`
- `docs/marketing/growth/research/youtube-transcripts/2026-04-28-ash-maurya-mafia-offer-ANALYSIS.md`

## Skill Frontmatter Convention

Every draft skill under `docs/research/youtube-library/skill-drafts/*/SKILL.md`
should have stable frontmatter:

```yaml
---
skill_id: landing-page-scorecard-funnel
name: Landing Page Scorecard Funnel
description: Design an assessment-driven landing page that converts visitors into qualified, segmented leads.
skill_type: combo
categories:
    - marketing-and-content
    - sales-and-growth
lineage: lineage.yaml
path: docs/research/youtube-library/skill-drafts/landing-page-scorecard-funnel/SKILL.md
---
```

Rules:

- `skill_id` is the stable slug and should match the folder name.
- `name` is human-readable and can be improved without breaking references.
- `skill_type` is currently `combo` for the YouTube-derived skill drafts.
- `categories` should use the category slugs from `skill-combo-indexes/`.
- `lineage` is present only when a `lineage.yaml` file exists beside the skill.
- `path` should point to the exact `SKILL.md` file.

## Lineage Manifest Convention

Use a skill-local `lineage.yaml` when a skill combines multiple sources, has
reusable primitive skills, or needs claim-level traceability.

The manifest currently models:

- `root_skill`: the skill package being described.
- `sources`: primary source markdown files and source URLs.
- `candidate_v2_sources`: relevant sources not yet imported into the skill.
- `nodes`: skill, primitive skill, guardrail, output, or evaluation nodes.
- `source_claims`: specific claims or framework elements extracted from sources.
- `edges`: relationships such as `composed_of`, `depends_on`, and `cites`.
- `operational_map`: how primitives and claims map to skill outputs.
- `open_questions`: unresolved modeling or synthesis questions.

Do not dump entire citations into `SKILL.md` frontmatter. The frontmatter
identifies the skill; `lineage.yaml` carries the structured composition and
source map.

## Landing Page Scorecard Example

The current landing-page skill has two primary source layers:

- Daniel Priestley supplies the scorecard funnel mechanics: landing page,
  questionnaire, dynamic results page, and segmentation.
- April Dunford supplies the positioning/setup layer for considered purchases:
  market insight, alternatives analysis, perfect-world scenario, differentiated
  value, and anti-FOMO posture.

Its current primitive skills include:

- `primitive.scorecard-funnel-architecture`
- `primitive.mode-selection`
- `primitive.assessment-promise-copy`
- `primitive.setup-layer-positioning`
- `primitive.alternatives-aware-value-prop`
- `primitive.questionnaire-signal-design`
- `primitive.dynamic-results-personalization`
- `primitive.lead-segment-routing`
- `primitive.credibility-and-trust`

This is the pattern to copy for the next combo skill.

## Design Principles

1. Start file-first.
   Do not propose a graph database until the file-based workflow shows that
   traversal or impact analysis is painful.

2. Model behavior, not trivia.
   Add a primitive only when it changes what the agent does.

3. Cite claims, not just documents.
   A source can support several different primitives. A primitive can cite
   several source claims.

4. Keep `SKILL.md` agent-readable.
   The skill file should remain a useful playbook. The lineage file should carry
   structured composition, sources, and edges.

5. Use candidate sources honestly.
   If a source seems relevant but has not been synthesized into the skill yet,
   add it to `candidate_v2_sources` rather than pretending the current skill
   already operationalizes it.

6. Prefer reusable primitives.
   If a primitive appears in two or more skills, consider whether it should
   become a standalone primitive skill draft or shared manifest later.

## Suggested Next Work

1. Add `source_id` frontmatter to source analysis markdown files.
   This would make chains like `skill_id -> lineage.yaml -> source_claims ->
source_id -> source markdown` easier to follow.

2. Add `lineage.yaml` to one more combo skill.
   Good candidates:
    - `content-strategy-beyond-blogging`
    - `hook-craft-short-form`
    - `algorithm-aware-publishing`
    - `ui-ux-quality-review`

3. Write a small validator.
   It should check:
    - every `skill_id` matches the folder slug
    - every `path` exists
    - every `lineage` file exists
    - every `source_id` referenced in `lineage.yaml` exists in `sources`
    - every edge endpoint resolves to a node or source claim

4. Only after several manifests exist, consider a database design.
   The likely first database shape is relational tables for skills, sources,
   claims, and edges. A graph database is a later option, not the next step.

## Important Caution

Do not turn this into a giant ontology project yet. The immediate product value
is that BuildOS can inspect a skill, see what primitive skills compose it, see
which sources justify those primitives, and reuse the primitives across better
compound skills over time.
