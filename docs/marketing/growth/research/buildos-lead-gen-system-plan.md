---
title: BuildOS Lead Generation System — Reverse-Engineered from Lead Grow / Claude Code flow
status: draft
owner: dj
created: 2026-04-24
source_transcript: ./youtube-transcripts/2026-04-24_mitchell-keller_lead-lists-claude-code.md
tags:
  - growth
  - lead-gen
  - claude-code-skills
  - icp-scoring
  - creator-outreach
---

# BuildOS Lead Generation System

A Claude-Code-native lead-gen pipeline for BuildOS, reverse-engineered from Mitchell Keller's Lead Grow walkthrough. Goal: a skill-driven flow that finds BuildOS's best-fit creators (authors, YouTubers, podcasters, indie builders), scores them against an annealed ICP prompt, sources contacts, and enriches records for personalized outreach — all inside the monorepo, all durable in Supabase.

This doc is the single source of truth for the system design. Implementation specs will live alongside it in this folder as they're drafted.

---

## 1. What Lead Grow's flow actually does (reverse-engineered)

| Stage | Lead Grow's tool | What it actually does |
|---|---|---|
| 1. Account discovery | Discolike CLI | 65M-domain index keyed on company self-descriptions (not scraped LinkedIn). Lookalike + natural language + phrase search. API endpoints: `Discover`, `Count`, `Segment`, `BizData`, `Score`, `Growth`, `Contacts`, `Match`, `Append`, `Vendors`, `Subsidiaries`. |
| 2. ICP scoring | Autoprompt Creator | Seed prompt → run against ground-truth examples → score → generate variants → iterate until convergence. Keller hit 94.8% after 45 iterations. NOT Anthropic's single-shot prompt improver. Closest OSS analog: DSPy `BootstrapFewShot` / `MIPROv2` or GEPA. |
| 3. Contact sourcing | AI Arc CLI | B2B people DB with 76 data points, refreshed every 30 days. Semantic + similarity search. Keller's trick: pull *job titles* per company first, then reverse-engineer personas tier 1/2/3. |
| 4. Enrichment | Clay / Clay CLI / Sculpted / Open Web Ninja / Serper | Per-record variables: tech stack, case-study match, target-market tag, owner names, custom signals. SERP via Serper ($0.30/1K). Public web via OpenWeb Ninja (Google Maps, Yelp, Glassdoor, LinkedIn, Indeed). |
| 5. Session retro | SpiderCloud session-review skill (Gilbert) | Reviews Claude Code session logs, flags failures, proposes skill upgrades. Compounds the system. |
| 6. Arguments pattern | Custom skill arguments | Skills reference ICP/API-key files via argument instead of embedding content → version-controlled knowledge graph. |

**Maltica** is mentioned but not public; safe to assume it's Keller's internal campaign-state tool he's saving for his paid course.

### Keller's stated philosophy (worth keeping)
- **Human-in-the-loop over YOLO.** No autopilot until a campaign is already winning.
- **Terminal as source of truth**, not Google Sheets.
- **Anneal, don't prompt.** Observability of *reasoning*, not just output.
- **Outsource coordination, not thinking.** "When X happens, Y or Z could happen — program my opinion into you." Matches BuildOS's context-engineering-vs-agent-engineering position.

---

## 2. Critical reframe for BuildOS

BuildOS's ICP is not B2B companies — it's **creators**: authors, YouTubers, podcasters, indie builders, and solo founders working on complex projects. This changes the discovery substrate from "company homepages" to "creator content."

Implication: we don't need to rebuild Discolike's 65M-domain index. Creators are discovered through their content, and content APIs (YouTube, Substack, podcasts, books) are structured enough that embedding search + SERP fallback gets us most of the way. In many ways this is *easier* than B2B discovery.

Secondary audience (optional): reaching founders / PMs at specific companies. The flow supports this — only the ingestion substrate changes.

---

## 3. Shared foundation: Supabase schema

Before any skill ships, we need a durable store. This becomes our equivalent of Keller's "knowledge graph through arguments" — skills reference campaign state in Supabase instead of embedding ICP into the skill body.

```sql
-- Core entities
creators                (id, name, primary_handle, homepage_url, email, status, ...)
creator_content         (id, creator_id, platform, url, title, body, embedding vector(1536), published_at)
creator_contacts        (id, creator_id, email, source, verified_at, bounce_status)

-- Campaigns / ICPs
campaigns               (id, slug, icp_description, seed_creator_ids[], status, created_at)
campaign_examples       (id, campaign_id, creator_id, label: 'positive'|'negative', notes)  -- ground truth
campaign_prompts        (id, campaign_id, version, prompt_text, accuracy, iteration_count, is_active)
campaign_exclusions     (id, campaign_id, kind: 'phrase'|'category'|'domain', value, reason)

-- Scoring results
creator_scores          (id, creator_id, campaign_id, prompt_version, score, reasoning, model, created_at)

-- Enrichments (flexible kv)
creator_enrichments     (id, creator_id, key, value, source, computed_at)
```

**Why this schema:**
- pgvector already available → embedding search is one query away
- Every prompt version keeps its accuracy → we can roll back and compare
- Exclusions are first-class — Keller manages them by hand; we let the retro skill propose additions
- Enrichments as kv gives us Clay-table flexibility without a separate system

---

## 4. The skills (what we build)

All skills live under `apps/web/.claude/skills/` (or wherever BuildOS's Claude Code skills conventionally live — TBD). Each skill reads/writes Supabase via a shared service in `packages/shared-utils` or the admin client.

### 4.1 `buildos-creator-discover` (replaces Discolike)

**Input:** seed creator URL or handle + platform hint + campaign slug.

**Process:**
1. Pull seed creator's last N pieces of content via platform API
2. Embed content → average or sample embeddings → creator vector
3. Search `creator_content` in Supabase for nearest neighbors via pgvector
4. For platforms not yet indexed: run a SERP sweep for topic keywords extracted from the seed, crawl top results, upsert to DB, re-run
5. Return 50 candidates with match reasoning and confidence
6. Interactive loop: report "X great, Y marginal, Z noise" → ask user for phrase/category/domain exclusions → persist to `campaign_exclusions`

**Data sources:**
| Substrate | Source | Cost |
|---|---|---|
| YouTube | YouTube Data API v3 (official) | $0 for low volume (10K unit quota/day) |
| Podcasts | Listen Notes API or Apple Podcasts RSS | ~$10/mo |
| Substack | Public RSS + homepage scrape | $0 |
| Twitter/X | Twitter API Basic (or scrape) | $100/mo or free via scraping |
| Books | Google Books API / Goodreads scrape | $0 |
| Fallback | Serper SERP | $0.30/1K queries |

### 4.2 `buildos-icp-anneal` (replaces Autoprompt Creator — the leverage piece)

**Input:** seed scoring prompt + 20–50 labeled ground-truth creators from `campaign_examples` (minimum 10 positive, 10 negative) + target accuracy (default 90%).

**Loop:**
1. Run seed prompt across all ground-truth creators → predicted scores
2. Compute accuracy (agreement with labels at threshold ≥7)
3. If below target: generate 3-5 prompt variants via a meta-prompt that sees the failures
   > "Here's a prompt and its failures. Here are the examples it got wrong and why. Propose a revised prompt that addresses the failure modes while preserving the correct behavior."
4. Run each variant against the full eval set, keep the best
5. Repeat until convergence or max iterations (default 30)
6. Save winner to `campaign_prompts` with version number and accuracy

**Model routing via `packages/smart-llm`:**
- "Score an example" calls → cheap/fast (Haiku, Gemini Flash) — these are hot-path
- "Propose a variant" calls → smart (Opus, Sonnet) — these are rare
- Eval runs in parallel; variant generation is sequential

**v1 vs v2:**
- **v1 (days to ship):** simple accuracy + single failure-mode feedback loop. 3 variants per iteration.
- **v2 (weeks):** DSPy-style with per-example reasoning traces, confusion-matrix-aware variant generation, few-shot example injection. Consider `dspy-ruby` as a microservice OR rebuild in TypeScript inside `packages/smart-llm`. Default recommendation: **TypeScript in monorepo**.

### 4.3 `buildos-creator-contacts` (replaces AI Arc)

For creators, contact sourcing is easier than B2B — most publish email publicly. Cascading strategy:

1. **Structured first**
   - YouTube "business inquiries" email field (requires captcha; may need manual pass)
   - Substack About page
   - Podcast description email
   - Public email from creator homepage `mailto:`
2. **Homepage scrape**
   - Fetch homepage, extract `mailto:` + contact page links
   - Second-pass scrape of contact pages for email + booking links
3. **Paid fallback** (only when free path fails)
   - Hunter.io or Findymail for creators with a domain but no exposed email
4. **Verify**
   - NeverBounce or free MX+SMTP check before writing to `creator_contacts` with `verified_at`

**Explicitly out of scope:** LinkedIn scraping. Brand-safety risk, low ROI for creator wedge.

### 4.4 `buildos-creator-enrich` (replaces Clay + Serper + OpenWeb Ninja)

Per-creator variables for personalized outreach. All stored in `creator_enrichments`.

Examples:
- `last_3_video_titles` — for first-line reference
- `stated_productivity_philosophy` — LLM summary of their About page
- `best_matching_case_study` — vector match against BuildOS case studies
- `output_cadence` — posts/week or videos/month — signals overwhelm
- `audience_size` — YouTube subs, podcast downloads, Substack subscribers
- `recent_rant_or_theme` — what are they complaining about / excited about this month

**Cost:** everything runs on Serper + platform APIs + smart-llm. No Clay.

### 4.5 `buildos-campaign-retro` (replaces SpiderCloud session-review)

After a discovery or scoring session, reads the session's tool calls + user corrections, writes up what the skill got wrong, and proposes edits to the skill's reference files as a unified diff. User approves → changes land. Optionally proposes additions to `campaign_exclusions`.

This is the flywheel: **the system gets smarter every run without manual skill maintenance.**

---

## 5. Build vs. rent vs. skip

| Layer | Strategy | Notes |
|---|---|---|
| Creator DB + embeddings | **Build** | Supabase + pgvector, already in stack |
| YouTube ingestor | **Build** | Worker job, starts with API v3 |
| Podcast ingestor | **Build** | Listen Notes or Apple RSS |
| Substack ingestor | **Build** | RSS + homepage scrape |
| Twitter ingestor | **Build** or defer | Rent API only if signal justifies |
| Book/author ingestor | **Build** | Google Books API |
| SERP fallback | **Rent** | Serper ($0.30/1K) |
| Email finding | **Rent** | Hunter or Findymail, only when free path fails |
| Email verification | **Rent** (cheap) | NeverBounce or free MX check |
| Prompt annealer | **Build** | `packages/smart-llm` — this is our moat |
| Session retro skill | **Build** | Trivial |
| Clay-equivalent | **Skip** | Our schema is opinionated; don't need arbitrary tables |
| Maltica | **Skip** | Can't find it; probably paywalled |

**Estimated external spend at realistic v1 volume (~500 creators/month):** $50–100/mo.

---

## 6. Execution order (proposed)

| Week | Milestone |
|---|---|
| 1 | Supabase migration for the schema above + one platform ingestor (YouTube first — highest signal for creator audience) |
| 2 | `buildos-icp-anneal` skill with 20 hand-labeled creators. Proves the leverage thesis before we scale ingestion. |
| 3 | `buildos-creator-discover` skill + one seeded campaign end-to-end: 15 creators ranked |
| 4 | `buildos-creator-contacts` + `buildos-creator-enrich`. Run a real outreach sprint. |
| 5 | `buildos-campaign-retro`. Flywheel starts. |

The opinionated bit: **we build the annealer (week 2) BEFORE we scale discovery (week 3).** Rationale: a noisy discovery pipeline with a sharp scoring prompt beats a clean pipeline with a vague prompt. Keller's whole edge is the annealing.

---

## 7. Open decisions

1. **Creators vs. B2B:** start creator-only, or build both from day 1? Recommendation: creators only for v1. B2B is a data-substrate swap later.
2. **Annealer depth:** v1 (3-variant loop) or v2 (full DSPy-style)? Recommendation: ship v1 in week 2, graduate to v2 only if v1 plateaus below 90%.
3. **Skill location:** where do Claude Code skills for BuildOS conventionally live? Need to confirm the monorepo path before committing code.
4. **Run target:** is the end goal a lead list we export to email tools, or a fully in-BuildOS outreach flow where campaigns are BuildOS projects and tasks? Leaning toward the latter (eats our own dog food).

---

## 8. Companion specs

- [x] **Discovery flow spec** → [`./buildos-creator-discover-spec.md`](./buildos-creator-discover-spec.md)
  Multi-platform (IG, LinkedIn, Twitter, YouTube, Quora) discovery-scan → warmup → reply → follow-up ladder → DM → trial funnel. Extends existing `/instagram-warmup`, `/linkedin-warmup`, `/twitter-warmup` commands. Introduces cross-platform person graph, search-term annealing, and comment-to-signup attribution.
- [ ] **Ingestion process spec** — DJ to outline; we write it up in `buildos-creator-ingestion-spec.md`
- [ ] Schema migration SQL (draft)
- [ ] Skill scaffolds for each of the five skills
- [ ] Ground-truth creator list (the first 20 hand-labeled examples for the annealer)
