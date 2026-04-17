# Draft a ranked cluster blog (T35–T43)

Load this when the user picks "Draft the next ranked blog" from the menu.

## Step 1 — Identify the target post

1. Open `docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md`, read the status dashboard.
2. Pick the highest-priority row that is 🟡 or ⚪ (skip ✅ and ⏸).
3. If multiple 🟡 rows, default to the lowest T-number.
4. Confirm the target with the user: "Next up is **T## — {title}**. Draft it now?"
5. If user names a different T## explicitly, use that.

## Step 2 — Gather required inputs

Load (if not already in this session):

- `docs/marketing/brand/brand-guide-1-pager.md`
- `docs/marketing/strategy/anti-feed-content-topic-map.md` (cluster 1–7 + terms-to-own)
- `docs/marketing/social-media/FOUNDER_CONTEXT.md`
- The task brief for T## inside WS09
- The two most-recently-published cluster posts (for vocabulary continuity + cross-link targets)
- `youtube-transcripts/2026-04-16-exposing-the-new-manufactured-viral-content-economy.md` — only if the post cites the Devin Nash receipts

## Step 3 — Outline before prose

Produce a 5-bullet outline **before writing any prose**. Show it to the user; wait for confirmation or edits.

Outline must include:

1. **Lead-with-relief opener** (one sentence describing the felt experience the post names)
2. **The mechanic or claim** (one sentence describing the evidence/argument)
3. **The reframe** (one sentence introducing or repeating a term-to-own from the topic map)
4. **The BuildOS frame** (one sentence connecting to thinking environment / anti-feed — not a pitch)
5. **The practice** (what the reader can do before closing the tab)

## Step 4 — Draft

Target: **1,200–2,000 words**. Shape:

- Opening hook (2–4 sentences) — felt experience, no product mention
- Mechanic / receipts section — cite at least one specific source (Devin Nash, Cal Newport, named study, named company/campaign)
- Philosophical reframe — repeat ≥1 cluster vocabulary term 3–4 times across the post
- BuildOS section — one section only, named as a tool, not pitched hard
- The practice — concrete, doable today, no product required
- Closing line — memorable, standalone-quotable

## Step 5 — Frontmatter + cross-links

Every post ships with:

```yaml
---
title: '{exact T## title}'
description: '{one sentence, under 160 chars, contains ≥1 term-to-own}'
author: 'DJ Wayne'
date: '{YYYY-MM-DD}'
lastmod: '{YYYY-MM-DD}'
changefreq: 'monthly'
priority: '0.9'
published: true
tags: ['anti-feed', 'interest-media', 'thinking-environment', ...]
readingTime: {minutes}
excerpt: '{2–3 sentence excerpt; no AI-hype language}'
pic: '{slug-for-hero}'
path: apps/web/src/content/blogs/philosophy/{slug}.md
---
```

Cross-links inside the post body:

- ≥2 inline links to prior cluster posts (check the latest WS09 dashboard for published URLs)
- 1 link to the topic map for readers who want more
- 1 link to the companion flagship piece once WS04 T15 exists

## Step 6 — JSON-LD

Verify `Article` JSON-LD renders. If the existing blog route auto-generates it, confirm `datePublished`, `dateModified`, `author`, `headline`, `description`, `image` are all accurate. If not auto-generated, block on fixing that before shipping.

## Step 7 — Voice check

Run the [voice checklist](./status-drift.md#voice-checklist) before marking draft complete. If any item fails, revise before handing back.

## Step 8 — Update status in three places

After draft is saved (even if unpublished), update:

1. **WS09 dashboard** — change T## from 🟡 to 🔵 (drafting) or ✅ (published)
2. **`docs/marketing/distribution/README.md`** task quick-map — mirror the change
3. **`buildos-strat-tasks.md`** — mirror the change, add published date if ✅

All three or it's drift. See [status-drift.md](./status-drift.md).

## Step 9 — Hand off to publish kit

Once the blog is drafted, prompt the user: "Draft is saved at `{path}`. Build the publish kit now? (runs menu option 2)"

If yes → load [build-publish-kit.md](./build-publish-kit.md).

## Common failure modes

- **Leading with AI.** If your opening paragraph mentions AI, rewrite. Lead with the felt experience.
- **Vocabulary drift.** If the post doesn't use at least one term from the topic map's "terms to own" table, revise.
- **Pitch creep.** If the BuildOS section is more than ~15% of the post, trim it.
- **Missing cross-links.** Under 2 cluster links = fails the compounding goal. Add before shipping.
- **ADHD-era framing.** If you find yourself writing for "ADHD minds" in the hook, rewrite for authors/YouTubers/makers and leave ADHD as supporting affinity.
