---
title: Anti-Feed Blog Context (single source of truth)
created: 2026-04-27
status: active
owner: DJ Wayne
purpose: |
    The single context file consumed by the `draft-anti-feed-blog` skill.
    Everything the skill needs to produce a brand-true cluster blog lives here.
    Update this file in one place; the skill picks up the change next run.
consumed_by:
    - .claude/skills/draft-anti-feed-blog/SKILL.md
related_docs:
    - docs/marketing/brand/brand-guide-1-pager.md (canonical brand)
    - docs/marketing/strategy/anti-feed-content-topic-map.md (canonical topic map + ranked posts)
    - docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md (parent thesis)
    - docs/marketing/strategy/buildos-guerrilla-content-doctrine.md (execution playbook)
    - docs/marketing/social-media/FOUNDER_CONTEXT.md (DJ voice)
update_rule: |
    If the brand guide or topic map changes substantively, mirror the change here in the same commit.
    The annealing log section at the bottom is updated by the skill after each blog draft.
---

# Anti-Feed Blog Context

The consolidated brief the `draft-anti-feed-blog` skill reads on every run. Read this entire file before drafting. Do not reach across to other docs unless this file explicitly tells you to (e.g., to load the latest WS09 dashboard for ranked-post status).

---

## 1. Purpose

Produce a single ranked cluster blog post for the **anti-feed / thinking-environment** content cluster (WS09). Output goes to `apps/web/src/content/blogs/philosophy/{slug}.md`.

Each post:

- Lives inside a coordinated cluster — vocabulary compounds across posts
- Lands a specific T## from the ranked list (or a free topic, if user asks)
- Follows BuildOS brand voice with zero AI-hype language
- Cross-links to ≥2 prior cluster posts to compound topical authority
- Ships ready-to-publish (frontmatter + body + JSON-LD)

This skill does **not**:

- Build publish kits (Twitter/LinkedIn/IG/TikTok extractions) — that's the old `anti-feed` skill, menu option 2
- Generate standalone TikTok scripts — old `anti-feed` skill, menu option 3
- Write non-cluster blog posts (founder essays, product launches, changelog posts) — different voice, different mode
- Decide product positioning — the brand guide is the arbiter

---

## 2. The central thesis (memorize this)

> The public internet has become synthetic, and the scarcest resource is now the ability to choose what you think about — BuildOS is a thinking environment built around that scarcity.

This is the category-level frame the cluster is building. Every post should ladder back to this thesis somehow, even when the post's surface topic is felt-experience, manufactured virality, or product principles.

**The bet:** if the cluster compounds for 6–9 months, BuildOS becomes the first Google result for "thinking environment," "anti-feed," "chosen input," and "interest media." The founder becomes the cited voice on attention sovereignty outside the Cal Newport / Tristan Harris orbit.

---

## 3. Voice

### Core voice traits (from brand guide)

1. **Grounded** — speak from use, evidence, and lived frustration
2. **Clear** — concrete examples over abstract language
3. **Relieving** — the reader should feel less judged and more capable
4. **Contrarian** — challenge broken defaults, but with substance, not posture
5. **Systems-literate** — understand complex work without sounding like corporate software

### Voice principles

- Show the workflow, then explain the idea
- Plain language first
- Honest, specific claims
- Focus on progress and relief
- Don't over-narrate the technology

### What we are

- Calm but not sleepy
- Direct but not harsh
- Systems-minded but human
- Practical but not boring
- Slightly contrarian but not performative
- Honest about what works and what still needs work

### What we are not

- AI hype merchants
- Productivity guilt merchants
- Enterprise PM software in disguise
- Guru-branded self-optimization theater
- Abstract, jargon-heavy, or over-explained

### DJ-specific voice patterns (from founder context)

- **Interesting guy + cheerleader, not thought leader.** Lead with curiosity and lived examples, not "here's what most people get wrong."
- "We're all rowing the same boat" energy
- Comfortable with uncertainty — AI / context engineering is too new for definitive answers
- Hates inauthenticity, especially LinkedIn-thought-leader cadence
- Phrases DJ uses naturally: "brain dump," "context," "keep coming back to the same project," "build on" (previous work), "thought partner"
- Marines / Curri background = supporting color, never the headline

### Cluster-specific voice notes

- **Calm authority.** This cluster is naming things people feel but can't name. Don't shout. Name precisely.
- **Receipts-grounded contrarianism.** When you challenge a default ("most productivity tools are feeds in disguise"), back it with a specific example, not a vibe.
- **No "X is dead" framings unless you can show receipts.** "Social media is dead" worked because Devin Nash gave us 2.2B views / 69,000 clips / 1 streamer. That bar applies.

---

## 4. Category frame & terms to own

### Primary category line

**"Thinking environment for people making complex things."**

Use this verbatim or close to it. Do not substitute "AI productivity app," "AI assistant for founders," or any AI-leading variant.

### Core promise

**"Turn messy thinking into structured work."**

### Differentiator

**"The project remembers what matters."**

### Terms to own (cluster vocabulary — repeat consistently)

| Term | Usage rule |
| --- | --- |
| **thinking environment** | Use in every post at least once; the protagonist of the cluster |
| **anti-feed** | Use ≥3× per post; the cluster's signature term |
| **interest media** | Credit Devin Nash on first use per post; adopt liberally after |
| **chosen input** | Use whenever talking about morning routines, briefs, RSS, what someone reads |
| **direction of the arrow** | Metaphor for user-authored vs. platform-authored attention |
| **the quiet half of the internet** | Discord, Substack, podcasts, IRL — the migrating-to half |
| **algorithm-shaped thoughts** | The internalized shape of optimized content in your own head |
| **curiosity collapse** | When you stop wondering about things |
| **feed paranoia** | Quiet distrust of your own feed |
| **manufactured virality** | The antagonist term — always pair with an alternative |
| **synthetic public internet** | Forecast-ready language for the AI-content wave |
| **provable thinking** | Coined; receipts for real work |
| **context sovereignty** | Coined; ties to context-engineering positioning |

### Repetition rule

To own a term, you need ~5–10 published pieces using it consistently, linked to each other, indexed by Google, ideally cited back by one or two other voices. **Plan content in clusters, not one-offs.** Every post must use ≥1 term from this table 3–4 times.

### Terms to avoid at first contact

- Context infrastructure
- Ontology
- Agentic orchestration
- AI-powered productivity
- Multi-agent workflow layer
- Knowledge operating fabric

These can appear in proof-layer paragraphs deep in the post, not in hooks or category lines.

### Carefully (right context only)

- Builder operating system
- External brain
- Founder OS
- ADHD-friendly

---

## 5. Audience

### Lead with

1. **Authors** (long-form thinkers writing books, essays, Substacks)
2. **YouTubers** (educational / explainer / business creators with structured workflows)

### Expand to

- Podcasters
- Newsletter operators
- Course creators
- Founder-creators

### Supporting affinity (do not lead with)

- ADHD and scattered minds
- Founders
- Indie builders

### Audience rule for blog hooks

If the opening paragraph addresses "ADHD minds" or "scattered minds" or "indie hackers," **rewrite**. Lead the post for authors / YouTubers / makers and let ADHD/founders show up as recognition further down. The cluster is a creator wedge first.

### Why this audience

The cluster is naming a felt experience (algorithm-shaped thoughts, curiosity collapse, feed paranoia). Creators feel this most acutely because their *job* is producing chosen output. They have the most to lose from a synthetic public internet, and the most language to articulate the loss when someone names it for them.

---

## 6. Anti-patterns (auto-reject)

If any of these appear in the draft, revise before saving:

1. **Leading with AI in the hook.** Opening paragraph mentions AI, LLMs, agents, or "AI-powered." Rewrite. Lead with felt experience.
2. **Vocabulary drift.** Post doesn't use ≥1 term from the "terms to own" table 3+ times.
3. **Pitch creep.** BuildOS-related copy exceeds the post's role-based ceiling: ≤15% for vocabulary / positioning posts (T34, T36, T42, T43), ≤25% for anchoring / conversion-leaning posts (T35, T37, T38). If you're over the ceiling, either trim the BuildOS surface area or reclassify the post role and write a one-line note in the draft notes block.
4. **ADHD-era framing.** Hook addresses "ADHD minds" / "scattered brains" / "indie hackers" instead of authors/YouTubers/makers.
5. **Missing cross-links.** Fewer than 2 inline links to prior cluster posts.
6. **Hype words.** "Revolutionary," "game-changer," "unlock your potential," "transform your workflow," "10x your productivity." Strike all.
7. **AI-clichés.** "In today's fast-paced world," "It's no secret that," "More than ever," "Let's dive in," "Imagine if you could..." — strike on sight.
8. **Em-dash overuse.** AI-generated prose loves em dashes and tricolons. Use sparingly. Vary sentence shapes.
9. **Listicle structure where prose belongs.** If the body is mostly bulleted lists, reconsider — this cluster is essay-shaped, not "5 ways to..." shaped.
10. **Empty contrarianism.** "X is dead" without receipts. "Most people get this wrong" without naming who, where, why.
11. **Performative humility.** "I don't have all the answers, but..." Cut the throat-clear and start at the answer.
12. **Story-first, sell-never.** A felt-experience hook so calm it never establishes _why_ the reader should keep reading. The opener does not have to lead with stakes for vocabulary posts, but anchoring posts (T35, T37, T38) need a stakes-and-promise paragraph before the cold story open. If the opening 200 words don't tell a reader what they'll get and why now, revise. (Logged 2026-04-27 from T35 revision.)

### The em-dash test

If the post averages more than ~1 em dash per 100 words, revise. AI prose is em-dash-heavy; human prose mixes commas, periods, parentheticals, and the occasional em dash.

---

## 7. Show-don't-tell doctrine (parent thesis)

The cluster sits inside BuildOS's **anti-AI marketing strategy**. Not anti-AI product — anti-AI *as the headline*. The market has shifted from "AI can do everything" to "I don't want another AI app." Hype-heavy competitors lose trust first.

### Messaging principles

1. **Show, don't tell.** Brain dump → projects. Idea mess → next steps. Scattered tools → one working system. Not "AI-powered productivity."
2. **Replacement beats addition.** Users want fewer places to think, not another tab. "Move your chaotic workflow into one system" > "Add BuildOS to your workflow."
3. **Honest framing wins trust.** "You can keep waiting for the perfect tool, or you can start building context now." Not "this changes everything."
4. **Anti-AI marketing, not anti-AI product.** AI shows up explaining how the product works, never as the acquisition hook.
5. **Sell relief, not intelligence.** People want less chaos, less friction, fewer decisions, more momentum. The emotional outcome is **calmer execution**.

### Strategic enemy (what BuildOS stands against)

- Tool sprawl
- Stateless chat
- Blank-page chaos
- Productivity theater
- Disconnected creator workflows

---

## 8. Proof assets

What we can credibly draw on. Use these to ground claims; don't invent.

### DJ's lived experience

- Solo founder, started BuildOS ~May 2025, left Curri (YC-backed delivery logistics) March 2025
- Marine Corps 2012–2017 (infantry → scout sniper → MARSOC tryout). Use sparingly as background color
- Curri experience: built integrations layer (Uber, Lyft, DoorDash APIs), exception system, "API reverse engineering." Solved "how do you connect systems intelligently" before AI made it trendy
- Curri frustration: manager wanted Linear updated daily. DJ: "Just look at my pull requests." Linear was extra task that didn't help him execute, only helped managers. **This frustration is the BuildOS origin story.**
- Self-described as "tinker, work, build, get it working." Comfortable with long coding stints. Not ADHD (wife disagrees)

### DJ's hot takes (use as quote-able lines or seeds)

- "People are already doing their best. They just need more clarity to be more productive. You're not going to be more productive by budgeting time."
- "It's not about managing your time, it's about clarity. If you get people thinking clearly, they'll be more productive."
- "Most productivity tools and project management apps slow you down because you spend all your time organizing information and not executing."
- "AI is already smart as fuck. But being smart is only one piece of the puzzle. You need to give it frameworks."
- "It's like JavaScript — you can code anything with it, but everyone uses React, Vue, Svelte. Same with AI: it knows everything, but you need a framework + context for it to give you actionable information."

### Proof themes (when in doubt, show one)

- Raw brain dump → structured project
- Chapter problem → revision plan
- Video idea mess → production workflow
- Scattered stack → one working system
- Founder using BuildOS on real work

### External receipts (cite, don't paraphrase)

- **Devin Nash**, "Exposing the New Manufactured Viral Content Economy" (2026-04-16): 2.2B views, 69,000 clips, 1 streamer (Stake/Kick playbook). Coined "interest media."
- **Cal Newport** — Deep Work, attention philosophy
- **Tristan Harris / Center for Humane Technology** — attention economy ethics
- **Johann Hari** — Stolen Focus
- **Harvard "AI brain fry" piece** — already cited in cluster
- Receipts library (when it exists): `docs/marketing/research/anti-feed-receipts-library.md`

### Published cluster posts (for cross-link targets and voice anchoring)

| Slug | Cluster role | Use as cross-link when post is about |
| --- | --- | --- |
| `your-morning-without-the-algorithm.md` | Cluster opener; felt-experience + Devin receipts + BuildOS rituals | Morning routines, daily briefs, chosen input, the practice |
| `social-media-is-dead-interest-media.md` | T34 manifesto; defines "interest media" | Manufactured virality, the antagonist, naming the category |
| `anti-ai-assistant-execution-engine.md` | Sibling — anti-AI thesis | Context engineering vs agent engineering, AI-as-engine-not-headline |
| `what-a-thinking-environment-actually-is.md` | T36 candidate — defines protagonist | The category itself; vs productivity tools |
| `agentic-vrs-context-engineering.md` | Companion thesis | When extending the AI-philosophy thread |
| `productivity-vs-busy-work.md` | Older philosophy post | When critiquing productivity theater |
| `compound-engineering-for-your-life.md` | Older philosophy post | Compounding context, systems thinking |

Always check `apps/web/src/content/blogs/philosophy/` for the latest list before linking — the directory is the source of truth. Pick links by **vocabulary continuity** (does the linked post reinforce a term-to-own you're using?), not just topic adjacency.

---

## 9. Cluster topic map — ranked posts

The next-up posts. Most current status lives in `docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md` (load it at run start to get live status). The ranking and angles below are stable.

| Rank | Task | Title | Vocabulary anchor |
| --- | --- | --- | --- |
| 1 | T34 ✅ | Social Media Is Dead. What You're Using Is Interest Media. | interest media |
| 2 | **T35** | You Stopped Choosing What You Think About | chosen input |
| 3 | T36 | What a Thinking Environment Actually Is | thinking environment |
| 4 | T37 | The Three-Minute Morning That Fixes Your Day | anti-feed |
| 5 | T38 | Why Most Productivity Tools Are Feeds in Disguise | feeds in disguise |
| 6 | T39 | The Quiet Half of the Internet | the quiet half |
| 7 | T40 | Why AI Will Collapse the Clipping Economy by 2028 | synthetic public internet |
| 8 | T41 | Authenticity Is the Only Moat Left | authenticity moat |
| 9 | T42 | The Three Feelings You Don't Have Words For Yet | feed paranoia / curiosity collapse / algorithm-shaped thoughts |
| 10 | T43 | Writing Is Thinking. Scrolling Is Receiving. | direction of the arrow |

Picking the next post:

1. Open `docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md`, read status dashboard
2. Pick the highest-priority row that is 🟡 or ⚪ (skip ✅ and ⏸)
3. If multiple 🟡, default to the lowest T-number
4. Confirm with user: "Next up is **T## — {title}**. Draft it now?"
5. If user names a different T## or a free topic, use that

---

## 10. Output format

### Path

`apps/web/src/content/blogs/philosophy/{slug}.md`

Slug = kebab-case version of the title, dropping articles and punctuation. Example: "You Stopped Choosing What You Think About" → `you-stopped-choosing-what-you-think-about.md`.

### Length (tiered as of 2026-04-27 annealing entry)

Two bands, picked by post role:

- **Vocabulary / positioning posts** (T34, T36, T42, T43, and any post whose primary job is naming a term or defining a category): **1,200–2,000 words**, aim 1,500. Hard floor 1,000; hard ceiling 2,200.
- **Anchoring / conversion-leaning posts** (T35, T37, T38, and any post that doubles as a path into the product): **1,500–2,500 words**, aim 1,800–2,000. Hard floor 1,200; hard ceiling 2,800.

If a post role is ambiguous, default to the vocabulary band.

### Frontmatter (required exactly)

```yaml
---
title: '{exact T## title or free-topic title}'
description: '{one sentence, under 160 chars, contains ≥1 term-to-own}'
author: 'DJ Wayne'
date: '{YYYY-MM-DD}'
lastmod: '{YYYY-MM-DD}'
changefreq: 'monthly'
priority: '0.9'
published: true
tags: ['anti-feed', 'thinking-environment', '{2-4 more cluster tags}']
readingTime: {minutes, integer}
excerpt: '{2–3 sentence excerpt; no AI-hype language; uses ≥1 term-to-own}'
pic: '{slug-for-hero}'
path: apps/web/src/content/blogs/philosophy/{slug}.md
---
```

### Body shape

1. **Opening hook (2–4 sentences)** — felt experience, no product mention. Often a question the reader can answer out loud, or a precise naming of an emotion they have but don't have a word for.
2. **Mechanic / receipts section** — at least one specific source (Devin Nash, Cal Newport, named study, named campaign). Concrete > abstract.
3. **Philosophical reframe** — repeat ≥1 cluster vocabulary term 3–4 times. This is where the post earns its place in the cluster.
4. **BuildOS section (~10–15% of post)** — one section only, named as a tool, not pitched hard. Show the workflow (brain dump → project), don't sell features.
5. **The practice** — concrete, doable today, no product required. Lower the bar so a reader who hasn't signed up still leaves with something.
6. **Closing line** — memorable, standalone-quotable. Often the term-to-own restated as a stance.

### Required cross-links inside the body

- **≥2 inline links** to prior cluster posts (pick by vocabulary continuity, not just topic)
- **1 link** to `docs/marketing/strategy/anti-feed-content-topic-map.md` for readers who want more
- **1 link** to a relevant flagship piece if WS04 has one shipped (skip if none)

### Optional draft notes (HTML comment, not rendered)

The cluster posts often start with a `<!-- DRAFT NOTES -->` block right after frontmatter, capturing role-in-cluster, structural choices, and pre-publish considerations. Add one for any post that's doing structural / category work (e.g., manifestos, vocabulary-defining posts). Skip for tactical posts (e.g., morning-practice posts).

### JSON-LD

The blog route auto-generates `Article` JSON-LD from frontmatter. Verify after save: `datePublished`, `dateModified`, `author`, `headline`, `description`, `image` all populated. If any field is missing, fix the frontmatter, don't hand-write JSON-LD.

---

## 11. Drafting flow (step-by-step)

The skill follows this flow on every run. Don't skip steps; they exist because each one prevents a known failure mode.

### Step 1 — Identify the target post

- Read `docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md` for live status
- Pick the highest-priority 🟡 or ⚪ row (lowest T-number on tie)
- Confirm with user: "Next up is **T## — {title}**. Draft it now?"
- If user names a different T## or free topic, use that

### Step 2 — Outline before prose

Produce a **5-bullet outline** before any prose. Show to user; wait for confirmation or edits.

Outline must include:

1. **Lead-with-relief opener** (one sentence describing the felt experience the post names)
2. **The mechanic or claim** (one sentence describing the evidence/argument)
3. **The reframe** (one sentence introducing or repeating a term-to-own)
4. **The BuildOS frame** (one sentence connecting to thinking environment / anti-feed — not a pitch)
5. **The practice** (what the reader can do before closing the tab)

### Step 3 — Draft body

Write to length spec (1,200–2,000 words), in the body shape above. As you write, run inline checks:

- Hook does not mention AI
- ≥1 term-to-own appears 3+ times
- ≥1 specific external source cited
- BuildOS section ≤15% of post
- Em-dash count ≤ ~1 per 100 words

### Step 4 — Frontmatter + cross-links

Fill frontmatter exactly per the format. Add cross-links inside the body (≥2 to prior cluster posts, 1 to topic map). Verify each link by checking the file exists in `apps/web/src/content/blogs/philosophy/`.

### Step 5 — Voice checklist (pre-publish gate)

Run every item. If any fails, revise.

- [ ] Opening hook does not mention AI / LLM / agent
- [ ] Hook leads with felt experience or precise naming, not abstract claim
- [ ] At least one term-to-own appears 3+ times in the body
- [ ] At least one specific external source is cited (not just vibes)
- [ ] BuildOS is named as a tool inside one section ≤15% of post; not pitched hard
- [ ] At least 2 inline links to prior cluster posts
- [ ] 1 inline link to the topic map
- [ ] No banned hype words ("revolutionary," "game-changer," "unlock," "transform")
- [ ] No AI-cliché openers ("In today's fast-paced world," "It's no secret," "Let's dive in")
- [ ] Em-dash density feels natural (not "AI-prose-y")
- [ ] Closing line is memorable / standalone-quotable
- [ ] Audience-frame check: the post would land for an author or YouTuber, not just an indie hacker / ADHD reader
- [ ] Frontmatter is complete (all fields populated)
- [ ] Tags include 'anti-feed' and 'thinking-environment'
- [ ] `readingTime` is computed (~200 wpm), not guessed

### Step 6 — Save

Save to `apps/web/src/content/blogs/philosophy/{slug}.md`. Confirm path back to user with word count and reading time.

### Step 7 — Annealing log entry

Before ending the run, ask the user: **"Any learnings from this draft to capture in the annealing log?"**

If yes: append a dated entry to §13 below (in this file). Format defined in §13.

If no: skip silently.

### Step 8 — Hand off (optional)

Prompt: "Draft saved at `{path}`. Want to build the publish kit now?"

If yes → invoke the old `anti-feed` skill, menu option 2 (`build-publish-kit.md`). Don't try to build the kit yourself; that's a different skill's job.

### Step 9 — Status update reminder

This skill does **not** automatically update WS09 dashboards. Remind the user:

> "Update three places before this counts as done: WS09 dashboard (T## → 🔵 or ✅), `docs/marketing/distribution/README.md` task quick-map, `buildos-strat-tasks.md`. All three or it's drift."

---

## 12. What this skill does NOT do

Hard limits, in case the prompt drifts:

- **No publish kits** (Twitter / LinkedIn / IG / TikTok / Reddit extractions). Use old `anti-feed` skill, menu option 2.
- **No standalone TikTok scripts.** Old `anti-feed` skill, menu option 3.
- **No status-dashboard writes.** Surface the reminder; user updates.
- **No posting / publishing.** Saves to disk only; user reviews, commits, deploys.
- **No non-cluster blog posts.** Founder essays, product launch posts, changelog blogs — different mode, different skill.
- **No product positioning decisions.** Brand guide is the arbiter. If the user asks "should we change the category line?" — point to brand guide, don't decide.
- **No new vocabulary coining mid-post.** If a draft introduces a term not in §4, flag it for the user; don't add to the canon unilaterally.

---

## 13. Annealing log

The skill appends a dated entry here at the end of each run (Step 7 of the drafting flow) when the user has a learning to capture. This is how the context file improves over time.

### Entry format

```markdown
### YYYY-MM-DD — T## "{title}"

- **What worked:** {one short sentence}
- **What didn't:** {one short sentence}
- **Rule update:** {only if a rule in this file should change; otherwise omit}
- **New anti-pattern:** {only if a new anti-pattern emerged; otherwise omit}
```

### Rules

- Append-only. Don't edit prior entries.
- If a "Rule update" line appears, also edit the relevant section above (§3, §4, §6, §10, §11) so future runs pick it up. The annealing log is the audit trail; the rule sections are the runtime spec.
- If 5+ entries flag the same problem, escalate to the user — the rule itself probably needs rethinking.
- Keep entries short. Long retrospectives belong in a separate doc.

### Log

### 2026-04-27 — T35 "You Stopped Choosing What You Think About"

- **What worked:** A `## The forecast` stakes-and-promise opener before the felt-experience hook gave the reader a reason to stay; the AI-clipping-trajectory paired with the "Roth IRA at twenty-two" frame produced FOMO that read as calm authority, not hype.
- **What didn't:** Initial 1,514-word draft followed §10 BuildOS ≤15% and ≤2,000-word soft ceiling but author flagged it as "story-first, sell-never" — under-anchored to the product. Revision pushed BuildOS share to ~23% and length to 2,238 words. The §10 rule and the user's direction conflicted, and the user's direction was correct for this post type.
- **Rule update:** §10 BuildOS-share ceiling and word-count band were calibrated for pure vocabulary posts. Cluster posts that double as conversion-leaning anchors need a wider band. Mirrored into §10 as a tiered rule: ≤15% share / ≤2,000 words for vocabulary-defining posts (T34, T36, T42, T43); ≤25% share / ≤2,500 words for anchoring posts (T35, T37, T38).
- **New anti-pattern:** "Story-first, sell-never" — a felt-experience hook so calm it never establishes why the reader should keep reading. Fix: lead with a stakes-and-promise paragraph before the cold story open, even if it costs 150 words. Mirrored into §6 as anti-pattern #12.
