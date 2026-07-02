# LinkedIn Warmup - Daily Engagement Scan

You are conducting a daily LinkedIn engagement scan for {{YOUR_NAME}} to find high-quality comment opportunities that align with the {{YOUR_BRAND}} brand.

## Output

Create a daily engagement doc at:
`docs/social-media/daily-engagement/YYYY-MM-DD_linkedin-warmup.md`

---

## Browser Automation Skill

**REQUIRED:** Before interacting with LinkedIn in the browser, read and follow the workflows in:
- `/.claude/skills/linkedin.skill.md` - Contains proven click patterns, selectors, and URL patterns for LinkedIn automation

If this skill file doesn't exist, create it by exploring LinkedIn's interface and documenting:
- How to create posts
- How to search for people/companies
- How to send messages
- How to navigate
- URL patterns

---

## Phase 1: Load Context

### Read These Files (Required)

1. **Founder Context** (shared across platforms):
   - `docs/social-media/FOUNDER_CONTEXT.md`

2. **LinkedIn Voice Reference** (platform-specific):
   - `docs/social-media/linkedin-voice-quick-ref.md`

3. **Engagement Targets** (accounts to scan):
   - `docs/social-media/linkedin-engagement-targets.md`

4. **Search Strategy** (for topic searches):
   - `docs/social-media/linkedin-search-queries.md`

### Check for Duplicates

Scan the last 7 days of engagement docs to avoid suggesting posts already seen:
- `docs/social-media/daily-engagement/` (all LinkedIn files from last 7 days)

Extract post links from previous docs and maintain a "seen" list.

---

## Phase 2: Browser Scanning

### LinkedIn Platform Notes

- **Algorithm**: First hour engagement is critical. Comments > reactions.
- **Comment Length**: 2-4 sentences minimum to be meaningful
- **External Links**: Reduce reach - never put links in comments
- **Dwell Time**: Matters - algorithm rewards thoughtful engagement
- **Comment Competition**: Fewer comments = better chance to stand out

### Scan Order (Comprehensive)

**Round 1: Tier 1 Accounts (High Priority)**
Scan these profiles for posts from last 24 hours. Navigate to each profile's "Posts" section.
<!-- FILL IN from your linkedin-engagement-targets.md -->

**Round 2: Tier 2 Accounts**
<!-- FILL IN from your engagement-targets.md - organize by category -->

**Round 3: Topic Searches**
Use LinkedIn's search bar → Filter by "Posts" → Sort by "Latest"

Queries from: `docs/social-media/linkedin-search-queries.md`

**Round 4: Hashtag Scanning**
Check recent posts under relevant hashtags from your search queries doc.

**Round 5: Feed Discovery (New Accounts)**
Navigate to LinkedIn home feed and scroll through recent posts to discover:
- Accounts posting relevant content that aren't in Tier 1/2/3 lists
- Fresh voices with good engagement who align with your themes
- People discussing your niche topics

### New Account Discovery Criteria

**Flag accounts for potential Tier addition if they:**
- Post about topics relevant to your niche
- Have 5K-100K followers (engagement sweet spot for LinkedIn)
- Post consistently (multiple times per week)
- Have good engagement ratios (comments relative to followers)
- Write in an authentic voice (not generic thought leader content)
- Are builders, founders, or practitioners

**Capture for each discovered account:**
- Name and headline
- Follower count
- Bio summary
- Why they're relevant (content themes)
- Recent post that caught your attention
- Suggested tier placement (1, 2, or 3)

### For Each Potential Post, Capture:

- Author name and headline
- Post text (full content, first 500 chars if very long)
- Post age (how long ago)
- Current engagement (comments, reactions)
- Link to post
- Why it's relevant (which content pillar it matches)

### Selection Criteria

**Include posts that are:**
- From last 24 hours (prioritize <6h for freshness - first hour engagement matters most)
- Relevant to your content pillars
- Low-to-moderate existing comments (<30 comments is ideal)
- NOT already in the "seen" list from previous 7 days

**Skip posts that:**
- Are promotional/ads
- Already have 50+ comments (too crowded, hard to stand out)
- Are just announcements with no discussion angle
- You've already seen in previous docs
- Are from mega-influencers with 500K+ followers (too much noise)

---

## Phase 3: Prioritize & Score

Score each post opportunity (1-10):

| Factor | Weight | Criteria |
|--------|--------|----------|
| Freshness | 3x | <1h = 10, 1-4h = 8, 4-12h = 6, 12-24h = 4 |
| Brand Fit | 3x | How aligned with your messaging/pillars |
| Author Relevance | 2x | Tier 1 = 10, Tier 2 = 7, Tier 3 = 5, Discovery = 6 |
| Comment Competition | 2x | <10 comments = 10, 10-20 = 7, 20-30 = 5, 30+ = 3 |

Select **top 5-7 opportunities** based on total score.

---

## Phase 4: Generate Comments

For each selected post, create 2-3 comment options following the founder's voice:

### The Core Philosophy: Interesting Person + Cheerleader

> **NOT a thought leader.** Everyone is trying to be a thought leader. That's overdone and inauthentic.
> **The goal:** Come across as an interesting person who has interesting things to say, OR as a genuine supporter when you don't have specific expertise.

### Two Modes of Engagement

**Mode 1: Add Value (When You Have Something)**
Use when the topic touches actual experience from the Founder Context.
- Share specific experience or insight
- Lead with curiosity, not authority
- "Here's what I've seen..." not "The answer is..."
- Offer a perspective others might not have considered
- Ask questions that show expertise

**Mode 2: Cheerleader (When You Don't)**
Use when you don't have specific expertise but want to engage.
- Genuine encouragement and support - this is valid!
- Ask curious questions that show you're actually interested
- Celebrate their wins like they're your wins
- Hype them up authentically
- "We're all rowing the same boat toward our goals" energy

### Comment Generation Rules

1. **Decide your mode first** - Do you have value to add, or are you here to support?
2. **Be genuinely curious** - Ask questions that show real interest, not just "great point!"
3. **Celebrate specifically** - If cheering someone on, reference exactly what impressed you
4. **Use specific experience when relevant** - From Founder Context
5. **Niche angle** - When discussing your space, frame around your core thesis IF relevant
6. **Teammate energy, not teaching** - "What I'm finding..." not "Here's how to do it..."
7. **Product mentions** - Only when genuinely relevant, be transparent about it
8. **2-4 sentences minimum** - LinkedIn rewards thoughtful comments
9. **It's okay to just encourage** - Sometimes the most valuable thing is genuine support

### Comment Templates by Topic

**Niche Posts - Value Mode:**
```
[Observation about the topic from your experience]

[Your specific experience building/working in this space]

[Question or extension of their point]

[Optional: soft product mention if natural - be transparent]
```

**Niche Posts - Cheerleader Mode:**
```
[Genuine reaction to what they shared]

[Specific thing that stood out to you]

[Curious question about their approach/experience]
```

**Someone Sharing a Win - Cheerleader Mode:**
```
Hell yes. [Specific thing about the win that impressed you].

[Curious question about how they did it / what's next]
```

**Big Account Engagement:**
```
[Reference their past content, framework, or specific work]

[Add unique angle from your experience OR genuine curiosity]

[Ask a direct question - not generic praise]

[Show you've actually thought about their ideas]
```

### Voice Reminders

**The Philosophy:** Interesting person + cheerleader. NOT a thought leader.

**DO (Value Mode):**
- Lead with observation or insight from experience
- Be specific - use real examples
- Ask questions that show expertise
- "What I'm finding..." / "In my experience building..."
- Teammate energy, not teaching

**DO (Cheerleader Mode):**
- Genuine excitement for their work/win
- Specific praise - what exactly impressed you
- Curious questions about their journey
- "Hell yes" and "this is awesome" when you mean it
- "We're all rowing the same boat" energy

**DON'T:**
- "Love this!" / "Great post!" (hollow)
- Generic observations anyone could make
- Preachy setups ("Most people don't realize...")
- Teaching when you're just supporting
- Sycophantic praise
- Making it about you/your product when cheering someone on
- Thought leader energy

---

## Phase 5: Output Document

### Document Format

```markdown
<!-- docs/social-media/daily-engagement/YYYY-MM-DD_linkedin-warmup.md -->

# LinkedIn Warmup - [Date in words]

**Date:** [YYYY-MM-DD]
**Scan Time:** [timestamp]

---

## Priority Summary

| Priority | Author | Post Topic | Age | Comments | Why |
|----------|--------|------------|-----|----------|-----|
| 1 | [Name] | [brief topic] | Xh | X | [reason] |
| 2 | ... | ... | ... | ... | ... |
[5-7 rows]

---

## 1. [Author Name] - [Topic]

**Post Link:** [full URL]

**Author:** [Name] | [Headline] | [Follower count]

**The Post:**
> [post text - first 500 chars if very long]

**Stats:** X comments, Y reactions ([age])

**Why This Post:**
[1-2 sentences on why this is a good engagement opportunity - pillar alignment, author relevance, timing]

**Suggested Comment Option 1 ([angle]):**
> [comment text - 2-4 sentences]

**Suggested Comment Option 2 ([angle]):**
> [comment text - 2-4 sentences]

**Suggested Comment Option 3 ([angle]):**
> [comment text - 2-4 sentences]

---

[Repeat for all 5-7 posts]

---

## Commenting Strategy

**Recommended Order:**
1. [Freshest post with lowest competition]
2. [Tier 1 account post]
3. [Best brand fit]
...

**Timing Notes:**
- Posts <1h old: Comment ASAP (first hour is critical on LinkedIn)
- Posts 1-4h old: Still good, comment within the hour
- Posts 12h+: Only if exceptional fit and low competition

**Spacing:** 15-30 min between comments (less critical than Twitter, but still good practice)

---

## New Accounts Discovered

Accounts from feed worth adding to engagement tiers:

| Account | Followers | Theme | Suggested Tier | Why |
|---------|-----------|-------|----------------|-----|
| [Name] | Xk | [Theme] | [1/2/3] | [brief reason] |

### Account Details

#### [Name] - [Headline]
**Followers:** X,XXX
**Bio/About:** [summary]
**Content Themes:** [what they post about]
**Recent Post That Stood Out:**
> [post text excerpt]

**Why Add to Tier [X]:**
[1-2 sentences on why this account is worth engaging with regularly]

---

## Voice Reminder

### The 3 Rules (From Twitter, Applies Here Too)
1. Can I visualize it? (Specific details, not abstractions)
2. Can I falsify it? (Real experience you could defend)
3. Can nobody else say this? (Use your unique experience)

### LinkedIn-Specific
- Longer, more nuanced than Twitter
- Professional but authentic
- Learning voice, not authoritative
- 2-4 sentence comments minimum
- Ask questions to open dialogue

---

**Created:** [timestamp]
**Next Scan:** [tomorrow's date]
```

---

## Execution Notes

1. **Take screenshots** of relevant posts for reference
2. **Wait 2 seconds** after page loads before capturing
3. **Use "Latest" sorting** for searches to get fresh content
4. **Check for previous engagement** - don't suggest same posts twice
5. **Quality over quantity** - better to find 5 great opportunities than 10 mediocre ones
6. **First hour matters** - prioritize very fresh posts (<1-2 hours)

---

## When Complete

Present a summary to the user:

```
LinkedIn warmup complete for [date].

## Engagement Opportunities Found: X

- [count] from Tier 1 accounts
- [count] from Tier 2/3 accounts
- [count] from topic/hashtag searches
- [count] from feed discovery

Top opportunities:
1. [Author] - [topic] (Xh ago, Y comments)
2. [Author] - [topic] (Xh ago, Y comments)
3. [Author] - [topic] (Xh ago, Y comments)

## New Accounts Discovered: X

Worth adding to your engagement tiers:
- [Name] ([followers]) - [theme] → Suggested: Tier [X]
- [Name] ([followers]) - [theme] → Suggested: Tier [X]

Full doc: docs/social-media/daily-engagement/[filename]

Ready to engage? Start with [recommendation] - it's the freshest with lowest competition.
```

### After Each Scan

If new accounts are discovered, ask the user:
```
I found X new accounts worth engaging with regularly. Should I update your engagement targets doc (linkedin-engagement-targets.md) to add them to the appropriate tiers?
```
