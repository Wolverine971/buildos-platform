<!-- docs/research/youtube-library/INGESTION_FLOW.md -->

# YouTube Ingestion Flow

Use this flow for new YouTube URLs, transcripts, downloaded docs, analysis notes, or mixed source files before they become BuildOS skill drafts or public blog posts.

The goal is to keep every useful source findable without pretending every source is ready to become a skill.

## Staging Areas

| Stage | Location | Purpose |
| ----- | -------- | ------- |
| Raw intake | `docs/research/youtube-library/inbox/` | Temporary holding area for pasted transcripts, downloaded files, URL notes, or messy source bundles that have not been normalized yet. |
| Canonical transcripts | `docs/research/youtube-library/transcripts/` | Clean transcript files with standard frontmatter and source metadata. |
| Canonical analyses | `docs/research/youtube-library/analyses/` | Clean analysis files that extract reusable operating lessons from one or more sources. |
| Source index | `docs/research/youtube-library/INDEX.md` | Source of truth for every discovered video, deduped by YouTube video ID. |
| Skill queue | `docs/research/youtube-library/SKILL_CANDIDATES.md` | Tracks which sources should become skills, need synthesis, or were intentionally archived. |
| Skill drafts | `docs/research/youtube-library/skill-drafts/<skill-slug>/SKILL.md` | Portable skill definitions created only after a source has enough operating value. |

Do not put raw or unanalyzed source material directly in `skill-drafts/`.

## Intake Rules

For every new YouTube source:

1. Extract or record the YouTube video ID.
2. Check `INDEX.md` for an existing entry before adding or downloading anything.
3. If the source is messy, incomplete, or bundled with unrelated files, place it in `inbox/` first.
4. If the transcript is clean enough, put it directly in `transcripts/`.
5. Add standard frontmatter from `FRONTMATTER_SCHEMA.md`.
6. Add or update the row in `INDEX.md`.
7. Decide the next processing status.

## Processing Status Ladder

Use these statuses to keep staged sources honest:

| Situation | `library_status` | `processing_status` | `processed` | Next action |
| --------- | ---------------- | ------------------- | ----------- | ----------- |
| URL only, no transcript | `link-only` | `needs_transcript` | `false` | Download transcript or ask for source file. |
| Raw source dropped in `inbox/` | `intake` | `needs_classification` | `false` | Identify video ID, category, source type, and whether it needs transcript cleanup. |
| Transcript exists, no analysis | `transcript` | `needs_analysis` | `false` | Extract operating lessons and decide skill potential. |
| Transcript plus analysis exists, but skill direction is unclear | `transcript, analysis` | `needs_synthesis` | `false` | Combine with related sources or choose the strongest skill angle. |
| Source is useful but not a skill | `transcript` or `analysis` | `archive_reference_only` | `true` | Keep it indexed as a reference. |
| Source is not research material | `product-asset, not-skill-source` | `not_skill_source` | `true` | Exclude from skill queue. |
| Source produced a portable skill | `transcript, analysis, skill-draft` | `draft_skill_created` | `true` | Link the draft skill and consider a public article. |
| Source produced a public article | `skill-article` | `public_article_created` | `true` | Link the public article. |

`processed: true` means the source produced a durable output or an explicit archive decision. It does not mean the video was merely downloaded.

## Classification Checklist

Classify every source on intake:

- Category: sales and growth, product strategy, marketing and content, product and design, technology and agent systems, writing, psychology/agency/philosophy, product asset, or another clearly named category.
- Source state: URL only, transcript, analysis, mixed notes, blog reference, product asset.
- Skill potential: `true`, `false`, or `needs_synthesis`.
- Priority: `high`, `medium`, `backlog`, or `not_applicable`.
- Likely skill type: core, provider, stack, soft.
- Likely skill shape: procedure, decision-framework, strategy-playbook, quality-guardrail, research-synthesis, or content-system.
- Next action: download transcript, clean transcript, analyze, synthesize, create skill draft, archive, or publish.

## When To Create A Skill

Create `skill-drafts/<skill-slug>/SKILL.md` only when the source changes what an agent should do.

Good signs:

- It teaches a repeatable workflow.
- It gives a decision framework or sequence of questions.
- It names concrete failure modes and guardrails.
- It can guide future work without rereading the full transcript.
- It combines well with other BuildOS skill-repo themes.

Weak signs:

- It is mainly motivational.
- It is useful background but not operational.
- It duplicates an existing skill without adding a new behavior.
- It needs several related sources before the lesson is stable.

## Required Updates

After every intake pass, update:

- `INDEX.md` with the video row and local source paths.
- Source frontmatter with `processing_status`, `processed`, `skill_candidate`, and downstream output links.
- `SKILL_CANDIDATES.md` if the source is ready, needs synthesis, or has been archived.

If a public article is created later, update `public_article` in the source frontmatter and change `processing_status` to `public_article_created`.
