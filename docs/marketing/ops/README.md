<!-- docs/marketing/ops/README.md -->

# Marketing Ops Pipeline

> A folder of **data + scripts** an agent drives — so the marketing schedule lives in a queue, not in DJ's head. Inspired by the capability-overhang idea: reroute the "what's overdue / what's next" question into a deterministic tool instead of eyeballing markdown every session.

Run it with one command:

```
/marketing            # status + route into whatever's due
/marketing backlog    # synthesize & re-prioritize the backlog
/marketing assets     # generate images/screenshots for what's queued
/marketing publish    # spin up the platform posts for a blog
/marketing engage     # pull post metrics back into the queue
```

---

## The model

Four stages, one durable queue that is the memory between them:

```
① QUEUE/STATUS  →  ② ASSETS  →  ③ PUBLISH  →  ④ ENGAGE/LEARN
     (queue.json is the single source of truth for all four)
```

- **① QUEUE / STATUS** — `status.mjs` reads the queue + cadence and computes what's due, overdue, next, and backlogged. Deterministic; no agent arithmetic.
- **② ASSETS** — every post ships _with_ its visuals (product screenshots + generated images), tracked as `asset_needs` → `assets` on each deliverable.
- **③ PUBLISH** — turns a blog into platform posts (IG / LinkedIn / Twitter / 2 TikToks) in one unified voice, reusing the existing `anti-feed` publish-kit skill.
- **④ ENGAGE / LEARN** — post performance flows back into each item's `metrics[]` so you're not posting into the void; the next posts steer on what worked.

Nothing is ever "lost" — the queue records the exact state of every deliverable, so you always pick up where you left off.

---

## Files

| File | Role |
| --- | --- |
| `queue.json` | **Single source of truth.** Every content item + its per-platform deliverables, statuses, assets, and metrics. |
| `cadence.json` | Timing rules (blog interval, 48h extractions, 7-day TikToks…). Mirrors `../distribution/RECURRING.md`. |
| `tracks.json` | Content tracks + ramp schedules. `anti-feed` = active; `writers` = ramps in later (warm-up, not cold pivot). |
| `../../../scripts/marketing/ops/status.mjs` | The deterministic status engine. Prints a report or `--json` for the daily ping. |

## The queue schema

Each item is a piece of source content (today: a blog) plus the deliverables it spawns.

```jsonc
{
  "id": "T35",                         // ranked-post id from the WS09 topic map
  "track": "anti-feed",
  "type": "blog",
  "title": "You Stopped Choosing What You Think About",
  "slug": "you-stopped-choosing-...",
  "path": "apps/web/src/content/blogs/philosophy/....md",
  "status": "idea | drafted | scheduled | published",
  "rank": 2,                            // ordering in the backlog (lower = sooner)
  "published_at": "2026-04-27",         // null until live
  "deliverables": [
    {
      "kind": "instagram-carousel",     // twitter-thread | linkedin-post | instagram-carousel | tiktok-30s | tiktok-90s | reddit-angle
      "status": "pending | drafted | scheduled | posted | skipped",
      "posted_at": null,
      "url": null,
      "asset_needs": ["carousel-6-slides"],   // what visuals this needs
      "assets": []                            // resolved asset file paths (fills in at stage ②)
    }
  ],
  "metrics": [                          // stage ④ writes here
    { "platform": "linkedin", "posted_at": "...", "impressions": 1200, "engagements": 45 }
  ]
}
```

## Cadence rules (enforced by the engine)

- **Blog:** one anti-feed cluster post every **7–10 days** (at-risk past 10).
- **Extractions:** all **5** (Twitter thread, LinkedIn post, IG carousel, 2 TikTok scripts) drafted within **48h** of a blog going live.
- **TikTok:** both scripts recorded **and posted within 7 days** of publish.

The engine reports each obligation as 🔴 overdue / 🟡 due / 🔵 next, plus 🖼️ asset gaps and the 📦 backlog.

## Proactive ping

A daily scheduled agent runs `status.mjs --json`, and if anything is overdue or due, pings DJ with the summary + a one-tap "run `/marketing`". (Configured separately via the scheduling system.)

## How the agent edits the queue

The `/marketing` skill mediates all edits — you never hand-edit `queue.json`. Mark a deliverable posted, drop in metrics, add a new idea, re-rank the backlog: describe it in chat and the skill patches the JSON, then re-runs the engine so you immediately see the new picture.
