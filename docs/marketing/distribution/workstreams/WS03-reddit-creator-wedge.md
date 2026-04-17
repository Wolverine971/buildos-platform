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

| Task | Title | Type | Wave | Effort | Status | Spec |
|------|-------|------|------|--------|--------|------|
| T03 | Creator-subreddit research | R | 1 | ~4 h (batch over 2–3 sessions) | 🔵 spec drafted 2026-04-17 | [reddit-subreddit-research-spec.md](../../social-media/reddit/reddit-subreddit-research-spec.md) |
| T10 | Reddit karma accumulation | O | 1 + recurring | 15 min/day × 90 d | 🔁 ⚪ | see [RECURRING](../RECURRING.md#daily) |
| T11 | Create r/buildos | O | 1 | 30 min | ⚪ | inline below |
| T27 | First promotional posts | O | 3 | ongoing | ⏸ gated on T10 | inline below |

## Required reading

- [Strategy §Part 4](../../../../buildos-strat.md#part-4-reddit-strategy-for-buildos) — full Reddit playbook
- [Brand guide](../../brand/brand-guide-1-pager.md) — voice for Reddit comments
- [Research spec (T03)](../../social-media/reddit/reddit-subreddit-research-spec.md) — this is also the template for the future `/reddit-warmup` command
- `.claude/commands/twitter-warmup.md` — pattern reference for Stage 1/Stage 2 command layout

## Scope

**In scope:**
- All 20 target subreddits listed in T03 spec
- Karma accumulation cadence (daily comments, no BuildOS mentions during runway)
- Defensive r/buildos subreddit squat
- First promotional posts once karma gate is cleared
- Future `/reddit-warmup` command (design-in by making T03 outputs warmup-ready)

**Out of scope:**
- Comment-template drafting (that's future work after first month of real commenting provides voice data)
- Other Reddit tactics (ads, modmail outreach to mods, etc.)
- Non-Reddit community channels (Discord, Circle, etc.)

## Current state

- **T03 spec drafted and in execution** at [reddit-subreddit-research-spec.md](../../social-media/reddit/reddit-subreddit-research-spec.md)
- **Research outputs will land** in `docs/marketing/social-media/reddit/reddit-subreddit-tracker.md` and `docs/marketing/social-media/reddit/subreddit-profiles/`
- **Karma runway has not started** — T10 should begin the same day as T03 research, per strategy

## Dependency chain within this work stream

```
T03 (in exec) ──► T10 (can start in parallel with T03)
T11 (independent, do today) ──► no dependencies
T10 ──► T27 (gate: 500 karma/primary sub, ~day 90)
```

## Cross-workstream dependencies

- **WS04 T15 (framework doc) → T27.** First big Reddit posts should point back to the framework doc. Don't post promotionally before it exists.
- **WS01 T12 (public pages Phase 1) → T27 share material.** Public pages give Reddit comments + posts actual linkable artifacts (not just "check out our landing page").
- **WS02 T01 (baseline) — observe Reddit's effect on LLM citations.** T28 monthly remeasure should track whether Reddit mentions lift citation rates.

## Output artifacts

| Artifact | Location |
|----------|----------|
| T03 research spec (handoff) | `docs/marketing/social-media/reddit/reddit-subreddit-research-spec.md` |
| Subreddit tracker | `docs/marketing/social-media/reddit/reddit-subreddit-tracker.md` |
| Per-sub profiles (×20) | `docs/marketing/social-media/reddit/subreddit-profiles/{name}.md` |
| Profile index | `docs/marketing/social-media/reddit/subreddit-profiles/INDEX.md` |
| Daily engagement docs (future) | `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_reddit-warmup.md` |
| Reddit mentions log (non-ours) | `docs/marketing/measurement/reddit-mentions-log.md` (future) |
| `/reddit-warmup` command (future) | `.claude/commands/reddit-warmup.md` |
| Reddit skill (future) | `.claude/skills/reddit/SKILL.md` |

## Task briefs

### T03 — Creator-subreddit research 🔵

**Full spec:** [reddit-subreddit-research-spec.md](../../social-media/reddit/reddit-subreddit-research-spec.md). Execution in progress.

**Short version:** For each of 20 target subs (Tier 1 authors + YouTubers, Tier 2 other creators, Tier 3 cross-cutting, Tier 4 supporting affinity), capture subscribers, daily active estimate, promo rules verbatim, moderation posture, culture, thread types where BuildOS fits, and 3–5 recent example threads.

**Done when:** tracker + 20 profiles + INDEX.md committed.

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

## Future: `/reddit-warmup` command

Planned but not yet built. Design-in happens by ensuring T03 research outputs are warmup-consumable. Full sketch at the bottom of [reddit-subreddit-research-spec.md](../../social-media/reddit/reddit-subreddit-research-spec.md#future-reddit-warmup-command).

**Build gate:** after T03 tracker is populated + 30 days of manual T10 comments yields voice data.

## Open questions

1. **Username for the burner-ish account.** Needs to sound like a real creator. Candidates?
2. **Should DJ have TWO accounts** — a "real DJ" account with founder disclosure, and a "quiet research" account for lurking? Risk = shadowban if Reddit detects evasion. Recommendation: one account, always disclosed.
3. **r/ClaudeAI / r/artificial / r/LocalLLaMA** — mention in T03 research as "candidates only." Defer formal tiering.

## Change log

- **2026-04-17** — Work stream created. T03 spec drafted earlier today and in execution. T10/T11 unblocked for today. T27 gated.
