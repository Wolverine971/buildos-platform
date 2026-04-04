<!-- apps/web/docs/content/AI_AGENT_SKILLS_LIBRARY_PLAN.md -->

# BuildOS AI Agent Skills Library Plan

## Goal

Build a public, search-indexable library of practical agent skills that can live alongside the existing BuildOS blog, attract traffic, and become durable reference material for both humans and agents.

The key difference from a prompt dump or isolated skill repo is that each page should teach:

- what the skill is for
- when an agent should use it
- how to implement it safely
- what to recommend in real-world situations
- what has changed and when the page was last reviewed

---

## Core Positioning

This library should do two jobs at the same time:

- help people plug these skills into their own agents and workflows
- show that BuildOS is the best integrated way to actually operationalize them

That means the content should be genuinely useful even if the reader never uses BuildOS.

But the pages should also make a clear argument:

- here is the open, practical way to do it yourself
- here is what good looks like when the workflow is implemented end to end
- if you want the integrated version with compounding context and less glue code, use BuildOS

This is important because the content should feel generous and credible, not like bait.

---

## What To Copy From gstack

The useful idea in `gstack` is not just "a pile of prompts." It is a stack of opinionated skills that work together as an operating system. That is the right mental model here.

BuildOS should extend that model in a public-web direction:

- indexed pages instead of repo-only skills
- deeper research and implementation notes
- screenshots and UI walkthroughs
- recommendation sections, not just instructions
- explicit freshness signals
- BuildOS-specific guidance for turning external activity into durable project context

---

## Recommended Product Decision

Do **not** build a separate skills product first.

Start inside the existing blog system and treat the first release as a new content lane:

- draft and strategy docs in `apps/web/docs/content/`
- published articles in `apps/web/src/content/blogs/agent-skills/`
- screenshots and static assets in `apps/web/static/blogs/agent-skills/<slug>/`

This is the fastest path because the repo already has:

- mdsvex-backed blog content loading
- category routes under `/blogs/<category>/<slug>`
- SEO metadata plumbing
- JSON-LD on blog and article pages
- a working publishing pattern for long-form technical content

Only split out a dedicated `/skills` hub later, after the category proves demand.

---

## Content Model

The library should have three initial layers, but it should be designed to expand into a broader capability system.

### 1. Foundation Skills

These are reusable building blocks that stack underneath product-specific guides.

Examples:

- OAuth 2.0 for agents
- service accounts and delegated access
- webhook verification
- rate limiting and backoff
- incremental sync and cursor handling
- browser handoff for MFA and CAPTCHA

### 2. Provider Skills

These are product-specific guides for real tools.

Examples:

- Google Calendar
- Gmail
- Google Drive
- Slack
- Linear
- Stripe

### 3. Stack Recipes

These are higher-level operating procedures that combine multiple skills into one workflow.

Examples:

- Founder assistant stack: Gmail + Calendar + Drive + BuildOS
- Sales follow-up stack: HubSpot + Gmail + Calendar + Docs + BuildOS
- Delivery stack: Slack + Linear + GitHub + BuildOS

This layered model matters because the same foundation pages can support many provider pages, and the stack recipes become strong search and conversion content.

### Important Extension

This is not the full long-term model.

As the system matures, the public library should evolve into a capability system with four main layers:

- skills for judgment and workflow
- tools for executable capability surfaces
- plugins for ecosystem packaging and auth
- stacks for multi-system operating recipes

See `AI_AGENT_CAPABILITY_SYSTEM_PLAN.md` for the full scalable model.

---

## Recommended Information Architecture

### Phase 1: Publish Through Existing Blog Infrastructure

Use a new blog category:

- category key: `agent-skills`
- route shape: `/blogs/agent-skills/<slug>`

This keeps everything inside the current site structure and lets you start shipping content immediately.

### Phase 2: Add A Dedicated Skills Index

After the first 8-12 strong articles, add:

- `/skills` as a curated hub or alias page
- filters by provider, skill type, and stack
- "stacks with" linking between related articles
- freshness cues and review status

### Phase 3: Add Agent-Friendly Packaging

Once the content library is real, add:

- an agent-readable skills index page
- structured "quick use" blocks near the top of each article
- canonical stack pages that summarize prerequisites and linked skills

### Phase 4: Expand Into Capability Views

When volume justifies it, split the public surface into filtered views for:

- `/skills`
- `/tools`
- `/plugins`
- `/stacks`

Those should share one metadata model and one linking system.

---

## Article Contract

Every skill article should follow a predictable template.

### Required Sections

1. **What this skill does**
2. **When an agent should use it**
3. **Prerequisites and access requirements**
4. **Authentication and permission model**
5. **API surface and important endpoints**
6. **Recommended implementation path**
7. **How to use this in your own agent stack**
8. **How BuildOS handles or benefits from this skill**
9. **Step-by-step workflow**
10. **Screenshots of key UI paths**
11. **Common failure modes and edge cases**
12. **Security and privacy recommendations**
13. **Last updated / what changed**
14. **References and official docs**

### Content Rules

- High-level explanation first, concrete implementation second.
- Recommendations should be explicit, not implied.
- Include what to avoid, not just what to do.
- Prefer operational guidance over generic summaries.
- Where the UI matters, include screenshots with captions.
- Where the API matters, explain scopes, quotas, pagination, retries, and common error states.
- The article must stand on its own for readers using other tools.
- BuildOS sections should demonstrate the integrated implementation, not replace the generic guidance.

---

## Metadata Strategy

### What Already Exists

The current blog metadata pipeline already supports:

- `title`
- `description`
- `author`
- `date`
- `lastmod`
- `published`
- `tags`
- `readingTime`
- `excerpt`
- `pic`

### Important Current Constraint

The current post loader in `apps/web/src/lib/utils/blog.ts` only exposes the known fields above in the `BlogPost` object. That means you can add extra frontmatter today, but it will not become visible in route data until the loader is extended.

### Recommended Future Metadata Additions

When the category is created, add support for:

- `skillType`: `foundation`, `provider`, or `stack`
- `providers`: array of relevant apps or APIs
- `stackWith`: related skills
- `reviewCadenceDays`
- `staleAfterDays`
- `testedAgainst`: API or product version notes
- `screenshotPaths`

Until that is wired in, keep the extra metadata in an on-page facts block.

---

## Current Infrastructure Gaps

The existing site is close, but not fully ready for agent skill content yet.

### Already Good

- Blog posts are loaded from `apps/web/src/content/blogs/**/*.md`
- Category routes already exist
- Article pages already emit `dateModified` in structured data
- The `lastmod` field already exists in content metadata

### Missing For Skill Content

- `lastmod` is not clearly shown to readers on the article page
- blog categories are hardcoded in `apps/web/src/lib/utils/blog.ts`
- category icons are hardcoded in `apps/web/src/routes/blogs/[category]/+page.svelte`
- there is no dedicated skill index or stack map
- there is no stale-content warning pattern
- there is no screenshot asset convention for skills yet

---

## First Implementation Batch

This is the minimum viable infrastructure to ship the first real wave.

### 1. Add The Category

Update:

- `apps/web/src/lib/utils/blog.ts`
- `apps/web/src/routes/blogs/[category]/+page.svelte`

### 2. Surface Freshness Clearly

Show visible publish and update dates on article pages, not just in metadata.

### 3. Establish A Content Template

Create one canonical article template for:

- frontmatter
- section order
- screenshot placement
- recommendation blocks
- change-log block

### 4. Establish An Asset Convention

Use:

```text
apps/web/static/blogs/agent-skills/<slug>/
```

Keep screenshots named for stable UI steps, not ad hoc exports.

### 5. Publish The First 3 Cornerstone Skills

Recommended first wave:

- Google Calendar for agents
- Gmail for agents
- Google Drive and Docs for agents

These stack naturally, fit the BuildOS story, and are broad enough to drive search traffic.

---

## Editorial Workflow

Use a two-track workflow: research first, publish second.

### Research Track

1. Pick one skill cluster.
2. Gather official docs, auth details, quotas, scopes, and edge cases.
3. Test the workflow end to end.
4. Capture screenshots while testing.
5. Write recommendations based on actual tradeoffs.

### Publish Track

1. Draft a planning brief in `apps/web/docs/content/`
2. Draft the article in `apps/web/src/content/blogs/agent-skills/`
3. Add screenshots to `apps/web/static/blogs/agent-skills/<slug>/`
4. Verify metadata, internal links, and references
5. Publish with a real `lastmod`
6. Add follow-up stack links from adjacent skills

---

## Freshness Workflow

Because these pages are implementation guides, freshness is part of the product.

Each skill should have:

- a visible `Last updated` date
- a note on what was reviewed
- a refresh owner
- a review cadence
- a trigger list for early refreshes

### Refresh Triggers

Refresh a page when:

- auth flows change
- scopes or permissions change
- API versions or quotas change
- UI screenshots drift materially
- recommended libraries or SDKs change
- BuildOS integration guidance changes

### Suggested Default Cadence

- Google Workspace, Slack, Stripe, HubSpot: every 60-90 days
- BuildOS-native skills: every release cycle where behavior changes
- Foundation patterns like OAuth and webhooks: every 90-120 days unless a provider change forces an earlier review

---

## SEO And Discoverability Strategy

These pages need to serve both humans and agents.

### Human Discovery

Optimize for:

- problem-based titles
- practical queries
- comparison and recommendation language
- strong internal linking between related skills

Examples:

- "How Agents Should Use Google Calendar Safely"
- "Gmail For AI Agents: Auth, Drafts, Replies, And Failure Modes"
- "Google Drive Permissions For Agents: What To Store, Share, And Avoid"

### Agent Discovery

Optimize for:

- predictable section headings
- explicit prerequisites
- a short "recommended approach" section near the top
- stable terminology across pages
- clearly labeled edge cases

### Conversion Framing

The CTA pattern should be:

- teach the skill openly
- explain the tradeoffs of stitching it together manually
- show how BuildOS turns that capability into durable project context and operational workflows

The message is not "you can only do this with BuildOS."

The message is:

- you can use this skill with your own agent stack
- if you want to see it done well in an integrated system, use BuildOS

---

## Success Metrics

The first version should be judged on three things:

### Traffic

- search impressions and clicks on skill pages
- entry pages by provider and problem query

### Utility

- time on page
- scroll depth
- internal click-through to related skills
- backlinks or direct references from other agents and repos

### Conversion

- clicks from skill pages into BuildOS pages
- signups from skill-content sessions
- qualitative evidence that people understand BuildOS as workflow infrastructure, not just another app

---

## Recommended Near-Term Sequence

### Sprint 1

- finalize category and template decisions
- make freshness visible on blog posts
- write the first three cornerstone article briefs

### Sprint 2

- publish the first three skill articles
- add internal linking between them
- create one "stack recipe" article that combines them

### Sprint 3

- add the skills index page
- add richer frontmatter support if the metadata proves useful
- start publishing second-wave tools like Slack, Linear, and Stripe

---

## Recommendation

Use the current blog system as the publishing engine, not as the final product shape.

That keeps the initial scope tight:

- ship through the existing site
- make freshness visible
- standardize article structure
- publish a small but excellent first wave

If the first 5-10 pages are strong, the library can later become its own top-level BuildOS surface.
