<!-- docs/specs/USER_FIRST_SKILL_GALLERY_SPEC_2026-07-08.md -->

# User-First Skill Gallery Spec

Status: Implementation in progress
Date: 2026-07-08
Owner: BuildOS product
Last implementation update: 2026-07-10

## Thesis

BuildOS skills should be presented as useful workflows first and agent infrastructure second.

The current public skill surface is strong technically: portable `SKILL.md` files, bundles, source lineage, runtime IDs, and reference modules. The user experience still feels like a repository. The next version should feel like a gallery of things a person can understand, try, remix, and trust.

The model is:

```txt
User browsing -> useful workflow
Agent browsing -> portable operating file
Builder browsing -> lineage, evals, references, and implementation details
```

The gallery should serve all three without making the first screen feel like documentation.

## Goals

- Make skills browseable by ordinary users, not only by agent builders.
- Give every skill a clear promise: what it helps you do, when to use it, and what output to expect.
- Keep `SKILL.md`, bundles, references, and lineage available without making them the main story.
- Support domain-first exploration, where users can start broad and move down into related skills, child skills, packs, and stacks.
- Make skills feel usable inside BuildOS, not just downloadable from BuildOS.
- Preserve the current portable skill architecture.

## Non-Goals

- Replace the existing blog posts. Blogs stay as editorial/source-led content.
- Replace `SKILL.md` as the canonical agent instruction file.
- Build a full marketplace with payments, ratings, moderation, or third-party publishing in this phase.
- Expose every internal skill reference publicly by default.

## Product Shape

The skill gallery becomes a dedicated product surface, separate from the blog.

Recommended routes:

```txt
/skills
/skills/[domain]
/skills/[domain]/[skill]
/skills/packs/[pack]
/skills/stacks/[stack]
```

Existing public compatibility routes can remain:

```txt
/agent-skills
/agent-skills/[slug]
/agent-skills/[slug]/skill.md
/agent-skills/[slug]/portable/SKILL.md
/agent-skills/[slug]/bundle.zip
```

The new gallery can link to those agent artifacts, but the user-facing route should be shorter and more memorable.

## Core IA

The hierarchy should reflect how people search for help:

```txt
Domain
  Skill Family
    Skill
      Child Skills
      References
      Examples
      Related Skills
```

Example:

```txt
Sales and Growth
  Cold Outreach
    Cold Email Engagement-First Outreach
      ICP and Signal Design
      Offer Lab
      Research Anchors
      Outreach Compiler
      Taste Review
      Deliverability Readiness
      Reply OS
      Learning Review
```

This lets users move down the rabbit hole without requiring them to understand BuildOS internals first.

## Gallery Home

The home page should answer: "What can I do with these?"

Recommended sections:

1. Hero
    - Headline: `Skills for better agent work`
    - Subcopy: `Browse repeatable workflows for research, writing, growth, design, planning, and operations. Use them yourself or give them to an agent.`
    - Primary CTA: `Browse skills`
    - Secondary CTA: `View packs`

2. Featured Skills
    - 3 to 6 high-quality skills with strong user-facing outcomes.
    - Cards should show title, short promise, domain, output type, and a `Try` or `View` action.

3. Skill Packs
    - Curated bundles around a job-to-be-done.
    - Examples: `Design Review Pack`, `Cold Outreach Pack`, `Content Craft Pack`, `Founder Strategy Pack`, `Calendar and Task Ops Pack`.

4. Browse By Domain
    - Product and Design
    - Sales and Growth
    - Marketing and Content
    - Founder Craft
    - Planning and Ops
    - Knowledge and Research

5. Explore All Skills
    - Search, filters, sort, compact cards.

## Skill Card

Cards should be designed for scanning and decision-making.

Required fields:

```txt
Name
One-line promise
Domain
Skill type
Output shape
Try/View action
```

Optional fields:

```txt
Creator/source
Stackable with
References count
Evals status
Portable support
```

Example card:

```txt
Cold Email Engagement-First Outreach
Plan, draft, audit, and route trust-preserving cold outreach.

Sales and Growth
Orchestration skill
Outputs: campaign plan, single email, audit, reply route

[Try in BuildOS] [View skill]
```

Avoid making card stats the dominant visual layer. `Sources`, `refs`, and `primitives` are trust signals, not the core promise.

## Skill Detail Page

The skill page should be the main product artifact.

Recommended layout:

1. Header
    - Name
    - One-line promise
    - Domain and type
    - Primary CTA: `Try in BuildOS`
    - Secondary CTA: `Copy prompt` or `Download bundle`

2. What It Does
    - Plain-language explanation for a human.
    - 3 to 5 use cases.
    - 2 to 4 non-use cases.

3. Try It
    - Example prompts or starting points.
    - Prefill chat with the skill context.
    - If the skill requires inputs, show an input checklist.

4. Steps
    - Human-readable operating procedure extracted from the skill.
    - This is the Dia-inspired section: the actual workflow is visible, readable, and central.

5. Output Examples
    - Show representative output shapes.
    - Do not need full demos at first. A compact example is enough.

6. Related Skills
    - Child skills
    - Sibling skills
    - Skills commonly stacked with this one

7. For Agents
    - Portable `SKILL.md`
    - BuildOS runtime `SKILL.md`
    - Bundle
    - `buildos.yaml`
    - Reference files
    - Compatibility notes

8. Trust and Lineage
    - Sources
    - Reference modules
    - Evals or smoke tests
    - Last updated
    - Safety notes

## Search And Discovery

Search should support both direct lookup and rabbit-hole exploration.

Search surfaces:

```txt
Global search: all skills, packs, stacks, domains
Domain search: only within one domain
Skill-family search: parent plus children
```

Search should match:

```txt
Name
Description
Use cases
Domain
Tags
Output shape
Activation language
Related skills
Lineage people
Reference summaries
```

Search result types:

```txt
Skill
Pack
Stack
Domain
Reference
Blog/source article
```

Result cards should explain why they matched:

```txt
Matched "deliverability" in:
- Use case: diagnose low opens, bounces, spam placement, or complaint risk
- Child skill: Cold Email Deliverability Readiness
```

## Domain Rabbit Holes

Domain pages should feel like maps, not filtered lists.

Each domain page should include:

- Overview of the domain.
- "Start here" skills.
- Skill families.
- Common packs.
- Advanced/deep skills.
- Source lineage highlights.
- Suggested paths.

Example path:

```txt
I want better cold outreach
-> Start with Cold Email Engagement-First Outreach
-> If list quality is weak, open ICP and Signal Design
-> If the ask is weak, open Offer Lab
-> If sending at scale, open Deliverability Readiness
-> If replies come in, open Reply OS
```

This should be represented visually as a simple linked path or tree.

## Packs And Stacks

Packs are curated for user jobs.

```txt
Pack = "I have a job to do"
```

Examples:

- Cold Outreach Pack
- UI Quality Pack
- Founder Content Pack
- Weekly Planning Pack
- Knowledge Cleanup Pack

Stacks are composable agent workflows.

```txt
Stack = "Run these skills in this order"
```

Example:

```txt
Landing Page Improvement Stack
1. Marketing Site Design Review
2. UI/UX Quality Review
3. Visual Craft Fundamentals
4. Accessibility Inclusive UI Review
5. Landing Page Scorecard Funnel
```

Pack pages should show:

- Job-to-be-done
- Included skills
- Recommended order
- When to use each skill
- Example prompt
- "Try pack in BuildOS" CTA

## Metadata Model

The current metadata should be extended with user-facing fields.

Recommended additions:

```yaml
gallery:
    display_name: Cold Email Engagement-First Outreach
    short_promise: Plan, draft, audit, and route trust-preserving cold outreach.
    domain: sales-and-growth
    family: cold-outreach
    output_shapes:
        - campaign plan
        - single email
        - audit report
        - reply route
    use_cases:
        - Launch a segmented cold outbound campaign.
        - Draft one strategic cold email.
        - Audit a weak sequence.
    non_use_cases:
        - Newsletter email.
        - Lifecycle email.
        - Support replies.
    try_prompts:
        - Help me design a cold outreach campaign for this ICP.
        - Audit this cold email before I send it.
    trust:
        eval_status: covered
        source_lineage: public
        safety_notes:
            - Do not send outreach without human approval.
```

This can live in `buildos.yaml`, blog frontmatter, or a generated registry layer. Long term, `buildos.yaml` is the cleaner home.

## Visual Direction

The gallery should feel calm, usable, and product-native.

Principles:

- Lead with outcomes, not implementation.
- Use large, readable cards with restrained metadata.
- Show the skill's procedure as a polished artifact.
- Keep agent files accessible but visually secondary.
- Make domains feel navigable through maps, paths, and clusters.
- Use status and trust indicators sparingly.

Avoid:

- Turning every skill page into a blog article.
- Leading with curl commands.
- Showing raw lineage stats before users understand the skill.
- Over-indexing on file/download language.

## Content Rules

Every public skill should have:

- A plain-English promise.
- At least 3 use cases.
- At least 1 non-use case or boundary.
- A visible procedure.
- A sample prompt.
- A clear output shape.
- Related skills.
- Agent artifacts.
- Trust and lineage notes.

If a skill does not meet this bar, it can still appear as a compact catalog entry, but not as a featured skill.

## Phased Rollout

### Phase 1: Gallery Shell

- Build `/skills` as a user-first gallery using existing public skill metadata.
- Keep `/agent-skills` intact.
- Add cards, search, filters, and featured packs.
- Link detail pages to existing blog-style skill pages for now.

### Phase 2: Skill Detail Template

- Create a dedicated skill detail template separate from the blog article template.
- Add `Try in BuildOS`, procedure, examples, related skills, and trust panels.
- Generate the `For Agents` section from current bundle/index endpoints.

### Phase 3: Domain Rabbit Holes

- Add domain pages and skill family pages.
- Support hierarchical search scoped to domain and family.
- Add child skill trees.

### Phase 4: Packs And Stacks

- Add pack and stack metadata.
- Add "Try pack in BuildOS" flows.
- Add recommended order and handoff behavior.

### Phase 5: Full Catalog Coverage

- Classify every runtime skill as `public`, `preview`, or `internal`.
- Publish reviewed preview entries before exposing portable files or full definitions.
- Promote previews to public entries only after their user-facing metadata and artifacts meet the publication bar.
- Add missing user-facing metadata incrementally while unreviewed skills remain internal by default.

## Success Criteria

- A user can understand what a skill does in under 10 seconds.
- A user can find a relevant skill from a domain page without knowing its exact name.
- A user can start a BuildOS chat from a skill page.
- An agent builder can still access `SKILL.md`, bundle, references, and metadata within one click.
- Featured skills all have use cases, boundaries, example prompts, and output shapes.
- Skill pages no longer feel like blog posts with agent links attached.

## Implementation Status — 2026-07-10

- Phase 1 is shipped: `/skills`, user-first cards, featured skills, domain and pack filters, sorting, and cross-gallery search are live in the application.
- Phase 2 is substantially shipped: dedicated detail pages include prompt-specific Try links, copy prompt, procedures, runtime examples, boundaries, related skills, linked child skills, agent files, `buildos.yaml`, public references, compatibility, eval coverage, updated dates, safety notes, and lineage.
- Phase 3 is shipped for the current public catalog: domain pages, skill-family pages, domain/family search, linked child-skill trees, and friendly domain/skill route aliases are implemented.
- Phase 4 is shipped for the curated paths: pack/stack metadata includes example prompts and handoff rules, path pages show when to use each stage, and `Try pack/stack in BuildOS` launches one ordered editable workflow draft.
- Phase 5 is in progress: the 51 core enabled runtime skills, plus the optional Libri skill when configured, resolve through a safe publication model. The current catalog has 8 public skills, 31 reviewed previews, and 12 core internal skills; Libri raises the enabled/internal totals to 52/13 when active.
- Four reviewed preview cohorts are available without publishing internal files or raw definitions: seven Cold Outreach children, nine Interface Quality workflows, eight Content Craft strategy/creation workflows, and seven Project Operations workflows. The Interface Quality family now includes Calm Software Design Review, Delightful Product Review, Design System Architecture Review, and Usability Quick Research.
- Preview detail pages expose reviewed promises, use cases, workflow steps, guardrails, output shapes, trust state, and prompt-specific Try links. Family pages can select either a published root or an explicitly reviewed start preview, surface reviewed siblings that are not direct children of a public skill, and label preview roots and children without flattening the hierarchy.
- Preview-first domains are supported. Planning And Ops appears in gallery discovery, resolves through its canonical and friendly domain routes, selects Project Creation as its start preview, groups all seven Project Operations previews, and searches reviewed preview metadata without requiring a published skill.
- Dynamic sitemap coverage now includes 54 public gallery URLs across public skills, reviewed previews, domains, families, and paths.

Current product decisions:

- Keep `/skills` and `/agent-skills` public for different audiences.
- Author packs and stacks manually first.
- Generate gallery metadata into the public catalog and portable `buildos.yaml` while keeping curated overrides in the registry.
- `Try in BuildOS` opens an editable chat draft and never auto-sends.
- Show useful runtime child skills in family trees without exposing internal files or pretending they have a finished public entry.
- Default every runtime-only skill to `internal`; publication requires either an approved public post or explicit reviewed preview metadata.

## Resolved Product Questions

- `/skills` and `/agent-skills` remain public for different audiences.
- Packs and stacks are authored manually first.
- Curated gallery metadata lives in the registry and is generated into the public catalog and portable metadata where appropriate.
- `Try in BuildOS` opens the chat launcher with an editable draft and never auto-sends.
- Useful but not fully publishable child skills can receive an explicit reviewed preview; everything else remains internal.
