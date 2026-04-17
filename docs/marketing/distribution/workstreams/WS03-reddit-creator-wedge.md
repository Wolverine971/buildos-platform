<!-- docs/marketing/distribution/workstreams/WS03-reddit-creator-wedge.md -->

---

id: WS03
title: Reddit Creator-Wedge Program
wave_span: 1-3 + recurring
status: in-progress
owner: DJ
related_tasks: [T03, T10, T11, T27]
cross_workstreams: [WS04]
last_updated: 2026-04-17

---

# WS03 — Reddit Creator-Wedge Program

> [← Index](../README.md) · [Conventions](../CONVENTIONS.md) · [Strategy §Part 4](../../../../buildos-strat.md#part-4-reddit-strategy-for-buildos) · [Task List](../../../../buildos-strat-tasks.md)

## One-line goal

Build authentic Reddit presence in creator-focused subreddits (authors, YouTubers, podcasters) so BuildOS gets mentioned, recommended, and cited — via the 90/10 rule: 90% value, 10% promotion, always founder-disclosed.

## Why this is a work stream

Strategy ranks Reddit as the single highest-ROI non-product distribution channel in 2026:

- Appears in ~97% of product-review Google queries (dual SEO visibility)
- Top training data source for LLMs (citation visibility)
- Creator subs are where authors and YouTubers actually work out loud

**But:** violating the 90/10 rule bans SaaS founders inside a month (80%+ of attempts fail). The karma runway is 3 months; every day not started is a day later to first posts.

## Status dashboard

| Task | Title                      | Type | Wave          | Effort                         | Status                  | Spec                                                                                                                                                                                                                     |
| ---- | -------------------------- | ---- | ------------- | ------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T03  | Creator-subreddit research | R    | 1             | ~4 h (batch over 2–3 sessions) | ✅ completed 2026-04-17 | [tracker](../../social-media/reddit/reddit-subreddit-tracker.md) · [profile INDEX](../../social-media/reddit/subreddit-profiles/INDEX.md) · [original spec](../../social-media/reddit/reddit-subreddit-research-spec.md) |
| T10  | Reddit karma accumulation  | O    | 1 + recurring | 15 min/day × 90 d              | 🔁 ⚪                   | see [RECURRING](../RECURRING.md#daily)                                                                                                                                                                                   |
| T11  | Create r/buildos           | O    | 1             | 30 min                         | ⚪                      | inline below                                                                                                                                                                                                             |
| T27  | First promotional posts    | O    | 3             | ongoing                        | ⏸ gated on T10         | inline below                                                                                                                                                                                                             |

## Required reading

- [Strategy §Part 4](../../../../buildos-strat.md#part-4-reddit-strategy-for-buildos) — full Reddit playbook
- [Brand guide](../../brand/brand-guide-1-pager.md) — voice for Reddit comments
- [Subreddit tracker](../../social-media/reddit/reddit-subreddit-tracker.md) — 19 target subs + cadence + cultural canaries
- [Profile INDEX](../../social-media/reddit/subreddit-profiles/INDEX.md) — per-sub rules, culture, thread types
- [`/reddit-warmup` command](../../../../.claude/commands/reddit-warmup.md) — daily Stage 1 flow
- [Reddit skill](../../../../.claude/skills/reddit/SKILL.md) — JSON API + browser patterns
- [Research spec (archived)](../../social-media/reddit/reddit-subreddit-research-spec.md) — completed; use for quarterly re-runs

## Scope

**In scope:**

- All 19 target subreddits catalogued in the tracker (r/youtubers currently closed — de-prioritized)
- Karma accumulation cadence (daily comments, no BuildOS mentions during runway)
- Defensive r/buildos subreddit squat
- First promotional posts once karma gate is cleared
- `/reddit-warmup` command (Stage 1 ✅ built; Stage 2 `/reddit-reply` pending voice data)

**Out of scope:**

- Comment-template drafting (that's future work after first month of real commenting provides voice data)
- Other Reddit tactics (ads, modmail outreach to mods, etc.)
- Non-Reddit community channels (Discord, Circle, etc.)

## Current state

- **T03 completed 2026-04-17.** Tracker + INDEX + 19 per-sub profiles committed to `docs/marketing/social-media/reddit/`.
- **`/reddit-warmup` Stage 1 command built.** Daily engagement flow ready to run.
- **Reddit skill built** at `.claude/skills/reddit/` with JSON-API + browser patterns.
- **Karma runway (T10) is now unblocked** — start this week; 90 days until T27 posts.
- **`/reddit-reply` Stage 2 command pending.** Gated on `docs/marketing/social-media/reddit/reddit-reply-strategy.md`, which needs ~30 days of manual commenting to produce real voice data.

## Dependency chain within this work stream

```
T03 ✅ ──► T10 (unblocked — start this week)
T11 (independent, do today) ──► no dependencies
T10 ──► T27 (gate: 500 karma/primary sub, ~day 90)
T10 (first 30 days) ──► reddit-reply-strategy.md ──► /reddit-reply (Stage 2)
```

## Cross-workstream dependencies

- **WS04 T15 (framework doc) → T27.** First big Reddit posts should point back to the framework doc. Don't post promotionally before it exists.
- **WS01 T12 (public pages Phase 1) → T27 share material.** Public pages give Reddit comments + posts actual linkable artifacts (not just "check out our landing page").
- **WS02 T01 (baseline) — observe Reddit's effect on LLM citations.** T28 monthly remeasure should track whether Reddit mentions lift citation rates.

## Output artifacts

| Artifact                             | Location                                                                   | Status                                |
| ------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------- |
| T03 research spec (archived)         | `docs/marketing/social-media/reddit/reddit-subreddit-research-spec.md`     | ✅ archive                            |
| Subreddit tracker                    | `docs/marketing/social-media/reddit/reddit-subreddit-tracker.md`           | ✅ live                               |
| Per-sub profiles (×19)               | `docs/marketing/social-media/reddit/subreddit-profiles/{name}.md`          | ✅ live                               |
| Profile index                        | `docs/marketing/social-media/reddit/subreddit-profiles/INDEX.md`           | ✅ live                               |
| JSON-API fetch helper                | `docs/marketing/social-media/reddit/tools/fetch-sub.sh`                    | ✅ live                               |
| `/reddit-warmup` command (Stage 1)   | `.claude/commands/reddit-warmup.md`                                        | ✅ live                               |
| Reddit skill                         | `.claude/skills/reddit/SKILL.md` + `references/workflows.md`               | ✅ live                               |
| Daily engagement docs                | `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_reddit-warmup.md` | generated by /reddit-warmup           |
| `reddit-reply-strategy.md` (Stage 2) | `docs/marketing/social-media/reddit/reddit-reply-strategy.md`              | ⏸ pending ~30 days of T10 voice data |
| `/reddit-reply` command (Stage 2)    | `.claude/commands/reddit-reply.md`                                         | ⏸ gated                              |
| Reddit mentions log (non-ours)       | `docs/marketing/measurement/reddit-mentions-log.md`                        | ⚪ future                             |

## Task briefs

### T03 — Creator-subreddit research ✅

**Completed 2026-04-17.**

**Output:** 19 per-sub profiles + tracker + INDEX, all under `docs/marketing/social-media/reddit/`. The spec's original "20 subs" target resolved to 19 (the tier list in the spec sums to 19; r/Newsletter singular doesn't exist as an active sub and was substituted with r/Newsletters plural).

**Key findings:**

- r/youtubers is currently CLOSED — de-prioritized until reopened.
- r/NewTubers has a formal mod-approval path for product posts — highest-EV negotiation route on Reddit.
- r/Notion's self-promo thread is **fortnightly, not weekly** — cadence constraint.
- r/ADHD / r/productivity / r/getdisciplined have **zero BuildOS mention surface** — karma-farm only.
- 8 of 19 subs hard-ban "AI" as a product frame (sidebar or rule text). Always workflow / thinking-environment framing.
- 14 of 19 subs are `strict` or `strict-but-structured` on promo — the 90/10 rule is non-negotiable on Reddit.
- Cultural canaries catalogued in the tracker — read before any engagement.

### T10 — Reddit karma accumulation 🔁

**Cadence and daily recipe:** see [RECURRING §Daily](../RECURRING.md#daily).

**Key numbers:**

- 15–20 min/day
- Target ~500 comment karma per primary sub over 90 days
- Max 5 comments/day across all subs (more looks campaign-y)
- **Zero BuildOS mentions during runway.** Zero. Not one.

**Kick-off action for today:**

1. Pick or create burner-account-ish real-sounding username (not branded)
2. Pick 2–3 Tier 1 subs to start in (r/writing + r/productivity is a reasonable day-1 pair)
3. Comment on 2–3 threads, purely value contribution
4. Log in a simple weekly-cadence note

**Gate it unlocks:** T27.

### T11 — Create r/buildos ⚪

**Goal:** Pure defensive squat so no one else can.

**Action:**

1. Reddit → create r/buildos
2. Set description, basic rules (no spam, keep it on-topic, disclose affiliations), sidebar with link to buildos.com
3. Do not promote yet — wait until WS01 T12 ships and we have a surface to send people to

**Effort:** 30 minutes, one-time. Can do this today.

**Assign to:** DJ-personal (requires DJ's Reddit account for mod ownership).

### T27 — First promotional posts ⏸

**Gate:** Do not start until ~500 comment karma hit in at least one primary sub + WS04 T15 framework doc published + WS01 T12 (public pages Phase 1) shipped.

**Post plan candidates (per strategy §Part 4):**

- r/writing: "I built a thinking environment for long-running creative projects — here's the framework" (point to T15 doc)
- r/productivity: "How I structure a multi-month project without losing context between sessions"
- r/YouTubers or r/podcasting: similar, tailored per-sub
- Show HN / Show r/SaaS — once product has shippable public surface

**Rules:**

- Follow each sub's self-promotion rules verbatim (per T03 profile)
- Founder disclosure in every post
- Honest about limitations
- Seeking feedback > announcing

**Max one promotional post per sub per 2 weeks. Revisit cadence after first 3 posts.**

## Agent assignment notes

- **T03 execution:** can delegate the per-sub scanning to a browser-capable agent, but DJ review on the final tracker is required (voice/culture reads are judgment calls).
- **T10:** DJ-personal. Agents cannot write Reddit comments in DJ's voice at the quality bar required.
- **T11:** DJ-personal (takes 30 min and requires his Reddit account).
- **T27:** DJ-personal for the first 3 posts; once voice is documented in drafts, future posts can have agent-drafted options.

## `/reddit-warmup` command — built 2026-04-17

**Stage 1 (live):** [.claude/commands/reddit-warmup.md](../../../../.claude/commands/reddit-warmup.md) drives the daily discovery flow. It:

- Prioritizes subs from the tracker (Tier 1 + any sub unvisited 7+ days)
- Uses the JSON API via [tools/fetch-sub.sh](../../social-media/reddit/tools/fetch-sub.sh) for fast discovery (not blocked like `WebFetch`)
- Scores candidate threads (freshness × fit × velocity × competition; penalizes cultural-canary matches)
- Writes a daily engagement doc to `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_reddit-warmup.md`
- Opens Chrome at the top 5–7 threads for human review
- Updates the tracker's `Last Visited` column and scan log

**Stage 2 (`/reddit-reply`) is gated** on `docs/marketing/social-media/reddit/reddit-reply-strategy.md`, which gets written after ~30 days of T10 manual commenting produces real voice data. Per the research spec: "Reply-crafting rules live in a future `reddit-reply-strategy.md` (to be written after first month of manual commenting yields real voice data)."

## Open questions

1. **Username for the burner-ish account.** Needs to sound like a real creator. Candidates?
2. **Should DJ have TWO accounts** — a "real DJ" account with founder disclosure, and a "quiet research" account for lurking? Risk = shadowban if Reddit detects evasion. Recommendation: one account, always disclosed.
3. **r/ClaudeAI / r/artificial / r/LocalLLaMA** — mention in T03 research as "candidates only." Defer formal tiering.

## Change log

- **2026-04-17** — Work stream created. T03 research spec drafted, executed, and completed in one day. 19 per-sub profiles + tracker + INDEX committed. Reddit skill + `/reddit-warmup` Stage 1 command built. T10/T11 unblocked; T27 still gated on karma runway.
