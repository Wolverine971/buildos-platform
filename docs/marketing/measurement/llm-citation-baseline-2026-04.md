---
title: 'LLM Citation Baseline — April 2026'
created: 2026-04-16
status: partial baseline (Perplexity complete; ChatGPT/Claude pending manual run)
owner: DJ Wayne
cadence: monthly (run first week of each month)
related_docs:
    - /buildos-strat.md
    - /buildos-strat-tasks.md
    - /docs/marketing/brand/brand-guide-1-pager.md
    - /docs/marketing/strategy/buildos-marketing-strategy-2026.md
path: docs/marketing/measurement/llm-citation-baseline-2026-04.md
---

# LLM Citation Baseline — April 2026

This file is the canonical baseline for BuildOS's LLM-citation visibility. It locks the methodology and the six baseline prompts, records verbatim results, and scores each result against BuildOS's positioning guardrails. Every month, copy this file to `llm-citation-baseline-YYYY-MM.md` and re-run the same prompts — no edits to the question set until we have at least six months of data, so the trend line stays comparable.

Baseline metric from `buildos-strat.md` Part 6: **"whether BuildOS appears, in what position, with what framing, and whether the framing matches our positioning."**

---

## Why we track this

The old SEO game is not the game we're playing. Per research in `buildos-strat.md` Part 2, only ~7% of ChatGPT citations appear in Google's top 10; ~83% of AI Overview citations come from outside the organic top 10. That means the win condition is citation inside the LLM answer itself, not rank on a SERP.

This baseline answers three questions each month:

1. Does BuildOS get mentioned at all in consumer LLM answers for queries that match our target wedge?
2. When mentioned, is it framed the way we want (**thinking environment for people making complex things**), or is it miscategorized (ADHD tool, AI productivity, task manager, etc.)?
3. What direction is the trend moving month-over-month as we ship public pages, deep content, Reddit karma, and integration listings?

---

## Methodology

**Surfaces measured** (consumer-facing, not API):

- **ChatGPT** (chatgpt.com) — default logged-in model, whatever the web app serves that day
- **Claude** (claude.ai) — default logged-in model, whatever the web app serves that day
- **Perplexity** (perplexity.ai) — default model

Note: this is intentionally the consumer surface because that's what our target audience actually uses. It is _not_ raw API output. Retrieval layers, cached answers, and personalization are all part of what we're trying to influence.

**Session rules** (non-negotiable — varying these invalidates the monthly comparison):

1. **One fresh session per prompt.** New chat, no prior turns, no system prompt customization, no "memories" / custom instructions.
2. **Use signed-out or incognito sessions where the product allows** to minimize personalization bias. For products that require auth (Claude, ChatGPT), use the logged-in session but with memories/custom instructions disabled or cleared.
3. **Record the exact model name and date** alongside every result. Model rollouts between runs are the single biggest confound.
4. **Do not add clarifying follow-ups.** Only the first response counts for the baseline. Multi-turn behavior is a different measurement.
5. **Save the verbatim response text** (trimmed to the first ~800 characters or the first 5 bullet points if it's a list). Paste the full response into the `Raw` collapse if available.
6. **Scoring is done after all 18 queries are collected**, not inline, so the scorer isn't primed by earlier results.

**When to re-run:** First Monday of each month. Set calendar reminder. If a model version changes mid-month and we notice drift, note it in that month's file — don't re-run early.

---

## The Six Prompts (do not modify between months)

The first five are target prompts directly aligned with the **thinking environment for people making complex things** wedge. The sixth is tracked separately because ADHD is a supporting affinity lane only, not our main category — we want to know where BuildOS lands there but not drive positioning toward it.

| #   | Prompt                                                                   | Why                                                       |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| P1  | "What's a good thinking environment for writing a book?"                 | Direct hit on category + primary wedge (authors)          |
| P2  | "What tool helps me turn messy notes into a structured project?"         | Core promise verbatim                                     |
| P3  | "Best productivity tool for YouTubers planning a series?"                | Secondary wedge (YouTubers)                               |
| P4  | "Alternative to Notion for long-running creative work?"                  | High-intent comparison query; common Reddit / LLM pattern |
| P5  | "How do I keep context across sessions when I'm making a complex thing?" | Differentiator (the project remembers what matters)       |
| P6  | "What's a project management tool that works with ADHD?"                 | Supporting affinity only — scored separately              |

---

## Scoring Rubric

For every (prompt, surface) pair, record:

**Appears?** (Y / N)

- Did the word "BuildOS" (or `build-os.com`) appear anywhere in the response, including citations/sources panels?

**Position**

- Where in the response?
    - `ranked-list:N` — appears as item #N in a numbered/bulleted list
    - `inline-mention` — mentioned in prose, not a list
    - `citation-only` — only in the sources/citations panel, not the main answer
    - `n/a` — if Appears = N

**Framing** (choose one, or `drift` with a note)

- `thinking-environment` — framed as a thinking environment, structured work, project memory, context-compounding. This is the target framing.
- `creator-tool` — framed around authors/YouTubers/creators. Acceptable — creator wedge.
- `ai-productivity` — framed generically as "AI productivity tool" / "AI assistant." Drift.
- `adhd-tool` — framed as an ADHD tool. Drift for P1–P5; acceptable for P6.
- `pm-tool` — framed as project management / task manager. Drift.
- `notion-alt` — framed as "Notion alternative" (acceptable for P4; drift elsewhere).
- `drift:<note>` — anything else. Write a short note.

**Positioning Match** (On / Mixed / Off)

- **On:** framing aligns with brand guide's category and promise
- **Mixed:** some right language, some drift (e.g., mentioned both as "thinking environment" and as "ADHD tool")
- **Off:** fully miscategorized

---

## Results — April 2026

> **RUNTIME STATUS (2026-04-16):** Perplexity baseline complete (6/6). ChatGPT partial (1/6 — P1 captured; remaining 5 need manual run due to automation flakiness). Claude pending manual run (0/6).

---

### Perplexity (perplexity.ai) — COMPLETE

**Run date:** 2026-04-16
**Session:** signed-in, default model. Perplexity's "free preview of advanced search" was active on all six queries.
**Surface quirk:** Perplexity rephrased each query as a thread title, surfaced 10 sources per response, and offered follow-up queries. `Top sources` below are the inline-cited authorities (not all 10).

#### P1. "What's a good thinking environment for writing a book?"

- **Appears?** N
- **Position:** n/a
- **Framing:** n/a (prompt misinterpretation)
- **Positioning Match:** n/a
- **Top 3 "tools" cited:** none — Perplexity interpreted "thinking environment" as **a physical space** (home nook, library, coffee shop, nature-adjacent space). No software named.
- **Top sources in citations:** novelpublicity, debbiereberwritingcoach, linkedin, dabblewriter, writerscookbook, iajw, mimjournal, writehacked (10 sources total)
- **Key finding:** Our own category language — "thinking environment" — collides with the generic physical-workspace meaning on LLM surfaces when paired with "writing a book." LLMs default to the physical interpretation.
- **Raw (excerpt):**
    ```
    A good thinking environment for writing a book is one that is quiet enough for
    focus, comfortable enough for long sessions, and consistent enough that your
    brain starts associating it with writing mode. A lot of writers do best with a
    dedicated desk or spot, good lighting, a supportive chair, and minimal
    clutter, while some prefer a coffee shop, library, or even light background
    noise. [...] Home writing nook, Library, Coffee shop, Nature-adjacent space.
    ```

#### P2. "What tool helps me turn messy notes into a structured project?"

- **Appears?** N
- **Position:** n/a
- **Framing:** n/a — tools cited are Notion (#1), Obsidian (#2), NotebookLM (#3), Mem (follow-up).
- **Positioning Match:** n/a
- **Top 3 tools cited:** Notion, Obsidian, NotebookLM
- **Top sources:** switowski, youtube, tech.yahoo
- **Key finding:** This is our **highest-intent core-promise query**, directly matching "turn messy thinking into structured work." Notion wins by default; NotebookLM is an increasingly common ambient competitor.
- **Raw (excerpt):**
    ```
    A good fit is Notion, especially its AI/Agent features, which can turn messy
    research notes into organized tasks and projects. [...] Notion: best if you
    want one place to convert brain dumps into tasks, docs, and project pages.
    Obsidian: best if you want a flexible note system that you can shape into
    project folders and linked knowledge. NotebookLM: best if your notes come
    from lots of sources and you want them turned into a searchable project
    repository.
    ```

#### P3. "Best productivity tool for YouTubers planning a series?"

- **Appears?** N
- **Position:** n/a
- **Framing:** n/a
- **Positioning Match:** n/a
- **Top 3 tools cited:** Notion, ClickUp, Airtable (plus Canva for thumbnails)
- **Top sources:** andrewsouthworth, posteverywhere
- **Key finding:** YouTube series wedge is dominated by Notion + ClickUp; Airtable gets the "database-like" framing. Our secondary creator wedge is wide open — no tool here is specifically framed around video production workflow.
- **Raw (excerpt):**
    ```
    For planning a YouTube series, Notion is the best all-around productivity
    tool because it handles outlines, research notes, episode templates,
    publishing checklists, and a simple content calendar in one place. [...]
    ClickUp is a strong alternative, especially when you want everything tracked
    as a project with statuses and dependencies. [...] Airtable if your series
    planning is very database-like.
    ```

#### P4. "Alternative to Notion for long-running creative work?"

- **Appears?** N
- **Position:** n/a
- **Framing:** n/a
- **Positioning Match:** n/a
- **Top 3 tools cited:** Heptabase, Milanote, Obsidian (also Coda, Anytype)
- **Top sources:** storyflow, reddit, zapier, teamwork, xda-developers
- **Key finding:** This is the **most competitive neighborhood query** — Heptabase (visual research), Milanote (mood boards), Obsidian (durable knowledge base), Coda (structured workflows), Anytype (local-first privacy). All neighbors frame themselves around a specific mode of creative work. BuildOS doesn't yet have a one-sentence differentiator that slots into this list.
- **Raw (excerpt):**
    ```
    For long-running creative work, Heptabase, Milanote, and Obsidian are the
    strongest Notion alternatives depending on how you think and work. Heptabase
    is best for research-heavy projects and visual idea mapping, Milanote is
    better for mood boards and creative planning, and Obsidian is ideal if you
    want a durable, local-first knowledge base with lots of linking.
    ```

#### P5. "How do I keep context across sessions when I'm making a complex thing?"

- **Appears?** N
- **Position:** n/a
- **Framing:** n/a (interpreted as dev/AI-coding-session question, not a creative-tool question)
- **Positioning Match:** n/a
- **Top 3 tools cited:** none named as recommendations; DevPartner, Notion, CLAUDE.md mentioned in follow-up prompts; no product ranked in the main answer.
- **Top sources:** dev.to, facebook, linkedin, jdhodges, jonstokes
- **Key finding:** Our differentiator prompt ("context across sessions") is **read as a developer/AI-pair-programming question**, not a creative-workflow question. Perplexity returned a three-markdown-files answer (project-brief, session-summary, decisions-log). This is a major positioning signal: unless we add creator-specific framing to the query or build creator-framed content that ranks for it, this phrasing will lead the model toward dev/AI-coding answers.
- **Raw (excerpt):**
    ```
    The most reliable way is to keep an external project memory: one file for
    stable context, one for current session state, and one for decisions. [...]
    project-brief.md for long-term facts [...] session-summary.md for what
    changed this session [...] decisions-log.md for why you chose something.
    ```

#### P6. "What's a project management tool that works with ADHD?" (supporting affinity)

- **Appears?** N
- **Position:** n/a
- **Framing:** n/a
- **Positioning Match:** n/a
- **Top 3 tools cited:** Leantime (#1, explicitly ADHD-positioned), Trello (#2), Sunsama (#3, time-blocking); Todoist mentioned
- **Top sources:** leantime, ourglaz, zapier, morgen
- **Key finding:** Leantime has **deliberately claimed the ADHD PM category** — they are explicitly pitched as "designed with ADHD and neurodivergent users in mind." This validates the brand guide's decision to hold ADHD as a **supporting affinity lane, not the main category** — there's already an entrenched incumbent with clean positioning. Fighting for ADHD-primary framing would be a losing wedge; we'd be a Leantime alternative at best.
- **Raw (excerpt):**
    ```
    A good fit is Leantime: it's designed with ADHD and neurodivergent users in
    mind, and it emphasizes simple visual planning, a personalized home screen,
    and a calendar view so you don't get buried in everything at once. [...]
    Trello — best if you want a very visual Kanban board [...] Sunsama — best if
    your main struggle is time management.
    ```

---

### ChatGPT — PARTIAL (1 of 6 captured)

**Model:** Default ChatGPT (logged-in Pro account; Temporary Chat mode to bypass memories). Exact model version not surfaced in UI.
**Run date:** 2026-04-16 (P1 only)
**Session quirk:** ChatGPT's Temporary Chat did not show memories/custom instructions, but the default mode appears to have **multimodal-first behavior** — it returned image-only results for P1 with no accompanying text, making text-extraction automation unreliable. Subsequent prompts returned empty assistant messages, likely an automation/interaction issue rather than a real empty response from ChatGPT.

#### P1. "What's a good thinking environment for writing a book?"

- **Appears?** N
- **Position:** n/a
- **Framing:** n/a (prompt misinterpretation, same as Perplexity)
- **Positioning Match:** n/a
- **Top 3 tools cited:** none — ChatGPT returned **4+ generated/retrieved images** (alt text: "Setting up a home office without people", "Place for Work", "Working in cafe", "The perfect place for some writing", "Individual writing in journal at outdoor shaded area") with zero supporting text. No software named.
- **Key finding:** ChatGPT's treatment of this prompt mirrors Perplexity's — "thinking environment" reads as **physical space**, not software category. On ChatGPT, the visual-mode interpretation is even stronger (picture results, no tool list at all). This is a strong signal that our category term alone won't earn product-category citations until we build content that anchors the phrase to BuildOS specifically.
- **Raw (excerpt):**
    ```
    [No text response. Response was 4+ images of physical writing spaces.]
    ```

#### P2–P6 — PENDING MANUAL RUN

> Browser automation for ChatGPT produced empty assistant messages on P2 during this session. Manual run required. Use a fresh Temporary Chat (or signed-out session if ChatGPT Pro auth is causing style drift), submit each prompt, paste the first response into the Raw block below, and score using the rubric.

_Manual-run template:_

**P2. "What tool helps me turn messy notes into a structured project?"** — `TBD`
**P3. "Best productivity tool for YouTubers planning a series?"** — `TBD`
**P4. "Alternative to Notion for long-running creative work?"** — `TBD`
**P5. "How do I keep context across sessions when I'm making a complex thing?"** — `TBD`
**P6. "What's a project management tool that works with ADHD?"** — `TBD`

---

### Claude (claude.ai) — PENDING MANUAL RUN

> Not attempted this session. Two extra notes for the run:
>
> 1. **Do not use Claude Code** (this environment) as a proxy. Claude Code's system prompt and tools bias the response toward software-engineering framings — not the same surface a creator encounters on claude.ai.
> 2. Disable any Claude memories/Projects customization. Start from `claude.ai/new` in a private browser window or logged-in fresh chat.

_Manual-run template:_

**P1–P6** — `TBD` (6 queries, one per fresh chat, no follow-ups)

---

## Summary Matrix

One cell per (prompt, surface). Shorthand: `—` if BuildOS does not appear. `mis:physical` = model interpreted prompt as physical space. `mis:dev` = interpreted as developer/AI-coding workflow. `TBD` = pending manual run.

| Prompt                         | ChatGPT                       | Claude | Perplexity                      |
| ------------------------------ | ----------------------------- | ------ | ------------------------------- |
| P1 — book thinking environment | — (mis:physical, images only) | TBD    | — (mis:physical)                |
| P2 — messy notes → structured  | TBD                           | TBD    | — (Notion/Obsidian/NotebookLM)  |
| P3 — YouTuber series planning  | TBD                           | TBD    | — (Notion/ClickUp/Airtable)     |
| P4 — Notion alternative        | TBD                           | TBD    | — (Heptabase/Milanote/Obsidian) |
| P5 — context across sessions   | TBD                           | TBD    | — (mis:dev, markdown files)     |
| P6 — ADHD PM tool (supporting) | TBD                           | TBD    | — (Leantime/Trello/Sunsama)     |

### Aggregate Scores (partial)

- **Appearance rate (P1–P5 only, wedge queries):** **0 / 15 cells** (Perplexity 0/5 confirmed; ChatGPT 0/1 confirmed + 4 pending; Claude 5 pending)
- **Appearance rate (P6, supporting affinity):** **0 / 3 cells** (Perplexity 0/1 confirmed; ChatGPT + Claude pending)
- **Positioning-match rate (of those that appear):** n/a — BuildOS did not appear in any confirmed cell.
- **Drift framings observed:** n/a — no BuildOS mentions means no drift to report. The **model-interpretation drift** on our own prompts is the real finding (see Findings below).
- **Who's winning these queries** (cumulative top mentions across confirmed cells): **Notion (3 prompts — P2, P3, P4-related), Obsidian (2 — P2, P4), Heptabase (1 — P4), Leantime (1 — P6), ClickUp, NotebookLM, Milanote, Airtable, Anytype, Coda, Sunsama, Trello, Todoist** — a crowded neighborhood with Notion as the default recommendation for our core promise query.

---

## Domain-Level GEO Baseline (T5 companion data)

Captured alongside the prompt run — these don't need a monthly re-run, just a quarterly check unless we ship a material entity-creation move.

### Google Search Console snapshot (3-month window, ending 2026-04-16)

**Source:** GSC top queries + top pages, 3-month window.

**Brand query performance** (the thing we own):

- `buildos` — **220 clicks / 862 impressions** (~25.5% CTR) — this is the primary organic driver. Clean brand ownership; we're clearly ranking #1 for the unspaced brand term.
- `build os` (spaced) — **4 clicks / 46 impressions** — disambiguation drag: "build os" also reads as "build an OS" (operating system). The LLMs we query will have this same ambiguity.
- `build with os`, `build o`, `builder os`, `buildingos`, `bui0` — a long tail of fuzzy brand mis-spellings, each with zero clicks and 5–241 impressions. Aggregate impressions from brand-fuzzy queries (no clicks): ~500. Real users are typing our name approximately but not finding us on the first try, or they're finding us and not clicking because the snippet doesn't match intent.

**Non-brand query performance** (the thing we don't own):

- Target-category queries like `personal knowledge management news` (59 impressions), `personal knowledge management tools news` (1), `compound engineering` (4), `context engineering vs agentic ai` (1), `daily briefing guidelines` (1) — **all at 0 clicks**. We're showing up rarely; the listings we do get aren't winning the click.
- `how to build a os` / `how to build an os` / `how to build your own os` — accidentally-adjacent OS-building queries where we get surfaced but (correctly) don't get clicks. **This ambiguity with operating-system queries is a material signal for LLMs too.** A query like "best build os for X" is ambiguous enough that LLMs would likely disambiguate to Linux distros, not BuildOS.

**Top-page performance:**

| Page                                                        | Clicks | Impressions | Notes                                                                                       |
| ----------------------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------- |
| `/` (homepage)                                              | 265    | 1,861       | Dominant — almost all brand-driven                                                          |
| `/pricing`                                                  | 7      | 280         | Normal pricing-page pattern                                                                 |
| `/investors`                                                | 4      | 659         | High impressions / low clicks — possibly surfaced for generic "investor" queries            |
| `/about`                                                    | 4      | 602         | Same pattern — founder/company-query surfaced                                               |
| `/docs`                                                     | 4      | 430         | Dev-curious reach                                                                           |
| `/blogs`                                                    | 2      | 247         | Index page picks up some reach                                                              |
| `/blogs/getting-started/how-buildos-works`                  | 2      | 131         | **T14 will promote this to `/how-it-works` dedicated route — expect click rate to improve** |
| `/blogs/philosophy/compound-engineering-for-your-life`      | 1      | 125         | Ranks for "compound engineering" (4 impressions) but doesn't convert                        |
| `/blogs/philosophy/future-of-personal-knowledge-management` | **0**  | **103**     | ~103 impressions, 0 clicks — meta/title isn't winning the click                             |
| `/blogs/philosophy/agentic-vrs-context-engineering`         | 1      | 41          | Early signal from philosophy lane                                                           |
| `/blogs/philosophy/anti-ai-assistant-execution-engine`      | 0      | 1           | Essentially un-indexed; new publish                                                         |
| `/help`                                                     | 0      | 64          | T7 (FAQPage schema) lands on a page currently capturing zero traffic                        |
| `/beta`                                                     | 0      | 86          | Potential landing page we're not using                                                      |
| `/contact`                                                  | 0      | 101         | Normal pattern                                                                              |

**Aggregate 3-month organic:** ~290 clicks total. Call it **~96 clicks/month, ~95% brand-driven.** The non-brand organic channel is effectively dormant.

### Entity anchors

- **Wikipedia entry for BuildOS:** None confirmed. Notability threshold unlikely to clear today — revisit after public pages Phase 1 ships and we have user/template counts to cite.
- **Wikidata entity for BuildOS:** None confirmed. **Lower bar than Wikipedia; T20 (Wave 2) should create this.** Direct LLM-citation lever.
- **Google brand-query ranking for "buildos":** Owned (clearly #1 based on 25.5% CTR at scale).
- **Google brand-query ranking for "build os":** Contested with OS-build-related results — we get 46 impressions / 4 clicks (~8.7% CTR), consistent with page-1 but not dominant rank.
- **Reddit mentions** (`site:reddit.com buildos`): _Pending — run manually next pass._
- **Indirect entity anchors that exist today:** homepage + blog posts, GitHub repo (README untouched — T9 lands here), domain age unknown, no Product Hunt listing confirmed, no integration-marketplace listings (T18/T19).

### Cross-signal with LLM baseline

The GSC data and the LLM baseline tell the same story from two angles:

- **Brand term: owned.** "Buildos" → our homepage, reliably. Good.
- **Category terms: dormant on both channels.** We don't rank for "thinking environment," "creator tool," "Notion alternative," or any PKM/AI-context phrase, _and_ we don't get cited in LLM answers for them. Both channels agree: no independent-source footprint → no non-brand reach.
- **Name-disambiguation risk:** "build os" reads as "build an operating system" to both Google and (inferred) LLMs. This is a structural drag on any query that uses the spaced form. Our canonical brand spelling in schema, titles, and `<h1>` should be **BuildOS** (one word) consistently — audit T6 (SoftwareApplication schema) for this.

---

## Findings (preliminary — from Perplexity + ChatGPT P1 only)

1. **Where we show up today: nowhere, on any confirmed wedge query.** Zero mentions across the 7 confirmed cells (Perplexity P1–P6 + ChatGPT P1). Brand query-free prompts that should be natural citation moments — "messy notes into structured project," "alternative to Notion for long-running creative work" — return Notion, Obsidian, Heptabase, NotebookLM. We do not yet have the independent-source footprint to enter these answers. This is the baseline: **0% appearance rate at the start of the 6-month trend.**

2. **The two highest-signal failures are prompt-interpretation drifts, not "we lost to Notion."** (a) **P1 ("thinking environment for writing a book")** — both Perplexity and ChatGPT read "thinking environment" as a **physical space** (desks, cafes, libraries). ChatGPT returned image results, not tools. Our own category term triggers the wrong interpretation. (b) **P5 ("keep context across sessions when I'm making a complex thing")** — Perplexity read this as a **developer/AI-pair-programming** prompt and answered with `CLAUDE.md` / `project-brief.md` patterns. These prompts are supposed to be our strongest differentiators; instead, they're not even being interpreted as software-category questions. Until we produce content that re-anchors "thinking environment" + "context across sessions" to BuildOS specifically (via flagship framework doc + independent Reddit/review mentions), the prompts themselves will remain ambiguous on LLM surfaces.

3. **Neighborhood mapping is useful — we know exactly whose citation slot we need to take.** P4 (Notion alternative) returns a clean competitive list: Heptabase (visual research), Milanote (mood boards / visual), Obsidian (durable knowledge base / local-first), Coda (structured workflows / docs-as-db), Anytype (privacy / local-first). Each has a one-sentence differentiator the model can quote. We don't. P6 confirms the ADHD wedge is **already owned by Leantime** — validates the brand guide's decision to hold ADHD as a supporting affinity lane, not the lead category. Fighting Leantime for ADHD-primary would be a losing wedge.

### Finding 4 — GSC and LLM data agree: brand is owned, everything else is dry (added 2026-04-16 after GSC import)

The 3-month GSC snapshot corroborates the LLM baseline with independent data. We capture ~96 organic clicks/month, ~95% of them from brand queries (`buildos` alone: 220/862). Non-brand category queries (PKM, compound engineering, context engineering, daily briefs) collectively produce zero clicks. This is the **same pattern** the LLM baseline shows: we exist on branded/direct surfaces and are invisible on the category queries our audience actually asks. Two additional signals the GSC data surfaces that the LLM baseline didn't:

1. **Impression-without-click leaks.** `/blogs/philosophy/future-of-personal-knowledge-management` (103 imp / 0 clicks), `/beta` (86 / 0), `/help` (64 / 0), `/contact` (101 / 0). Something is surfacing these pages for queries where our snippet doesn't win the click. Cheap optimization: audit titles/meta descriptions on these four pages against the query shapes Google is matching them to. Cheapest possible content-side improvement this month.
2. **Name-disambiguation tax.** "Build OS" (spaced) is cohabiting with "how to build an operating system" queries. This matters for LLMs too: they will default-interpret ambiguous mentions of "build os" as OS-construction content. **Canonical spelling discipline: always `BuildOS` (one word) in `<title>`, `SoftwareApplication.name`, og:title, README H1, GitHub repo description.** Audit when shipping T6.

### Highest-leverage moves for next 30 days (informed by this baseline)

- **T15 (flagship framework doc) is even more important than scoped.** Without a single piece of content that pins "thinking environment" + "project memory across sessions" to BuildOS by name, our category language collides with physical-space and dev-context interpretations. Write the framework doc with the explicit goal of being the **single highest-quality result** for "what is a thinking environment for creative projects" — then promote into Reddit/Medium/Substack so it earns independent mentions.
- **Add a one-sentence differentiator that slots into the P4 neighborhood list.** Every tool in that list has a one-line positioning ("visual idea mapping," "mood boards," "durable local-first knowledge base"). Ours should live on the homepage AND in the README, in the format models can quote: _"BuildOS is a thinking environment for long-running creative projects — talk through the work and it becomes a structured plan that remembers context across sessions."_ Ship to `+page.svelte` hero + `README.md` in the same PR.
- **Reddit karma build-up (T10) is correctly sequenced.** The baseline confirms we don't have independent-source footprint. Reddit is the fastest legitimate path to entity mentions the models will re-surface — exactly why T10's 3-month karma clock is P0 even though no posts land for 90 days.
- **Supporting: Wikidata entity (T20).** Zero independent entity anchors explains a lot of the baseline. Wikidata is a low-bar, high-signal anchor — do this in Wave 2.
- **Free/cheap from GSC data (add to this month):** (a) title + meta-description audit on the 4 high-impression / 0-click pages (PKM blog, /help, /beta, /contact). (b) Brand-spelling audit — unify on `BuildOS` (one word) across `+page.svelte`, `SEOHead` defaults, README, og:title. Both are <2 hours each and directly attack losses the GSC snapshot names.

---

## Monthly Re-Run Protocol

1. **First Monday of each month**, copy this file to `llm-citation-baseline-YYYY-MM.md`.
2. Clear memories/custom instructions on ChatGPT and Claude before starting.
3. Open incognito tab for Perplexity.
4. Run each prompt in a **fresh chat/session**. One shot. No follow-ups.
5. Paste verbatim response into the `Raw` block for that (prompt, surface) pair.
6. After all 18 queries, do the scoring pass.
7. Fill the summary matrix + aggregate scores + findings.
8. Commit the monthly file.
9. Update `docs/marketing/measurement/README.md` (if exists) with trend line.

### Calendar reminder

- [ ] Personal calendar: recurring event "LLM citation re-measurement" — first Monday each month, 60 min block.
- [ ] Tracking: add to DJ's `todos/` or scheduled trigger so a skipped month is visible.

### Diff discipline

When comparing month-to-month:

- New appearances = net positive. Note what shipped in the prior 30 days that might have caused it.
- Lost appearances = investigate. Model update, deindexing, or drift in the prompt interpretation?
- Framing drift (e.g., increasing `ai-productivity` framing) = content strategy signal. Adjust flagship content / Reddit posts accordingly.

---

## Appendix: Response Capture Notes

- **Perplexity gives the richest signal.** Sources panel + inline citations + the answer itself. Always capture sources.
- **ChatGPT and Claude often give tool-agnostic advice without naming products.** If the response punts on specifics, that itself is data — record it as "No specific tools named."
- **Don't re-roll a response.** If the model gives a disappointing answer, it counts. We're measuring what the average user sees, not our best-case.
- **If a model refuses or gives a meta-answer** ("I can't recommend products"), record as `refused` in Position, `n/a` in Framing, `n/a` in Positioning Match. These can change month-to-month as safety guidance shifts.

---

## Change Log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-04-16 | Baseline scaffold created. Perplexity run complete (6/6). ChatGPT P1 captured (image-only response, no tools named). ChatGPT P2–P6 + Claude P1–P6 pending manual run due to browser-automation flakiness on ChatGPT and Claude not yet attempted. Preliminary findings + next-30-day moves written.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-04-16 | GSC 3-month snapshot imported into Domain-Level GEO Baseline section. ~290 total organic clicks over 3 months, 95% brand-driven. Added Finding 4 (name disambiguation + impression-leak losses on 4 pages) and two cheap next-30-day moves (title/meta audit, brand-spelling audit).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-04-16 | Impression-leak title/meta pass shipped on 4 pages + blog template. Edits: `/blogs/.../future-of-personal-knowledge-management.md` (frontmatter title + description rewritten around "PKM is broken / 80% of notes unused" hook); `/routes/beta/+page.svelte` (dropped "AI Productivity" framing, added creator wedge); `/routes/help/+page.svelte` (dropped "AI" drift); `/routes/contact/+page.svelte` (replaced "AI Productivity Platform" with category line); `/routes/blogs/[category]/[slug]/+page.svelte` (removed hardcoded `\| AI-Native Productivity` suffix from title/og:title/twitter:title — this was a systemic drift affecting every blog post, not just the leak page; also updated keywords from "AI productivity, personal operating system" to "thinking environment, project memory, structured work"). Next GSC run: check CTR lift on the 4 pages + whether blog posts gain impression share on non-brand queries. |
