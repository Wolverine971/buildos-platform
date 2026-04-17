<!-- buildos-strat.md -->

# BuildOS Distribution Strategy: Agent Handoff Document

**Purpose:** Research and action plan for BuildOS's distribution strategy in the post-SEO era. This document briefs an agent working inside the BuildOS codebase and marketing surface on where we're going, why, and what to build/research next.

**Author context:** DJ (CEO, technical co-founder of BuildOS). Marine Corps Scout Sniper veteran turned engineer. Methodical, mission-driven, "missionary founder" archetype. Prefers first-principles thinking and hates generic marketing advice.

**Status:** Strategy defined, research validated, partially implemented. See inline `[STATUS: ...]` tags for current codebase state.

**Required reading before executing any task in this doc:**

- `docs/marketing/brand/brand-guide-1-pager.md` — category, audience order, voice, terms to use/avoid
- `docs/marketing/strategy/buildos-marketing-strategy-2026.md` — master strategy
- `docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md` — anti-AI positioning thesis
- `docs/marketing/strategy/thinking-environment-creator-strategy.md` — creator-wedge strategy
- `docs/marketing/strategy/buildos-guerrilla-content-doctrine.md` — solo-founder content doctrine

**Positioning guardrails (non-negotiable):**

- Category: **thinking environment for people making complex things**
- Primary wedge: **authors + YouTubers.** Expand to podcasters, newsletter operators, course creators, founder-creators.
- ADHD, founders, indie builders are **supporting affinity lanes, not the main category.**
- Do not lead with "AI." Lead with relief. ("Turn messy thinking into structured work.")
- "Ontology" is a deep-content term only, not a first-contact term.

---

## Part 1: The Strategic Context (Why This Matters)

### The Problem

Traditional SEO is dead as a primary distribution channel for new sites in competitive niches. Google's AI Overviews now trigger on roughly half of all tracked queries and eat the clicks. Reddit and YouTube consistently outrank independent sites. Domain authority compounds more than ever, which structurally disadvantages newcomers. The iteration loop that made SEO magical — hypothesis, test, measure, compound — is largely gone.

BuildOS cannot win by playing the old SEO game. We need a different strategy.

### The Framing Shift

We've moved from the **monopoly aggregator era** (Google routes all intent via algorithmic relevance + link authority) to the **trust-routing era** (intent flows through people, communities, and AI models that humans trust as proxies for truth).

Implications:

- The unit of trust shifted from domain to person/community.
- Aggregators that matter now aggregate humans, not pages (TikTok, Reddit, Substack, YouTube, LLMs).
- Discovery is adversarial against AI-generated content; all successful channels have some trust-based defense layer.
- **Stop optimizing for an algorithm. Start optimizing for entering trust networks.**

### How This Fits BuildOS's Existing Strategy

The marketing strategy already commits to creator-led distribution (authors + YouTubers), anti-AI show-don't-tell, and guerrilla content over SEO grind. This doc is the distribution-channel layer underneath that strategy — it names the trust networks we actually enter (LLM training data, Reddit, integration marketplaces, user-generated public pages) and the technical foundations that make entry compound.

### The Five Channels We've Identified

Ranked by fit for BuildOS specifically:

1. **Public pages as a distribution surface** — Every user's public BuildOS project page becomes a crawlable, shareable, cloneable artifact with "made with BuildOS" branding. Notion/Figma/Linear model. Compounds across every other channel.
2. **LLM citation optimization (GEO/AEO/LLMO)** — Getting BuildOS cited when someone asks Claude, ChatGPT, or Perplexity about thinking environments, creator workflow tools, or how to turn messy thinking into structured work. Early stage, high leverage, tooling primitive.
3. **Reddit / community presence** — Authentic participation in creator-focused subreddits (writing, self-publishing, YouTubing, podcasting) with productivity/founder subs as cross-cutting lanes. Three-for-one: reaches community + ranks on Google + enters LLM training data.
4. **Developer and integration surface** (docs, GitHub README, integration directories) — Not the primary wedge, but low-effort and LLM-weighted.
5. **One deep authoritative piece per quarter** — Not weekly content. One 3,000-word piece that cements BuildOS as an intellectual authority in the thinking-environment category.

---

## Part 2: Power Law Priorities (What Actually Matters)

The research on LLM citation optimization is noisy — at least half of published "GEO advice" is repackaged SEO consulting. Filtering for what's consistent across independent sources, there's a clear power law. Most content optimization tips are padding.

### The Core Insight

Only ~7% of ChatGPT's cited results appear in Google's top 10. ~83% of AI Overview citations come from outside the organic top 10. **The old SEO game and the LLM citation game are different games with different winners.** Optimizing for traditional SEO to win LLM citations is optimizing the wrong function.

### What Drives Citations (Ranked by Evidence + Leverage)

1. **Being a "mentioned entity" across many independent sources.** LLMs build authority maps by seeing entities referenced consistently across many contexts by many unaffiliated people. One optimized page on our own domain does almost nothing. Ten independent sources mentioning "BuildOS" in the context of thinking environments and creator workflows does enormously more. This is why Reddit, Wikipedia, Hacker News, and GitHub keep appearing in citation studies — they're trust-laundering layers.

2. **Statistics and named numbers.** Princeton's GEO framework identified "Statistics Addition" and "Cite Sources" as the top-performing techniques, with reported visibility boosts up to 40%. LLMs preferentially cite content with specific numerical claims because they need anchors for synthesis. "BuildOS processes braindumps through a structured project schema with N tracked dimensions" beats "BuildOS organizes your thoughts."

3. **Content freshness.** Content updated within the last 13 weeks is significantly more likely to be cited. This is the closest LLM-era analog to the SEO iteration loop — we can actually run update-and-check cycles here.

4. **Structured JSON-LD markup.** `FAQPage`, `SoftwareApplication`, `Article` schemas. Unsexy but measurably reduces model hallucination risk when pulling from us, which increases citation rate.

5. **Query fan-out coverage.** LLMs decompose a prompt into multiple sub-queries and search each. Optimizing for one keyword matters less than covering the 15–20 sub-questions that fan out from it (for us: capturing messy input, connecting chapters to scenes, turning voice memos into structure, keeping project memory across sessions, replacing scattered tools, etc.).

Everything else — `llms.txt` files, `SpeakableSpecification` markup, voice search optimization — is lower-order. Don't rabbit-hole on those.

**Caveat on tooling:** The GEO measurement market is in hype phase. Vendors are selling $79–$500/month dashboards for what is essentially manually querying ChatGPT/Claude/Perplexity once a month. Don't buy tools yet. Build a simple internal process first.

---

## Part 3: BuildOS-Specific Action Items

Each item is tagged with current codebase status. Re-audit before implementation — these were captured 2026-04-16.

### Code / Product Changes

#### 3.1 Public Pages as a First-Class Distribution Surface

**This is the single highest-leverage strategic move available.** Treat it as P0.

**[STATUS: ~60–70% built. Backend scaffold exists — missing end-user UI, clone/template, gallery, marketing pages that showcase.]**

Existing infrastructure (don't rebuild):

- Public page routes at `apps/web/src/routes/(public)/p/[slug]/` and `/p/[slugPrefix]/[slugBase]/`
- Database: `onto_public_pages` table, `onto_public_page_slug_history`, `onto_public_page_review_attempts`
- Publish flow API: `/api/onto/documents/[id]/public-page/{prepare,confirm,live-sync}`
- Admin moderation dashboard: `/admin/ontology/public-pages`
- Core service: `apps/web/src/lib/server/public-page.service.ts`
- JSON-LD `Article` schema on public page template
- `onto_projects.is_public` flag (access control, not yet exposed to users)

The model: Notion, Figma Community, Linear changelog, GitHub READMEs, Vercel deploy previews. Every PLG unicorn of the last decade has had a user-generated-public-artifact layer. BuildOS's scaffold is ready; it needs the user-facing surface and discovery layer.

**What to build (phased):**

- **Phase 1 (P0 NOW): End-user publish UI.** Expose the existing publish flow to users. Publish/unpublish toggle on projects and documents, slug editing, "copy link" affordance, visibility selector (public vs unlisted). This unlocks everything downstream.
- **Phase 2: "Made with BuildOS" attribution.** Tasteful footer/badge on every public page, linked back to homepage with UTM. Permanent backlink engine. Verify it's present on existing public page templates; if not, add it.
- **Phase 3: Default visual design audit.** The bar is Notion-level. A shared project should look like a polished public document (working surface, project map, chapters-to-scenes, etc. per brand guide visual direction), not a CRM export. Align with Inkprint design system.
- **Phase 4: Clone-as-template action.** One user's public project becomes N new user acquisitions. Design the clone flow carefully; preserve structure, clear personal data. Show "X people cloned this template."
- **Phase 5: Discovery surface.** A public gallery at `/gallery` or `/showcase`, filterable by creator type (book projects, YouTube productions, podcast plans, newsletter pipelines, launch plans). Seed with 10–20 of DJ's own public projects that are genuinely useful to read.
- **Phase 6: Social layer (only after gallery has critical mass).** Likes/comments/follows come LATER. Empty social layers actively hurt the product.

**URL structure.** Current `/p/{slug}` is fine for V1. When Phase 5 ships, consider `/@username/project-name` or `/u/username/project-name` for better memorability and personal-brand compounding. This is a migration, not a V1 blocker.

**Collaboration-framed sharing.** "Here's my book outline — tell me what I'm missing" is a much stronger share driver than "Look at my project." Design Phase 1 publish CTAs around feedback-seeking, not vanity.

**The specific angle nobody else can touch:** Public "here's how I'm actually building this book / video series / podcast season" pages from creators, sharing real project structures with commentary on why this thinking environment fits their workflow. This content literally doesn't exist at scale on the internet right now. Highly personal, highly specific, highly cite-able, highly share-able. ADHD/neurodivergent creators adding their own lens on top is a supporting affinity wedge — valid and welcome, just not the main frame.

#### 3.2 Marketing Site Technical Foundations

**[STATUS: Mostly done. Audit for gaps, don't rebuild from scratch.]**

Already shipped:

- Shared `SEOHead` component with title, description, canonical, og:, twitter:, robots control
- `BlogPosting` + `BreadcrumbList` schema on blog posts
- `Blog` schema on blog index
- `Product` schema on `/pricing`
- `Organization` schema on `/about` and root layout
- `robots.txt` with explicit rules for GPTBot, ClaudeBot, OAI-SearchBot
- `sitemap.xml` with 48 URLs and current `lastmod` dates
- `llms.txt` with full site map
- `datePublished` / `dateModified` sourced from blog frontmatter

Gaps to close (P1, one afternoon of work):

- Add `SoftwareApplication` schema to homepage `/+page.svelte`
- Add `FAQPage` schema to `/help` (and wherever FAQ content lives)
- Keep `dateModified` accurate when blog content is updated (not just initial publish)
- Audit Core Web Vitals / Lighthouse on marketing pages — no tooling currently configured

#### 3.3 Dedicated `/how-it-works` Page

**[STATUS: Exists as a blog post (`/blogs/getting-started/how-buildos-works`), not a dedicated route. Recommend promoting to a first-class page.]**

Most SaaS sites hide how their product actually works behind hero copy. Be the exception. Write a page — in plain language, per brand guide — that explains:

- The capture surface: rough note / voice memo / scattered bullets → structured project
- The working map: how chapters connect to scenes, episodes connect to research and clips, plans connect to tasks and milestones
- Project memory: how context stays attached so you don't start from zero each session
- Calendar integration mechanics
- Daily brief generation

Use "ontology" sparingly and only in deeper sections — not hero copy. Lead with the workflow, then explain the idea.

Why this matters: LLMs cite this kind of content heavily because it has named entities and concrete mechanics and no other source explains it. It's also the kind of transparency that builds trust with creators who've been burned by opaque AI tools.

#### 3.4 Public Comparison Pages

**[STATUS: Partial. Three comparison blog posts exist (`buildos-vs-notion-adhd-minds`, `buildos-vs-chatgpt-context-that-compounds`, `buildos-vs-monday-thought-organization`). Missing: dedicated hub and creator-framed comparisons.]**

Rename / reframe the Notion-vs piece to drop "ADHD minds" from the slug/frame (or keep as a supporting sub-piece). Add creator-framed comparisons:

- BuildOS vs Notion for authors writing books
- BuildOS vs Notion for YouTubers running series
- BuildOS vs Scrivener for long-form fiction
- BuildOS vs Milanote / Workflowy for creative thinking
- BuildOS vs NotebookLM for research-heavy creators
- BuildOS vs ChatGPT for creators tired of stateless chat (already exists — refresh)
- BuildOS vs Motion / Reclaim (keep for founder-creator overlap)

Rules: include real weaknesses of BuildOS. Don't strawman competitors. These pages punch above their weight in LLM citations because models need comparison data to answer comparison questions, and almost nobody writes honest ones.

Add a `/compare` or `/alternatives` hub page that indexes all comparisons with JSON-LD `ItemList` schema.

#### 3.5 The Project Structure as a Standalone Document

**[STATUS: Missing. The ontology/structure model only lives in code (`onto_*` tables, server code). This is the biggest content gap.]**

BuildOS's project structure model is the intellectual moat. Write it up as a standalone document — but frame it for creators, not as internal jargon.

Working title: **"How BuildOS Holds a Complex Project Together: The Thinking-Environment Framework."**

Not: "The 9-Dimensional Ontology." Not: "USMC 5-Paragraph Order for ADHD Founders." Those frames were tried and discarded. The DJ-USMC backstory can appear as a one-paragraph origin note inside the piece, not as the headline.

Publish as:

- A long-form post on build-os.com (Article schema, accurate `dateModified`)
- A Medium / Substack cross-post
- A post to r/writing and r/ProductManagement (following Reddit rules in Part 4)
- A lightweight companion page at `/how-buildos-thinks` or similar

This is content no LLM has seen elsewhere. The moment anyone asks a model about thinking environments, project memory, or how creators structure long-running work, we get cited. P1 writing task.

#### 3.6 Public Changelog

**[STATUS: Missing. No `/changelog` route.]**

Not marketing blog posts — a raw, dated "what shipped this week" list at `buildos.com/changelog`. Freshness signal for LLMs, trust signal for developer-adjacent users, search-indexable, build-in-public energy without the Twitter tax. Linear, Vercel, and Resend do this well — study their formats.

Can be driven by git commits on `main` + a light editorial pass. The `compound-engineering:changelog` skill is already installed in this repo — use it.

#### 3.7 README Overhaul (Public Repo)

**[STATUS: Untouched. Current README covers monorepo structure, tech stack, deployment — no product positioning, no thinking-environment framing, no screenshots, no concrete examples.]**

The GitHub repo is public. The README is a permanent, crawlable, LLM-weighted document. Rewrite it as:

- Clear category line ("a thinking environment for people making complex things") and core promise
- Who this is for (creators, builders, anyone living inside long multi-step work)
- Concrete before/after: raw brain dump input → structured project output
- Screenshots with descriptive alt text (working surface, project map, one current focus area)
- Architecture diagram (Mermaid is fine)
- Tech stack with versions
- Links to `/how-it-works`, the thinking-environment framework doc, and the marketing strategy

This gets cited by LLMs when people ask "how do thinking environments / creator project tools work."

#### 3.8 Integration Marketplace Listings

**[STATUS: Untouched. Low-effort, high-leverage.]**

BuildOS integrates with Google Calendar, Twilio, various AI APIs (OpenRouter, Anthropic, OpenAI, Moonshot). Each of those ecosystems has a marketplace or "works with" directory. Being listed is free, tedious, and almost nobody does it.

Tasks:

- Inventory every integration BuildOS has today (start with `packages/` and env var list in `.env.example`)
- For each, find the partner's marketplace / directory / "built on" page
- Submit listings with creator-framed copy, screenshots, and links

### Research Tasks for the Agent

Before building, research and produce a brief on each:

1. **End-user publish UX audit.** The backend scaffold is ~70% built; what end-user UI exists today in components? Where would the publish toggle live in the current UX? Inventory existing entry points (project page, document modal) and sketch the minimum publish flow.
2. **Top 20 creator + productivity subreddits** ranked by (active daily users × promotional-tolerance score). Creator-first list (r/writing, r/selfpublish, r/youtubers, r/NewTubers, r/podcasting, r/Substack, r/contentcreation, r/creators, r/worldbuilding for fiction, r/screenwriting, r/solopreneur for creator-founders); cross-cutting (r/productivity, r/getdisciplined, r/ObsidianMD, r/Notion for displaced users). Include each sub's rules verbatim.
3. **Competitor public-page strategies.** How do Notion, Linear, Coda, Craft, Obsidian Publish, Figma Community, Scrivener's community handle public sharing? What makes theirs work? Screenshot and annotate.
4. **LLM citation baseline.** Ask ChatGPT, Claude, and Perplexity the following prompts and record which brands get mentioned, in what position, with what framing. Re-run monthly to track progress:
    - "What's a good thinking environment for writing a book?"
    - "What tool helps me turn messy notes into a structured project?"
    - "Best productivity tool for YouTubers planning a series?"
    - "Alternative to Notion for long-running creative work?"
    - "How do I keep context across sessions when I'm making a complex thing?"
    - (Supporting affinity, run separately) "What's a project management tool that works with ADHD?"
5. **Schema markup gap check.** Homepage lacks `SoftwareApplication`; `/help` lacks `FAQPage`. Confirm and draft the missing JSON-LD blocks.
6. **Domain-level GEO baseline.** Current ranking for "BuildOS" branded queries, current citation rate in AI answers, current state of Wikipedia / Wikidata entity (we likely have none; creating one is a lever).

### Explicit Non-Goals

- Don't build a tool for measuring GEO visibility. Manual querying is sufficient at this stage.
- Don't pursue traditional SEO tactics (keyword-stuffed blog posts, link building schemes, programmatic SEO pages). This is the trap.
- Don't build a public social feed / likes / comments before there are public pages worth following.
- Don't buy GEO tooling until we have our own measurement workflow and know what gap a tool would fill.
- Don't reframe BuildOS as an ADHD tool or an AI productivity tool in any public-facing surface. ADHD is a supporting affinity wedge only. See brand guide.

---

## Part 4: Reddit Strategy for BuildOS

Reddit is the single highest-ROI non-product distribution channel for BuildOS in 2026. Three reasons:

- Reddit appears in ~97% of product-review Google queries (dual SEO visibility)
- Reddit is a top training data source for LLMs (citation visibility)
- Creator-focused subreddits are where our primary audience (authors, YouTubers, podcasters) actually works out loud

The 90/10 rule is non-negotiable: **90% value contribution, 10% subtle promotion.** Violate this and get banned in under a month — this happens to 80%+ of SaaS companies attempting Reddit.

### 🔎 Research + execution surfaces (completed 2026-04-17)

Research Task 1 (subreddit inventory) is complete. Three operational docs drive daily Reddit work:

| Surface                                                                                           | Role                                                                                                              |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **[reddit-subreddit-tracker.md](docs/marketing/social-media/reddit/reddit-subreddit-tracker.md)** | Master tracker: all 19 target subs, cadence, last-visited, recurring threads, cultural canaries, AI-hard-ban list |
| **[subreddit-profiles/INDEX.md](docs/marketing/social-media/reddit/subreddit-profiles/INDEX.md)** | Per-sub profile database: rules verbatim, culture signal, thread types, voice notes, karma-building plans         |
| **[/reddit-warmup command](.claude/commands/reddit-warmup.md)**                                   | Daily discovery pass — JSON-API-driven scoring, opens Chrome at top threads, updates tracker                      |

### Reddit Playbook (Concrete)

**Account hygiene.**

- Use a real-sounding username, not `buildos_founder` or anything branded.
- Build karma for 3+ months before posting anything promotional. Comments only during this period.
- Target ~500 comment karma in relevant subs before first post.
- Always disclose founder relationship when mentioning BuildOS. Transparency is protective — getting caught being stealthy is the fast track to a ban.
- Several target subs have **AutoMod karma/age gates** (r/podcasting: 5 karma + 7-day account; r/getdisciplined: 200 karma + 30-day account to post). Per-sub gates are in each profile file.

**Target subreddits (19 total — updated 2026-04-17 from research).**

_Tier 1 — Primary Creator Subs · Authors (high-fit):_

- r/writing — 3.36M subs, strict, **Sunday Tool thread = only sanctioned surface**
- r/selfpublish — 241K, strict, Weekly Self-Promo thread only
- r/worldbuilding — 1.88M, moderate, "my lore keeps contradicting itself" = exact BuildOS thesis
- r/screenwriting — 1.76M, strict, **culturally hostile to outsider software** — medium fit only

_Tier 1 — Primary Creator Subs · YouTubers:_

- ~~r/YouTubers~~ — **sub is currently CLOSED for renovations; de-prioritize until reopened**
- r/NewTubers — 668K, strict, has **formal mod-approval path for product posts** (highest-EV Reddit negotiation route)
- r/VideoEditing — 505K, strict-but-structured, **Monthly Developer/Tool creator thread** = sanctioned surface

_Tier 2 — Secondary creators:_

- r/podcasting — 180K, strict, **Wednesday 7am ET Product or Service thread** = sanctioned surface (Rule 11 permabans market research)
- r/Substack — 47K, moderate, "writing isn't the actual problem" thesis threads
- r/Newsletters (plural — _the spec's `r/Newsletter` singular is not the active sub_) — 12K, moderate, low-but-relevant
- r/contentcreation — 23K, moderate, "AI creative stack" threads are our fit
- r/creators — 7K, moderate, Rule 2 "self-promo must be earned" is permissive
- r/solopreneur — 60K, moderate, **DJ's native peer group + BuildOS-thesis threads recur**

_Tier 3 — Cross-cutting (productivity / tool-switchers):_

- r/productivity — 4.17M, strict, **Rule 2 bans even asked-for recommendations — karma-farm only**
- r/getdisciplined — 2.14M, strict, Rule 4 permabans link-posting; 200-karma + 30-day post gate
- r/Notion — 453K, strict, **fortnightly (not weekly) Self-promo & Showcase thread**; migration threads are our sweet spot
- r/ObsidianMD — 310K, strict, switching-cost-locked audience — only useful with genuine Obsidian-user cred

_Tier 4 — Supporting affinity (participate authentically; never lead with BuildOS):_

- r/ADHD — 2.21M, **Rule 8 absolute permaban on any promotion — comment-only, never mention product**
- r/ExperiencedDevs — 382K, 3+ YOE gate, BuildOS off-topic but DJ can engage as senior engineer

**Comment targets (the gold):**

- "What tool do you use for [drafting / outlining / organizing research / tracking scenes]?" threads → honest mention with one specific creator use case and founder disclosure — **only in that sub's sanctioned surface** (each profile lists it).
- "I can't stick with any productivity tool" / "my system broke" threads → empathetic response, lived experience first. Mention BuildOS only if the asker's described problem matches, and only in a sanctioned surface.
- "Alternative to [Notion / Scrivener / Final Draft] that doesn't lean into AI" → **our positioning sweet spot**, but mention surface constraints apply (e.g. r/Notion fortnightly thread only).
- "Does anyone else find it 10x easier to 'explain' out loud than write it down?" (r/NewTubers pattern) → literal voice-first thesis thread.
- "My lore keeps contradicting itself until I changed how I organize everything" (r/worldbuilding pattern) → literal continuity thesis.

**Post targets (after karma built):**

- "I built a thinking environment for long-running creative projects — here's the framework" — target r/solopreneur (case-study format, sidebar-sanctioned) first, r/worldbuilding (Rule 7 allows non-disruptive ads with context) second, r/NewTubers via the mod-approval path third.
- "How I structure a multi-month project without losing context between sessions" — r/Substack self-promotion-flair post; r/solopreneur case study.
- "Show HN / Show r/SaaS: BuildOS — thinking environment for people making complex things" with honest limitations and open asks for feedback.

**Sanctioned surfaces with cadence (the only places to mention BuildOS):**

| Sub             | Thread                                              | Cadence        |
| --------------- | --------------------------------------------------- | -------------- |
| r/writing       | Sunday Writing Tools, Software, and Hardware        | weekly         |
| r/selfpublish   | Weekly Self-Promo and Chat Thread                   | weekly         |
| r/NewTubers     | Feedback Friday / mod-approval path for posts       | weekly + gated |
| r/VideoEditing  | Monthly Developer/Tool creator thread               | monthly        |
| r/podcasting    | Wednesday 7am ET Product or Service thread          | weekly         |
| r/Substack      | Self-promotion-flaired text posts                   | on demand      |
| r/Newsletters   | Weekly pinned self-promo thread                     | weekly         |
| r/Notion        | **Fortnightly** Self-promo & Showcase thread        | bi-weekly      |
| r/worldbuilding | Non-disruptive ads with context (Rule 7 allows)     | on demand      |
| r/solopreneur   | IAmA / Q&A / case-study format (sidebar-sanctioned) | on demand      |

**AI-framing hard-ban subs** — never lead with "AI" in these. Workflow / thinking-environment / project-home framing only:

- r/writing (Rule 4 calls generative AI "slop")
- r/selfpublish (Rule 2 will ban AI-written posts)
- r/worldbuilding (Rule 5 bans "using AI to organize, edit, present, or rewrite")
- r/screenwriting (Rule 3 bans AI content and discussion)
- r/NewTubers (Rule 5 treats AI-written posts as spam)
- r/productivity (sidebar: "no LLM generation of any kind")
- r/getdisciplined (Rule 5)
- r/ObsidianMD (Rule 4: "vibe-coded or otherwise" = ban)

**Cultural canaries** — high-upvote mod/community posts that draw anti-promo lines. Read the tracker's `Cultural canaries (read before commenting)` section before any engagement. Representative examples:

- r/ObsidianMD: "If your first post is to promote your app, you will be banned" (1,360↑)
- r/productivity: "NO ADVERTISING IS ALLOWED OF ANY KIND" pinned mod post (239↑)
- r/screenwriting: "Please stop submitting your vibe-coded software" (111↑)
- r/worldbuilding: top 2 of week both anti-AI (3,801↑ + 3,766↑)

**Own our subreddit.** Create r/buildos before anyone else does. Low effort, prevents squatting, gives users a home, gets indexed by Google. (Task T11.)

**The 1Password model.** Treat Reddit as a core support + retention channel, not just acquisition. Answer user questions in public. Reduces support ticket volume while building a self-sustaining community. This is the long-term move.

### Reddit Research Tasks for the Agent

1. ~~For each target subreddit, pull: subscriber count, daily active estimate, self-promotion rules (verbatim), and 3–5 recent threads where BuildOS would be a legitimate recommendation.~~ **✅ Completed 2026-04-17** — see tracker + profiles.
2. Identify the 10 highest-value evergreen threads currently ranking on Google for our target queries. These are threads where a well-placed comment has maximum long-term leverage. (T4 evergreen inventory — seed list lives in the tracker's "Evergreen thread patterns" section.)
3. Draft comment templates for the 5 most common thread types — templates to be humanized per-instance, never copy-pasted. Voice per brand guide: grounded, clear, relieving, slightly contrarian, no AI hype. **Do this after the first month of manual commenting** — we need real voice data before codifying templates. Output: `docs/marketing/social-media/reddit/reddit-reply-strategy.md` (will unlock the `/reddit-reply` Stage 2 command).
4. Identify 3–5 creator-adjacent redditors (authors, YouTubers, podcasters) already active in target subs who would be potential collaborators, early users, or friendly faces. Surface candidates during `/reddit-warmup` runs and log them in the tracker's "Creator-adjacent high-value redditors" section.

---

## Part 5: Content Strategy (One Deep Piece Per Quarter)

Stop writing weekly blog posts. Write one genuinely excellent 2,500–4,000 word piece per quarter. Each piece:

- Has original observations (data from BuildOS users, frameworks we developed, creator workflow patterns we see)
- Includes specific numerical claims wherever possible ("out of X users we observed, Y% exhibited Z pattern")
- Uses question-based headers ("What happens when a writer's draft lives in six different places?")
- Has JSON-LD `Article` schema with accurate `dateModified`
- Is promoted once on Reddit (following rules), once on X, once on LinkedIn, once in a relevant newsletter
- Has a shareable public BuildOS page as a companion artifact (link back to canonical blog)

**Candidate topics (ranked):**

1. **The BuildOS thinking-environment framework** (see 3.5). The flagship piece. Creator-framed, not ADHD-framed.
2. **"How authors and YouTubers actually structure long-running creative projects — a pattern study."** Pull from real user data; specific numerical claims; show the working maps.
3. **"Why AI chat assistants keep failing creative workflows: the stateless-context problem."** Directly advances the anti-AI show-don't-tell thesis.
4. **"The creator-workflow gap: what breaks between the idea and the shipped thing."** High fan-out potential across every creator sub.

Supporting affinity content (ADHD, founders, indie builders) can live in blog or social, but **not as the flagship piece.**

### Part 5.5: Parallel cluster play — the Anti-Feed content loop

On top of the quarterly flagship, there's a **parallel cluster track** running at a tighter cadence — 10 posts in ~3 months at 7–10-day intervals. The goal is different: language / niche ownership, not intellectual-moat depth.

- **Canonical topic map:** [`docs/marketing/strategy/anti-feed-content-topic-map.md`](docs/marketing/strategy/anti-feed-content-topic-map.md)
- **Execution:** [WS09 — Anti-Feed Content Cluster](docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md) (T34–T45 in `buildos-strat-tasks.md`)
- **Cadence:** [RECURRING §Anti-feed publishing cadence](docs/marketing/distribution/RECURRING.md#anti-feed-publishing-cadence-t44)
- **First post shipped:** [`social-media-is-dead-interest-media.md`](apps/web/src/content/blogs/philosophy/social-media-is-dead-interest-media.md) (2026-04-17, T34)
- **Cluster opener (adjacent):** [`your-morning-without-the-algorithm.md`](apps/web/src/content/blogs/philosophy/your-morning-without-the-algorithm.md)

**Boundary with the flagship (WS04):** the quarterly piece is research-heavy, 2,500–4,000 words, canonical across Medium + Substack. The cluster posts are 1,200–2,000 words, opinionated, vocabulary-forward, build-os.com primary. The cluster should land 2–3 posts before the flagship publishes (T35, T36 or its T15-satisfied equivalent, and T38) so the flagship compresses vocabulary the reader already recognizes.

**Vocabulary to own:** "thinking environment," "anti-feed," "interest media," "chosen input," "direction of the arrow," "synthetic public internet," "context sovereignty" — see topic map §Terms to own.

---

## Part 6: Measurement

### What to Track Monthly

- **LLM citations:** Run the baseline prompts (section 3 research task 4) against ChatGPT, Claude, Perplexity. Record whether BuildOS appears, in what position, with what framing, and whether the framing matches our positioning (thinking environment for creators) or drifts (ADHD, AI productivity, etc.). This is our primary success metric.
- **Reddit mentions:** Use Google with `site:reddit.com buildos` and a simple Reddit search. Track count of independent mentions (not ours), sentiment, whether they convert.
- **Public pages created + shared:** Once Phase 1 ships. From internal analytics. Track growth rate + which creator types publish most.
- **"Made with BuildOS" backlinks:** Via Ahrefs or Google Search Console.
- **GitHub stars, README views, fork rate:** Proxies for developer-adjacent interest.

### What Not to Track

- Page rank for specific keywords (the wrong game)
- Blog traffic in isolation (vanity metric without conversion context)
- Social media follower counts (vanity)

---

## Part 7: Execution Sequencing

Adjusted to reflect what's already shipped vs. what needs work.

**First 30 days (foundations + measurement baseline):**

- Research tasks in section 3 (all of them)
- Add `SoftwareApplication` schema to homepage; `FAQPage` to `/help`
- LLM citation baseline measurement — establish the monthly cadence
- Reddit account hygiene + karma building begins (creator subs first)
- README overhaul (creator-framed, with thinking-environment language)
- Public pages Phase 1 scope locked (end-user publish UI)

**Days 30–90:**

- Public pages Phase 1 ships (end-user publish UI)
- Public pages Phase 2 ships ("Made with BuildOS" attribution verified on all public pages)
- Dedicated `/how-it-works` page published
- Thinking-environment framework doc published (section 3.5) — flagship content piece
- First refreshed comparison page published (creator-framed)
- Integration marketplace listings submitted
- 3+ months of Reddit karma accumulated

**Days 90–180:**

- Public pages Phase 3 (visual design audit) + Phase 4 (clone-as-template)
- Public changelog live at `/changelog`
- First quarterly deep piece published (beyond the framework doc)
- Reddit posts begin (after karma threshold hit), creator subs first
- Wikipedia / Wikidata entity created

**Days 180+:**

- Public pages Phase 5 (discovery gallery, seeded with DJ's projects)
- Quarterly deep pieces continue
- Reddit presence sustained
- Measure, iterate, double down on what's working
- Revisit `/@username/project-name` URL migration

---

## Closing Note for the Agent

BuildOS is competing in a category where the incumbents (Notion, Linear, Asana) have 100x our marketing budget and decade-long domain authority. We cannot out-spend or out-SEO them. We can out-position and out-cite them by being the tool that's specifically, visibly, provably a **thinking environment for people making complex things** — and by ensuring that specificity enters every trust network we care about (LLMs, Reddit, GitHub, integration marketplaces, our own users' public pages).

The meta-principle: **every distribution move should simultaneously serve multiple channels.** A good public page is SEO + LLM citation + social share + user acquisition + product showcase in one artifact. Optimize for multi-channel leverage, not single-channel wins.

When in doubt, bias toward: honesty over polish, specificity over breadth, permanence over recency, helping over selling, and creator-framed over jargon-framed.
