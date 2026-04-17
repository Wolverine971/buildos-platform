<!-- docs/marketing/social-media/reddit/subreddit-profiles/INDEX.md -->

# BuildOS Subreddit Profile Database

> Per-sub profiles for BuildOS's Reddit strategy.
> **Last Updated: 2026-04-17**
> **Total Profiles: 20**

**Related Docs:**

- **[Subreddit Tracker](../reddit-subreddit-tracker.md)** — Live tracking with last visited dates, aggregate stats, recurring-thread inventory
- **[Reddit Reply Strategy](../reddit-reply-strategy.md)** — Voice + angle + decision rails for Stage 2 comment drafting (v0.1)
- **[Research Spec](../reddit-subreddit-research-spec.md)** — The source task spec (T3) that produced these profiles
- **[Brand Guide](../../../brand/brand-guide-1-pager.md)** — Non-negotiable voice + terms
- **[Creator Wedge Strategy](../../../strategy/thinking-environment-creator-strategy.md)** — Authors + YouTubers primary audience
- **[Anti-AI Positioning](../../../strategy/anti-ai-show-dont-tell-strategy.md)** — Don't lead with AI

---

## How To Read This Index

Each profile captures, for one subreddit:

- Rules verbatim (from Reddit's public JSON API as of the scan date)
- Karma / account age gates (where publicly stated)
- Moderation posture with evidence
- Culture + voice signals from top-week and top-month posts
- Sub-specific terminology (insider vs. outsider vocabulary)
- Thread types where BuildOS is plausibly relevant (with constraints)
- 3–5 recent real thread examples with upvote/comment counts
- Voice notes for future commenting
- Karma-building strategy with realistic timelines and hard constraints

Profile files live in this directory as `{sub-name}.md` (without `r/` prefix, matching Reddit's canonical casing).

---

## Quick Stats

| Category                     | Profiles | Combined Subscribers |
| ---------------------------- | -------- | -------------------- |
| Tier 1 — Author subs         | 4        | ~7.23M               |
| Tier 1 — YouTuber subs       | 3        | ~1.50M               |
| Tier 2 — Secondary creators  | 6        | ~329K                |
| Tier 3 — Productivity / PKM  | 4        | ~7.07M               |
| Tier 4 — Supporting affinity | 2        | ~2.59M               |
| **TOTAL**                    | **20**   | **~19.25M**          |

---

## 📖 Tier 1 — Primary Creator Subs: Authors (4)

Core BuildOS wedge. Authors working on multi-month creative projects.

| Profile                               | Subscribers | Promo Tolerance | BuildOS Fit | One-line summary                                                                                    |
| ------------------------------------- | ----------- | --------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| [r/writing](./writing.md)             | 3.36M       | strict          | high        | 800-lb gorilla of writing subs. Craft-focused; Sunday Tool thread is the only sanctioned surface.   |
| [r/selfpublish](./selfpublish.md)     | 241K        | strict          | high        | Indie-author-operators. Business of shipping books. Weekly self-promo thread only.                  |
| [r/worldbuilding](./worldbuilding.md) | 1.88M       | moderate        | high        | "My lore keeps contradicting itself" = exact BuildOS thesis. Rule 5 bans AI-as-organizer framing.   |
| [r/screenwriting](./screenwriting.md) | 1.76M       | strict          | medium      | Industry-savvy screenwriters; hostile to outsider software ("stop submitting vibe-coded software"). |

### Highest-leverage author thread patterns

- **r/writing Sunday Tool thread** — the sanctioned monthly-cadence mention surface in the biggest writing sub.
- **r/worldbuilding "how do you track your worlds" recurring threads** — BuildOS-continuity thesis in the wild.
- **r/selfpublish Weekly Self-Promo thread** — the only launch-recap surface, after we have real users.

---

## 🎥 Tier 1 — Primary Creator Subs: YouTubers (3)

Video creator workflows — production is multi-month and under-scaffolded.

| Profile                             | Subscribers | Promo Tolerance       | BuildOS Fit   | One-line summary                                                                                    |
| ----------------------------------- | ----------- | --------------------- | ------------- | --------------------------------------------------------------------------------------------------- |
| [r/youtubers](./youtubers.md)       | 329K        | strict                | de-prioritize | **Currently CLOSED for renovations.** Revisit quarterly. Strictest rules of any target sub.         |
| [r/NewTubers](./NewTubers.md)       | 668K        | strict                | high          | Small-creator solidarity. Multiple structured weekly threads + mod-approval path for product posts. |
| [r/VideoEditing](./VideoEditing.md) | 505K        | strict-but-structured | medium        | Hobbyist editors. **Monthly Developer/Tool creator thread** — rare sanctioned dev surface.          |

### Highest-leverage YouTuber thread patterns

- **r/NewTubers "Does anyone else find it 10x easier to 'explain' your video out loud than to write it down?"** — literal BuildOS voice-first thesis.
- **r/VideoEditing Monthly Developer/Tool thread** — sanctioned monthly cadence for BuildOS dev post.
- **r/NewTubers mod-approval path (Rule 2)** — formal negotiation route for a product post after ~4 months of karma.

---

## 🎙️ Tier 2 — Secondary Creator Subs (6)

Podcasters, newsletter operators, Substack writers, general creators, solopreneurs.

| Profile                                   | Subscribers | Promo Tolerance | BuildOS Fit      | One-line summary                                                                                                  |
| ----------------------------------------- | ----------- | --------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| [r/podcasting](./podcasting.md)           | 180K        | strict          | medium           | Production-weary podcasters. Wednesday Product thread = sanctioned BuildOS surface. Rule 11 bans market research. |
| [r/Substack](./Substack.md)               | 47K         | moderate        | high             | Essayist/newsletter writers. "Anyone else feel like writing isn't the actual problem?" = our exact thesis.        |
| [r/Newsletters](./Newsletters.md)         | 12K         | moderate        | low-but-relevant | Small operator-focused sub (CPM, sponsorship, open rates). Weekly pinned thread is the link surface.              |
| [r/contentcreation](./contentcreation.md) | 23K         | moderate        | medium           | Generalist creators in an AI-tool-exploration phase. "AI creative stack" is the local vocabulary.                 |
| [r/creators](./creators.md)               | 7K          | moderate        | low-but-relevant | Tiny permissive sub. Rule 2: "self-promo must be earned" — creator-friendly but low reach.                        |
| [r/solopreneur](./solopreneur.md)         | 60K         | moderate        | high             | DJ's native peer group. "How do you keep your projects organised?" (16↑) = literal BuildOS thesis.                |

### Highest-leverage Tier 2 thread patterns

- **r/Substack "Anyone else feel like writing isn't the actual problem?"** — direct BuildOS thesis; reply with craft-level insight.
- **r/solopreneur "How do you keep your projects organised?"** — founder-disclosed reply is welcome.
- **r/podcasting Wednesday Product thread** — sanctioned weekly mention surface with founder disclosure.

---

## 🧠 Tier 3 — Cross-Cutting: Productivity / Tool-Switchers (4)

Big productivity subs + power-user tool subs. Most crowded, strict on promo.

| Profile                                 | Subscribers | Promo Tolerance | BuildOS Fit      | One-line summary                                                                                                           |
| --------------------------------------- | ----------- | --------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [r/productivity](./productivity.md)     | 4.17M       | strict          | medium           | Biggest productivity sub on Reddit. **Rule 2 bans self-promo even when asked.** Zero mention surface.                      |
| [r/getdisciplined](./getdisciplined.md) | 2.14M       | strict          | medium           | Self-discipline + habit sub. Rule 4 permabans link-posting; Rule 7 gates posts at 30 days + 200 karma.                     |
| [r/Notion](./Notion.md)                 | 453K        | strict          | high             | Power-user Notion-ers. Fortnightly Self-promo & Showcase thread = our surface. "Leaning into AI" = our framing sweet spot. |
| [r/ObsidianMD](./ObsidianMD.md)         | 310K        | strict          | low-but-relevant | Customization-obsessed PKM community. "If your first post is to promote your app, you will be banned" (1.36K↑).            |

### Highest-leverage Tier 3 thread patterns

- **r/Notion Fortnightly Self-promo & Showcase thread** — our bi-weekly-cadence BuildOS surface.
- **r/Notion migration threads** ("Alternative to Notion that isn't leaning into AI") — BuildOS positioning sweet spot; comment-only pending fortnightly thread cadence.
- **r/productivity / r/getdisciplined** — zero mention surface; karma-farming + cultural-intel only.

---

## 🫂 Tier 4 — Supporting Affinity (2)

Participate authentically. ADHD (core user archetype) + developers (DJ's professional peer group).

| Profile                                   | Subscribers | Promo Tolerance                | BuildOS Fit                        | One-line summary                                                                                               |
| ----------------------------------------- | ----------- | ------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [r/ADHD](./ADHD.md)                       | 2.21M       | strict (permaban on any promo) | high (comment-only, never mention) | Largest ADHD peer-support community. Rule 8 permabans any product mention, no loopholes. Comment-only forever. |
| [r/ExperiencedDevs](./ExperiencedDevs.md) | 382K        | strict                         | low-but-relevant                   | 3+ year dev gate. Anti-AI-slop cultural moment. BuildOS off-topic; DJ participates as senior engineer peer.    |

### Highest-leverage Tier 4 thread patterns

- **r/ADHD "has a planner ever worked for you guys?"** and similar — high-relevance cultural signal. Lived-experience comments only; never mention product.
- **r/ExperiencedDevs "Personal knowledge systems - what works for you"** — rare BuildOS-adjacent thread. Comment from real system experience.

---

## 🚨 Cultural Canaries (Read Before Commenting)

High-upvote community or mod posts that explicitly set anti-promo lines. Read the referenced thread before making any BuildOS mention in that sub.

| Sub               | Canary Post                                                                                              | Upvotes       | What it means                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------- |
| r/ObsidianMD      | "If your first post is to promote your app, you will be banned"                                          | 1,360         | First-and-only promotional post = immediate permaban.            |
| r/productivity    | "NO ADVERTISING IS ALLOWED OF ANY KIND (including solicitation)! Advertising = Instant ban"              | 239           | Even asked-for recommendations are banned.                       |
| r/worldbuilding   | "Everyone knows you're using AI" + "I'd rather read your broken English post than an AI transcribed one" | 3,801 + 3,766 | Actively anti-AI cultural moment — never lead with AI here.      |
| r/productivity    | "/r/productivity is being hit hard by AI generated slop + advertising spam"                              | 175           | Users are primed to report — do not add to the pile.             |
| r/ADHD            | Rule 8 (verbatim): "If you made it... don't post it. Free or paid doesn't matter. No loopholes."         | —             | Explicit preemption of every workaround we'd try.                |
| r/screenwriting   | "Please stop submitting your vibe-coded software & general reminders"                                    | 111           | Direct warning to BuildOS-shaped indie software posters.         |
| r/Notion          | "Why is everyone always selling something?"                                                              | 159           | Spam-fatigue signal; one-more-tool post will land badly.         |
| r/ExperiencedDevs | "Show of hands: How many of you feel your stomach turn whenever you run into AI content?"                | 173           | Anti-AI-slop dev moment; "AI dev tool" framing will be rejected. |

---

## 🎯 Top Strategic BuildOS Targets

Based on audience alignment, cultural fit, and sanctioned mention surfaces:

### Must Engage (direct thesis alignment + sanctioned surface)

1. **r/solopreneur** — DJ's native peer group; recurring BuildOS-thesis threads; Rule 1 explicitly allows straightforward self-promo.
2. **r/Substack** — "Writing isn't the actual problem" thesis threads recur here weekly.
3. **r/worldbuilding** — Rule 7 allows non-disruptive advertising; "my lore keeps contradicting itself" threads recur.
4. **r/NewTubers** — large + active + mod-approval path for product posts.
5. **r/writing** — biggest creator sub. Sunday Tool thread is a narrow but real surface.

### Build Credibility Through Participation (commenting earns the right)

1. **r/selfpublish** — build launch-recap credibility before mentioning.
2. **r/Notion** — wait for fortnightly thread, frame as complement.
3. **r/podcasting** — Wednesday Product thread is ready when DJ/BuildOS has podcaster use cases.
4. **r/contentcreation** — "AI creative stack" thread pattern is our sweet spot.
5. **r/VideoEditing** — Monthly Developer thread when we have video-workflow users.

### Karma Farm / Cultural Intel (never mention product)

1. **r/ADHD** — our natural user base, but Rule 8 is absolute. Human-only.
2. **r/productivity** — zero surface; karma-farm only.
3. **r/getdisciplined** — same; comment on lived-experience threads.
4. **r/ExperiencedDevs** — DJ's senior-dev peer sub; engage as engineer.
5. **r/screenwriting** — cultural intel; hostile to outsider software.

### De-prioritize Or Skip

1. **r/youtubers** — currently CLOSED. Revisit quarterly.
2. **r/Newsletters** — small, off-topic for BuildOS.
3. **r/creators** — tiny, low reach.
4. **r/ObsidianMD** — switching-cost-locked audience; only useful if a team member is a genuine Obsidian user.

---

## Engagement Priority Legend

| Priority             | Meaning                                                          | Action                                                                      |
| -------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **high**             | Direct BuildOS thesis alignment + sanctioned mention surface     | Karma-build → participate in sanctioned thread → founder-disclosed mentions |
| **medium**           | Occasional BuildOS relevance in specific recurring threads       | Comment from lived experience; mention only where thread type warrants      |
| **low-but-relevant** | Cultural overlap but narrow surface                              | Comment-only; do not plug                                                   |
| **de-prioritize**    | Structural blockers (closed sub, absolute anti-promo, off-topic) | Minimal engagement; revisit periodically                                    |

---

## Profile Field Reference

Every profile uses this frontmatter:

```yaml
---
subreddit: r/{sub}
tier: 1|2|3|4
audience_wedge: authors|youtubers|podcasters|etc.
subscribers: { integer }
daily_active_estimate: { string; Reddit deprecated this, so narrative }
promo_tolerance: strict|moderate|lax
buildos_fit: high|medium|low-but-relevant|de-prioritize
last_scanned: YYYY-MM-DD
---
```

And this body structure (with the spec-required sections):

1. One-line summary
2. Self-promotion rules (verbatim from JSON API)
3. Karma / account age requirements
4. Moderation posture
5. Culture & voice
6. Sub-specific terminology
7. Thread types where BuildOS would be a legit recommendation
8. Recent real examples (3–5 threads)
9. Voice notes for future commenting
10. Karma-building strategy
11. Notes log

---

## Related Documentation

- **[BuildOS Marketing Strategy 2026](/docs/marketing/strategy/buildos-marketing-strategy-2026.md)** — Master positioning
- **[Anti-AI Show-Don't-Tell Strategy](/docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md)** — Don't lead with AI
- **[Thinking Environment Creator Strategy](/docs/marketing/strategy/thinking-environment-creator-strategy.md)** — Creator-wedge rationale
- **[BuildOS Guerrilla Content Doctrine](/docs/marketing/strategy/buildos-guerrilla-content-doctrine.md)** — Solo-founder operating doctrine
- **[buildos-strat.md §Part 4](/buildos-strat.md)** — Reddit strategy (source of truth)
- **[buildos-strat-tasks.md T3](/buildos-strat-tasks.md)** — T3: this task's definition of done
- **[Reddit Subreddit Tracker](../reddit-subreddit-tracker.md)** — Live tracker with scan history and recurring-thread inventory

### Workflows

- **`/reddit-warmup`** (Stage 1) — Daily thread-sourcing pass. Consumes this INDEX + the tracker, scores threads via the JSON API, surfaces top 5–7 for human review. See `.claude/commands/reddit-warmup.md`.
- **`/reddit-reply`** (Stage 2) — Comment-drafting pass. Loads the Stage 1 output + `reddit-reply-strategy.md` + per-sub profiles, drafts 2–3 options per thread using the 4-pattern library, and runs every draft through a 7-question quality gate. See `.claude/commands/reddit-reply.md`.

Each Stage 2 draft appends a `Drafted` entry to the relevant sub profile's `Notes log`; on user confirmation the entry is updated to `Posted` with the exact text. Strategy is v0.1 — pre-voice-data; expect v1.0 after ~30 days of real replies.

---

_Audited: 2026-04-17_
_Auditor: Claude Code (Reddit JSON API + synthesis pass, per T3 spec)_
_Status: COMPLETE — All 20 target subs profiled, tracker populated, recurring-thread inventory captured_
