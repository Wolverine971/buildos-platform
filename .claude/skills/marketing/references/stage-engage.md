# Stage ④ — ENGAGE / LEARN

"Stop posting into the void." Once a lane is posted, its performance flows back into the queue so the next posts steer on what actually worked — not vibes.

## Two jobs

1. **Pull metrics** into each posted deliverable's `metrics[]`.
2. **Synthesize** what's working and feed it forward into drafting/ranking decisions.

## Pulling metrics (browser automation)

For each deliverable with `status: "posted"` and a `url`, drive the matching browser skill to read its stats:

- `twitter` → impressions, likes, reposts, replies, bookmarks on the tweet/thread.
- `linkedin` → impressions, reactions, comments, reposts (LinkedIn analytics on the post).
- `instagram` → views, likes, saves, shares on the Reel/carousel.

Write results into the queue:

```jsonc
"metrics": [
  { "platform": "linkedin", "posted_at": "2026-07-24", "impressions": 1240, "engagements": 47, "note": "reshared by X" }
]
```

Cadence: pull at **48h** and again at **7d** after posting (early signal vs. settled). Don't over-poll — 2 reads per post is enough, and heavy scraping risks the account.

## Synthesizing (the actual learning)

After metrics land, answer three questions and record the answer where drafting will see it:

1. **Which vocabulary/hook landed?** Which term-to-own or opening line drove the most engagement? That term should recur in the next cluster posts.
2. **Which platform is the cluster's real channel?** Concentrate effort where engagement-per-post is highest; downgrade lanes that consistently flatline (mark them `skipped` for future blogs if they never pay off).
3. **Which receipt/felt-experience resonated?** Feed winners into `docs/marketing/research/anti-feed-receipts-library.md` for reuse.

Keep the synthesis short and append it to the WS09 dashboard's annealing log or the receipts library — somewhere `draft-anti-feed-blog` will re-read. The point is a closed loop: post → measure → the next draft is better because of it.

## Guardrail

Metrics are for steering, not vanity. If a post underperforms, that's signal about the hook/format, not a reason to stop the cadence. The cluster compounds on consistency; use learning to improve each post, not to justify skipping the next one.
