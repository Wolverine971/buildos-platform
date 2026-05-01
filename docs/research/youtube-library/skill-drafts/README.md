<!-- docs/research/youtube-library/skill-drafts/README.md -->

# Skill Drafts

Working space for source-to-skill drafts before they become public blog posts.

Use this folder when a video is promising but not ready for `apps/web/src/content/blogs/agent-skills/`.

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
