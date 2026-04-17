---
name: anti-feed
description: Dispatch the BuildOS anti-feed cluster — drafts the next ranked blog, builds full publish kits (Twitter + LinkedIn + Instagram + 2 TikTok scripts + Reddit angles), generates standalone TikTok scripts, captures receipts, and shows WS09/WS10 status. Triggers on "/anti-feed", "start anti-feed work", "draft next cluster blog", "TikTok script for X", "publish kit for Y", "anti-feed status".
---

# Anti-Feed Cluster Dispatcher

The single entry point for producing anti-feed cluster content. Keeps WS09 (blogs) and WS10 (TikTok) coordinated, enforces brand-guide voice, and respects the distribution-folder conventions.

## When to load this skill

- User runs `/anti-feed` or asks to kick off anti-feed work
- User asks "what should I write next" in the cluster
- User wants a publish kit (blog → Twitter + LinkedIn + IG + 2 TikTok + Reddit)
- User wants a standalone TikTok script tied to anti-feed vocabulary
- User wants to log a receipt for future cluster posts
- User asks for status on WS09 or WS10

Do **not** load for: general BuildOS marketing copy, non-cluster blog posts, product positioning reviews, or platform warmup work (that belongs to `twitter`, `instagram`, `linkedin`, `reddit` skills).

## Preflight — always load before drafting anything

Required reading, in order:

1. `docs/marketing/brand/brand-guide-1-pager.md` — voice, terms to prefer/avoid, category discipline
2. `docs/marketing/strategy/anti-feed-content-topic-map.md` — canonical vocabulary + cluster structure
3. `docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md` — status dashboard + task briefs
4. `docs/marketing/distribution/workstreams/WS10-short-form-video.md` — TikTok counter-positioning + guardrails
5. `docs/marketing/social-media/FOUNDER_CONTEXT.md` — DJ's voice, lived experience, source of truth
6. Published cluster posts (link from topic map) — for vocabulary continuity and cross-link targets

Load each file once, then keep working. Don't re-read across a single session.

## The menu

Present these five options when the user invokes the skill without specifying what they want. Quote the exact status (e.g. "T35 is next, due by 2026-04-27") pulled live from the WS09 dashboard.

### 1. Draft the next ranked blog

Read WS09 status dashboard. Pick the first 🟡 / ⚪ row after the last ✅. Confirm with user before drafting.

- Target: 1,200–2,000 words, one-day first draft
- Flow: [references/draft-blog.md](references/draft-blog.md)
- Output: `apps/web/src/content/blogs/philosophy/{slug}.md`
- Required: `Article` JSON-LD, `dateModified`, links to ≥2 prior cluster posts
- After draft: update three places (WS09 dashboard, README task map, `buildos-strat-tasks.md`) — see [references/status-drift.md](references/status-drift.md)

### 2. Build a publish kit for a blog

User picks any cluster blog (published or drafted). Generate all five social extractions in one file.

- Flow: [references/build-publish-kit.md](references/build-publish-kit.md)
- TikTok pair spec: [references/tiktok-scripts.md](references/tiktok-scripts.md)
- Output: `docs/marketing/social-media/publish-kits/{YYYY-MM-DD}-{slug}-kit.md`
- Contents (exact order): Twitter thread (5–8 tweets) → LinkedIn post → Instagram carousel (9 slides) → **TikTok script 30–45s (hook-on-vocabulary)** → **TikTok script 60–90s (explainer)** → Reddit share angles (3 subs max)

### 3. Generate a standalone TikTok script

User picks a vocabulary term or topic-map cluster line (no blog required). Generate one 30–45s or 60–90s script, whichever the user asks for. Default: pair of both (same vocabulary, two lengths).

- Flow: [references/tiktok-scripts.md](references/tiktok-scripts.md)
- Output: append to `docs/marketing/social-media/tiktok/scripts/{YYYY-MM-DD}-{slug}.md` (create folder on first use)
- Requires: one vocabulary term from the topic map's "terms to own" table, one receipts-grounded claim, one "direction of the arrow" flip, one CTA that is NOT "follow me"

### 4. Capture a receipt

User drops a quote, screenshot, tweet, URL, or observation. Store in the T45 receipts library for future cluster posts.

- Flow: [references/capture-receipt.md](references/capture-receipt.md)
- Output: `docs/marketing/research/anti-feed-receipts-library.md` (create on first receipt)
- Format: one bulleted entry per receipt, with date, source, url, and claim it supports

### 5. Show status

Render the current WS09 + WS10 state, including per-blog publish-kit completeness.

- Flow: [references/status-report.md](references/status-report.md)
- Pulls from: WS09 + WS10 workstream dashboards, `buildos-strat-tasks.md`, the `publish-kits/` folder, the `tiktok/scripts/` folder
- Format: one table per workstream, then a "what's overdue" section, then "suggested next action"

## Voice & positioning guardrails

Apply to everything produced by this skill. Non-negotiable.

- **Category line:** "thinking environment for people making complex things" — not "AI productivity app," not "AI assistant for founders"
- **Never lead with AI.** Lead with relief or with the felt-experience problem. AI shows up in the proof layer, not the hook
- **Preferred vocabulary** (repeat consistently across cluster): thinking environment, anti-feed, interest media (credit Devin Nash on first use per post), chosen input, direction of the arrow, the quiet half of the internet, algorithm-shaped thoughts, curiosity collapse, feed paranoia
- **Avoid at first contact:** ontology, agentic orchestration, context infrastructure, AI-powered productivity, multi-agent, knowledge fabric
- **Audience order:** authors → YouTubers → podcasters → newsletter operators → course creators → founder-creators. ADHD / founders / indie builders are supporting affinity only
- **Tone:** calm, direct, slightly contrarian, grounded in lived frustration. Never hype-adjacent. Never "here's why X is dead" unless you can show receipts

## TikTok counter-positioning (WS10)

If output is a TikTok script, the following must be true or the script is rejected:

1. **No clip-farm tactics.** No buying views, no paid clippers, no trend-jacking without purpose.
2. **Founder-led on camera or screen.** No faceless AI voiceover loops.
3. **Receipts-first.** Every claim needs a pointer to a specific blog, stat, or primary source.
4. **Vocabulary discipline.** Each script repeats at least one "term to own" — the whole cluster compounds by repetition.
5. **CTA is chosen input.** "Read the piece," "try a brain dump," "subscribe to the daily brief." Never "follow for more."

See [references/tiktok-scripts.md](references/tiktok-scripts.md) for the 30–45s and 60–90s templates.

## Where things land

| Artifact | Location |
| --- | --- |
| Blog drafts | `apps/web/src/content/blogs/philosophy/{slug}.md` |
| Publish kits | `docs/marketing/social-media/publish-kits/{date}-{slug}-kit.md` |
| Standalone TikTok scripts | `docs/marketing/social-media/tiktok/scripts/{date}-{slug}.md` |
| Receipts library | `docs/marketing/research/anti-feed-receipts-library.md` |
| Status updates | WS09 dashboard + README task map + `buildos-strat-tasks.md` (all three, or it's drift) |

## Status update discipline

Every content artifact this skill produces triggers status writes in three places. See [references/status-drift.md](references/status-drift.md). If any of the three is missed, the work is not done.

## Cadence

- **Blog:** T44 — one cluster post every 7–10 days (RECURRING.md)
- **TikTok:** T49 — two scripts per cluster blog, posted within 7 days of the blog going live (RECURRING.md, WS10)
- **Receipts:** ongoing; aim for one entry per week minimum while cluster is active

## What this skill does NOT do

- Post to TikTok / Twitter / LinkedIn / Instagram / Reddit (use platform skills)
- Build the WS04 flagship quarterly piece (that's a separate mode; see WS04)
- Decide product positioning (brand guide is the arbiter, not this skill)
- Generate content outside the anti-feed cluster vocabulary

## References

- [references/draft-blog.md](references/draft-blog.md) — cluster blog drafting flow + voice checks
- [references/build-publish-kit.md](references/build-publish-kit.md) — full 5-lane publish kit flow
- [references/tiktok-scripts.md](references/tiktok-scripts.md) — 30–45s + 60–90s script templates + rejection rubric
- [references/capture-receipt.md](references/capture-receipt.md) — receipts library format
- [references/status-report.md](references/status-report.md) — dashboard render spec
- [references/status-drift.md](references/status-drift.md) — the three-place update rule
