<!-- docs/marketing/distribution/workstreams/WS05-comparison-pages.md -->

---
id: WS05
title: Comparison Pages Hub
wave_span: 2
status: not-started
owner: DJ
related_tasks: [T16, T17, T24]
cross_workstreams: [WS02, WS04]
last_updated: 2026-04-17
---

# WS05 — Comparison Pages Hub

> [← Index](../README.md) · [Conventions](../CONVENTIONS.md) · [Strategy §3.4](../../../../buildos-strat.md) · [Task List](../../../../buildos-strat-tasks.md)

## One-line goal

Build a set of honest, creator-framed comparison pages that LLMs and humans actually cite when evaluating thinking-environment tools — and index them at a dedicated `/compare` hub with `ItemList` JSON-LD.

## Why this is a work stream

Comparison pages punch above their weight in LLM citations because models need comparison data to answer comparison questions and almost nobody writes honest ones. BuildOS has three comparison blog posts already (`vs-notion-adhd-minds`, `vs-chatgpt-context-that-compounds`, `vs-monday-thought-organization`) — the first two need reframing to match the thinking-environment positioning, and creator-specific comparisons don't exist yet.

## Status dashboard

| Task | Title | Type | Wave | Effort | Status | Spec |
|------|-------|------|------|--------|--------|------|
| T16 | Refresh Notion comparison (drop ADHD frame) | W | 2 | 1 d | ⚪ | inline below |
| T17 | Write 2 new creator-framed comparisons | W | 2 | 2 d | ⚪ | inline below |
| T24 | `/compare` hub page | C + W | 3 | 1 d | ⚪ | inline below |

## Required reading

- [Brand guide](../../brand/brand-guide-1-pager.md) — voice, honest positioning
- Existing comparison posts:
  - `apps/web/src/content/blogs/case-studies/buildos-vs-notion-adhd-minds.md`
  - `apps/web/src/content/blogs/case-studies/buildos-vs-chatgpt-context-that-compounds.md`
  - `apps/web/src/content/blogs/case-studies/buildos-vs-monday-thought-organization.md`

## Scope

**In scope:**
- Refresh / reframe existing comparisons to creator wedge
- 2 new creator-framed comparisons (Scrivener, Milanote)
- `/compare` or `/alternatives` hub route with `ItemList` JSON-LD

**Out of scope:**
- Content marketing blog posts that aren't comparisons
- Feature matrices on the marketing site (separate design decision)
- Competitor intelligence gathering (separate function)

## Current state

- **3 comparison posts exist** in `blog/case-studies/` but framed for old positioning (ADHD, AI-first)
- **No `/compare` hub** route
- **No creator-specific comparisons** (for authors using Scrivener; for YouTubers using Notion; etc.)

## Dependency chain within this work stream

```
T16 (refresh Notion) ──► can parallelize with T17
T17 (new comparisons) ─┤
                       ▼
T24 (/compare hub) — needs T16 + T17 slugs finalized
```

## Cross-workstream dependencies

- **WS02:** every comparison page needs `Article` JSON-LD + accurate `dateModified`. T24 needs `ItemList` schema.
- **WS04 T15:** framework doc should link to the key comparisons and vice versa (internal authority compounding).

## Output artifacts

| Artifact | Location |
|----------|----------|
| Refreshed Notion comparison | `apps/web/src/content/blogs/case-studies/{new-slug}.md` (old slug 301-redirected) |
| Scrivener comparison | `apps/web/src/content/blogs/case-studies/buildos-vs-scrivener-for-long-form-fiction.md` |
| Milanote / Workflowy comparison | `apps/web/src/content/blogs/case-studies/buildos-vs-milanote-for-creative-thinking.md` |
| `/compare` hub route | `apps/web/src/routes/compare/+page.svelte` (proposed) |

## Task briefs

### T16 — Refresh Notion comparison ⚪

**Current state:** `buildos-vs-notion-adhd-minds.md` — frames the comparison around ADHD users. Per strategy reconciliation, this is a supporting-affinity frame, not the primary wedge.

**Two options (DJ to decide):**
- **Option A (replace):** Reframe the piece around "authors and YouTubers using Notion" as the main frame. ADHD angle becomes one section, not the headline. Keep old slug 301-redirected.
- **Option B (split):** Keep an ADHD-framed variant (shorter, more specific) AND add a creator-framed variant. Both exist. Requires editing old piece + writing new.

**Recommend Option A** for simplicity and to avoid diluting the new positioning. Revisit B later if ADHD traffic proves meaningful.

**Hard constraints for the refreshed piece:**
- Include real weaknesses of BuildOS
- Do not strawman Notion
- Creator examples in the hero section
- Update frontmatter `lastmod`
- 301 from old slug

**Assign to:** `content-editor` for refresh pass after DJ provides direction; DJ for positioning calls.

### T17 — Write 2 new creator-framed comparisons ⚪

**Two pieces to write:**

1. **BuildOS vs Scrivener for long-form fiction.** Scrivener is the incumbent for novelists. Most "Scrivener alternative" searches are active intent. Honest positioning: BuildOS is better at keeping context across sessions and AI-assisted synthesis; Scrivener is better at deep corkboard + compile-to-manuscript workflows. Write honestly.
2. **BuildOS vs Milanote / Workflowy for creative thinking.** Milanote is popular for visual thinkers; Workflowy for outliners. BuildOS differentiates on project memory + structured-schema output. Show tradeoffs.

**Same hard constraints as T16.**

**Optional third (defer):** BuildOS vs Obsidian Publish for PKM-fluent creators. Lower priority — note in open questions.

**Assign to:** `content-editor` for drafts; DJ voice review before publish.

### T24 — `/compare` hub page ⚪

**Goal:** Single route at `/compare` (or `/alternatives`) that indexes all comparison pages with `ItemList` JSON-LD.

**Structure:**
- Brief intro paragraph ("we compare BuildOS to the tools creators are actually using today")
- Grouped index: "vs flexible docs" (Notion, Craft), "vs dedicated writing tools" (Scrivener), "vs visual thinking" (Milanote, Workflowy), "vs AI chat" (ChatGPT), "vs project management" (Monday, Motion), etc.
- Each item links to the full comparison post
- `ItemList` schema references each comparison as `Article` items

**Depends on:** T16 and T17 slug finalization (to link from hub correctly).

**Assign to:** `compound-engineering:workflows:work` with the comparison slugs in hand.

## Agent assignment notes

- **Refreshes and new comparisons (T16, T17):** `content-editor` agent for draft quality; DJ voice review required.
- **Hub code (T24):** `workflows:work` agent.
- Voice discipline: no AI hype, no hedging, real weaknesses included, concrete examples. Review against brand guide every time.

## Open questions

1. **Route path — `/compare` or `/alternatives`?** Both work; `/alternatives` ranks better historically for "X alternative" queries but `/compare` reads cleaner. Default to `/compare` unless SEO baseline (T05) suggests otherwise.
2. **How many comparisons is too many?** At 6–8 well-maintained comparisons, returns start diminishing. Cap at 8 for now.
3. **Obsidian comparison?** PKM-fluent creators overlap our audience; Obsidian Publish is a competitor for the public-page use case. Consider for Q3.

## Change log

- **2026-04-17** — Work stream created. Existing Notion comparison flagged for reframing (currently ADHD-framed, strategy demoted ADHD to supporting affinity).
