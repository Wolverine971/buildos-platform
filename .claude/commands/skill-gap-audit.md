---
description: Audit a BuildOS skill or skill-combo index for blind spots, missing source coverage, expert gaps, and next research queries before drafting or publishing.
argument-hint: "[skill-combo-file | SKILL.md | skill-slug | blog-path]"
---

# Skill Gap Audit - BuildOS

Create a gap audit for a BuildOS skill, public skill draft, public agent-skill blog, or skill-combo index. The audit should answer: what is strong enough to draft, what is thin or missing, what expert/source material should be added, and what exact search queries should be used to find better source material.

This command is for planning and research direction. Do not draft the skill unless the user explicitly asks for a skill draft after reviewing the audit.

## If Invoked Without A Target

Ask for one target:

- A skill-combo index file, such as `docs/research/youtube-library/skill-combo-indexes/FOUNDER_OPS_AND_CAREER.md`
- A public skill draft, such as `docs/research/youtube-library/skill-drafts/ui-ux-quality-review/SKILL.md`
- A public agent-skill blog, such as `apps/web/src/content/blogs/agent-skills/<slug>.md`
- A runtime skill path, such as `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/<skill>/SKILL.md`
- A slug that can be resolved to one of the above

Then start once the user provides the target.

## Critical Boundary

This command may read BuildOS runtime agentic-chat skill definitions, but it must not edit them unless the user explicitly asks to change runtime behavior.

Do not edit files under:

```txt
apps/web/src/lib/services/agentic-chat/tools/skills/definitions/**
```

For runtime skill targets, write the audit under:

```txt
docs/research/youtube-library/gap-audits/runtime-<skill-slug>_GAP_AUDIT.md
```

For public skill-repo targets, it is okay to add or update a short "Related gap audit" link in the target file when useful.

## Target Resolution

Resolve the user's argument in this order:

1. Exact file path.
2. Skill-combo category name:
   - `sales-and-growth` -> `docs/research/youtube-library/skill-combo-indexes/SALES_AND_GROWTH.md`
   - `product-strategy` -> `docs/research/youtube-library/skill-combo-indexes/PRODUCT_STRATEGY.md`
   - `marketing-and-content` -> `docs/research/youtube-library/skill-combo-indexes/MARKETING_AND_CONTENT.md`
   - `product-and-design` -> `docs/research/youtube-library/skill-combo-indexes/PRODUCT_AND_DESIGN.md`
   - `technology-and-agent-systems` -> `docs/research/youtube-library/skill-combo-indexes/TECHNOLOGY_AND_AGENT_SYSTEMS.md`
   - `founder-ops-and-career` -> `docs/research/youtube-library/skill-combo-indexes/FOUNDER_OPS_AND_CAREER.md`
   - `writing` -> `docs/research/youtube-library/skill-combo-indexes/WRITING.md`
   - `psychology-agency-and-philosophy` -> `docs/research/youtube-library/skill-combo-indexes/PSYCHOLOGY_AGENCY_AND_PHILOSOPHY.md`
3. Public skill draft slug:
   - `docs/research/youtube-library/skill-drafts/<slug>/SKILL.md`
4. Public agent-skill blog slug:
   - `apps/web/src/content/blogs/agent-skills/<slug>.md`
5. Runtime skill slug:
   - `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/<slug>/SKILL.md`

If several files match, list the candidates and ask the user which one to audit.

## Output Location

Use the nearest durable planning location:

| Target Type | Audit Output |
| ----------- | ------------ |
| `docs/research/youtube-library/skill-combo-indexes/<NAME>.md` | `docs/research/youtube-library/skill-combo-indexes/<NAME>_GAP_AUDIT.md` |
| `docs/research/youtube-library/skill-drafts/<slug>/SKILL.md` | `docs/research/youtube-library/skill-drafts/<slug>/GAP_AUDIT.md` |
| `apps/web/src/content/blogs/agent-skills/<slug>.md` | `docs/research/youtube-library/gap-audits/<slug>_GAP_AUDIT.md` |
| Runtime `SKILL.md` | `docs/research/youtube-library/gap-audits/runtime-<skill-slug>_GAP_AUDIT.md` |
| Other readable source file | `docs/research/youtube-library/gap-audits/<slug>_GAP_AUDIT.md` |

Create `docs/research/youtube-library/gap-audits/` if it does not exist.

## Source Reading Pass

Read the target and gather nearby context before judging gaps.

### For Skill-Combo Indexes

Extract:

- category name
- existing combo candidates
- readiness states
- next actions
- stacked sources
- local source links
- YouTube/video links
- existing linked gap audit, if any

Then read the linked local source analyses or transcripts that materially support each combo. Do not read every transcript in full if the table points to a summary analysis; prefer the analysis first.

### For `SKILL.md` Files

Extract:

- skill name and description
- trigger phrases and when-to-use criteria
- workflow steps
- guardrails and stop conditions
- source attribution or references
- expected tools/providers
- examples
- missing assumptions

If the `SKILL.md` lives under runtime skill definitions, read only for analysis and do not modify it.

### For Public Agent-Skill Blogs

Extract:

- frontmatter fields, especially `skillId`, `skillType`, `skillCategory`, `skillSource`, and source attribution fields
- portable skill definition inside the article
- source notes
- failure modes
- install hint

Prefer auditing the embedded portable skill behavior, not the marketing polish of the article.

## Gap Analysis Framework

Create an audit that includes these sections.

### 1. Purpose

State what was audited, why the audit exists, and whether it is for a combo index, skill draft, blog, or runtime skill.

### 2. Current Strengths

List what the current source or skill already handles well.

For combo indexes, link each current source and name its unique contribution.

For skills, name the behavior the skill already changes in future agents.

### 3. Highest-Priority Gaps

Identify 4-8 gaps. Each gap should include:

- **Why it matters:** the practical failure or blind spot this creates.
- **What to collect or improve:** the missing source material, examples, workflows, guardrails, or tests.
- **Experts and sources to look for:** named people, channels, books, articles, podcasts, videos, or organizations.
- **Search queries:** exact queries the user can paste into YouTube, Google, Perplexity, or a podcast search.
- **Potential skill combo or update:** how this gap could become a new skill, sub-skill, section, or source stack.

Prefer gaps that change agent behavior. Avoid vague gaps like "needs more examples" unless you specify which examples and why.

### 4. Source Coverage Matrix

Add a compact table:

```markdown
| Capability / Question | Covered By | Missing Or Thin | Priority |
| --------------------- | ---------- | --------------- | -------- |
| ... | ... | ... | high |
```

Use this to show what the current materials can and cannot support.

### 5. Suggested New Directions

List candidate new skill combos or skill revisions:

```markdown
| Proposed Direction | Sources To Add | What It Should Enable |
| ------------------ | -------------- | --------------------- |
| `skill-slug` | Person/source list | Agent behavior enabled |
```

### 6. Recommended Next Research Pull

Choose the highest-leverage source-gathering move. Be opinionated. Include the first 3-5 sources or searches to run.

### 7. Draft Readiness

End with one of:

- `ready-to-draft`: enough source coverage exists.
- `draft-after-one-source`: one obvious source gap should be filled first.
- `needs-synthesis`: enough sources exist, but they need synthesis before drafting.
- `needs-research`: the audit found substantial blind spots.
- `archive-or-split`: the target is too broad, weak, or actually several skills.

Explain the status in 2-4 sentences.

## Expert And Search Query Rules

The audit should produce "gold" search directions, not generic recommendations.

Good:

```text
Matt Mochary CEO operating system accountability tracker
Claire Hughes Johnson Scaling People Stanford startup operating cadence
John McMahon MEDDICC champion economic buyer enterprise sales
```

Weak:

```text
startup advice
how to sell better
leadership tips
```

When suggesting people:

- Prefer operators, researchers, or domain experts with repeatable frameworks.
- Include contrarian sources when a skill needs judgment.
- Include at least one tactical operator source for every strategic source.
- If the target is a soft skill, look for experts who teach concrete conversation, decision, review, or operating workflows.
- If the target is a provider/core skill, look for official docs, implementation examples, failure cases, and security/permission caveats.

If internet access is available, search enough to verify that the named source exists and link it. If internet access is unavailable, still include the search queries and mark links as `to-find`.

## Linking Rules

For combo indexes and public skill drafts:

1. Add a "Related gap audit" or "Related planning doc" link near the top of the target file.
2. In the audit, link back to the target.
3. Link to every local source file used in the audit.
4. Link to external expert sources when verified.

For runtime skills:

- Link from the audit back to the runtime skill path.
- Do not add a link inside the runtime skill file.

## Audit Template

Use this structure:

````markdown
<!-- <audit-path> -->

# <Target Name> Gap Audit

## Purpose

This audit reviews [<target name>](<relative-link>) before drafting or revising related BuildOS skill files.

## Current Strengths

...

## Highest-Priority Gaps

### 1. <Gap Name>

**Why it matters:** ...

**What to collect or improve:**

- ...

**Experts and sources to look for:**

- [Name / source](https://...)

**Search queries:**

```text
query 1
query 2
query 3
```

**Potential skill combo or update:** `skill-slug`

## Source Coverage Matrix

| Capability / Question | Covered By | Missing Or Thin | Priority |
| --------------------- | ---------- | --------------- | -------- |
| ... | ... | ... | high |

## Suggested New Directions

| Proposed Direction | Sources To Add | What It Should Enable |
| ------------------ | -------------- | --------------------- |
| `skill-slug` | ... | ... |

## Recommended Next Research Pull

...

## Draft Readiness

`needs-research`

...
````

## Verification

After creating or editing an audit:

1. Check local links in the audit resolve.
2. If you added a link from the target to the audit, check that it resolves.
3. Run:

```bash
git diff --check
```

4. If the target was a runtime skill, verify the runtime skill has no diff:

```bash
git diff -- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/<skill-slug>/SKILL.md
```

## Final Response

Report:

- target audited
- audit file created or updated
- whether the target was linked back to the audit
- strongest gap found
- recommended next research pull
- verification run and result
