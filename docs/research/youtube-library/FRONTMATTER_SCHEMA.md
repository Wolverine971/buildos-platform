<!-- docs/research/youtube-library/FRONTMATTER_SCHEMA.md -->

# YouTube Source Frontmatter Schema

Use this schema for canonical YouTube source files under `docs/research/youtube-library/transcripts/` and cleaned analyses under `docs/research/youtube-library/analyses/`.

Required fields:

```yaml
title: "Video or source title"
source_type: youtube_transcript
video_id: "YouTube video ID"
url: "https://www.youtube.com/watch?v=..."
channel: "Creator or channel"
channel_url: "https://www.youtube.com/@..."
upload_date: YYYY-MM-DD
duration: "MM:SS"
views: 0
library_category: sales-and-growth
library_status: transcript
transcript_status: available
analysis_status: missing
processing_status: needs_analysis
processed: false
skill_candidate: true
skill_priority: backlog
skill_draft: ""
public_article: ""
indexed_date: "YYYY-MM-DD"
last_reviewed: "YYYY-MM-DD"
transcribed_date: "YYYY-MM-DD"
```

## Field Values

`source_type`:

- `youtube_transcript`
- `youtube_analysis`
- `youtube_reference`
- `product_asset`

`library_category`:

- `sales-and-growth`
- `product-strategy`
- `marketing-and-content`
- `product-and-design`
- `technology-and-agent-systems`
- `writing`
- `psychology-agency-and-philosophy`
- `product-asset`

`library_status` can combine values as comma-separated text when needed:

- `intake`
- `transcript`
- `analysis`
- `blog-reference`
- `skill-draft`
- `skill-article`
- `link-only`
- `related-link`
- `product-asset`
- `not-skill-source`

`transcript_status`:

- `missing`
- `available`
- `referenced`
- `not_applicable`

`analysis_status`:

- `missing`
- `available`
- `needs_synthesis`
- `not_applicable`

`processing_status`:

- `needs_classification`
- `needs_transcript`
- `transcript_available`
- `needs_analysis`
- `needs_synthesis`
- `draft_skill_created`
- `public_article_created`
- `not_skill_source`
- `archive_reference_only`

Use `processed: true` only after the source has produced a durable output such as a draft `SKILL.md`, public blog article, or explicit archive decision.
