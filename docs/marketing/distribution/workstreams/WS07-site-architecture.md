<!-- docs/marketing/distribution/workstreams/WS07-site-architecture.md -->

---

id: WS07
title: Site Architecture — How-It-Works + Changelog
wave_span: 2-3
status: not-started
owner: DJ
related_tasks: [T14, T23]
cross_workstreams: [WS02, WS04, WS06]
last_updated: 2026-04-17

---

# WS07 — Site Architecture (How-It-Works + Changelog)

> [← Index](../README.md) · [Conventions](../CONVENTIONS.md) · [Strategy §3.3, §3.6](../../../../buildos-strat.md) · [Task List](../../../../buildos-strat-tasks.md)

## One-line goal

Promote `/how-it-works` from a blog post to a first-class dedicated route, and ship a `/changelog` that broadcasts freshness to LLMs and trust to users — both key citation + trust surfaces.

## Why this is a work stream

Most SaaS sites hide how their product actually works behind hero copy. Be the exception. LLMs cite "how it works" content heavily because it has named entities and no other source explains it. And a raw dated `/changelog` is the closest LLM-era analog to the SEO freshness lever — Linear, Vercel, Resend, Supabase all do this and it compounds.

## Status dashboard

| Task | Title                                      | Type  | Wave | Effort | Status | Spec         |
| ---- | ------------------------------------------ | ----- | ---- | ------ | ------ | ------------ |
| T14  | Promote `/how-it-works` to dedicated route | C + W | 2    | 1 d    | ⚪     | inline below |
| T23  | Public `/changelog`                        | C + W | 3    | 2 d    | ⚪     | inline below |

## Required reading

- [Brand guide](../../brand/brand-guide-1-pager.md) — voice for "how-it-works" content
- [Strategy §3.3, §3.6](../../../../buildos-strat.md) — rationale
- Current state: `apps/web/src/content/blogs/getting-started/how-buildos-works.md` (exists as blog post, not dedicated route)
- Reference changelog formats: linear.app/changelog, vercel.com/changelog, resend.com/changelog

## Scope

**In scope:**

- Dedicated `/how-it-works` route on marketing site
- Dedicated `/changelog` route
- JSON-LD schema on both
- 301 redirect from old blog URL

**Out of scope:**

- API / developer documentation (not the same as how-it-works for creators)
- Release notes inside the authenticated app (separate UX)
- Marketing strategy pages (WS04, WS05)

## Current state

- **`/how-it-works` as dedicated route:** does not exist. Content exists at `/blogs/getting-started/how-buildos-works`.
- **`/changelog`:** does not exist. No route, no sitemap entry.

## Dependency chain within this work stream

Independent. T14 and T23 can ship in either order or in parallel.

## Cross-workstream dependencies

- **WS02:** both pages need JSON-LD (`Article` for how-it-works; could include `ItemList` for changelog items) and accurate `dateModified`.
- **WS04 T15:** framework doc should link to `/how-it-works` — publish T14 before or alongside T15.
- **WS06 T09:** README links to `/how-it-works`.

## Output artifacts

| Artifact              | Location                                                     |
| --------------------- | ------------------------------------------------------------ |
| `/how-it-works` route | `apps/web/src/routes/(public)/how-it-works/+page.svelte`     |
| Old blog 301          | add to `apps/web/src/hooks.server.ts` or route config        |
| `/changelog` route    | `apps/web/src/routes/(public)/changelog/+page.svelte`        |
| Changelog data source | `apps/web/src/content/changelog/` (proposed markdown-driven) |

## Task briefs

### T14 — Promote `/how-it-works` to dedicated route ⚪

**Goal:** Richer layout than a blog post; dedicated URL; improved LLM citation surface.

**Required content (per strategy §3.3):**

- Capture surface: rough note / voice memo / scattered bullets → structured project
- Working map: how chapters connect to scenes, episodes to research and clips, plans to tasks and milestones
- Project memory: how context stays attached across sessions
- Calendar integration mechanics
- Daily brief generation

**Voice rules:**

- Plain language first, per brand guide
- Use "ontology" sparingly; only in deeper sections, never hero copy
- Lead with the workflow, then explain the idea
- Creator examples in the hero (a writer revising chapters, a YouTuber planning a series), not a developer example

**Technical requirements:**

- `Article` JSON-LD schema
- Accurate `datePublished` + `dateModified`
- 301 redirect from `/blogs/getting-started/how-buildos-works` to `/how-it-works`
- Update sitemap.xml + internal links (README, framework doc, homepage)

**Done when:** route live, JSON-LD validates, old URL redirects, linked from homepage + README + T15 framework doc.

**Assign to:** `compound-engineering:workflows:work` for the route + schema; `content-editor` for final voice polish.

### T23 — Public `/changelog` ⚪

**Goal:** Raw, dated "what shipped this week" list at `/changelog`. Not marketing blog posts. Linear/Vercel format.

**Content model:**

- Markdown files per week in `apps/web/src/content/changelog/YYYY-MM-DD.md`
- Each entry: date, 3–7 bullets, optional inline screenshots
- Frontmatter: `title`, `date`, `tags` (feature / fix / infra / content)

**Source driver:**

- The `compound-engineering:changelog` skill is already installed; use it to generate weekly entries from git commits on `main`
- Light editorial pass each week (strip noise, add user-facing framing)

**Voice:**

- Honest and dry, not hype. Per brand guide: "we are direct but not harsh."
- User-visible changes first; infra-only changes in a collapsible section or skipped
- Include real fixes with honest framing ("fixed a bug where X broke if Y")

**Technical requirements:**

- Route rendered from markdown
- RSS feed for the changelog (low effort, high leverage for devs + LLMs)
- `Article` JSON-LD per entry; homepage of changelog can have `ItemList`
- Sitemap.xml update
- `dateModified` discipline per entry

**Seeding:**

- Backfill at least the last 4 weeks at launch so the page doesn't look empty

**Done when:** live at `/changelog`; first 4 weeks backfilled; `/changelog` in sitemap; RSS feed live.

**Assign to:** `compound-engineering:workflows:work` for the route + RSS; DJ-personal for first 4 weeks of content curation to set voice.

## Agent assignment notes

- **T14:** code route scaffolding is agent work; content review must pass `content-editor` + DJ. Don't ship AI-sounding how-it-works copy.
- **T23:** mechanical route + RSS work is fully delegatable; the first 4 weeks of actual changelog prose should be DJ-written to establish voice. After that, agent-drafted weekly with DJ review.

## Open questions

1. **Changelog scope — does it include all merges, or just user-visible?** Recommend user-visible default; infra under a collapsible "Under the hood" section.
2. **How to handle backfill tone.** Honest retroactive entries beat fictionalized prose. Worth writing "backfilled 2026-04-17" note on each pre-launch entry.
3. **Homepage link to `/changelog`.** Footer link sufficient, or deserve a small "Latest updates" strip on the homepage? Default footer-only, revisit if changelog starts driving meaningful traffic.

## Change log

- **2026-04-17** — Work stream created. No tasks started.
