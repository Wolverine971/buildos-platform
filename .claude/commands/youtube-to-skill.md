---
description: Turn YouTube URLs, transcript files, or multiple source documents into a BuildOS agent-skill blog draft with a portable SKILL.md definition.
argument-hint: "[youtube-url | transcript-file | source-files...]"
---

# YouTube To Skill - BuildOS

Create a public BuildOS agent-skill guide from a YouTube video, transcript, long-form notes, or several source files. The output should help future agents capitalize on the operating knowledge in the source, not merely summarize it.

## If Invoked Without Sources

Ask for at least one source:

- YouTube URL
- Transcript file path
- Notes, chat export, or research file path
- A directory containing source files

Then start once the user provides sources.

## Critical Boundary

This command is for the public skill-repo/blog pipeline.

- Default output: `apps/web/src/content/blogs/agent-skills/<skill-slug>.md`
- Source storage for downloaded transcripts: `docs/research/youtube-library/transcripts/`
- Source-derived skill drafts when needed: `docs/research/youtube-library/skill-drafts/<skill-slug>/SKILL.md`
- General blog drafts when needed: `apps/web/docs/content/BLOG_DRAFT_<SLUG>.md`

Do not edit BuildOS runtime agentic-chat skill definitions unless the user explicitly asks to promote the public guide into runtime behavior. In particular, do not touch:

```txt
apps/web/src/lib/services/agentic-chat/tools/skills/definitions/**
```

## Input Handling

### YouTube URLs

For each YouTube URL, download a transcript with metadata:

```bash
python3 scripts/youtube-transcript.py "<youtube-url>" -o "docs/research/youtube-library/transcripts/YYYY-MM-DD_<video-slug>.md"
```

Before downloading, check `docs/research/youtube-library/INDEX.md` for the video ID. If a transcript or analysis already exists, use the existing source unless the user asked for a fresh download.

Use a readable lowercase slug from the video title or topic. If the transcript downloader fails because dependencies or network access are unavailable, report the blocker and ask the user to provide a transcript file. Do not invent transcript content.

### Transcript Or Source Files

Accept `.md`, `.txt`, `.srt`, `.vtt`, `.json`, or similar readable source files. If given a directory, list candidate source files first and use the files that are clearly relevant.

For multiple files:

1. Build a source inventory with title/path/type/date if available.
2. Identify common themes, contradictions, and unique contributions.
3. Decide whether the sources support one coherent skill or several separate skills.
4. If they clearly contain unrelated skills, create a classification brief and ask which skill to draft first.

## Analysis Pass

Before writing the article, extract the operating knowledge.

### 1. Source Attribution

Record source metadata:

- video title
- channel or creator
- channel URL if available
- video URL
- upload date if available
- local transcript/source path

The public article must cite the source video and creator. The portable `SKILL.md` may include a short attribution section when the source materially shaped the skill.

### 2. Topic And Skill Classification

Classify the skill along two axes.

**Skill type**

- `core`: durable infrastructure, auth, APIs, data sync, tool safety
- `provider`: one provider or product surface, such as Google Calendar, Gmail, Stripe, Slack
- `stack`: a recipe combining multiple tools or skills
- `soft`: an opinionated way to think, decide, create, research, sell, market, plan, or manage work

**Skill shape**

- `procedure`: step-by-step workflow
- `decision-framework`: questions and tradeoffs an agent should consider
- `strategy-playbook`: opinionated operating model for a recurring business or creative task
- `quality-guardrail`: failure modes, review checks, and stop conditions
- `research-synthesis`: how to investigate, compare, and turn evidence into action
- `content-system`: how to create, repurpose, publish, or distribute content

### 3. Use Cases And Triggers

Write the trigger surface future agents need:

- user phrasings that should activate the skill
- jobs-to-be-done
- cases where the skill should not be used
- tools, providers, or documents it expects

### 4. Extract Agent Behavior

Look for the behavior delta:

- What should an agent do differently after reading this?
- What sequence should it follow?
- What questions should it ask before acting?
- What should it avoid?
- What failure mode does this prevent?
- What examples make the skill concrete?
- What should the agent do when confidence is low?

Prefer actionable operating rules over inspirational summaries. A good skill changes future agent behavior.

## Output Decision

Usually create a public article draft directly:

```txt
apps/web/src/content/blogs/agent-skills/<skill-slug>.md
```

Set `published: false` unless the user explicitly says to publish.

Create a source-derived working draft under `docs/research/youtube-library/skill-drafts/<skill-slug>/SKILL.md` only when:

- the sources are messy or contradictory
- there are several possible skill directions
- the user asked for an outline before a blog post
- there is not enough confidence to create a publishable draft

After adding or using a source, update:

- `docs/research/youtube-library/INDEX.md`
- `docs/research/youtube-library/SKILL_CANDIDATES.md` when the source suggests a new skill

## Blog Draft Template

Use this frontmatter shape and adapt values to the skill:

```yaml
---
title: '<Human Title For The Skill>'
description: '<One-sentence description of the skill and why agents need it.>'
author: 'DJ Wayne'
date: 'YYYY-MM-DD'
lastmod: 'YYYY-MM-DD'
changefreq: 'monthly'
priority: '0.8'
published: false
tags: ['agent-skills', '<topic>', '<provider-or-domain>', 'buildos']
readingTime: 8
excerpt: '<Short excerpt for the blog card.>'
skillId: '<category>/<skill-slug>'
skillType: '<core | provider | stack | soft>'
skillCategory: '<category>'
providers: ['<Provider Or Tool>']
compatibleAgents: ['BuildOS-compatible agents', 'Claude Code', 'Codex', 'portable Agent Skills']
stackWith: ['<Related skill>']
skillSource: '<local source path or comma-separated source paths>'
installHint: '.agents/skills/<skill-slug>/SKILL.md'
sourceTitle: '<Source Video Or Document Title>'
sourceCreator: '<Creator Or Channel>'
sourceUrl: '<https://youtube.com/...>'
sourceChannelUrl: '<https://youtube.com/@...>'
path: apps/web/src/content/blogs/agent-skills/<skill-slug>.md
---
```

Omit source fields that are genuinely unavailable. Keep extra frontmatter valid YAML.

## Article Structure

Use the structure that fits the material, but include these pieces:

````markdown
Opening: what this skill helps an agent do and why it matters.

## Source Attribution

This skill was distilled from [<video title>](<video url>) by [<creator>](<channel url>) plus any additional listed sources.

## What This Skill Is For

Use cases, trigger phrases, expected inputs, and where it should not be used.

## The Operating Model

The mental model, decision framework, or strategic posture the source teaches.

## The Portable Skill Definition

Copy this into `.agents/skills/<skill-slug>/SKILL.md`.

```markdown
---
name: <skill-slug>
description: <what it does + when to use it + important trigger phrases>
---

# <Skill Name>

...
```

## How To Use It In BuildOS

Explain how this skill helps BuildOS users or agents, without making the whole article a product pitch.

## Failure Modes

What agents get wrong without this skill.

## Source Notes

Short citations and links to source materials.
````

Do not over-quote transcripts. Use short excerpts only when they are necessary; otherwise paraphrase and attribute.

## Portable SKILL.md Quality Bar

The `SKILL.md` inside the article should be concise and agent-readable:

- YAML frontmatter with only `name` and `description`
- clear "When to Use" section
- 3-7 step core workflow, or a decision framework if the skill is not procedural
- guardrails and stop conditions
- examples when they make behavior concrete
- references/source attribution when useful
- no long transcript summaries
- no marketing copy

Choose the right degree of freedom:

- Use exact steps for fragile procedural work.
- Use questions, principles, and examples for strategic or judgment-heavy soft skills.
- Split long details into references only if creating an actual skill package, not just a blog code block.

## Multi-Source Synthesis Rules

When combining several transcripts or notes:

- Do not flatten every source into one generic summary.
- Preserve the strongest unique idea from each source.
- Flag contradictions or disagreements.
- Prefer a skill that has one coherent job.
- If two strong skills emerge, write the first draft for the strongest one and list the others as pipeline candidates.

## Verification

After creating or editing a blog article:

1. Check the frontmatter parses as valid YAML.
2. From `apps/web`, run the nearest blog utility test:

```bash
npm run test -- src/lib/utils/blog.test.ts
```

3. If route or metadata code changed, also run:

```bash
npm run check
```

## Final Response

Report:

- source inputs used
- skill classification
- files created or edited
- whether the article is published or draft
- verification run and result
- unresolved questions or next skill ideas from the sources
