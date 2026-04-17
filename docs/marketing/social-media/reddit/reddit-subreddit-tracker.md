<!-- docs/marketing/social-media/reddit/reddit-subreddit-tracker.md -->

# BuildOS Reddit Subreddit Tracker

> Living document tracking all target subreddits for BuildOS karma-building, participation, and eventual posting.
> Mirrors the structure of `twitter-accounts-tracker.md`. Updated during each Reddit warmup scan.

**Last full scan:** 2026-04-17
**Scan cadence:** Weekly during karma phase → 2–3× weekly once posting begins
**Source spec:** [reddit-subreddit-research-spec.md](./reddit-subreddit-research-spec.md)
**Strategy source:** [buildos-strat.md §Part 4](../../../buildos-strat.md)

**Related Docs:**

- [Subreddit Profiles Index](./subreddit-profiles/INDEX.md) — One-file-per-sub detailed profiles
- [Brand Guide](../../brand/brand-guide-1-pager.md) — Non-negotiable voice + terms
- [Creator Wedge Strategy](../../strategy/thinking-environment-creator-strategy.md)
- [Anti-AI Positioning](../../strategy/anti-ai-show-dont-tell-strategy.md)

---

## Legend

| Column              | Meaning                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- |
| **Subscribers**     | As returned by `/about.json` on the last scan date                                      |
| **Activity Proxy**  | Top-week post #1 score and comment count (Reddit deprecated public `active_user_count`) |
| **Promo Tolerance** | `strict` / `moderate` / `lax` — derived from rules + enforcement posture                |
| **BuildOS Fit**     | `high` / `medium` / `low-but-relevant` / `de-prioritize`                                |
| **Last Visited**    | Last scan date (YYYY-MM-DD) or `---` if never                                           |
| **Profile**         | Link to per-sub profile doc                                                             |

**Data caveat:** `active_user_count` returns null on Reddit's public JSON API in 2026. We use top-week #1's score/comments as an activity proxy. For true daily-active estimates, use the live "X users here now" sidebar figure during manual visits.

---

## Tier 1 — Primary Creator Subs (Authors)

Core BuildOS wedge. Creator workflows, multi-month projects, long-running context problems.

| Subreddit       | Subscribers | Activity Proxy (top-week) | Promo Tolerance | BuildOS Fit | Last Visited | Profile                                                |
| --------------- | ----------- | ------------------------- | --------------- | ----------- | ------------ | ------------------------------------------------------ |
| r/writing       | 3,357,620   | ↑3157 / 💬364             | strict          | high        | 2026-04-17   | [writing](./subreddit-profiles/writing.md)             |
| r/selfpublish   | 241,418     | ↑91 / 💬18                | strict          | high        | 2026-04-17   | [selfpublish](./subreddit-profiles/selfpublish.md)     |
| r/worldbuilding | 1,877,690   | ↑3801 / 💬543             | moderate        | high        | 2026-04-17   | [worldbuilding](./subreddit-profiles/worldbuilding.md) |
| r/screenwriting | 1,755,386   | ↑259 / 💬54               | strict          | medium      | 2026-04-17   | [screenwriting](./subreddit-profiles/screenwriting.md) |

## Tier 1 — Primary Creator Subs (YouTubers)

Video creator workflows — production is almost always multi-month and under-scaffolded.

| Subreddit      | Subscribers | Activity Proxy (top-week) | Promo Tolerance       | BuildOS Fit   | Last Visited | Profile                                              |
| -------------- | ----------- | ------------------------- | --------------------- | ------------- | ------------ | ---------------------------------------------------- |
| r/youtubers    | 329,170     | ↑0 / 💬4 (sub is CLOSED)  | strict                | de-prioritize | 2026-04-17   | [youtubers](./subreddit-profiles/youtubers.md)       |
| r/NewTubers    | 667,614     | ↑233 / 💬195              | strict                | high          | 2026-04-17   | [NewTubers](./subreddit-profiles/NewTubers.md)       |
| r/VideoEditing | 505,219     | ↑198 / 💬26               | strict-but-structured | medium        | 2026-04-17   | [VideoEditing](./subreddit-profiles/VideoEditing.md) |

## Tier 2 — Secondary Creator Subs

Podcasters, newsletter operators, Substack writers, solopreneurs, general content creators.

| Subreddit         | Subscribers | Activity Proxy (top-week) | Promo Tolerance | BuildOS Fit      | Last Visited | Profile                                                    |
| ----------------- | ----------- | ------------------------- | --------------- | ---------------- | ------------ | ---------------------------------------------------------- |
| r/podcasting      | 179,889     | ↑194 / 💬62               | strict          | medium           | 2026-04-17   | [podcasting](./subreddit-profiles/podcasting.md)           |
| r/Substack        | 47,348      | ↑84 / 💬47                | moderate        | high             | 2026-04-17   | [Substack](./subreddit-profiles/Substack.md)               |
| r/Newsletters     | 11,984      | ↑12 / 💬23                | moderate        | low-but-relevant | 2026-04-17   | [Newsletters](./subreddit-profiles/Newsletters.md)         |
| r/contentcreation | 22,921      | ↑7 / 💬7                  | moderate        | medium           | 2026-04-17   | [contentcreation](./subreddit-profiles/contentcreation.md) |
| r/creators        | 7,170       | ↑23 / 💬17                | moderate        | low-but-relevant | 2026-04-17   | [creators](./subreddit-profiles/creators.md)               |
| r/solopreneur     | 60,431      | ↑191 / 💬71               | moderate        | high             | 2026-04-17   | [solopreneur](./subreddit-profiles/solopreneur.md)         |

## Tier 3 — Cross-Cutting (Productivity / Tool-Switchers)

High volume of "what tool" and "alternative to X" threads. Big but crowded; most strict on self-promo.

| Subreddit        | Subscribers | Activity Proxy (top-week) | Promo Tolerance | BuildOS Fit      | Last Visited | Profile                                                  |
| ---------------- | ----------- | ------------------------- | --------------- | ---------------- | ------------ | -------------------------------------------------------- |
| r/productivity   | 4,170,139   | ↑243 / 💬64               | strict          | medium           | 2026-04-17   | [productivity](./subreddit-profiles/productivity.md)     |
| r/getdisciplined | 2,138,759   | ↑555 / 💬103              | strict          | medium           | 2026-04-17   | [getdisciplined](./subreddit-profiles/getdisciplined.md) |
| r/Notion         | 452,568     | ↑307 / 💬50               | strict          | high             | 2026-04-17   | [Notion](./subreddit-profiles/Notion.md)                 |
| r/ObsidianMD     | 309,917     | ↑1785 / 💬52              | strict          | low-but-relevant | 2026-04-17   | [ObsidianMD](./subreddit-profiles/ObsidianMD.md)         |

## Tier 4 — Supporting Affinity

Participate authentically. Don't lead with BuildOS. ADHD and dev-adjacent creators.

| Subreddit         | Subscribers | Activity Proxy (top-week) | Promo Tolerance                | BuildOS Fit                        | Last Visited | Profile                                                    |
| ----------------- | ----------- | ------------------------- | ------------------------------ | ---------------------------------- | ------------ | ---------------------------------------------------------- |
| r/ADHD            | 2,210,299   | ↑1634 / 💬383             | strict (permaban on any promo) | high (comment-only, never mention) | 2026-04-17   | [ADHD](./subreddit-profiles/ADHD.md)                       |
| r/ExperiencedDevs | 381,637     | ↑651 / 💬224              | strict                         | low-but-relevant                   | 2026-04-17   | [ExperiencedDevs](./subreddit-profiles/ExperiencedDevs.md) |

---

## Aggregate — 20 Subs At A Glance

| Metric                       | Value          |
| ---------------------------- | -------------- |
| Total subs reached (sum)     | **19,251,115** |
| Average subs per target sub  | ~963K          |
| Tier 1 — Authors             | 4 subs, 7.23M  |
| Tier 1 — YouTubers           | 3 subs, 1.50M  |
| Tier 2 — Secondary creators  | 6 subs, 329K   |
| Tier 3 — Productivity        | 4 subs, 7.07M  |
| Tier 4 — Supporting affinity | 2 subs, 2.59M  |

**BuildOS Fit distribution:**

- `high`: 8 subs (r/writing, r/selfpublish, r/worldbuilding, r/NewTubers, r/Substack, r/solopreneur, r/Notion, r/ADHD\*)
- `medium`: 6 subs (r/screenwriting, r/VideoEditing, r/podcasting, r/contentcreation, r/productivity, r/getdisciplined)
- `low-but-relevant`: 4 subs (r/Newsletters, r/creators, r/ObsidianMD, r/ExperiencedDevs)
- `de-prioritize`: 1 sub (r/youtubers — closed)
- _r/ADHD is high on audience fit but `comment-only, never mention product`._

**Promo Tolerance distribution:**

- `strict` / `strict-but-structured`: 14 subs
- `moderate`: 6 subs
- `lax`: 0 subs

Takeaway: creator subs are uniformly strict on promo. The 90/10 value-first rule is non-negotiable on Reddit.

---

## Open Research Notes (feeds T4 and future strategy)

These surface patterns across subs for the evergreen-thread inventory (T4), creator-adjacent redditor outreach, and the future `/reddit-warmup` command.

### Recurring weekly / monthly threads (goldmines for low-friction karma)

| Sub               | Thread                                                                         | Cadence        | Why it matters for BuildOS                                                 |
| ----------------- | ------------------------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------- |
| r/writing         | **Sunday Writing Tools, Software, and Hardware**                               | weekly         | The _only_ sanctioned surface for tool mentions in the largest writing sub |
| r/writing         | Weekly Critique and Self-Promotion Thread                                      | weekly         | Only place for work-sharing + promo                                        |
| r/writing         | Mon/Thu Writer's Block, Tue/Fri Brainstorming, Wed General, Sat First Page     | daily          | Low-stakes karma surfaces                                                  |
| r/selfpublish     | Weekly Self-Promo and Chat Thread                                              | weekly         | Only self-promo surface                                                    |
| r/screenwriting   | Five Page Thursday, Black List Wednesday, Cold Query Tuesday                   | weekly         | Community threads; karma-building                                          |
| r/VideoEditing    | **Monthly Developer/Tool creator thread**                                      | monthly        | Sanctioned BuildOS mention surface (rare for creator subs)                 |
| r/VideoEditing    | Monthly "What software?" / "What hardware?" / Feedback                         | monthly        | Recurring structured discussion                                            |
| r/podcasting      | **Wednesday 7am ET Product or Service promotional thread**                     | weekly         | Sanctioned BuildOS mention surface                                         |
| r/podcasting      | Thursday Weekly Episode Thread                                                 | weekly         | Podcast self-promo                                                         |
| r/podcasting      | Friday Trailer Exchange / Tuesday 7am ET Job Announcement                      | weekly         |                                                                            |
| r/NewTubers       | Feedback Friday / Self-Introduce Saturday / Motivational Monday / Monthly Goal | weekly+monthly | Structured participation mechanics                                         |
| r/Substack        | Pinned Soliciting Recommendations megathread                                   | ongoing        | For newsletter recs; self-promo also megathread-gated                      |
| r/Newsletters     | Weekly pinned self-promo thread                                                | weekly         | Only sanctioned link surface                                               |
| r/Notion          | **Fortnightly pinned Self-promo & Showcase thread**                            | bi-weekly      | The _only_ third-party/integration/showcase surface                        |
| r/Notion          | Product Feedback for Notion thread                                             | pinned         | For Notion-specific feedback only (not ours)                               |
| r/getdisciplined  | Daily/Weekly [Plan] threads (specific mod-run format)                          | daily+weekly   | Structured planning format                                                 |
| r/ExperiencedDevs | "Ask Experienced Devs" Weekly Thread                                           | weekly         | Only space for <3 YOE devs (not us)                                        |
| r/ADHD            | Weekly megathreads on frequent topics                                          | weekly         | Karma-farming surface; never mention BuildOS                               |

### Subs with mod-approval paths (rare, valuable)

- **r/NewTubers** (Rule 2) — contact mod team for pre-approval of product posts. Realistic: ~4 months after established participation.
- **r/ExperiencedDevs** (Rule 8) — mod approval for surveys/ads possible; unlikely for BuildOS.
- **r/NewTubers** is the highest-EV of these paths.

### Evergreen thread patterns (T4 input)

BuildOS-thesis threads that recur across multiple subs. Each is a candidate for the evergreen-thread inventory:

1. **"How do you keep your [projects / worlds / lore / content] organized across a long run?"** — recurs in r/writing, r/worldbuilding, r/solopreneur, r/Notion, r/ObsidianMD, r/podcasting.
2. **"What tools do you use?"** — recurs in r/writing (Sunday thread), r/worldbuilding, r/contentcreation, r/solopreneur, r/Newsletters, r/Notion.
3. **"I can't finish anything / my system broke"** — r/writing (ADHD-diagnosed thread), r/Substack ("Anyone else feel like writing isn't the actual problem?"), r/getdisciplined ("i thought discipline was my problem, but my system was broken"), r/productivity ("I spent 3 years chasing productivity systems").
4. **"Does anyone else find it 10x easier to 'explain' your video out loud than to actually write it down?"** — r/NewTubers; exact BuildOS voice-first thesis.
5. **"Alternative to [Notion / Scrivener / Final Draft] that doesn't lean into AI"** — recurring migration-pain threads in r/Notion, r/writing, r/screenwriting.
6. **"My lore kept contradicting itself until I changed how I organize everything"** — r/worldbuilding; exact continuity thesis.
7. **Solo-operator overwhelm** — "Any one-person band and how you juggle?" (r/podcasting), "How do you deal with decision fatigue?" (r/solopreneur), "How do you keep your projects organised?" (r/solopreneur).

### Cultural canaries (read before commenting)

High-upvote mod or community posts that signal cultural lines we must not cross:

- **r/screenwriting**: "Please stop submitting your vibe-coded software & general reminders" (111↑) — sub is tired of outsider tool promotion.
- **r/ObsidianMD**: "If your first post is to promote your app, you will be banned" (1,360↑) — first-post-promo ban is actively enforced.
- **r/youtubers**: Rule 4 bans "disguised self-promo ('I found this great tool…')" as instant-permaban.
- **r/ADHD**: Rule 8 — "If you made it, work on it, benefit from it, were asked to share it, or know the creator, don't post it. Free or paid doesn't matter. No loopholes. Violations = permanent ban."
- **r/productivity**: Pinned mod post (239↑) — "NO ADVERTISING IS ALLOWED OF ANY KIND (including solicitation)! Advertising = Instant ban."
- **r/worldbuilding**: Top 2 of week are both anti-AI posts (3801↑ + 3766↑); Rule 5 specifically bans "using AI to organize, edit, present, or rewrite material."
- **r/Notion**: "Why is everyone always selling something?" (159↑/52💬) — users are spam-fatigued.
- **r/ExperiencedDevs**: "Show of hands: How many of you feel your stomach turn whenever you run into AI content?" (173↑/177💬) — anti-AI-slop.

### AI-framing hard-ban subs (never use "AI" as primary BuildOS frame)

- r/writing (Rule 4: "No Generative AI — AI slop has no place here.")
- r/selfpublish (Rule 2)
- r/worldbuilding (Rule 5)
- r/screenwriting (Rule 3)
- r/NewTubers (Rule 5)
- r/productivity (sidebar + Rule 6)
- r/getdisciplined (Rule 5)
- r/ObsidianMD (Rule 4)

### Creator-adjacent high-value redditors (seed list for T4 research task 4)

_To be populated during warmup scans as we watch top commenters across scans. Looking for users who show up repeatedly with high-quality tool-workflow takes._

### Cross-sub user overlap signals

_To be populated during warmup scans. Expected overlaps:_

- r/writing ↔ r/selfpublish ↔ r/worldbuilding (likely heavy overlap)
- r/NewTubers ↔ r/VideoEditing ↔ r/contentcreation (likely overlap)
- r/solopreneur ↔ r/Notion (likely overlap for indie SaaS builders)
- r/ADHD ↔ r/getdisciplined ↔ r/productivity (likely overlap)

### BuildOS Fit rationale quick reference

- **high** — Creator/productivity workflows are the sub's core topic; BuildOS mention is plausibly useful in 1–3 thread types/week, with a clearly sanctioned surface.
- **medium** — BuildOS mention is occasionally relevant but most threads are off-topic; participate for culture signal and rare tool-thread opportunities.
- **low-but-relevant** — Sub culture is hostile to tool plugs (e.g. r/ExperiencedDevs, r/ObsidianMD) or heavily off-topic for BuildOS, but still worth knowing.
- **de-prioritize** — Not worth karma-building in; minimal profile only.

---

## Scan History

| Date       | Subs Scanned | Notes                                                                                                                                                                                                           |
| ---------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-17 | 20           | Initial research pass. Data via Reddit JSON API (about/rules/top-week/top-month/new/hot + per-sub search queries). Synthesized per-sub profiles with rules verbatim, culture signal, and thread-type inventory. |

---

## How to Update This File

During each Reddit warmup scan:

1. Update the `Last Visited` column with today's date for each sub scanned
2. Update subscriber counts if changed significantly (5%+ or 10K+)
3. Update the Activity Proxy with the latest top-week post's score and comment count
4. Re-rate `Promo Tolerance` or `BuildOS Fit` only if evidence warrants it (log the reason in the profile doc's Notes log)
5. Log the scan in "Scan History"

---

_This is a living document. First populated 2026-04-17 as part of T3 (see `buildos-strat-tasks.md`)._
