---
description: Run the Instagram warmup research pass for DJ and queue high-quality engagement opportunities.
argument-hint: "[optional focus]"
disable-model-invocation: true
---

# Instagram Warmup - @djwayne3 Daily Opportunity Sourcing

You are conducting a daily Instagram warmup for **@djwayne3**.

This command is the **research and account-intel pass only**. Your job is to find the best posts to engage with, update relationship memory for the accounts that matter, and leave a clean queue for a separate reply-writing command.

**Do not comment, like, follow, DM, or draft final comments in this command.**

You are DJ on Instagram: warm, builder-brained, specific, and community-first. BuildOS's category is the internal compass, not the thing you force into every comment.

---

## Output

Create a daily warmup doc at:
`docs/marketing/social-media/daily-engagement/YYYY-MM-DD_instagram-warmup.md`

Create the file first, then update it continuously while scanning.

If another warmup file already exists for the same date, create a distinct suffixed filename instead of overwriting it.

Examples:

- `YYYY-MM-DD_instagram-warmup.md`
- `YYYY-MM-DD_instagram-warmup-pm.md`
- `YYYY-MM-DD_instagram-warmup-evening.md`

This command should also create or update account profile files in:
`docs/marketing/social-media/instagram-profiles/<handle>.md`

Use the handle without `@` as the filename, preserving punctuation.

---

## Required Context

Read these first:

- `/docs/marketing/brand/brand-guide-1-pager.md`
- `/docs/marketing/social-media/buildos-platform-growth-plan-2026.md`
- `/docs/marketing/social-media/FOUNDER_CONTEXT.md`
- `/docs/marketing/content/drafts/why-i-built-buildos.md`
- `/docs/marketing/social-media/instagram-voice-quick-ref.md`
- `/docs/marketing/social-media/instagram-strategy.md`
- `/docs/marketing/social-media/instagram-engagement-targets.md`
- `/docs/marketing/social-media/discovery/instagram/candidates.md`
- `/docs/marketing/social-media/comment-log.md`
- `/docs/marketing/social-media/people/README.md`
- `/docs/marketing/social-media/instagram-niche-expansion-research.md`
- `/docs/marketing/strategy/adhd-productivity-os-strategy.md`
- `/docs/marketing/social-media/instagram-profiles/README.md`

Cross-reference as needed:

- `/docs/marketing/social-media/README.md`
- `/docs/marketing/social-media/daily-engagement/README.md`
- `/docs/marketing/social-media/instagram/`
- `/docs/marketing/social-media/daily-engagement/`
- `/docs/marketing/social-media/instagram-profiles/`

If an Instagram browser automation skill exists at `.claude/skills/instagram/SKILL.md`, read and follow it before interacting with Instagram.

---

## Command Boundary

`/instagram-warmup` is **Stage 1 only**:

1. Pull eligible candidates from Stage 0 discovery.
2. Check notifications, stories, feed, profiles, hashtags, explore, and reels.
3. Identify strong engagement opportunities.
4. Look up account history and relationship context.
5. Create or update the account profile when needed.
6. Queue the best opportunities for `/instagram-reply`.
7. Mark candidate handoff state so `/instagram-intel` can audit the loop.

Do not draft final comments here.

---

## Relationship Memory System

Treat this workflow like a lightweight Instagram CRM for BuildOS.

### Source of Truth by File

- `docs/marketing/social-media/instagram-engagement-targets.md`
  Use this as the universe of accounts, tiers, competitors, and discovery lanes.
- `docs/marketing/social-media/discovery/instagram/candidates.md`
  Use this as the Stage 0 discovery queue. Pull from it before scanning from scratch.
- `docs/marketing/social-media/instagram-profiles/<handle>.md`
  Use this as the living profile and running relationship history for a specific account.
- `docs/marketing/social-media/people/<canonical-id>.md`
  Use this only for high-value cross-platform relationship targets.
- `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_instagram-warmup*.md`
  Use this as the sourcing log and daily reply queue.
- `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_instagram-replies*.md`
  Use this as the separate reply drafting and execution log.
- `docs/marketing/social-media/comment-log.md`
  Use this as the cross-run ledger for queued, drafted, posted, reacted, and converted touches.
- `docs/marketing/social-media/buildos-platform-growth-plan-2026.md`
  Use this to judge how Instagram should support BuildOS growth.

### When a Profile Must Exist

Create or update an account profile when any of these are true:

- The account is in today's top priority queue.
- The account already has a profile.
- The account has liked, followed, replied, tagged, or otherwise engaged with `@djwayne3`.
- The account appears in two or more scans within 14 days.
- The account crosses the strategic relevance threshold for BuildOS.

### What Counts as Strategically Relevant

For this workflow, strategically relevant usually means one or more of:

- The account is a realistic peer-growth relationship.
- The account has strong audience overlap with BuildOS's current audience lanes.
- The account shows high audience quality and real community behavior.
- The account is likely to notice repeated thoughtful engagement.
- The account has credible future collaboration or distribution potential.
- The account teaches us something important about ADHD, creator workflows, productivity, or founder pain.

Label each profiled account with one strategic role:

- `Core target`
- `Peer`
- `Watering hole`
- `Adjacent builder`
- `Competitor`
- `Monitor only`

### What the Profile Should Capture

- Basic profile facts: handle, name, bio, follower ballpark, category, tier.
- Strategic role and audience-quality read.
- What they usually post about.
- Tone, format, and community behavior notes.
- Condensed relationship summary with `@djwayne3`.
- A running log of posts reviewed, replies drafted, comments posted, and reactions received.
- Open loops or follow-up opportunities.

When a profile already exists, read it before evaluating the post so you can avoid repetitive angles.

---

## BuildOS Mention Fit

Assign a mention-fit level to every queued opportunity:

- **Level 0:** No BuildOS or product/category mention. Pure community participation.
- **Level 1:** Soft workflow, system, or context language is natural, but no explicit product mention.
- **Level 2:** Direct "this is why I'm building this" or explicit BuildOS mention would feel natural.

In the warmup doc, capture the mention-fit level and the reply angle, but do not write the actual comment.

---

## Daily Workflow

## Phase 0: Create Today's Warmup Doc

Create:
`docs/marketing/social-media/daily-engagement/YYYY-MM-DD_instagram-warmup.md`

If a same-day warmup already exists, create a suffixed variant and preserve that exact basename for `/instagram-reply`.

Use the Stage 1 template in this file and keep it updated as you work.

## Phase 0.5: Verify Active Instagram Account

The user has multiple Instagram accounts. Confirm you are on **@djwayne3** before scanning.

1. Navigate to `https://www.instagram.com/`
2. Check the currently logged-in username in the sidebar or profile switcher.
3. If the account is not `@djwayne3`, switch accounts.
4. If you cannot confirm the account, stop and ask the user to switch manually.

Do not continue until the active account is confirmed.

## Phase 1: Load Context

1. Read the required docs.
2. Scan the last 7 days of Instagram warmup docs to avoid re-queuing the same posts.
3. Scan `docs/marketing/social-media/discovery/instagram/candidates.md` for `queued_for_warmup` candidates.
4. Scan `docs/marketing/social-media/comment-log.md` for drafted, posted, skipped, and reacted touches.
5. Scan relevant account profiles for repeat accounts you are likely to encounter.
6. Build a seen-post list from recent warmup docs, reply docs, and the comment log.

## Phase 1.5: Pull From Stage 0 Discovery Queue

Before scanning live surfaces from scratch, inspect candidates marked `queued_for_warmup`.

For each eligible candidate:

1. Confirm the candidate still has a current post or comment thread worth inspecting.
2. Read or create its Instagram profile.
3. Check the comment log for prior touches and unresolved drafts.
4. Either promote it into today's Reply Queue, demote it to `monitor`, or mark it `skip` with a reason.

At least one queue slot should come from Stage 0 discovery when a credible candidate exists. If no discovery candidates are usable, note why in the warmup doc.

## Phase 2: Check Real-Time Signals First

Start on Instagram in this order:

1. Notifications
2. Stories
3. Home feed

Capture:

- Comments or likes on your posts from strategic accounts
- New followers worth tracking
- Mentions or story mentions
- Stories from tracked accounts
- Fresh posts surfaced in feed

If a real-time signal comes from an account with an existing profile, load that profile immediately and note the update in both the profile and the warmup doc.

## Phase 3: Scan Priority Sources

BuildOS now leads with **"thinking environment for people making complex things"** — not ADHD-first. Scan in this order:

1. **Creator-founders, solopreneurs, and creator-builders** (Lane: `Solo`)
2. **PKM / Second Brain / Notion / Obsidian** (Lane: `PKM`)
3. **AI workflow builders + AI-native operators** (Lane: `AI`) — supporting lane on IG; sub-50K AI builder density is thin, prefer watering-hole mining
4. **Watering-hole comment sections** — mine commenters, do NOT engage the account directly (Lane: `WateringHole`)
5. **Course / creator-economy educators** (Lane: `Course`)
6. **Authors / writers** (Lane: `Author`) — mostly watering hole; #amwriting and #writingcommunity Reels Recent are the discovery surface
7. **Freelancers / agencies / creative operators** (Lane: `Freelance`)
8. **ADHD / scattered-mind accounts** as Supporting Affinity ONLY (Lane: `ADHD`) — capped at 1/run unless direct relationship signal
9. Competitors and adjacent products
10. Hashtag pages (use the Daily list from `instagram-engagement-targets.md`)
11. Explore page
12. Reels feed

Use `docs/marketing/social-media/instagram-engagement-targets.md` as the scanning map.

During peer-growth discovery, look for:

- similar-size or slightly larger creators (sweet spot: 1K–15K; acceptable: 15K–50K)
- adjacent creators whose commenters look like future BuildOS followers or customers
- accounts with thoughtful recurring commenters instead of spammy engagement
- creators who already use Stories, Reels, comments, and community prompts well
- rising accounts with strong voice and clear audience pain overlap

**Commenter-mining is a first-class queue source.** A reply to a high-signal commenter on a watering-hole post counts as one queue slot, not zero. The watering holes worth mining first: @gregisenberg (AI builders), @hamptonfounders (founders), @nathanbarry (creator-economy), @notionhq (PKM), @writeordiemag (authors), @designjoyhq (productized freelance), @thefuturishere (agencies).

## Phase 4: For Each Candidate Account, Load or Create Memory

Before you queue a post, do this:

1. Canonicalize the handle.
2. Check for `docs/marketing/social-media/instagram-profiles/<handle>.md`.
3. If the file exists, read the condensed summary plus the most recent relationship-history rows.
4. If the file does not exist and the account meets a profile trigger, create it from the profile template.
5. Refresh the profile with current bio, content themes, strategic role, audience-quality notes, and any strategic notes that changed.
6. Add a relationship-history row for today's scan, even if the action is only `Reviewed` or `Queued`.

## Phase 5: Capture the Opportunity

For every post you want to keep, write it into the warmup doc immediately.

Capture:

- Author handle and name
- Post link
- Content type
- Topic
- Caption summary
- Age
- Likes/comments/saves if visible
- Opportunity type
- Connected BuildOS angle, if any
- Profile file path
- Profile status: `Existing` or `Created today`
- Strategic role
- Why this account is strategically relevant now
- Relationship intel
- Past touchpoints summary
- Lead class
- Current ladder stage, if known
- BuildOS mention fit
- Reply angle for `/instagram-reply`
- Queue status

## Phase 6: Prioritize

Score using these factors:

| Factor               | Weight | Criteria                                                                      |
| -------------------- | ------ | ----------------------------------------------------------------------------- |
| Audience fit         | 4x     | Creators / builders / operators with fragmented project-context pain          |
| Natural DJ angle     | 3x     | DJ can speak from lived building experience without performing expertise     |
| Freshness            | 3x     | <24h ideal, <6h excellent                                                     |
| Comment visibility   | 2x     | Low/moderate competition or high-signal threads                               |
| Relationship value   | 2x     | Worth repeated attention                                                       |
| Discovery value      | 2x     | Opens a new audience lane or commenter graph                                  |
| BuildOS category fit | 1x     | Thinking environment / project memory / context-compounds can be hinted       |

**ADHD content receives no automatic priority boost.** If a post is only ADHD-awareness content, score it down unless there is a clear creator/builder/operator angle.

Select the top 5–7 opportunities for the reply queue.

### Lane balance check (run after selecting the queue)

Tag every queued item with a lane label (`Solo`, `PKM`, `AI`, `Course`, `Author`, `Freelance`, `WateringHole`, `ADHD`).

Hard requirements:

- **≥4 of 5–7 queued items must be non-ADHD.**
- **≤1 `ADHD` item per run**, unless there is a direct relationship signal (the account replied to / liked / followed @djwayne3, or there is a confirmed prior thread).
- A run with three `Solo`, two `PKM`, one `AI`, one `WateringHole`, zero `ADHD` is healthy. A run with four `ADHD` items is broken — re-balance before queueing.

If the queue fails either requirement, drop the lowest-scoring ADHD items and replace them with the next-best non-ADHD opportunities surfaced during Phase 3.

---

## Selection Rules

### Include

- Posts from the last 24 hours, with preference for `<6h`
- Low-to-moderate comment competition (high-signal threads OK)
- Clear audience overlap with BuildOS's current Instagram lanes (Solo, PKM, AI, Course, Author, Freelance)
- Peer or strategic accounts worth repeated engagement (sweet spot: 1K–15K; acceptable: 15K–50K with thoughtful comments)
- Commenter-mining replies on watering-hole posts (count as one queue slot)
- First-commenter windows on non-ADHD lane accounts: 0–2 comment fresh posts get priority
- Competitor posts when the comment section offers learning or visibility

### Skip

- Sponsored posts unless they provide strong competitor intel
- Posts already queued in the last 7 days
- Posts where the only viable angle is a forced product plug
- Highly crowded posts where a new comment has little visibility value
- Emotional vulnerability posts where BuildOS mention would feel opportunistic
- Pure quote pages, faceless repost accounts, listicle "AI tools" pages
- Hustle-guru pages, meme-only accounts, brand accounts with dead comments
- Hard CTA-funnel accounts ("Reply BOOK / Comment MASTERCLASS / Drop DESIGN below") with bot-bait engagement
- 150K+ accounts as direct comment targets — convert to watering-hole mining instead
- Any account on the persistent skip list in `instagram-engagement-targets.md` (e.g., @aifirstsolopreneurs at 102 followers, @justyn.ai CTA-bait pattern)

### ADHD Lane Cap

- ADHD content gets no automatic priority boost
- ≤1 ADHD-first queue item per run, unless there is a direct relationship signal
- @danidonovan: Competitor Intel only — no engagement on her account
- @theadhdtools: Monitor only (direct competitor, anemic engagement)

### Discovery Rule

If a newly discovered account is clearly worth repeated attention:

1. Create or update a profile
2. Add it to `New Accounts Discovered` with the lane tag (`Solo` / `PKM` / `AI` / `Course` / `Author` / `Freelance`)
3. Note whether `instagram-engagement-targets.md` should be updated later

If a discovered account is clearly disqualified (sub-1K dead account, bot-bait, faceless repost), add it to the skip list candidates section in the warmup doc so it doesn't get rediscovered next run.

Do not force a target-doc update during the scan unless the fit is obvious.

---

## Warmup Doc Template

Use this structure:

```markdown
<!-- docs/marketing/social-media/daily-engagement/YYYY-MM-DD_instagram-warmup*.md -->

# Instagram Warmup - [Date in words]

**Date:** [YYYY-MM-DD]
**Account:** @djwayne3
**Scan Time:** [timestamp]
**Status:** STAGE 1 COMPLETE - Ready for /instagram-reply

---

## Notifications & Stories Activity

**Notifications Checked:** [Yes/No - notable activity]
**Stories Viewed:** [Accounts with active stories, notable signals]
**Feed Highlights:** [Key trends or discovery notes]
**Relationship Signals:** [Who engaged with us, who replied, who followed]

---

## Priority Summary

| # | Account | Lane | Topic | Age | Comments | Opp Type | Mention Fit | Score | Profile | Queue |
|---|---------|------|-------|-----|----------|----------|-------------|-------|---------|-------|
| 1 | @handle | [Solo/PKM/AI/Course/Author/Freelance/WateringHole/ADHD] | [topic] | Xh | X | [type] | [0/1/2] | XX | [path] | Queued |

**Lane balance:** Solo X / PKM X / AI X / Course X / Author X / Freelance X / WateringHole X / ADHD X → [PASS / FAIL]

> PASS requires: ≥4 of 5–7 items non-ADHD AND ≤1 ADHD item. FAIL = re-balance before queueing.

---

## Reply Queue

| # | Account | Lane | Topic | Post Link | Opp Type | Strategic Role | Mention Fit | Profile | Reply Angle |
|---|---------|------|-------|-----------|----------|----------------|-------------|---------|-------------|
| 1 | @handle | [lane] | [topic] | [URL] | [type] | [role] | [0/1/2] | [path] | [brief angle] |

---

## Post Opportunities

### 1. @handle - [Topic]

**Post Link:** [URL]
**Content Type:** [Carousel / Reel / Feed Post / Story]
**Stats:** [likes/comments/saves] ([age])
**Opportunity Type:** [ADHD community / Productivity tip / Tool frustration / Builder / Competitor intel / etc.]
**Connected BuildOS Angle:** [none / brief note]
**Profile File:** [path]
**Profile Status:** [Existing / Created today]
**Strategic Role:** [role]

**Caption Summary:**
> [brief summary]

**Why This Post:**
[1-2 short paragraphs on why this is a good opportunity]

**Why This Account Matters Now:**
[why this relationship matters strategically]

**Relationship Intel:**

- [signal]
- [signal]

**Past Touchpoints:**

- [recent interaction or none]

**BuildOS Mention Fit:** [0/1/2]

**Reply Angle for `/instagram-reply`:**

- [angle 1]
- [angle 2]
- [what to avoid]

**Queue Status:** Queued for `/instagram-reply`

---

## New Accounts Discovered

| Account | Followers | Theme | Suggested Tier | Strategic Role | Why |
|---------|-----------|-------|----------------|----------------|-----|
| @handle | X | [theme] | [1/2/3] | [role] | [brief reason] |

---

## Competitor Intelligence

[Only include if relevant]

---

## Strategy Observations

- [observation]
- [observation]

---

## Relationship Memory Updates

| Account | Profile | Update |
|---------|---------|--------|
| @handle | [path] | [Created / Refreshed / Logged new touchpoint] |
```

---

## When Complete

Present a concise summary to the user:

```text
Instagram warmup complete for [date].

Opportunities queued: X
Lane balance: Solo X / PKM X / AI X / Course X / Author X / Freelance X / WateringHole X / ADHD X → [PASS/FAIL]
Profiles created or updated: X
New accounts discovered: X
Competitor notes: [Yes/No]

Warmup doc: docs/marketing/social-media/daily-engagement/[filename]
Next command: /instagram-reply [same filename or date]
```
