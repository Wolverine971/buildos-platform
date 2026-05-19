<!-- docs/marketing/strategy/data-driven-topic-validation-2026-05-15.md -->

---

title: Data-Driven Topic Validation Tasker
created: 2026-05-15
owner: DJ
status: ready-to-execute
related_workstream: WS09 (anti-feed cluster)
source: Kallaway "NEW Era of Personal Brands" — Attribute #2 (data-driven creativity)
parent_analysis: ../research/youtube-analyses/2026-05-15-kallaway-analysis-and-buildos-recommendations.md

---

# Data-Driven Topic Validation Tasker

> One-line goal: Identify which BuildOS-adjacent topics are already validated by the market, then run the surviving topics through the BuildOS contrarian lens — so the anti-feed cluster (WS09 T36–T43) and short-form pipeline (WS10) are built on topics the market has confirmed it wants, not on topics doctrine assumes it wants.

## Why this exists

Kallaway's framing: every piece of content is `topic + take`. Weak brands guess on topic AND copy the take. Premium brands validate the topic with data and originate the take with their worldview.

BuildOS today: anti-feed topics are thesis-driven. They come from [`anti-feed-content-topic-map.md`](./anti-feed-content-topic-map.md) and [`buildos-guerrilla-content-doctrine.md`](./buildos-guerrilla-content-doctrine.md). Strong on take. Untested on whether the **topic itself** is one the market is hungry for — versus a topic only the BuildOS team finds interesting.

This tasker fixes the topic side. The take stays contrarian and BuildOS-native.

## What this is NOT

- Not a research project to assign to an agent in one shot.
- Not a pivot away from the anti-feed thesis. The take stays.
- Not a request to copy what's working. The output is a **prioritization filter** for already-planned content, plus a small list of new topic candidates.

---

## Inputs

- **Adjacent creators (default list)** — narrow or expand on Step 1:
    - Tiago Forte (Building a Second Brain — note-taking/PKM)
    - Cal Newport (Deep Work, Slow Productivity — attention/focus)
    - Ali Abdaal (productivity creator at scale)
    - Naval Ravikant (originality + leverage — distant but relevant)
    - Khe Hy (RadReads — creator/knowledge worker overlap)
- **BuildOS topic map** — [`anti-feed-content-topic-map.md`](./anti-feed-content-topic-map.md)
- **Current WS09 backlog** — T36–T43 still ⚪ unstarted ([WS09 dashboard](../distribution/workstreams/WS09-anti-feed-cluster.md))

## Tools

- **sandcastles.ai** — Kallaway's tool. Free trial. Pulls top-performing content for any creator across platforms.
- **Alternative if sandcastles is friction:** YouTube channel pages sorted by "Popular" + Social Blade + manual Twitter/LinkedIn top-post pulls.
- **Claude** — for synthesis. Feed exported data, ask for patterns.

---

## Steps

### Step 1 — Narrow the adjacent creator list (15 min)

For each of the 5 default creators, ask:

- Do they actually share BuildOS's audience? (Creators making complex things — authors, YouTubers, builders, knowledge workers)
- Are they at a scale where their top posts are signal, not noise? (>50K following, >10 published top-performers)
- Do they post often enough that "top X of last 90 days" is meaningful?

Cut anyone who doesn't pass. Add anyone obvious who's missing. Target: **3–5 creators max.** More than 5 = analysis dilution.

**Candidates to consider adding:**

- David Perell (writing + thinking)
- Andy Matuschak (notes + tools for thought) — small but exactly on-niche
- Anne-Laure Le Cunff (Ness Labs — mindful productivity)
- Tim Ferriss (broad but knowledge-worker overlap)

**Output:** Final shortlist of 3–5 creators, written into the [Decisions log](#decisions-log) at the bottom of this doc.

---

### Step 2 — Pull top-performing content per creator (30–45 min)

For each creator on the shortlist:

- Pull their **top 20 posts/videos by performance** in the last 12 months.
- Format per row: `creator | platform | title/hook | metric (views or eng. rate) | URL | one-sentence topic summary`.
- Save as CSV or markdown table at `docs/marketing/research/adjacent-creators-top-content-2026-05-15.csv` (or `.md`).

**Tool path A — sandcastles.ai (recommended):**

1. Free trial at sandcastles.ai
2. Add each shortlisted creator
3. Export top performers
4. Dump into one combined file

**Tool path B — manual fallback if sandcastles is friction:**

1. YouTube channel → "Videos" → sort by Popular → top 20
2. Twitter/X → creator profile → "Media" or "Highlights"
3. LinkedIn → creator profile → "Activity" → sort by reactions

---

### Step 3 — Cluster topics with Claude (30 min)

Open a Claude conversation. Paste the combined dataset. Prompt structure:

```
Here is the top-performing content from [N] productivity/thinking-tools creators
adjacent to BuildOS over the last 12 months. For each row I've included title,
performance metric, and a topic summary.

1. Cluster these top performers into 8-15 topic categories.
2. For each cluster, tell me:
   - How many top-performers fall in it
   - Which creators have hits there (the broader the better — cluster appears
     across 3+ creators = strong validation)
   - The shared "promise" of the cluster (what reader/viewer outcome it implies)
3. Flag clusters that show up across 3+ creators as "category-validated."
4. Flag any cluster appearing for only 1 creator as "personality-bound"
   (success may not transfer).
```

**Output:** A ranked list of validated topic clusters with the strongest category-level signal at the top.

---

### Step 4 — Run validated clusters through the BuildOS lens (45 min)

For each category-validated cluster from Step 3, fill in this table:

| Validated cluster             | Conventional take (what other creators say) | BuildOS contrarian take (what we say)                                                                                   | Anti-feed map cluster match                 | WS09 task slot |
| ----------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------- |
| _e.g., "Note-taking systems"_ | More notes, better tags, second brain       | Notes are not the bottleneck. **Structured thinking is.** Tools that capture without structuring are feeds in disguise. | Cluster 3 / 7 (productivity tools as feeds) | T38            |
| _e.g., "Morning routines"_    | Wake up early, journal, exercise            | The 3-min morning that **decides what your brain works on** before the algorithm decides for you.                       | Cluster 3                                   | T37            |

**Three judgment calls per cluster:**

1. **Match:** Does this validated cluster correspond to an existing anti-feed map cluster or T## slot? → Use it to prioritize that task.
2. **New whitespace:** Validated but NOT in our topic map? → Candidate new task (T46+) — flag, don't add yet.
3. **Pass:** Validated but no honest contrarian take? → Skip. Don't write into a topic you don't have a real angle on.

---

### Step 5 — Update WS09 prioritization (15 min)

Take the matched rows from Step 4 and:

- Re-order T36–T43 in [`WS09-anti-feed-cluster.md`](../distribution/workstreams/WS09-anti-feed-cluster.md) so that **strongest category-validated topics come first.**
- Add a "Validation: ✅ cross-creator | ⚠️ single-creator | ❓ thesis-only" tag to each task row in the dashboard.
- Open new task IDs (T46+) for any whitespace clusters from Step 4. Add them to [`buildos-strat-tasks.md`](../../../buildos-strat-tasks.md) but mark them ⚪ — don't draft yet.

---

## Done definition

- [ ] Shortlist of 3–5 adjacent creators decided + logged below
- [ ] Combined dataset of top performers saved to `docs/marketing/research/`
- [ ] Topic cluster output from Claude saved alongside it
- [ ] BuildOS-lens table completed for category-validated clusters
- [ ] WS09 dashboard re-ordered and tagged with validation signal
- [ ] Any new whitespace topics added as T46+ in the strat tasks file

**Time estimate:** ~2.5 hours, single sitting.

---

## Out of scope (for this tasker)

- Short-form (TikTok/Reels) topic validation — handle in a sibling tasker for WS10.
- LinkedIn-specific topic validation — handle separately if LinkedIn is chosen as home platform.
- Take generation — this tasker validates topics. Drafting takes happens inside each T## blog task.
- Sandcastles MCP wiring into Claude Code — possible future automation, not needed for v1.

---

## Decisions log

> Filled in 2026-05-15 (Steps 1-4 executed; Step 5 awaiting DJ sign-off).

- **Final creator shortlist (Step 1):** Tiago Forte, Cal Newport, Ali Abdaal, Naval Ravikant, Khe Hy. Default 5; DJ confirmed in tasker session 2026-05-15.
- **Tool path chosen (Step 2):** Manual via WebSearch + WebFetch (5 parallel research agents). Sandcastles.ai not used — manual sufficient + zero-trust-deficit.
- **Dataset path (Step 2):** [`docs/marketing/research/adjacent-creators-top-content-2026-05-15.md`](../research/adjacent-creators-top-content-2026-05-15.md) — ~104 rows across all 5 creators.
- **Cluster output path (Step 3 + 4):** [`docs/marketing/research/adjacent-creators-topic-clusters-2026-05-15.md`](../research/adjacent-creators-topic-clusters-2026-05-15.md) — 12 clusters, 6 tier-1 validated, 3 new whitespace task candidates (T46-T48), BuildOS-lens table and WS09 re-prioritization proposal inside.
- **WS09 re-order date (Step 5):** ⏸ Pending DJ sign-off. Recommendation in cluster doc §Step 5; would touch `WS09-anti-feed-cluster.md`, `anti-feed-content-topic-map.md`, and `buildos-strat-tasks.md` together.

---

## Open questions for DJ

1. Is **sandcastles.ai** worth the friction (free trial sign-up, possible card), or stay manual? Manual is slower but zero-trust-deficit; sandcastles is faster but a new dependency.
2. Are there **creators in BuildOS's ICP (authors, YouTubers building complex things)** worth including beyond the productivity creators? The default list skews toward productivity teachers, not the actual audience BuildOS wants to serve.
3. Should this tasker also cover **Reddit/subreddit thread-topic validation** for the Reddit warmup work? Different signal source, same logic.
