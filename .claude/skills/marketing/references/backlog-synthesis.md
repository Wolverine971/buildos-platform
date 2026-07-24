# Backlog Synthesis (`/marketing backlog`)

When the 📦 backlog piles up, this reorganizes it so you never lose track and always know the single next thing. Two failure modes it prevents: (a) a wall of undifferentiated ideas you avoid looking at, (b) posting/drafting the wrong thing because ranking drifted from strategy.

## What to do

1. Run the engine, read the full 📦 BACKLOG list.
2. Pull current strategy so ranking reflects reality, not inertia:
   - `docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md` (dashboard status — note: it self-describes as periodically stale; reconcile).
   - `docs/marketing/strategy/anti-feed-content-topic-map.md` (canonical cluster order + which clusters are under-covered).
3. **Re-rank** by lowest-effort-highest-leverage, honoring cluster compounding:
   - A blog that cross-links what's already published compounds faster → rank sooner.
   - News-cycle-sensitive topics (e.g. the clipping-economy forecast) pivot up when timely.
   - Anything gated (needs reconciliation, needs a receipt, needs the karma gate) → note the blocker, don't rank it #1.
4. **Synthesize** — collapse duplicates, merge thin ideas, split overloaded ones. If two ideas are the same post, keep one and note the merge.
5. Write the new `rank` values back into `queue.json` (see `queue-editing.md`). Lower rank = sooner. Re-run the engine.
6. Report back: the new top 3, one line each on why, and the single recommended next draft.

## Reconciliation checks (specific to this cluster's known drift)

- **T35** is live but its kit was drafted and never posted — it's not a backlog item, it's a stage-③ posting debt. Don't re-rank it; route it to publish.
- **T36** is live but unverified (cross-links / JSON-LD unchecked; reconcile with WS04-T15). Verify before treating as "done."
- **T44 cadence** is badly at-risk (last publish 2026-04-27). The backlog doesn't matter if the cadence is dead — restarting the publish cadence outranks perfecting the backlog order.

## Output shape

Keep it decision-brief altitude:

> Re-ranked 7 backlog items. Top 3:
> 1. **T37** Three-Minute Morning — practical, cross-links T34+T35, zero blockers → draft next.
> 2. **T38** Productivity Tools Are Feeds — competitive angle, strong for LinkedIn.
> 3. **T40** Clipping Economy 2028 — timely; pull up if the news cycle turns.
> Recommended next action: draft T37.
