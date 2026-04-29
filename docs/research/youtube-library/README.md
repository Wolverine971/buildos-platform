<!-- docs/research/youtube-library/README.md -->

# BuildOS YouTube Library

This is the canonical index for YouTube videos, transcripts, and analyses that can become BuildOS blog posts, personal research notes, or public agent skills.

The goal is organization first:

- dedupe videos by YouTube video ID
- keep source attribution attached to every derived skill
- separate videos with transcripts from simple link references
- identify which videos are ready to convert into public `agent-skills` guides
- distinguish public skill sources from internal BuildOS operating references
- avoid losing existing context while older files still live elsewhere in the repo

## Folder Structure

```txt
docs/research/youtube-library/
+-- README.md
+-- INDEX.md
+-- SKILL_CANDIDATES.md
+-- BUILDOS_INTERNAL_SOURCES.md
+-- FRONTMATTER_SCHEMA.md
+-- INGESTION_FLOW.md
+-- skill-combo-indexes/
|   +-- README.md
+-- gap-audits/
|   +-- README.md
+-- inbox/
|   +-- README.md
+-- transcripts/
|   +-- README.md
+-- analyses/
|   +-- README.md
+-- skill-drafts/
    +-- README.md
```

## Source Of Truth

`INDEX.md` is the current source of truth for discovered YouTube videos.

Existing transcripts and analyses have not been moved yet. The index points back to their current paths so we can migrate deliberately instead of breaking drafts, blog references, or untracked working files.

Canonical source files under this folder should use the frontmatter schema in `FRONTMATTER_SCHEMA.md`, including `processing_status`, `processed`, `skill_candidate`, and downstream output fields.

Use `BUILDOS_INTERNAL_SOURCES.md` for videos that should inform BuildOS product, marketing, sales, fundraising, or agent architecture work even when they are not public skill candidates.

Use `skill-combo-indexes/` when a video is not strong enough to become a standalone skill but can strengthen a multi-source workflow.

Use `gap-audits/` for `/skill-gap-audit` outputs when the target is a standalone skill, public blog, runtime skill, or source file without a natural sibling audit location. Category-level combo audits should usually live beside their combo index in `skill-combo-indexes/`.

## Status Terms

- `transcript`: a local transcript or transcript-like source exists.
- `analysis`: a local analysis file exists.
- `blog-reference`: a public blog references the video.
- `skill-article`: the video has already been converted into an agent-skill article.
- `link-only`: the repo has only a URL or thin note.
- `related-link`: the video is mentioned inside another transcript or source file.
- `product-asset`: the URL is part of app/product code, not research material.

## Conversion Flow

Use `INGESTION_FLOW.md` for new YouTube URLs, raw transcripts, source bundles, and analysis notes that are not ready to become skills yet.

1. Add or find a video in `INDEX.md`.
2. Put messy or unclassified source drops under `inbox/`.
3. Put clean transcripts under `transcripts/`.
4. Put derived analysis notes under `analyses/`.
5. If the video can become an agent skill, add it to `SKILL_CANDIDATES.md`.
6. Use `/skill-gap-audit` when a skill or combo needs a blind-spot review before drafting.
7. Use `/youtube-to-skill` to create a portable draft under `skill-drafts/<skill-slug>/SKILL.md`.
8. Promote polished skills into public blog articles under `apps/web/src/content/blogs/agent-skills/`.
9. Keep the video and creator cited in the article and in the portable skill definition when useful.

## Migration Policy

For now, do not bulk-move existing transcripts. Move or copy them only when one is actively converted into a cleaned source package or skill draft.
