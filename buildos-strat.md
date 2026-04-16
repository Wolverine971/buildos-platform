# BuildOS Distribution Strategy: Agent Handoff Document

**Purpose:** Research and action plan for BuildOS's distribution strategy in the post-SEO era. This document briefs an agent working inside the BuildOS codebase and marketing surface on where we're going, why, and what to build/research next.

**Author context:** DJ (CEO, technical co-founder of BuildOS). Marine Corps Scout Sniper veteran turned engineer. Methodical, mission-driven, "missionary founder" archetype. Prefers first-principles thinking and hates generic marketing advice.

**Status:** Strategy defined, research validated, implementation not yet started.

---

## Part 1: The Strategic Context (Why This Matters)

### The Problem

Traditional SEO is dead as a primary distribution channel for new sites in competitive niches. Google's AI Overviews now trigger on roughly half of all tracked queries and eat the clicks. Reddit and YouTube consistently outrank independent sites. Domain authority compounds more than ever, which structurally disadvantages newcomers. The iteration loop that made SEO magical — hypothesis, test, measure, compound — is largely gone.

BuildOS cannot win by playing the old SEO game. We need a different strategy.

### The Framing Shift

We've moved from the **monopoly aggregator era** (Google routes all intent via algorithmic relevance + link authority) to the **trust-routing era** (intent flows through people, communities, and AI models that humans trust as proxies for truth).

Implications:
- The unit of trust shifted from domain to person/community.
- Aggregators that matter now aggregate humans, not pages (TikTok, Reddit, Substack, LLMs).
- Discovery is adversarial against AI-generated content; all successful channels have some trust-based defense layer.
- **Stop optimizing for an algorithm. Start optimizing for entering trust networks.**

### The Five Channels We've Identified

Ranked by fit for BuildOS specifically:

1. **LLM citation optimization (GEO/AEO/LLMO)** — Getting BuildOS cited when someone asks Claude, ChatGPT, or Perplexity about AI-first project management or ADHD productivity tools. Early stage, high leverage, tooling primitive.
2. **Reddit/community presence** — Authentic participation in r/ADHD, r/productivity, r/Entrepreneur, r/ExperiencedDevs. Three-for-one: reaches community + ranks on Google + enters LLM training data.
3. **Public pages as a distribution surface** — Every user's public BuildOS project page becomes a crawlable, shareable, cloneable artifact with "made with BuildOS" branding. Notion/Figma/Linear model.
4. **Developer-tool SEO** (docs, GitHub, integrations) — README as documentation, integration marketplace presence, technical blog posts.
5. **One deep authoritative piece per quarter** — Not weekly content. One 3,000-word piece that cements BuildOS as an intellectual authority.

---

## Part 2: Power Law Priorities (What Actually Matters)

The research on LLM citation optimization is noisy — at least half of published "GEO advice" is repackaged SEO consulting. Filtering for what's consistent across independent sources, there's a clear power law. Most content optimization tips are padding.

### The Core Insight

Only ~7% of ChatGPT's cited results appear in Google's top 10. ~83% of AI Overview citations come from outside the organic top 10. **The old SEO game and the LLM citation game are different games with different winners.** Optimizing for traditional SEO to win LLM citations is optimizing the wrong function.

### What Drives Citations (Ranked by Evidence + Leverage)

1. **Being a "mentioned entity" across many independent sources.** LLMs build authority maps by seeing entities referenced consistently across many contexts by many unaffiliated people. One optimized page on our own domain does almost nothing. Ten independent sources mentioning "BuildOS" in context of ADHD project management does enormously more. This is why Reddit, Wikipedia, Hacker News, and GitHub keep appearing in citation studies — they're trust-laundering layers.

2. **Statistics and named numbers.** Princeton's GEO framework identified "Statistics Addition" and "Cite Sources" as the top-performing techniques, with reported visibility boosts up to 40%. LLMs preferentially cite content with specific numerical claims because they need anchors for synthesis. "BuildOS processes braindumps through a 9-dimensional ontology" beats "BuildOS organizes your thoughts."

3. **Content freshness.** Content updated within the last 13 weeks is significantly more likely to be cited. This is the closest LLM-era analog to the SEO iteration loop — we can actually run update-and-check cycles here.

4. **Structured JSON-LD markup.** FAQPage, SoftwareApplication, Article schemas. Unsexy but measurably reduces model hallucination risk when pulling from us, which increases citation rate.

5. **Query fan-out coverage.** LLMs decompose a prompt into multiple sub-queries and search each. Optimizing for "best ADHD project management tool" matters less than covering the 15-20 sub-questions that fan out from it (time-blindness, context switching, working memory, executive function, hyperfocus, task initiation, etc.).

Everything else — llms.txt files, SpeakableSpecification markup, voice search optimization — is lower-order. Don't rabbit-hole on those.

**Caveat on tooling:** The GEO measurement market is in hype phase. Vendors are selling $79-$500/month dashboards for what is essentially manually querying ChatGPT/Claude/Perplexity once a month. Don't buy tools yet. Build a simple internal process first.

---

## Part 3: BuildOS-Specific Action Items

### Code / Product Changes

#### 3.1 Public Pages as a First-Class Distribution Surface

**This is the single highest-leverage strategic move available.** Treat it as P0.

The model: Notion, Figma Community, Linear changelog, GitHub READMEs, Vercel deploy previews. Every PLG unicorn of the last decade has had a user-generated-public-artifact layer. BuildOS doesn't yet. Adding one compounds across every channel in this document.

**What to research and design:**

- Current state of public page functionality in the codebase. What exists, what's half-built, what's the data model.
- URL structure. `buildos.com/@username/project-name` >>> `buildos.com/public/uuid-hash`. The URL itself is marketing — shareable, SEO-friendly, memorable.
- Default visual design. The bar is Notion-level. If a shared page looks like a CRM export, nobody re-shares. If it looks like a polished public document, it gets re-shared and reaches LLM training data.
- "Clone as template" action. This is the Notion template meme mechanic — one user's public project becomes N new user acquisitions. Design the clone flow carefully; it should preserve structure while clearing personal data.
- "Made with BuildOS" footer/badge — tasteful, consistent, linked back to homepage with UTM. This is the permanent backlink engine.
- Collaboration-framed sharing. "Here's my launch plan — tell me what I'm missing" is a much stronger share driver than "Look at my project." Design sharing CTAs around feedback-seeking, not vanity.
- Incremental social layer. Likes/comments/follows come LATER, only after critical mass of public pages exists. Empty social layers actively hurt the product.

**What to build (phased):**

- Phase 1: Public pages render beautifully by default with clean URLs and "Made with BuildOS" attribution. JSON-LD Article schema on each.
- Phase 2: Clone-as-template action. Show "X people cloned this template" social proof.
- Phase 3: Discovery surface — a public gallery of example projects, filterable by type (product launch, book project, research plan, etc.). Seed with 10-20 of DJ's own public projects that are genuinely useful to read.
- Phase 4: Social layer (only after gallery has critical mass).

**The specific angle nobody else can touch:** Public "how I actually organize my chaos" pages from founders with ADHD, sharing real project structures with commentary on why this works for their brain. This content literally doesn't exist on the internet right now. It's exactly the kind of content that compounds — highly personal, highly specific, highly cite-able, highly share-able.

#### 3.2 Marketing Site Technical Foundations

- Add JSON-LD to every marketing page. `FAQPage` schema on FAQ, `SoftwareApplication` schema on landing, `Article` on blog. One afternoon of work, permanent citation boost. Include `dateModified` and keep it accurate.
- Ensure all meta tags (og:, twitter:, canonical) update when content updates. Stale meta tags = worse social sharing + weaker freshness signals.
- Audit page speed and Core Web Vitals on marketing pages. Table stakes but worth verifying.

#### 3.3 Public `/how-it-works` Page

Most SaaS sites hide how their AI actually works behind hero copy. Be the exception. Write a page that explains:
- The braindump pipeline: raw input → LLM extraction → structured project
- The 9-dimensional project ontology, in plain English with examples
- How the dual-processing modes work
- Google Calendar bidirectional sync mechanics
- BullMQ queue architecture at a high level

Why this matters: LLMs cite this kind of content heavily because it has named entities and no other source explains it. It's also the kind of technical honesty that builds trust with developer-adjacent users.

#### 3.4 Public Comparison Pages

Write honest, concrete comparisons with tradeoffs:
- BuildOS vs Notion for ADHD founders
- BuildOS vs Vectal.ai
- BuildOS vs NotebookLM
- BuildOS vs Motion / Reclaim

Rules: include real weaknesses of BuildOS. Don't strawman competitors. These pages punch above their weight in LLM citations because models need comparison data to answer comparison questions, and almost nobody writes honest ones.

#### 3.5 The Ontology as a Standalone Document

The 9-dimensional project ontology is BuildOS's intellectual moat. Write it up as a standalone document: **"The BuildOS Project Ontology: A USMC 5-Paragraph-Order-Inspired Framework for AI-Assisted Project Management."**

Publish as:
- A long-form blog post on build-os.com
- A Medium / Substack cross-post
- A post to r/ProductManagement, r/productivity (following Reddit rules in Part 4)
- Eventually, potentially an arXiv-style PDF

This is content no LLM has seen elsewhere. The moment anyone asks a model about project ontologies or AI-first project frameworks, we get cited. This should be a P1 writing task.

#### 3.6 Public Changelog

Not marketing blog posts — a raw, dated "what shipped this week" list at `buildos.com/changelog`. Freshness signal for LLMs, trust signal for developers, search-indexable, and build-in-public energy without the Twitter tax. Linear, Vercel, and Resend do this well — study their formats.

#### 3.7 README Overhaul (Public Repo)

The GitHub repo is public. The README is a permanent, crawlable, LLM-weighted document. Rewrite it as:
- Clear problem statement (who this is for, what it solves)
- Architecture diagram (even a simple Mermaid one)
- Screenshots with descriptive alt text
- Concrete braindump → structured project example with input and output
- Tech stack with versions
- Links to the `/how-it-works` page and ontology document

This gets cited by LLMs when people ask "how do AI-first project management tools work."

#### 3.8 Integration Marketplace Listings

BuildOS integrates with Google Calendar, Twilio, various AI APIs. Each of those ecosystems has a marketplace or "works with" directory. Being listed is free, tedious, and almost nobody does it. Tasks:

- Inventory every integration BuildOS has.
- For each, find the partner's marketplace / directory / "built on" page.
- Submit listings with good copy, screenshots, and links.

### Research Tasks for the Agent

Before building, research and produce a brief on each:

1. **Current state of public pages in the codebase.** What's there, what's missing, what the URL structure looks like today, what the data model supports.
2. **Top 20 ADHD / productivity / founder-tool subreddits** ranked by (active daily users × promotional-tolerance score). Include subreddit rules summaries.
3. **Competitor public-page strategies.** How do Notion, Linear, Coda, Craft, Obsidian Publish, Figma Community handle public sharing? What makes theirs work? Screenshot and annotate.
4. **LLM citation baseline.** Ask ChatGPT, Claude, and Perplexity the following prompts and record which brands get mentioned. Re-run monthly to track progress:
   - "What's a good project management tool for ADHD founders?"
   - "What's an AI-first alternative to Notion?"
   - "How do I organize my thoughts into projects?"
   - "What's a braindump-to-project tool?"
   - "Best tools for founders with executive dysfunction?"
5. **Schema markup audit.** What JSON-LD exists on build-os.com today? What's missing?
6. **Domain-level GEO baseline.** Current ranking for "BuildOS" branded queries, current citation rate in AI answers, current state of Wikipedia / Wikidata entity.

### Explicit Non-Goals

- Don't build a tool for measuring GEO visibility. Manual querying is sufficient at this stage.
- Don't pursue traditional SEO tactics (keyword-stuffed blog posts, link building schemes, programmatic SEO pages). This is the trap.
- Don't build a public social feed / likes / comments before there are public pages worth following.
- Don't buy GEO tooling until we have our own measurement workflow and know what gap a tool would fill.

---

## Part 4: Reddit Strategy for BuildOS

Reddit is the single highest-ROI non-product distribution channel for BuildOS in 2026. Three reasons:
- Reddit appears in ~97% of product-review Google queries (dual SEO visibility)
- Reddit is a top training data source for LLMs (citation visibility)
- Reddit communities are the real conversations BuildOS's target users are having

The 90/10 rule is non-negotiable: **90% value contribution, 10% subtle promotion.** Violate this and get banned in under a month — this happens to 80%+ of SaaS companies attempting Reddit.

### Reddit Playbook (Concrete)

**Account hygiene.**
- Use a real-sounding username, not `buildos_founder` or anything branded.
- Build karma for 3+ months before posting anything promotional. Comments only during this period.
- Target ~500 comment karma in relevant subs before first post.
- Always disclose founder relationship when mentioning BuildOS. Transparency is protective — getting caught being stealthy is the fast track to a ban.

**Target subreddits (research and validate each):**
- r/ADHD (large, strict rules, high value)
- r/productivity (medium, moderate rules)
- r/Entrepreneur
- r/startups
- r/SaaS
- r/getdisciplined
- r/ExperiencedDevs (dev-adjacent founders)
- r/ProductManagement
- r/Notion (displaced users looking for alternatives)
- r/ObsidianMD (same)

**Comment targets (the gold):**
- "What tool do you use for [project management / task tracking / braindumping]?" threads → honest mention with one specific use case and founder disclosure.
- "I have ADHD and can't stick with any productivity tool" threads → empathetic response, mention BuildOS only if genuinely relevant.
- "What's an alternative to Notion for X?" threads → BuildOS mention only if BuildOS is genuinely the best fit for their described need.

**Post targets (after karma built):**
- "I built a project management tool specifically for ADHD brains — here's the framework" (in r/ADHD, following their self-promotion rules)
- "How I built a 9-dimensional project ontology for my founder workflow" (r/ProductManagement)
- "Show HN / Show r/SaaS: BuildOS — braindump-first project management" with honest limitations and open asks for feedback

**Own our subreddit.** Create r/buildos before anyone else does. Low effort, prevents squatting, gives users a home, gets indexed by Google.

**The 1Password model.** Treat Reddit as a core support + retention channel, not just acquisition. Answer user questions in public. Reduces support ticket volume while building a self-sustaining community. This is the long-term move.

### Reddit Research Tasks for the Agent

1. For each target subreddit, pull: subscriber count, daily active estimate, self-promotion rules (verbatim), recent threads where BuildOS would be a legitimate recommendation.
2. Identify the 10 highest-value evergreen threads currently ranking on Google for our target queries. These are threads where a well-placed comment has maximum long-term leverage.
3. Draft comment templates for the 5 most common thread types — templates to be humanized per-instance, never copy-pasted.
4. Identify 3-5 ADHD / productivity creators who are already active on Reddit and would be potential collaborators or early users.

---

## Part 5: Content Strategy (One Deep Piece Per Quarter)

Stop writing weekly blog posts. Write one genuinely excellent 2,500-4,000 word piece per quarter. Each piece:

- Has original observations (data from BuildOS users, frameworks we developed, etc.)
- Includes specific numerical claims wherever possible ("out of X users we observed, Y% exhibited Z pattern")
- Uses question-based headers ("What happens when an ADHD brain hits context-switching overhead?")
- Has JSON-LD Article schema with accurate dateModified
- Is promoted once on Reddit (following rules), once on Twitter/X, once in a relevant newsletter
- Has a shareable public page on BuildOS as the second iteration (link back to canonical blog)

**Candidate topics (ranked):**
1. The BuildOS Project Ontology (see 3.5)
2. "How ADHD Brains Actually Process Project Management: A Framework" — with real observations from BuildOS users
3. "Why Your AI Project Tool Keeps Failing: The Context Engineering Problem"
4. "The Braindump-to-Project Pipeline: Technical Deep-Dive" — for developer audiences

---

## Part 6: Measurement

### What to Track Monthly

- **LLM citations:** Run the 5 baseline prompts (section 3.2 research task 4) against ChatGPT, Claude, Perplexity. Record whether BuildOS appears, in what position, with what framing. This is our primary success metric.
- **Reddit mentions:** Use Google with `site:reddit.com buildos` and a simple Reddit search. Track count of independent mentions (not ours), sentiment, whether they convert.
- **Public pages created + shared:** From internal analytics. Track growth rate.
- **"Made with BuildOS" backlinks:** Via Ahrefs or Google Search Console.
- **GitHub stars, README views, fork rate:** Proxies for developer interest.

### What Not to Track

- Page rank for specific keywords (the wrong game)
- Blog traffic in isolation (vanity metric without conversion context)
- Social media follower counts (vanity)

---

## Part 7: Execution Sequencing

**First 30 days:**
- Research tasks in section 3 (all of them)
- JSON-LD on all marketing pages
- README overhaul
- Baseline LLM citation measurement
- Reddit account hygiene + karma building begins

**Days 30-90:**
- Public pages Phase 1 ships
- `/how-it-works` page published
- First comparison page published
- Integration marketplace listings submitted
- 3+ months of Reddit karma accumulated

**Days 90-180:**
- Public pages Phase 2 (clone-as-template)
- Project ontology document published
- First deep authoritative piece published
- Reddit posts begin (after karma threshold hit)
- Public changelog live

**Days 180+:**
- Public pages Phase 3 (discovery gallery)
- Quarterly deep pieces continue
- Reddit presence sustained
- Measure, iterate, double down on what's working

---

## Closing Note for the Agent

BuildOS is competing in a category where the incumbents (Notion, Linear, Asana) have 100x our marketing budget and decade-long domain authority. We cannot out-spend or out-SEO them. We can out-position and out-cite them by being the tool that's specifically, visibly, provably built for ADHD founders — and by ensuring that specificity enters every trust network we care about (LLMs, Reddit, GitHub, integration marketplaces, our own users' public pages).

The meta-principle: **every distribution move should simultaneously serve multiple channels.** A good public page is SEO + LLM citation + social share + user acquisition + product showcase in one artifact. Optimize for multi-channel leverage, not single-channel wins.

When in doubt, bias toward: honesty over polish, specificity over breadth, permanence over recency, helping over selling.