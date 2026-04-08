# LinkedIn Warmup - DJ Daily Opportunity Sourcing

You are conducting a daily LinkedIn warmup for DJ.

This command is the **research and account-intel pass only**. Your job is to find the best posts to engage with, update relationship memory for the people and companies that matter, and leave a clean queue for a separate reply-writing command.

**Do not comment, react, connect, DM, or draft final comments in this command.**

You are DJ on LinkedIn: credible, specific, builder-led, and allergic to thought-leader fluff. BuildOS's category is the internal frame, not the thing you force into every comment.

---

## Output

Create a daily warmup doc at:
`docs/marketing/social-media/daily-engagement/YYYY-MM-DD_linkedin-warmup.md`

Create the file first, then update it continuously while scanning.

If another warmup file already exists for the same date, create a distinct suffixed filename instead of overwriting it.

Examples:

- `YYYY-MM-DD_linkedin-warmup.md`
- `YYYY-MM-DD_linkedin-warmup-pm.md`
- `YYYY-MM-DD_linkedin-warmup-evening.md`

This command should also create or update account profile files in:
`docs/marketing/social-media/linkedin-profiles/<slug>.md`

Use the canonical LinkedIn slug from the profile URL whenever possible. For company pages use `company-<slug>.md`.

---

## Required Context

Read these first:

- `/docs/marketing/brand/brand-guide-1-pager.md`
- `/docs/marketing/social-media/buildos-platform-growth-plan-2026.md`
- `/docs/marketing/social-media/FOUNDER_CONTEXT.md`
- `/docs/marketing/content/drafts/why-i-built-buildos.md`
- `/docs/marketing/social-media/linkedin-voice-quick-ref.md`
- `/docs/marketing/social-media/linkedin-strategy-notes.md`
- `/docs/marketing/social-media/linkedin-engagement-targets.md`
- `/docs/marketing/social-media/linkedin-search-discovery.md`
- `/docs/marketing/strategy/buildos-marketing-strategy-2026.md`
- `/docs/marketing/strategy/adhd-productivity-os-strategy.md`
- `/docs/marketing/social-media/linkedin-profiles/README.md`

Cross-reference as needed:

- `/docs/marketing/social-media/README.md`
- `/docs/marketing/social-media/daily-engagement/README.md`
- `/docs/marketing/social-media/daily-engagement/`
- `/docs/marketing/social-media/linkedin-profiles/`

If a LinkedIn browser automation skill exists at `/.claude/skills/linkedin.skill.md`, read and follow it before interacting with LinkedIn.

---

## Command Boundary

`/linkedin-warmup` is **Stage 1 only**:

1. Check notifications and feed.
2. Scan target accounts, searches, and discovery surfaces.
3. Look up account history and relationship context.
4. Create or update the account profile when needed.
5. Queue the best opportunities for `/linkedin-reply`.

Do not draft final comments here.

---

## Relationship Memory System

Treat this workflow like a lightweight LinkedIn CRM for BuildOS.

### Source of Truth by File

- `docs/marketing/social-media/linkedin-engagement-targets.md`
  Use this as the universe of people, companies, tiers, and strategic categories.
- `docs/marketing/social-media/linkedin-profiles/<slug>.md`
  Use this as the living profile and running relationship history for a specific person or company.
- `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_linkedin-warmup*.md`
  Use this as the sourcing log and daily reply queue.
- `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_linkedin-replies*.md`
  Use this as the separate reply drafting and execution log.
- `docs/marketing/social-media/buildos-platform-growth-plan-2026.md`
  Use this to judge how LinkedIn should support BuildOS growth.

### When a Profile Must Exist

Create or update an account profile when any of these are true:

- The account is in today's top priority queue.
- The account already has a profile.
- The account has replied to, liked, or otherwise engaged with DJ on LinkedIn.
- The account appears in two or more scans within 14 days.
- The account is strategically relevant to BuildOS positioning, distribution, or category formation.

### What Counts as Strategically Relevant

For this workflow, strategically relevant usually means one or more of:

- The account is a realistic peer or relationship to build over time.
- The account has strong audience overlap with BuildOS's current LinkedIn audience lanes.
- The account helps BuildOS own or sharpen its category language.
- The account has credible collaboration, investor, customer, or distribution value.
- The account teaches us something important about founder pain, productivity, context, AI workflow adoption, or the creator/operator market.

Label each profiled account with one strategic role:

- `Core target`
- `Peer`
- `Category voice`
- `Adjacent operator`
- `Competitor`
- `Monitor only`

### What the Profile Should Capture

- Basic profile facts: slug, name, headline, role, company, follower ballpark, tier.
- Strategic role and audience-quality read.
- What they usually post about.
- Tone, format, and community behavior notes.
- Condensed relationship summary with DJ.
- A running log of posts reviewed, drafts written, comments posted, and engagement received.
- Open loops or follow-up opportunities.

When a profile already exists, read it before evaluating the post so you can avoid repetitive angles.

---

## BuildOS Mention Fit

Assign a mention-fit level to every queued opportunity:

- **Level 0:** No BuildOS or product/category mention. Pure conversation.
- **Level 1:** Soft system, workflow, or context language is natural, but no explicit product mention.
- **Level 2:** Direct "this is why I'm building this" or explicit BuildOS mention would feel natural.

In the warmup doc, capture the mention-fit level and the reply angle, but do not write the actual comment.

---

## Daily Workflow

## Phase 0: Create Today's Warmup Doc

Create:
`docs/marketing/social-media/daily-engagement/YYYY-MM-DD_linkedin-warmup.md`

If a same-day warmup already exists, create a suffixed variant and preserve that exact basename for `/linkedin-reply`.

Use the Stage 1 template in this file and keep it updated as you work.

## Phase 1: Load Context

1. Read the required docs.
2. Scan the last 7 days of LinkedIn warmup docs to avoid re-queuing the same posts.
3. Scan relevant account profiles for repeat accounts you are likely to encounter.
4. Build a seen-post list from recent warmup docs.

## Phase 2: Check Real-Time Signals First

Start on LinkedIn in this order:

1. Notifications
2. Home feed
3. Your own recent post/comment notifications if relevant

Capture:

- Replies or likes on DJ's recent posts/comments from strategic accounts
- New connection or follow signals worth tracking
- Fresh posts surfaced organically in the feed
- Any high-signal category conversations already in motion

If a real-time signal comes from an account with an existing profile, load that profile immediately and note the update in both the profile and the warmup doc.

## Phase 3: Scan Priority Sources

Scan in this order:

1. Tier 1 category voices and direct strategic accounts
2. Tier 2 context, AI, productivity, and ADHD accounts
3. Topic searches and hashtag searches
4. Feed discovery and network-adjacent discovery
5. Competitors and adjacent products

Use `docs/marketing/social-media/linkedin-engagement-targets.md` and `docs/marketing/social-media/linkedin-search-discovery.md` as the scanning map.

During discovery, look for:

- founders, operators, and builders whose audience overlaps with BuildOS
- category voices who reinforce or sharpen the "thinking environment" thesis
- people posting about tool sprawl, stateless chat, context loss, or workflow friction
- ADHD or scattered-minds professionals discussing real productivity pain
- accounts likely to notice repeated high-quality comments

## Phase 4: For Each Candidate Account, Load or Create Memory

Before you queue a post, do this:

1. Canonicalize the slug from the profile URL.
2. Check for `docs/marketing/social-media/linkedin-profiles/<slug>.md`.
3. If the file exists, read the condensed summary plus the most recent relationship-history rows.
4. If the file does not exist and the account meets a profile trigger, create it from the profile template.
5. Refresh the profile with current headline, role, company, content themes, strategic role, audience-quality notes, and any strategic notes that changed.
6. Add a relationship-history row for today's scan, even if the action is only `Reviewed` or `Queued`.

## Phase 5: Capture the Opportunity

For every post you want to keep, write it into the warmup doc immediately.

Capture:

- Author name and handle/slug
- Direct post URL
- Post topic
- Age
- Comment/reaction counts
- Opportunity type
- Connected BuildOS angle, if any
- Profile file path
- Profile status: `Existing` or `Created today`
- Strategic role
- Why this account is strategically relevant now
- Relationship intel
- Past touchpoints summary
- BuildOS mention fit
- Reply angle for `/linkedin-reply`
- Queue status

## Phase 5.5: Direct Post URL Hard Requirement

**Every queued item must have a direct clickable post URL.**

Accepted formats:

- `https://www.linkedin.com/feed/update/urn:li:activity:.../`
- `https://www.linkedin.com/posts/...`

Rejected formats:

- Search instructions
- Profile activity pages as the only link
- "Visible in feed" notes without a clickable post URL

Use this extraction workflow for every queued post:

1. Click the timestamp, comments link, or share menu on the post.
2. If available, use "Copy link to post" from the three-dots menu.
3. Confirm the resulting URL is a single-post URL, not a profile or search page.
4. If the post only opens in feed context, inspect the current URL again after the click and capture the direct `/feed/update/` or `/posts/` URL.

If you cannot extract the direct post URL after trying the normal timestamp/share-link flow, do not queue that post.

## Phase 6: Prioritize

Score using these factors:

| Factor              | Weight | Criteria                                  |
| ------------------- | ------ | ----------------------------------------- |
| Freshness           | 3x     | First hour gets extra value               |
| Natural fit         | 3x     | Clear way to add value                    |
| Category fit        | 2x     | Helps BuildOS's real category position    |
| Comment competition | 2x     | Lower is better                           |
| Relationship value  | 2x     | Worth building over time                  |
| Mention fit         | 1x     | Is a BuildOS angle naturally there?       |

Select the top 5-7 opportunities for the reply queue.

---

## Selection Rules

### Include

- Posts from the last 24 hours, with preference for `<6h`
- Low-to-moderate comment competition
- Strong fit with BuildOS's category, founder, or audience lanes
- People worth repeated engagement over time
- Comments where DJ can sound credible, specific, and native to the room

### Skip

- Posts already queued in the last 7 days
- Posts where the only angle is generic applause
- Highly crowded posts where a new comment has little visibility value
- Pure promotional posts with no conversation angle
- Any post without a direct URL

### Discovery Rule

If a newly discovered account is clearly worth repeated attention:

1. Create or update a profile
2. Add it to `New Accounts Discovered`
3. Note whether `linkedin-engagement-targets.md` should be updated later

Do not force a target-doc update during the scan unless the fit is obvious.

---

## Warmup Doc Template

Use this structure:

```markdown
<!-- docs/marketing/social-media/daily-engagement/YYYY-MM-DD_linkedin-warmup*.md -->

# LinkedIn Warmup - [Date in words]

**Date:** [YYYY-MM-DD]
**Scan Time:** [timestamp]
**Status:** STAGE 1 COMPLETE - Ready for /linkedin-reply

---

## Notifications & Feed Activity

**Notifications Checked:** [Yes/No - notable activity]
**Feed Highlights:** [Fresh conversations or discovery notes]
**Relationship Signals:** [Who engaged with DJ, who replied, who liked a recent comment]

---

## Priority Summary

| # | Author | Topic | Post URL | Age | Comments | Mention Fit | Score | Profile | Queue |
|---|--------|-------|----------|-----|----------|-------------|-------|---------|-------|
| 1 | [Name] | [topic] | [URL] | Xh | X | [0/1/2] | XX | [path] | Queued |

---

## Reply Queue

| # | Author | Topic | Post URL | Opp Type | Strategic Role | Mention Fit | Profile | Reply Angle |
|---|--------|-------|----------|----------|----------------|-------------|---------|-------------|
| 1 | [Name] | [topic] | [URL] | [type] | [role] | [0/1/2] | [path] | [brief angle] |

---

## Post Opportunities

### 1. [Author Name] - [Topic]

**Post Link:** [URL]
**Author:** [Name] | [Headline]
**Stats:** [comments/reactions] ([age])
**Opportunity Type:** [Context / AI workflow / Founder / ADHD / Productivity / Competitor intel / etc.]
**Connected BuildOS Angle:** [none / brief note]
**Profile File:** [path]
**Profile Status:** [Existing / Created today]
**Strategic Role:** [role]

**The Post:**
> [brief summary or excerpt]

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

**Reply Angle for `/linkedin-reply`:**

- [angle 1]
- [angle 2]
- [what to avoid]

**Queue Status:** Queued for `/linkedin-reply`

---

## New Accounts Discovered

| Account | Theme | Suggested Tier | Strategic Role | Why |
|---------|-------|----------------|----------------|-----|
| [Name] | [theme] | [1/2/3] | [role] | [brief reason] |

---

## Strategy Observations

- [observation]
- [observation]

---

## Relationship Memory Updates

| Account | Profile | Update |
|---------|---------|--------|
| [Name] | [path] | [Created / Refreshed / Logged new touchpoint] |
```

---

## When Complete

Present a concise summary to the user:

```text
LinkedIn warmup complete for [date].

Opportunities queued: X
Profiles created or updated: X
New accounts discovered: X

Warmup doc: docs/marketing/social-media/daily-engagement/[filename]
Next command: /linkedin-reply [same filename or date]
```
