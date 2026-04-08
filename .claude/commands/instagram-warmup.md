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
- `/docs/marketing/social-media/instagram-niche-expansion-research.md`
- `/docs/marketing/strategy/adhd-productivity-os-strategy.md`
- `/docs/marketing/social-media/instagram-profiles/README.md`

Cross-reference as needed:

- `/docs/marketing/social-media/README.md`
- `/docs/marketing/social-media/daily-engagement/README.md`
- `/docs/marketing/social-media/instagram/`
- `/docs/marketing/social-media/daily-engagement/`
- `/docs/marketing/social-media/instagram-profiles/`

If an Instagram browser automation skill exists at `/.claude/skills/instagram.skill.md`, read and follow it before interacting with Instagram.

---

## Command Boundary

`/instagram-warmup` is **Stage 1 only**:

1. Check notifications, stories, feed, profiles, hashtags, explore, and reels.
2. Identify strong engagement opportunities.
3. Look up account history and relationship context.
4. Create or update the account profile when needed.
5. Queue the best opportunities for `/instagram-reply`.

Do not draft final comments here.

---

## Relationship Memory System

Treat this workflow like a lightweight Instagram CRM for BuildOS.

### Source of Truth by File

- `docs/marketing/social-media/instagram-engagement-targets.md`
  Use this as the universe of accounts, tiers, competitors, and discovery lanes.
- `docs/marketing/social-media/instagram-profiles/<handle>.md`
  Use this as the living profile and running relationship history for a specific account.
- `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_instagram-warmup*.md`
  Use this as the sourcing log and daily reply queue.
- `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_instagram-replies*.md`
  Use this as the separate reply drafting and execution log.
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
3. Scan relevant account profiles for repeat accounts you are likely to encounter.
4. Build a seen-post list from recent warmup docs.

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

Scan in this order:

1. Tier 1 ADHD and neurodivergent accounts
2. Tier 1 solo founders, solopreneurs, AI builders, and PKM accounts
3. Watering-hole accounts and their comment sections
4. Competitors and adjacent products
5. Hashtag pages
6. Explore page
7. Reels feed

Use `docs/marketing/social-media/instagram-engagement-targets.md` as the scanning map.

During peer-growth discovery, look for:

- similar-size or slightly larger creators
- adjacent creators whose commenters look like future BuildOS followers or customers
- accounts with thoughtful recurring commenters instead of spammy engagement
- creators who already use Stories, Reels, comments, and community prompts well
- rising accounts with strong voice and clear audience pain overlap

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
- BuildOS mention fit
- Reply angle for `/instagram-reply`
- Queue status

## Phase 6: Prioritize

Score using these factors:

| Factor              | Weight | Criteria                         |
| ------------------- | ------ | -------------------------------- |
| Freshness           | 3x     | Newer is better                  |
| Natural fit         | 3x     | Clear way to add value           |
| Tone match          | 2x     | You can sound native to the room |
| Comment competition | 2x     | Lower is better                  |
| Relationship value  | 2x     | Worth building over time         |
| Mention fit         | 1x     | Is a BuildOS angle naturally there? |

Select the top 5-7 opportunities for the reply queue.

---

## Selection Rules

### Include

- Posts from the last 24 hours, with preference for `<6h`
- Low-to-moderate comment competition
- Clear audience overlap with BuildOS's current Instagram lanes
- Peer or strategic accounts worth repeated engagement
- Competitor posts when the comment section offers learning or visibility

### Skip

- Sponsored posts unless they provide strong competitor intel
- Posts already queued in the last 7 days
- Posts where the only viable angle is a forced product plug
- Highly crowded posts where a new comment has little visibility value
- Emotional vulnerability posts where BuildOS mention would feel opportunistic

### Discovery Rule

If a newly discovered account is clearly worth repeated attention:

1. Create or update a profile
2. Add it to `New Accounts Discovered`
3. Note whether `instagram-engagement-targets.md` should be updated later

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

| # | Account | Topic | Age | Comments | Opp Type | Mention Fit | Score | Profile | Queue |
|---|---------|-------|-----|----------|----------|-------------|-------|---------|-------|
| 1 | @handle | [topic] | Xh | X | [type] | [0/1/2] | XX | [path] | Queued |

---

## Reply Queue

| # | Account | Topic | Post Link | Opp Type | Strategic Role | Mention Fit | Profile | Reply Angle |
|---|---------|-------|-----------|----------|----------------|-------------|---------|-------------|
| 1 | @handle | [topic] | [URL] | [type] | [role] | [0/1/2] | [path] | [brief angle] |

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
Profiles created or updated: X
New accounts discovered: X
Competitor notes: [Yes/No]

Warmup doc: docs/marketing/social-media/daily-engagement/[filename]
Next command: /instagram-reply [same filename or date]
```
