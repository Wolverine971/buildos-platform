<!-- docs/research/youtube-library/skill-drafts/README.md -->

# Skill Drafts

Working space for source-to-skill drafts before they become public blog posts.

Use this folder when a video is promising but not ready for `apps/web/src/content/blogs/agent-skills/`.

## Frontmatter

Draft skills should identify themselves with a stable `skill_id` that matches the
folder slug. `name` is human-readable and can change for clarity; `skill_id`
should not change unless the skill is intentionally renamed.

```yaml
---
skill_id: landing-page-scorecard-funnel
name: Landing Page Scorecard Funnel
description: Design an assessment-driven landing page that converts visitors into qualified, segmented leads.
skill_type: combo
categories:
    - marketing-and-content
    - sales-and-growth
lineage: lineage.yaml # optional
path: docs/research/youtube-library/skill-drafts/landing-page-scorecard-funnel/SKILL.md
---
```

Use category slugs from `docs/research/youtube-library/skill-combo-indexes/`.
Use `lineage` only when a structured lineage file exists beside the skill.

Draft skills should usually use this package shape:

```txt
<skill-slug>/
+-- SKILL.md
+-- lineage.yaml  # optional, experimental source/composition map
```

Use `lineage.yaml` when a skill combines multiple sources or when its subskills
should be reusable elsewhere. The current draft schema lives at
`docs/research/youtube-library/SKILL_LINEAGE_SCHEMA.md`.

Once the skill is ready for the public repo, move the final article draft into:

```txt
apps/web/src/content/blogs/agent-skills/<skill-slug>.md
```
