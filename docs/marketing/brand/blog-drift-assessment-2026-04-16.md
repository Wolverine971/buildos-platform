---
title: 'Blog Frontmatter Drift Assessment — 2026-04-16'
created: 2026-04-16
status: in progress
owner: DJ Wayne
related_docs:
    - /docs/marketing/brand/brand-guide-1-pager.md
    - /docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md
    - /docs/marketing/measurement/llm-citation-baseline-2026-04.md
path: docs/marketing/brand/blog-drift-assessment-2026-04-16.md
---

# Blog Frontmatter Drift Assessment

Audit of `title`, `description`, and `excerpt` across all 28 published blog posts against the BuildOS brand guide. Scope is frontmatter only (what Google, OG cards, and blog-index cards render) — body copy not audited in this pass.

---

## Approach — Counter-Positioning, Not Erasure

People are still searching for AI. We're not going to strip AI mentions. We're going to **counter-position** — use AI as a topical entry point, then contrast BuildOS against the broken default.

Patterns to use (aligned with `anti-ai-show-dont-tell-strategy.md`):

1. **Contrast pattern** — "AI [common broken thing]. BuildOS [better thing]."
    - e.g. "AI chats forget. BuildOS remembers."
2. **Category-redefinition pattern** — "Most AI productivity tools [pattern]. BuildOS [different pattern]."
    - e.g. "Most AI productivity tools race to do everything for you. BuildOS is built to help you see clearly."
3. **Relief-first pattern** — lead with the user's pain, mention AI only when naming what's broken.
    - e.g. "You shouldn't need six disconnected tools to finish a book. BuildOS is one thinking environment where AI helps your context compound."
4. **Contrarian-positioning pattern** — name the AI-hype default as a problem, then flip it.
    - e.g. "Stop chasing AI features. Start building context that compounds."

Rules:

- Never lead with "AI-powered" as a capability claim. Always lead with the user's work or relief.
- Brand category ("thinking environment") goes before AI wherever possible.
- Preserve informative keywords for search (AI, productivity, knowledge management, Notion, etc.) but in service of a contrarian frame.
- Canonical spelling: **BuildOS** (one word). Every title.

---

## Findings

### A. SEVERE — "AI-powered" / "AI productivity" / "AI-native" in title or description

Direct brand-guide violations ("Do not lead with AI"). 6 distinct posts. **Work this group first.**

- [ ] **A1.** `apps/web/src/content/blogs/buildos-vs-obsidian-knowledge-management.md:2`
    - Current title: _"Obsidian vs BuildOS: Manual Networks vs AI-Powered Organization"_
    - Drift: "AI-Powered Organization" as capability claim.
    - Counter-angle: Obsidian makes you maintain the network by hand; BuildOS lets your project memory compound as you work.

- [ ] **A2.** `apps/web/src/content/blogs/productivity-tips/evolution-of-note-taking.md:2,3,23`
    - Current title: _"The Evolution of Note-Taking: From Paper to AI-Powered Organization"_
    - Drift: "AI-Powered Organization" in title; "AI-powered systems" in desc + excerpt.
    - Counter-angle: the evolution isn't "paper → AI-powered." It's "collection → action" — most tools just added an AI veneer to the same old filing cabinets.

- [ ] **A3.** `apps/web/src/content/blogs/product-updates/build-os-beta-launch.md:2,3,12`
    - Current title: _"BuildOS Beta Launch: Your Personal Operating System is Here"_
    - Current desc: _"Announcing the BuildOS beta launch. Join the revolution in AI-powered productivity and personal knowledge management."_
    - Drift: Personal-OS framing (Group B) + "revolution in AI-powered productivity" + "AI-powered productivity platform" in excerpt.
    - Counter-angle: it's a thinking environment, not an AI-powered platform; "revolution" is hype — remove.

- [ ] **A4.** `apps/web/src/content/blogs/getting-started/daily-brief-guide.md:3,22`
    - Current desc: _"Make the most of your daily AI-generated briefs—contextual intelligence that draws from your goals, plans, tasks, and documents to provide personalized strategic guidance."_
    - Current excerpt: _"Transform your daily productivity with AI-powered briefs..."_
    - Drift: "AI-generated briefs" and "AI-powered briefs" both lead with AI capability.
    - Counter-angle: the value isn't "AI generates a brief." It's "you start the day knowing what actually matters, not with a blank page or a bloated task list."

- [ ] **A5.** `apps/web/src/content/blogs/productivity-tips/context-engineering-101.md:3,27`
    - Current title: _"Prompt Engineering is Out. Context Engineering is In."_ (title is on-brand)
    - Current desc: _"Why the future of AI productivity moves beyond crafting clever prompts to building persistent, contextual systems. See how BuildOS implements context engineering with rich ontology and Project Lens."_
    - Drift: "future of AI productivity" + "rich ontology" at first contact.
    - Counter-angle: the topic IS AI, so AI references are fine — but "AI productivity" is drift; should be "working with AI" or "AI-era creative work." Also drop "ontology" per brand guide.

- [ ] **A6.** `apps/web/src/content/blogs/product-updates/calendar-integration-announcement.md:3`
    - Current desc: _"New calendar integration brings seamless scheduling to BuildOS. Connect Google Calendar and let AI help you plan your time."_
    - Drift: "let AI help you plan your time" — AI as primary value.
    - Counter-angle: the value is that calendar commitments and project work stop fighting each other. AI isn't the headline; the scheduling-meets-thinking behavior is.

### B. MODERATE — "Personal Operating System" as primary category framing

Legacy positioning from before the "thinking environment" pivot. 3 posts.

- [ ] **B7.** `apps/web/src/content/blogs/philosophy/personal-operating-system-manifesto.md` — Entire piece framed around "Personal Operating System." **This is a positioning decision, not a copy fix.** Options: (a) rewrite as _"Thinking Environment Manifesto"_ with Personal-OS as supporting metaphor, (b) archive + 301-redirect to the T15 flagship doc once it ships, (c) leave as artifact of prior thinking (not recommended for a core philosophy post).
- [ ] **B8.** `apps/web/src/content/blogs/vision-deserves-better-operating-system.md:2` — Title uses "operating system"; description is actually clean. Title fix only.
- [ ] **B9.** `apps/web/src/content/blogs/product-updates/build-os-beta-launch.md:2` — Title: _"Your Personal Operating System is Here"_ (also in A3 — fix both together).

### C. MODERATE — ADHD-primary framing (already scoped for T16)

- [ ] **C10.** `apps/web/src/content/blogs/case-studies/buildos-vs-notion-adhd-minds.md` — Title + desc + excerpt all ADHD-led. **Already scheduled in Wave 2 (T16).** Confirm scope when we get there; no new action in this pass.

### D. MODERATE — "Ontology" / jargon in first contact

Per brand guide: _"ontology"_ is deep-content only.

- [ ] **D11.** `apps/web/src/content/blogs/getting-started/under-the-hood.md:3,22` — Desc + excerpt use "ontology." "Under the Hood" title implies deep content so softer constraint; swap "ontology" for "connected project memory" / "rich context architecture" in frontmatter only.
- [ ] **D12.** `apps/web/src/content/blogs/productivity-tips/context-engineering-101.md:3` — "rich ontology" in description. Covered by A5.

### E. MINOR — Excerpt-only drift

Excerpts feed blog-index cards and get quoted by LLMs.

- [ ] **E13.** `apps/web/src/content/blogs/philosophy/future-of-personal-knowledge-management.md:26` — Excerpt: _"AI systems that turn chaos into clarity..."_ (title + description already fixed; excerpt is residual).
- [ ] **E14.** `apps/web/src/content/blogs/case-studies/buildos-vs-chatgpt-context-that-compounds.md:13` — Excerpt: _"AI-assisted work"_ — soft; consider "complex creative work."
- [ ] **E15.** `apps/web/src/content/blogs/philosophy/anti-ai-assistant-execution-engine.md:28` — Excerpt: _"BuildOS takes the opposite approach: AI that helps you see clearly."_ — defensible given the post's deliberate anti-AI-positioning thesis. Title stays. Excerpt could be tightened.

### F. Defensible / on-brand (leave alone)

- `philosophy/anti-ai-assistant-execution-engine.md:2` — Title: _"The Anti-AI-Assistant That Actually Helps You Ship"_ — deliberate positioning artifact. Keep.
- `philosophy/agentic-vrs-context-engineering.md` — Deep content; topic is agentic AI. AI references are topical, not drift.
- `philosophy/compound-engineering-for-your-life.md` — AI reference in service of compound-engineering concept, not product claim.

### G. Clean / on-brand (voice reference models)

Use these as voice templates when rewriting A–E:

- `philosophy/your-morning-without-the-algorithm.md` — _"A thinking environment is the only way back to your own mind"_
- `philosophy/future-of-personal-knowledge-management.md` (post-fix) — contrarian + specific stat
- `productivity-tips/tech-project-managers-guide.md` — clean
- `talking-listening-productivity-phases.md` — clean
- `case-studies/buildos-vs-monday-thought-organization.md` — _"Thought Organization"_
- `getting-started/first-project-setup.md` — _"Just Start Talking"_
- `getting-started/effective-brain-dumping.md` — _"From Chaos to Compounding Context"_

---

## Aggregate Count

| Severity                      | Count             | What it touches              |
| ----------------------------- | ----------------- | ---------------------------- |
| A. Severe                     | 6                 | Title, description, excerpt  |
| B. Personal-OS framing        | 3 (1 overlaps A)  | Structural — deeper rewrites |
| C. ADHD-primary               | 1                 | Already scheduled (T16)      |
| D. Ontology/jargon            | 2 (1 overlaps A5) | Frontmatter-only             |
| E. Excerpt-only               | 3                 | Excerpt field                |
| **Distinct posts with drift** | **~11 posts**     | of 28 published              |

---

## Work Log

Will update this section in place as fixes ship.

### Group A — complete (2026-04-16)

| ID  | File                                        | Change summary                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | buildos-vs-obsidian-knowledge-management.md | Title reframed from _"Manual Networks vs AI-Powered Organization"_ to _"Linking by Hand vs Project Memory That Compounds"_ — names the maintenance-burden contrast instead of an AI capability claim. Description, SEO fields, keywords, and tags all updated; dropped `ai-organization` tag in favor of `project-memory` + `thinking-environment`.                                                                    |
| A2  | evolution-of-note-taking.md                 | Title: _"From Paper to AI-Powered Organization"_ → _"From Collection to Action"_ — renames the actual inflection point. Desc + excerpt reframed around "each generation promised a better filing cabinet; the real shift is from collection to action." AI mentioned but topically, not as a capability claim. Dropped `ontology` tag; added `thinking-environment`, `project-memory`. Bumped `lastmod` to 2026-04-16. |
| A3  | build-os-beta-launch.md                     | Title: _"Your Personal Operating System is Here"_ → _"A Thinking Environment for Complex Creative Work"_ (fixes both A3 + B9 Personal-OS drift). Desc + excerpt use category line + core promise; dropped "revolution in AI-powered productivity" hype. Content is still `_Content coming soon..._` placeholder (`published: false`) — frontmatter ready for when content lands.                                       |
| A4  | daily-brief-guide.md                        | Title: _"Your Personal Intelligence System"_ → _"Start the Day Knowing What Actually Matters"_ — names the relief outcome instead of the AI buzzword. Desc + excerpt reframed around "most mornings start buried in a task list; BuildOS starts with context." AI acknowledged ("AI does the overnight work") but user gets the relief framing. Dropped `ai-intelligence` tag. Bumped `lastmod`.                       |
| A5  | context-engineering-101.md                  | Topic IS AI/LLMs so references stay topical. Desc: _"future of AI productivity"_ → _"the way you work with AI"_. Dropped `rich ontology` → `project memory`. Dropped `AI-productivity` tag. Excerpt rewritten around the prompt→context-engineering shift. Bumped `lastmod`.                                                                                                                                           |
| A6  | calendar-integration-announcement.md        | Title slightly sharpened. Desc: _"let AI help you plan your time"_ → _"Project work and real-life scheduling stop fighting each other"_ — names the actual relief. Excerpt rewritten. Content is still placeholder (`published: false`).                                                                                                                                                                               |

### Group B — complete (2026-04-16)

| ID  | File                                       | Change summary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B7  | personal-operating-system-manifesto.md     | Title: _"The Personal Operating System Manifesto: Rethinking Productivity"_ → _"The Thinking Environment Manifesto"_. Desc + excerpt reframed around thinking environment / context that compounds. Dropped `operating-systems` tag; added `thinking-environment`, `project-memory`. **Open decision:** this `published: false` slot is either (a) where the T15 flagship doc lives, (b) archived once T15 ships, or (c) left as an empty placeholder. Frontmatter is now drift-free either way. |
| B8  | vision-deserves-better-operating-system.md | Title: _"Your Vision Deserves a Better Operating System"_ → _"Your Vision Deserves Better Infrastructure"_ — matches the post's own "this is an architecture problem" thesis. SEO title dropped "Empire Builders" (founder-guru drift); SEO description rewritten around thinking environment category + "context stays connected instead of scattering across six tools." Dropped `empire-building` tag. Slug unchanged (URL stable).                                                           |
| B9  | build-os-beta-launch.md                    | Covered by A3 in Group A work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### Group C — scheduled (T16, Wave 2)

- [ ] **C10.** `case-studies/buildos-vs-notion-adhd-minds.md` — reframe pending T16.

### Group D — complete (2026-04-16)

| ID  | File                              | Change summary                                                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D11 | getting-started/under-the-hood.md | Desc + excerpt rewritten with "ontology" swapped for "rich context architecture" / "connected project memory" — brand guide says "ontology" is deep-content only, not first-contact. Post body (which IS deep-content, per the `Deep dive:` banner) can still use the term in prose. Dropped `ontology` tag; added `project-memory`, `thinking-environment`. Bumped `lastmod`. |
| D12 | context-engineering-101.md        | Covered by A5 in Group A work.                                                                                                                                                                                                                                                                                                                                                 |

### Group E — complete (2026-04-16)

| ID  | File                                                      | Change summary                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E13 | philosophy/future-of-personal-knowledge-management.md     | Excerpt: _"It is AI systems that turn chaos into clarity..."_ → _"it's systems that turn chaos into clarity and notes into action"_ — drops the "AI systems" capability framing while keeping the thesis. Title + description were already fixed earlier.                                                                                                                                                                                             |
| E14 | case-studies/buildos-vs-chatgpt-context-that-compounds.md | Excerpt: _"...changes everything about AI-assisted work"_ → _"...changes everything when you're actually trying to ship something complex"_ — replaces the "AI-assisted work" soft drift with ship-framing (brand voice).                                                                                                                                                                                                                             |
| E15 | philosophy/anti-ai-assistant-execution-engine.md          | **Intentionally skipped.** Post's entire thesis is the anti-AI counter-position; title _"The Anti-AI-Assistant That Actually Helps You Ship"_ and excerpt _"Everyone races to build AI that does everything for you. BuildOS takes the opposite approach..."_ are the canonical models for how we _should_ counter-position elsewhere. The `AI-productivity` / `AI-philosophy` / `AI-assistants` tags are accurate to the piece's topic. Leave as-is. |

---

## Related — already shipped in this pass

Five fixes landed before this audit was written (the 4 GSC impression-leak pages + blog template):

- `apps/web/src/content/blogs/philosophy/future-of-personal-knowledge-management.md` — title + desc rewritten
- `apps/web/src/routes/beta/+page.svelte` — dropped "AI Productivity" framing
- `apps/web/src/routes/help/+page.svelte` — dropped "AI" drift (post-edit: added `FAQPage` JSON-LD + 8 FAQs — T7 early)
- `apps/web/src/routes/contact/+page.svelte` — replaced "AI Productivity Platform" with category line
- `apps/web/src/routes/blogs/[category]/[slug]/+page.svelte` — removed hardcoded `\| AI-Native Productivity` title suffix across every blog post
