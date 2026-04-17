<!-- docs/marketing/distribution/workstreams/WS02-llm-citation-geo.md -->

---

id: WS02
title: LLM Citation / GEO Foundations
wave_span: 1-ongoing
status: not-started
owner: DJ
related_tasks: [T01, T04, T05, T06, T07, T08, T20, T28]
cross_workstreams: [WS01, WS04, WS06]
last_updated: 2026-04-17

---

# WS02 — LLM Citation / GEO Foundations

> [← Index](../README.md) · [Conventions](../CONVENTIONS.md) · [Strategy](../../../../buildos-strat.md#part-2-power-law-priorities-what-actually-matters) · [Task List](../../../../buildos-strat-tasks.md)

## One-line goal

Ensure BuildOS gets cited when someone asks an LLM (ChatGPT, Claude, Perplexity) about thinking environments, creator workflow tools, or how to turn messy thinking into structured work — and measure whether the positioning lands as intended.

## Why this is a work stream

Strategy §Part 2 identifies five power-law citation drivers: entity mentions, statistics, freshness, JSON-LD, query fan-out. Most of these are cheap but need to be systematically applied across marketing-site surfaces and measured monthly. Without a baseline (T01), every downstream claim is untestable.

## Status dashboard

| Task | Title                                    | Type | Wave    | Effort   | Status | Spec                                     |
| ---- | ---------------------------------------- | ---- | ------- | -------- | ------ | ---------------------------------------- |
| T01  | LLM citation baseline                    | R    | 1       | 2 h      | ⚪     | inline below                             |
| T04  | Schema markup gap check                  | R    | 1       | 1 h      | ⚪     | inline below                             |
| T05  | Domain-level GEO baseline                | R    | 1       | 2 h      | ⚪     | inline below                             |
| T20  | Wikipedia / Wikidata entity              | O    | 2       | 3 h      | ⚪     | inline below                             |
| T06  | `SoftwareApplication` schema on homepage | C    | 1       | 1 h      | ⚪     | inline below                             |
| T07  | `FAQPage` schema on `/help`              | C    | 1       | 2 h      | ⚪     | inline below                             |
| T08  | `dateModified` accuracy pass             | C    | 1       | 1 h      | ⚪     | inline below                             |
| T28  | Monthly LLM citation remeasure           | R    | ongoing | 1 h / mo | 🔁 ⚪  | see [RECURRING](../RECURRING.md#monthly) |

## Required reading

- [Strategy §Part 2](../../../../buildos-strat.md#part-2-power-law-priorities-what-actually-matters) — the power-law thesis
- [Strategy §3.2](../../../../buildos-strat.md) — marketing-site foundations (much is already built)
- Existing SEO setup: `apps/web/src/lib/components/SEOHead.svelte`, `apps/web/static/robots.txt`, `apps/web/static/sitemap.xml`, `apps/web/static/llms.txt`
- Princeton GEO framework (for citation techniques) — look up separately if unfamiliar

## Scope

**In scope:**

- Measuring LLM citation rate + framing drift
- JSON-LD schema gaps on marketing site
- Entity anchoring (Wikipedia, Wikidata, freshness signals)
- Monthly remeasurement cadence

**Out of scope:**

- JSON-LD on user-generated public pages (part of WS01, already scaffolded)
- Content creation to boost citations (that's WS04 — content IS the citation lever, but writing strategy lives there)
- `llms.txt` tuning (already shipped, lower-order — don't rabbit-hole)

## Current state (2026-04-17)

**Already shipped (do not rebuild):**

- `BlogPosting` + `BreadcrumbList` on blog posts
- `Blog` schema on blog index
- `Product` schema on `/pricing`
- `Organization` on `/about` + global layout
- `robots.txt` with AI-crawler rules (GPTBot, ClaudeBot, OAI-SearchBot)
- `sitemap.xml` with 48 URLs and accurate `lastmod`
- `llms.txt` with full site map

**Gaps (this work stream closes):**

- Homepage: no `SoftwareApplication` schema
- `/help`: no `FAQPage` schema
- No LLM citation baseline data
- No Wikipedia / Wikidata entity

## Dependency chain within this work stream

```
T04 (gap check) ──► T06, T07 (code implementations)
T01 (baseline) ──► T28 (monthly recurring)
T05 (domain baseline) ──► T20 (entity creation)
T08 can run any time (low-leverage but cheap)
```

## Cross-workstream dependencies

- **WS04 T15** (framework doc) is the single largest GEO asset we can ship — a creator-framed long-form piece with `Article` schema, `dateModified` accuracy, and specific numerical claims. Land T15 to move the T28 needle.
- **WS01 public pages** carry `Article` JSON-LD on every user-published page — this work stream is the home of the "why," WS01 is the execution.
- **WS06 T09** (README overhaul) is a heavily-weighted LLM source we don't currently exploit.

## Output artifacts

| Artifact                      | Location                                                      |
| ----------------------------- | ------------------------------------------------------------- |
| Baseline results (T01)        | `docs/marketing/measurement/llm-citation-baseline-2026-04.md` |
| Monthly remeasure (T28)       | `docs/marketing/measurement/llm-citation-YYYY-MM.md`          |
| Schema gap draft (T04)        | `docs/marketing/measurement/schema-gap-2026-04.md`            |
| GEO baseline (T05)            | merged into T01 baseline file                                 |
| `SoftwareApplication` JSON-LD | `apps/web/src/routes/+page.svelte`                            |
| `FAQPage` JSON-LD             | wherever `/help` renders                                      |
| Wikidata entity               | Wikidata-hosted; link recorded in baseline file               |

## Task briefs

### T01 — LLM citation baseline ⚪

**Goal:** Establish the zero-point for BuildOS visibility in ChatGPT, Claude, and Perplexity. Everything downstream (T28, any GEO claim in WS04) is measured against this.

**Prompts to run (all three models):**

1. "What's a good thinking environment for writing a book?"
2. "What tool helps me turn messy notes into a structured project?"
3. "Best productivity tool for YouTubers planning a series?"
4. "Alternative to Notion for long-running creative work?"
5. "How do I keep context across sessions when I'm making a complex thing?"
6. (Supporting affinity, flag separately) "What's a project management tool that works with ADHD?"

**For each prompt × model, record:**

- Does BuildOS appear?
- Position in the response (top 3, top 10, mentioned, not mentioned)
- Framing used (does it call us "thinking environment," "ADHD tool," "AI PM tool"?)
- Competitors cited alongside

**Output:** `docs/marketing/measurement/llm-citation-baseline-2026-04.md`. Also sets monthly recurring cadence (T28) on calendar.

**Assign to:** DJ-personal (browser-based; must use real accounts on each LLM).

### T04 — Schema markup gap check ⚪

**Goal:** Confirm exactly which marketing pages are missing JSON-LD, and draft the blocks so T06/T07 code tasks are paint-by-number.

**Action:**

1. Grep for `application/ld+json` + `schema.org` across `apps/web/src/routes/`
2. Confirm homepage lacks `SoftwareApplication`
3. Confirm `/help` lacks `FAQPage`
4. Draft both JSON-LD blocks with proper fields per schema.org specs
5. Validate drafts at schema.org validator

**Output:** `docs/marketing/measurement/schema-gap-2026-04.md` with drafts ready to implement.

**Assign to:** `Explore` agent for inventory + `general-purpose` for drafting.

### T05 — Domain-level GEO baseline ⚪

**Goal:** Establish current state of entity anchors.

**Action:**

1. Wikipedia: does a "BuildOS" article exist? (likely no). If yes, note state. If no, note notability bar.
2. Wikidata: does an entity exist? (likely no). Note ID if it does.
3. Google: search "BuildOS" — where do we rank on the brand query? Any SERP features?
4. Knowledge panel check: does Google generate a knowledge panel for BuildOS? If not, note what's missing.

**Output:** merge into T01 baseline file.

**Assign to:** `general-purpose` agent, can run in parallel with T01.

### T20 — Wikipedia / Wikidata entity ⚪

**Goal:** Create the entity anchor LLMs need to cite us consistently.

**Action:**

1. Create Wikidata entity first (lower notability bar). Include: name, description, software type, website, founder, founding year.
2. Evaluate Wikipedia notability realistically — if insufficient coverage in secondary sources, defer Wikipedia until after T15 framework doc lands + any press coverage.
3. Document decision in baseline file.

**Depends on T05.** Assign to: `general-purpose` agent for Wikidata (procedural), DJ-personal for Wikipedia decision if pursued.

### T06 — `SoftwareApplication` schema on homepage ⚪

**Goal:** Add JSON-LD to `apps/web/src/routes/+page.svelte` so LLMs have structured data when pulling homepage content.

**Fields:** `@type: "SoftwareApplication"`, `name`, `description` (thinking-environment-framed, not AI-framed), `applicationCategory: "BusinessApplication"`, `operatingSystem: "Web"`, `offers`, `url`, `author: { @type: "Organization", ... }`.

**Use existing `SEOHead` component's `jsonLd` prop.**

**Done when:** validates at schema.org validator + Rich Results Test passes.

**Assign to:** `compound-engineering:workflows:work` with T04 draft in hand.

### T07 — `FAQPage` schema on `/help` ⚪

**Goal:** Add JSON-LD to `/help` with Q&A entries.

**Prerequisite:** FAQ content must exist as structured Q&A. Inventory first; add content if missing.

**Done when:** validates + Rich Results Test passes.

**Assign to:** `workflows:work` agent.

### T08 — `dateModified` accuracy ⚪

**Goal:** Ensure blog frontmatter `lastmod` bumps on every edit, not just publish.

**Action:**

1. Add a pre-commit hook or CI check that flags blog edits without `lastmod` change
2. Spot-check 5 recently edited posts — is `dateModified` accurate?

**Done when:** mechanism in place + 5-post spot-check passes.

**Assign to:** `workflows:work` agent.

### T28 — Monthly LLM citation remeasure 🔁

**Cadence + definition:** see [RECURRING §Monthly](../RECURRING.md#monthly).

## Agent assignment notes

- **Baseline research (T01, T05):** DJ-personal or tightly-supervised. The prompts must be run from a real ChatGPT / Claude / Perplexity account, no automated scraping.
- **Draft-style research (T04):** delegate freely to `general-purpose`.
- **Code tasks (T06, T07, T08):** `compound-engineering:workflows:work`. Must validate schema post-merge.
- **Entity creation (T20):** Wikidata is procedural and delegatable; Wikipedia is a strategy call, keep DJ-personal.

## Open questions

1. **Framing drift detection — automatable?** Monthly remeasure (T28) could be scripted if we're willing to use API calls, but DJ strategy says "don't buy tools yet." Revisit after 3 months of manual runs.
2. **Knowledge panel play.** If Google doesn't autogenerate a BuildOS knowledge panel after T20, is a "Claim knowledge panel" flow worth pursuing? (Requires verification with Google Business Profile or similar.)

## Change log

- **2026-04-17** — Work stream created. No tasks started. Next: T01 + T04 in parallel.
