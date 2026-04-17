<!-- docs/marketing/distribution/workstreams/WS04-flagship-content.md -->

---

id: WS04
title: Flagship Content Strategy
wave_span: 2 + recurring
status: not-started
owner: DJ
related_tasks: [T15, T25, T32]
cross_workstreams: [WS02, WS03, WS05]
last_updated: 2026-04-17

---

# WS04 — Flagship Content Strategy

> [← Index](../README.md) · [Conventions](../CONVENTIONS.md) · [Strategy §Part 5](../../../../buildos-strat.md#part-5-content-strategy-one-deep-piece-per-quarter) · [Task List](../../../../buildos-strat-tasks.md)

## One-line goal

Ship one genuinely excellent 2,500–4,000-word piece per quarter that cements BuildOS as an intellectual authority in the thinking-environment category — starting with a creator-framed write-up of how BuildOS holds a complex project together.

## Why this is a work stream

Strategy §Part 5 explicitly says stop writing weekly blog posts. One deep piece per quarter outperforms twelve shallow ones on LLM citations, Reddit share-ability, and long-tail trust building. The flagship framework doc (T15) is BuildOS's single largest intellectual-moat content asset — it doesn't exist anywhere else on the internet.

## Status dashboard

| Task | Title                                         | Type | Wave      | Effort       | Status | Spec                                       |
| ---- | --------------------------------------------- | ---- | --------- | ------------ | ------ | ------------------------------------------ |
| T15  | Thinking-environment framework doc (flagship) | W    | 2         | ~1 week      | ⚪     | inline below                               |
| T25  | Second quarterly deep piece                   | W    | 3         | ~1 week      | ⚪     | inline below                               |
| T32  | Quarterly cadence (ongoing)                   | W    | recurring | 1 wk/quarter | 🔁 ⚪  | see [RECURRING](../RECURRING.md#quarterly) |

## Required reading

- [Brand guide](../../brand/brand-guide-1-pager.md) — voice, terms to avoid at first contact
- [Anti-AI show-don't-tell strategy](../../strategy/anti-ai-show-dont-tell-strategy.md)
- [Thinking-environment creator strategy](../../strategy/thinking-environment-creator-strategy.md)
- [Guerrilla content doctrine](../../strategy/buildos-guerrilla-content-doctrine.md) — solo-founder content posture
- Existing published: `apps/web/src/content/blogs/philosophy/anti-ai-assistant-execution-engine.md` — voice precedent

## Scope

**In scope:**

- One deep piece per quarter, minimum
- Creator-framed angles; anti-AI show-don't-tell posture; specific numerical claims where possible
- Cross-publishing: build-os.com + Medium + Substack (canonical = build-os.com)
- Companion public pages on BuildOS as secondary artifact

**Out of scope:**

- Weekly blog posts (explicitly non-goal in strategy)
- Comparison pages (WS05)
- Social-media posts / short-form content (handled by other docs in `docs/marketing/social-media/`)

## Dependency chain within this work stream

```
T15 (flagship, Q2 2026) ──► T25 (next piece, Q3 2026) ──► T32 (ongoing)
```

Each piece is independent once scoped; the cadence is the work stream.

## Cross-workstream dependencies

- **WS02 (GEO):** T15 is the single largest JSON-LD `Article` schema + freshness + query fan-out asset this year. Land T15 to move T28 metrics.
- **WS03 T27:** the first big Reddit post points back to T15.
- **WS05 comparisons:** T15 should link to the key comparison pages and vice versa. Cross-linking boosts internal authority.

## Output artifacts

| Artifact                  | Location                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| T15 canonical blog        | `apps/web/src/content/blogs/philosophy/thinking-environment-framework.md` (proposed path) |
| T15 Medium cross-post     | external — canonical URL = blog-os.com                                                    |
| T15 Substack cross-post   | external                                                                                  |
| T15 companion public page | BuildOS public URL (post-T12)                                                             |
| T25 canonical blog        | `apps/web/src/content/blogs/philosophy/{slug}.md` (TBD topic)                             |

## Task briefs

### T15 — Thinking-environment framework doc (flagship) ⚪

**Working title:** "How BuildOS Holds a Complex Project Together: The Thinking-Environment Framework."

**Hard constraints (from brand guide + strategy):**

- Do NOT title it "The 9-Dimensional Ontology" or invoke "USMC 5-Paragraph Order for ADHD Founders" — those framings were tried and explicitly discarded
- Do NOT lead with AI
- Creator-framed: primary examples should be a book author or YouTuber, not a founder or engineer
- USMC / DJ-bio detail allowed as one-paragraph origin note inside the piece, never the headline

**Required structural elements:**

- Question-based headers ("What happens when a writer's draft lives in six different places?")
- Specific numerical claims (real BuildOS user data if available; otherwise concrete observations with honest scope)
- At least 3 before/after examples showing messy input → structured output
- Accurate `datePublished` + `dateModified`
- `Article` JSON-LD schema
- Internal links to: `/how-it-works` (once T14 lands), relevant comparison pages, public page examples (once T12 lands)

**Target word count:** 2,500–4,000. Shorter = not flagship.

**Publishing sequence:**

1. Draft → DJ voice review
2. Publish on build-os.com (canonical)
3. Cross-post to Medium + Substack (with canonical link)
4. Update README (WS06 T09) to link to it
5. One Reddit promo (per §Part 4 rules, once T10 karma cleared)
6. One X thread (voice per brand guide X channel rules)
7. One LinkedIn post (voice per brand guide LinkedIn rules)
8. One newsletter feature (if a relevant newsletter operator will take it)

**Done when:** published across canonical + 2 cross-posts, promoted on all three platforms, linked from README.

**Assign to:** `content-editor` for voice review after DJ draft; DJ-personal for the initial draft. Do not let an agent write the first draft — the piece is voice-load-bearing.

### T25 — Second quarterly deep piece ⚪

**Candidate topics (per strategy §Part 5, ranked):**

1. **"How authors and YouTubers actually structure long-running creative projects — a pattern study."** Pull from real user data; specific numerical claims; show working maps.
2. **"Why AI chat assistants keep failing creative workflows: the stateless-context problem."** Advances anti-AI show-don't-tell directly.
3. **"The creator-workflow gap: what breaks between the idea and the shipped thing."** High fan-out potential across every creator sub.

**Pick after Q2 data:** run T28 monthly remeasurement first; pick the topic that best complements whatever LLM-citation gap emerged.

**Same hard constraints as T15.**

### T32 — Quarterly cadence 🔁

**Definition, schedule, and candidate pipeline:** see [RECURRING §Quarterly](../RECURRING.md#quarterly).

## Agent assignment notes

- **Drafting (T15, T25):** DJ-personal for the first draft. The pieces are voice-load-bearing and define the category in public.
- **Voice review:** `content-editor` agent. Brief: "review for BuildOS voice per brand guide; strip AI-sounding patterns; match thinking-environment positioning."
- **Research / stat-gathering:** delegate to `general-purpose` or `Explore` agent. Ask for specific numerical claims from real BuildOS user data via Supabase — use the `supabase` skill.
- **Formatting / schema injection:** `compound-engineering:workflows:work` agent after voice review.

## Open questions

1. **Where does the piece live canonically?** Current blog structure has `philosophy/`, `productivity-tips/`, `getting-started/`, `case-studies/`, etc. Should T15 go under `philosophy/` (likely) or get a new `frameworks/` category?
2. **Branded framework naming.** "The Thinking-Environment Framework" is descriptive. Does it deserve a branded name (like "The BuildOS Compound Project Model")? Probably not at this stage — let it earn a name via usage, not manufacture one.
3. **Numerical claims source.** We need real BuildOS usage stats for credibility. Which counts are publishable (user count? avg projects per user? avg docs per project?)? Run this by DJ before publication.

## Change log

- **2026-04-17** — Work stream created. T15 scoped, topic locked to thinking-environment framework doc with creator framing. No writing has started.
