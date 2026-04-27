---
title: Discovery Flow Spec — Multi-Platform Creator/Person Discovery
status: draft
owner: dj
created: 2026-04-24
parent: ./buildos-lead-gen-system-plan.md
related:
    - ../../social-media/daily-engagement/
    - ../../social-media/instagram-profiles/
    - /.claude/commands/instagram-warmup.md
    - /.claude/commands/linkedin-warmup.md
    - /.claude/commands/twitter-warmup.md
    - /.claude/commands/reddit-warmup.md
tags:
    - discovery
    - creator-outreach
    - knowledge-graph
    - claude-code-commands
path: docs/marketing/growth/research/buildos-creator-discover-spec.md
---

# Discovery Flow Spec

Extend the existing warmup commands with a new **Stage 0: Discovery Scan**, add a cross-platform person graph, and wire every comment into a follow-up ladder that compounds toward DMs and BuildOS trials.

This spec is bespoke to BuildOS — inspired by Lead Grow's pipeline but not bound to their tools. Markdown-first, migrate to DB at scale.

---

## 1. Core thesis

> Every comment should seed a follow-up, not close a sale.

If we leave 1,000 high-quality comments on creators whose audiences look like ours, a 10% ladder-to-signup conversion is the north-star target. The soft-touch conversion model is what makes this viable at creator scale: no pitches, no DMs cold, just accumulated presence that eventually converts when the relationship is ready.

The system's job is to make that math reliable.

---

## 2. Platforms (branches of the funnel)

Each platform gets its own discover/warmup/reply trio, sharing a common person graph underneath.

| Platform    | Priority             | Commands                                                         | Notes                                           |
| ----------- | -------------------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| Instagram   | P0 (existing warmup) | `/instagram-discover` → `/instagram-warmup` → `/instagram-reply` | Richest creator wedge. Existing infrastructure. |
| LinkedIn    | P0 (existing warmup) | `/linkedin-discover` → `/linkedin-warmup` → `/linkedin-reply`    | Founders, operators. Higher signal per comment. |
| Twitter / X | P0 (existing warmup) | `/twitter-discover` → `/twitter-warmup` → `/twitter-reply`       | Fastest feedback loop.                          |
| YouTube     | P1                   | `/youtube-discover` → `/youtube-warmup` → `/youtube-reply`       | Content is indexable; comments have long decay. |
| Quora       | P2                   | `/quora-discover` → `/quora-warmup` → `/quora-reply`             | Different rhythm — answers, not comments.       |

**Shared across all platforms:**

- Search-term queue (annealed over time)
- Person graph (unified identity across platforms)
- Comment log (attribution ledger)
- Follow-up ladder state machine

---

## 3. The discovery scan (new Stage 0)

### What it does

Given a set of search terms for a platform, find accounts posting about those terms, score whether they're worth engaging with and worth tracking, and log the output into two queues.

### Inputs

- **Platform** (e.g., `instagram`)
- **Search terms** (from `docs/marketing/social-media/discovery/<platform>/search-terms.md`)
- **Scan quota** (e.g., 50 posts per term per run)
- **ICP context** (from BuildOS brand/strategy docs, already loaded by warmup commands)

### Process

1. **Load active search terms.** Skip terms flagged `retired` or below target hit rate.
2. **For each active term:**
   a. Search the platform (hashtag, keyword, or both)
   b. Pull top N recent posts
   c. Skip posts from accounts already in `known` or `scored_recent` state
   d. For each new account: extract follower count, post cadence (posts/week), bio, 3 recent captions
3. **Score each candidate** (two independent scores, see §4)
4. **Write results to:**
    - `docs/marketing/social-media/discovery/<platform>/candidates.md` (day's raw output)
    - `docs/marketing/social-media/people/<canonical-id>.md` (create or update person node)
    - Update `docs/marketing/social-media/discovery/<platform>/search-terms.md` with hit rate for each term
5. **Hand off the top-scored candidates** to the warmup command's engagement target pool.

### Output queues populated

- **Engage queue** — accounts with high `comment_fit` for today's `/warmup` to pull from
- **Watch queue** — accounts with high `track_worthiness` but not ready to engage yet
- **Retire queue** — search terms whose hit rate has decayed

### Rules

- **Never engage from the discover pass.** Discovery is read-only. All engagement happens in the existing `/warmup` → `/reply` flow.
- **Never comment on the same post twice** across any platform or scan.
- **Always log a seen-post** even if we don't engage — prevents rescanning.
- **Respect platform automation skills.** Use the existing `/.claude/skills/instagram/`, `/.claude/skills/linkedin/`, `/.claude/skills/twitter/`, `/.claude/skills/reddit/` skills for all platform interaction.

---

## 4. Scoring each candidate

Two independent scores per candidate, always logged together.

### 4.1 Comment Fit (0–10) — "should we engage on their posts right now?"

Factors:

- Topic overlap with BuildOS ICP (from annealed ICP prompt, see main plan §4.2)
- Post freshness (newer = higher)
- Comment competition (lower = higher)
- Natural reply angle exists (can we add value without forcing a BuildOS mention?)
- Tone match (can DJ sound native in their comment section?)

≥ 7 → `queue_for_engage_today`
5–6 → `queue_for_watch`
< 5 → `archive`

### 4.2 Track Worthiness (0–10) — "is this person worth a long-term relationship?"

Factors:

- Follower count tier: 1K–10K (+2), 10K–100K (+3), 100K–1M (+4), >1M (+2, harder to break in)
- Post cadence: ≥3/week = growing (+2), ≥1/week = active (+1), <1/week = dormant (0)
- Cross-platform presence (found on 2+ platforms = +2)
- Audience quality signals: thoughtful commenters (+2), spam-heavy (−3)
- Adjacent-to-BuildOS theme: ADHD, creator workflows, productivity, indie founder, solo builder, thinking tools (+3)
- Product/offering exists (course, newsletter, SaaS): +2 (proves they monetize and will notice community)

≥ 7 → `tracked` (profile created, added to person graph, eligible for follow-up ladder)
5–6 → `monitor_only` (light profile, recheck in 30 days)
< 5 → `archive` (no profile, just seen-list)

### 4.3 Quality signals (observed, not scored)

Always captured even for archived candidates:

- Follower count
- Posts/week
- Last post date
- Engagement rate (if available)
- Has paid product/course

These flow into `influence_score` (§7).

---

## 5. Search-term annealing

The discovery pass's queries improve over time — same annealing pattern as the ICP scoring prompt.

### Term state file

`docs/marketing/social-media/discovery/<platform>/search-terms.md`

```markdown
| Term                   | Status  | Runs | Accounts Found | Accounts Kept | Hit Rate | Last Run   | Notes                               |
| ---------------------- | ------- | ---- | -------------- | ------------- | -------- | ---------- | ----------------------------------- |
| #adhdproductivity      | active  | 14   | 312            | 58            | 18.6%    | 2026-04-24 | Stable                              |
| #brainfog              | active  | 9    | 188            | 12            | 6.4%     | 2026-04-24 | Drifting into health/wellness noise |
| "second brain"         | active  | 6    | 94             | 31            | 33.0%    | 2026-04-23 | High signal                         |
| #neurodivergentfounder | retired | 4    | 22             | 1             | 4.5%     | 2026-04-12 | Too rare, replaced                  |
```

### When a term is flagged for review

- `hit_rate < 10%` over 3+ runs → `review`
- `hit_rate > 25%` → `amplify` (look for adjacent terms, expand variant family)

### Annealing a term

Invoke `buildos-icp-anneal` (main plan §4.2) in "term generation" mode:

- Input: current term + its failure cases (accounts that scored low)
- Output: 3-5 replacement or adjacent term candidates
- DJ confirms, the new terms enter `testing` state for 3 runs before promotion

**No auto-retiring.** Annealing proposes; DJ approves. Human-in-the-loop.

---

## 6. The person graph (cross-platform identity)

The knowledge graph the user described. Each unique human = one file; their platform handles are nodes attached to that file.

### Structure

`docs/marketing/social-media/people/<canonical-id>.md`

`canonical-id` convention: lowercase-first-name-last-name, e.g., `ali-abdaal.md`. If ambiguous, append a short discriminator: `ali-abdaal-youtuber.md`.

### Template

```markdown
# Ali Abdaal

**Canonical ID:** ali-abdaal
**Display Name:** Ali Abdaal
**Primary platform:** youtube
**Influence Score:** 8.4 (see §7)
**Ladder Stage:** stage_2_commented
**Created:** YYYY-MM-DD
**Last Reviewed:** YYYY-MM-DD

## Handles

| Platform  | Handle     | URL                             | Followers | Last Scan  |
| --------- | ---------- | ------------------------------- | --------- | ---------- |
| youtube   | @aliabdaal | https://youtube.com/@aliabdaal  | 5.6M      | 2026-04-24 |
| instagram | @aliabdaal | https://instagram.com/aliabdaal | 1.1M      | 2026-04-22 |
| twitter   | @aliabdaal | https://twitter.com/aliabdaal   | 420K      | 2026-04-20 |

## Condensed Intel

- **What they do:** [themes]
- **Why they matter to BuildOS:** [strategic reason]
- **Best angles:** [reply angles that fit]
- **Avoid:** [dead ends]

## Offerings

- [Product / newsletter / course with link]

## Relationship Summary

[2-3 lines: where we are with them, what we've said, any replies/likes from them]

## Touchpoint Log

| Date       | Platform  | Surface | Post Link | Action | Angle   | Outcome            |
| ---------- | --------- | ------- | --------- | ------ | ------- | ------------------ |
| YYYY-MM-DD | instagram | comment | URL       | posted | [angle] | [reaction or null] |

## Connections

- Follows / is followed by: [other canonical-ids]
- Mentioned by / mentions: [other canonical-ids]
- Shared commenters with: [other canonical-ids]

## Ladder

- **Current stage:** stage_2_commented (see §8)
- **Next action:** third comment on different post; earliest: 2026-04-30
- **Notes:** [DJ-level notes]
```

### Linking platform profiles

The existing `instagram-profiles/<handle>.md`, `linkedin-profiles/<handle>.md`, etc. files stay as platform-specific working notes. The new `people/<id>.md` is the canonical node and links to each. Profile files reference their canonical person ID in frontmatter.

### When to migrate from markdown → DB

Triggers (any one):

- More than 500 person files
- Cross-platform deduplication becomes painful (3+ manual merges/week)
- Follow-up ladder needs scheduled reminders — cron over a DB beats markdown grep
- Attribution analysis becomes slow (grepping 500 files for signups)

When migrated, the schema mirrors §3 of the main plan (`creators`, `creator_content`, etc.), with the markdown files auto-exported as a rollback path.

---

## 7. Influence score

One number per person, recomputed whenever a handle's data refreshes.

```
influence_score (0–10) =
  0.30 × log_scale(total_followers_across_platforms)
+ 0.20 × avg_engagement_rate
+ 0.15 × platforms_active_count   (capped at 4)
+ 0.15 × posts_per_week_normalized
+ 0.10 × has_paid_offering
+ 0.10 × audience_quality_score   (from §4.3, derived)
```

Used for:

- **Priority in follow-up queue** — high-influence people get prioritized touches
- **DM readiness** — influence ≥ 7 + ladder_stage ≥ 4 → DM-eligible
- **Watch queue ranking** — who to promote to `tracked` next

Influence score is deliberately separate from Comment Fit and Track Worthiness. The scoring stage decides "are they in the game?" — influence decides "where in the batting order?"

---

## 8. The follow-up ladder

State machine for each tracked person. Every comment or touch advances a stage. Time gates prevent over-touching.

| Stage | Name               | Action                                                                                                                      | Earliest → next stage          |
| ----- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 0     | `discovered`       | Scored + added to person graph. No action yet.                                                                              | Immediate (if Comment Fit ≥ 7) |
| 1     | `lurked`           | Liked a post. No comment.                                                                                                   | 2 days                         |
| 2     | `commented_once`   | First substantive comment posted.                                                                                           | 7 days                         |
| 3     | `commented_twice`  | Second comment on a different post.                                                                                         | 10 days                        |
| 4     | `visible_presence` | 3+ comments across different posts; they may have noticed us. Light BuildOS-relevant comment allowed (Level 1 mention fit). | 14 days                        |
| 5     | `dm_intro`         | First DM — value-only, no pitch. Reference something specific they posted.                                                  | 14 days                        |
| 6     | `dm_followup`      | Second DM — soft BuildOS mention, invite to try.                                                                            | —                              |
| 7     | `activated`        | They signed up / tried / responded positively.                                                                              | —                              |
| -1    | `cold`             | No reaction across 5+ touches → demote to `monitor_only`.                                                                   | —                              |

### Rules

- No stage-skipping. A person earned through commenting; nothing else.
- Time gates are _minimums_, not schedules. Influence score raises their priority within the gate but doesn't bypass it.
- **Never** DM someone before stage 4.
- Every stage transition logs a row in the touchpoint log with date + action + angle.

### Where ladder state lives

- Markdown: `Ladder.Current stage:` + `Next action:` fields in the person file
- DB (post-migration): `ladder_state` and `ladder_eligible_at` columns on `creators`

---

## 9. Comment log & attribution

Single ledger for conversion math.

### File

`docs/marketing/social-media/comment-log.md` (or per-platform if it gets large)

```markdown
| Date       | Platform  | Person (canonical-id) | Post URL | Comment Text | Mention Fit | Ladder Stage Before | Ladder Stage After | Reaction Within 7d |
| ---------- | --------- | --------------------- | -------- | ------------ | ----------- | ------------------- | ------------------ | ------------------ |
| 2026-04-24 | instagram | ali-abdaal            | URL      | "..."        | 0           | 1                   | 2                  | like_on_comment    |
```

### Attribution

When a BuildOS signup happens:

1. Ask at signup: "how did you hear about us?" (standard UTM + self-report)
2. Search comment log for the signup's name / handle / email match
3. If matched: tag `social_attribution = {canonical_id, platform, first_touch_date, last_touch_date, total_touches}`
4. Write back to the person's file: `Ladder = activated`

### Conversion dashboard (post-DB migration)

- Total comments per month
- Comments by platform
- Ladder progression funnel (stage 2 → 3 → 4 → 5 → 6 → 7)
- Signups attributed
- **Conversion rate: signups / total comments** (target: 10%)
- Best-performing platforms, terms, and reply angles

**Before DB:** a weekly manual tally in a dated engagement log is fine.

---

## 10. File layout

```
docs/marketing/social-media/
├── discovery/
│   ├── instagram/
│   │   ├── search-terms.md                  # annealed term list
│   │   ├── candidates.md                    # rolling raw output
│   │   └── README.md
│   ├── linkedin/
│   ├── twitter/
│   ├── youtube/
│   └── quora/
├── people/                                  # canonical person graph (NEW)
│   ├── README.md
│   ├── _template.md
│   └── <canonical-id>.md
├── instagram-profiles/                      # existing platform-specific notes
├── linkedin-profiles/                       # existing
├── twitter-profiles/                        # existing if any
├── daily-engagement/                        # existing warmup/reply logs
├── comment-log.md                           # attribution ledger (NEW)
└── ...
```

---

## 11. Commands to build

Each platform gets a new `/xxx-discover` command following a symmetric pattern. Order of build:

1. `/instagram-discover` — first, because Instagram warmup is most mature
2. Shared: `people/` folder + `_template.md` + canonical-id convention
3. `/linkedin-discover`
4. `/twitter-discover`
5. `/youtube-discover`
6. `/quora-discover`
7. `buildos-icp-anneal` skill (main plan §4.2) — used by scoring and by term annealing

Each discover command will:

- Load the platform's `search-terms.md`
- Use the platform's browser skill (`/.claude/skills/<platform>/`)
- Write candidates to `discovery/<platform>/candidates.md`
- Create/update person nodes in `people/`
- Update platform profile files where appropriate
- Update `search-terms.md` with hit rates
- End with a concise summary + handoff to `/xxx-warmup`

---

## 12. Open questions

1. **Canonical ID collision policy** — what happens when two people share the same name? Proposed: append platform + handle disambiguator.
2. **Search-term seeding** — do we hand-write the initial terms per platform, or generate them from BuildOS strategy docs via LLM?
3. **Automation posture** — do we want discovery fully autonomous (cron'd nightly) or DJ-triggered per session? Recommendation: DJ-triggered during the first month; cron after search-term annealing stabilizes.
4. **Quora rhythm** — Quora answers aren't comments. Does Stage 2 on Quora = publishing a substantive answer that mentions a BuildOS-relevant angle? Need to define.
5. **YouTube comment reach** — comments on videos have long tails but low individual conversion. Do we weight YouTube differently in the ladder (higher threshold to advance stages)?
6. **DM cooldown between platforms** — if we DM on Instagram, should Twitter DM be blocked for N days to avoid appearing spammy? Probably yes.

---

## 13. Execution order (concrete first moves)

| Step | What                                                                                                                        | Output               |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1    | Build `people/` folder + README + `_template.md` + canonical-id doc                                                         | Foundation for graph |
| 2    | Seed `discovery/instagram/search-terms.md` with 10–15 initial terms pulled from existing engagement targets + strategy docs | First term list      |
| 3    | Draft `/instagram-discover` command, following the shape of `/instagram-warmup`                                             | Command file         |
| 4    | Run it once manually; hand-correct scoring on 20 candidates; use those as ground-truth seed for the annealer                | 20 labeled examples  |
| 5    | Wire `/instagram-discover` → `/instagram-warmup` handoff (warmup pulls from today's `candidates.md`)                        | End-to-end flow      |
| 6    | Add `comment-log.md` and update `/instagram-reply` to append an entry on every post                                         | Attribution on       |
| 7    | Port to LinkedIn, then Twitter, then YouTube, then Quora                                                                    | Full funnel          |
| 8    | Build `buildos-icp-anneal` skill and apply to both candidate scoring and search-term refinement                             | Annealing on         |
| 9    | Migrate to DB when the triggers in §6 hit                                                                                   | Durable system       |

---

## 14. Related docs

- `./buildos-lead-gen-system-plan.md` — parent plan (overall system architecture)
- `./youtube-transcripts/2026-04-24_mitchell-keller_lead-lists-claude-code.md` — source inspiration
- `/.claude/commands/instagram-warmup.md` — existing Stage 1
- `/.claude/commands/linkedin-warmup.md` — existing Stage 1
- `/.claude/commands/twitter-warmup.md` — existing Stage 1
- `/.claude/commands/reddit-warmup.md` — existing Stage 1 (Reddit is ladder-relevant but not in current 5-platform set; revisit)
