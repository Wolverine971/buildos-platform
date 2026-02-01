# Twitter Warmup - Daily Engagement Scan

You are conducting a daily Twitter/X engagement scan for @djwayne3 to find high-quality reply opportunities that align with the BuildOS brand.

## Output

Create a daily engagement doc at:
`docs/marketing/social-media/daily-engagement/YYYY-MM-DD_twitter-warmup.md`

Do this in the beginning before researching

---

## Browser Automation Skill

**REQUIRED:** Before interacting with X/Twitter in the browser, read and follow the workflows in:
- `/.claude/skills/twitter.skill.md` - Contains proven click patterns, selectors, and URL patterns for X/Twitter automation

This skill file documents:
- How to create posts (click "What's happening?" → type → click "Post")
- How to search (search bar → type query → Enter)
- How to navigate (URL patterns for home, notifications, search, profiles)
- How to interact with posts (like, reply, repost buttons)
- Keyboard shortcuts (n=new post, l=like, r=reply, t=repost)
- Important notes about X Chat encryption, dark mode, etc.

---

## Related Documentation

**Living Documents (Update During Scan):**
- `/docs/marketing/social-media/twitter-accounts-tracker.md` - **Account tracking with last visited dates**
- `/docs/marketing/social-media/twitter-strategy-recommendations-log.md` - **Strategy recommendations log**
- `/docs/marketing/social-media/twitter-profiles/INDEX.md` - Master list of all tracked accounts

**Cross-Links (Read for Full Context):**
- `/docs/marketing/strategy/adhd-productivity-os-strategy.md` - ADHD market positioning
- `/docs/marketing/social-media/twitter-context-engineering-strategy.md` - Context Engineering positioning
- `/docs/marketing/content/blog-skeletons/context-engineering-for-productivity.md` - Blog strategy
- `/docs/marketing/user-segments/users-adhd.md` - ADHD user messaging

---

## Competitor Monitoring (PRIORITY)

**Check these accounts FIRST every scan. Monitor for:**
- New features they're shipping (can we incorporate?)
- Content strategy and positioning
- Community response and engagement patterns
- Partnership opportunities or collaboration potential
- Weaknesses we can address

### Direct Competitors

| Account | Product | Why Monitor | Strategy |
|---------|---------|-------------|----------|
| @dannypostma (166K) | PostmaOS - AI Life OS | Direct competitor, building similar vision | Learn from features, differentiate on ADHD focus |
| @danidonovan (126K) | Anti-Planner | Competing ADHD philosophy (no structure) | Respect, don't attack. Potential partnership. |
| @tdinh_me (175K) | TypingMind | AI chat UI, Claude power user | Watch for productivity features |

### Context Engineering Space (Own This Term)

| Account | Relevance | Why Monitor | Strategy |
|---------|-----------|-------------|----------|
| @dexhorthy (10.5K) | Coined "Context Engineering" | LAND GRAB - he owns the term | Engage, credit, build relationship |
| @datachaz (149K) | Claude Code patterns guide | Deep context engineering practitioner | Learn from, cite, engage |
| @NinaLopatina (231) | Works at ContextualAI | Industry insider | Monitor for trends |

### What to Look For

**When scanning competitors:**
1. **New features announced** - Can BuildOS implement better?
2. **User complaints** - Pain points we can solve
3. **Pricing changes** - Market positioning shifts
4. **Partnership announcements** - Who are they working with?
5. **Community sentiment** - Are users happy or frustrated?

**When scanning Context Engineering accounts:**
1. **New definitions/frameworks** - Incorporate into our narrative
2. **Viral threads** - Engagement opportunities
3. **Technical insights** - Product improvement ideas

**Flag anything notable in the daily engagement doc under "Competitor Intelligence" section.**

---

## Phase 0: Check Notifications & Timeline FIRST

**ALWAYS START HERE - This shows real-time activity from accounts that matter.**

### Step 1: Check Notifications
Navigate to: **https://x.com/notifications**

Look for:
- Replies to your posts (respond to keep conversations going)
- Quote tweets mentioning you
- Likes from strategic accounts (note for relationship tracking)
- Mentions in conversations you should join

### Step 2: Check Home Timeline
Navigate to: **https://x.com/i/timeline** (or https://x.com/home)

Scan the "For You" and "Following" tabs for:
- Fresh posts from accounts you follow (especially Tier 1)
- Conversations happening in real-time
- Trending topics in your space

**Capture any engagement opportunities from notifications/timeline FIRST.**

---

## Phase 1: Load Context

### Read These Files (Required)

1. **Accounts Tracker** (who to scan + last visited):
   - `docs/marketing/social-media/twitter-accounts-tracker.md`

2. **Strategy Recommendations** (current strategic priorities):
   - `docs/marketing/social-media/twitter-strategy-recommendations-log.md`

3. **Founder Context** (shared across platforms):
   - `docs/marketing/social-media/FOUNDER_CONTEXT.md`

4. **Voice Reference** (platform-specific):
   - `docs/marketing/social-media/twitter-voice-quick-ref.md`

5. **Search Queries** (for topic searches):
   - `docs/marketing/social-media/twitter-advanced-search-queries.md`

6. **Twitter Profile Database** (detailed account info):
   - `docs/marketing/social-media/twitter-profiles/INDEX.md`

### Check for Duplicates

Scan the last 7 days of engagement docs to avoid suggesting posts already seen:
- `docs/marketing/social-media/daily-engagement/` (all files from last 7 days)

Extract tweet links from previous docs and maintain a "seen" list.

---

## Phase 2: Browser Scanning

### Scan Order (Use Accounts Tracker for Full List)

**Reference:** `docs/marketing/social-media/twitter-accounts-tracker.md`

**Round 1: Tier 1 Accounts (High Priority)**
Scan all accounts in the "Tier 1 - Core Strategic Targets" section.
Update `Last Visited` column after scanning each account.

**Round 2: Context Engineering Accounts (PRIORITY - Own This Space)**
Scan all accounts in the "Context Engineering" section.
@dexhorthy engagement is CRITICAL - he coined the term.

**Round 3: Competitors**
Check competitor accounts for new activity.
Note any changes in their profiles, products, or strategy.

**Round 4: ADHD/Neurodivergent (Core Audience)**
Scan ADHD accounts - this is BuildOS's primary user segment.

**Round 5: Indie Hackers / Building in Public**
Scan indie hacker accounts for building-related posts.

**Round 6: AI/LLM Thought Leaders**
Scan AI accounts (except @karpathy - monitor only, too big).

**Round 7: Topic Searches**
Use Twitter's search (Latest tab) with queries from:
`docs/marketing/social-media/twitter-advanced-search-queries.md`

**Round 8: Following Feed Discovery (New Accounts)**
Navigate to https://x.com/home (Following tab) to discover new accounts.

### For Each Potential Tweet, Capture:

- Author handle and name
- Tweet text (full content)
- Post age (how long ago)
- Current engagement (replies, likes, retweets)
- Link to tweet
- Why it's relevant (which content pillar it matches)

### Selection Criteria

**Include tweets that are:**
- From last 24 hours (prioritize <6h for freshness)
- Relevant to: AI/context, ADHD/productivity, building in public, tool frustration
- Low-to-moderate existing replies (better chance to stand out)
- NOT already in the "seen" list from previous 7 days

**Skip tweets that:**
- Are promotional/ads
- Already have 100+ replies (too crowded)
- Are just announcements with no discussion angle
- You've already seen in previous docs

---

## Phase 3: Prioritize & Score

Score each tweet opportunity (1-10):

| Factor | Weight | Criteria |
|--------|--------|----------|
| Freshness | 3x | <2h = 10, 2-6h = 8, 6-12h = 6, 12-24h = 4 |
| Brand Fit | 3x | How aligned with BuildOS messaging |
| Engagement Potential | 2x | Author reach + topic interest |
| Reply Competition | 2x | Fewer replies = higher score |

Select **top 5-7 opportunities** based on total score.

---

## Phase 4: Generate Replies

For each selected tweet, create 2-3 reply options following DJ's voice:

### The Core Philosophy: Interesting Guy + Cheerleader

> **NOT a thought leader.** Everyone is trying to be a thought leader. That's overdone and inauthentic.
> **The goal:** Come across as an interesting person who has interesting things to say, OR as a genuine supporter when you don't have specific expertise.

### Two Modes of Engagement

**Mode 1: Add Value (When You Have Something)**
Use when the topic touches your actual experience - Curri integrations, BuildOS, Marines, context engineering, solo founder journey.
- Share specific experience or insight
- Lead with curiosity, not authority
- Offer a perspective others might not have considered
- Be direct and lowercase casual

**Mode 2: Cheerleader (When You Don't)**
Use when you don't have specific expertise but want to engage.
- Genuine hype and encouragement
- Ask curious questions
- Celebrate their wins specifically
- "We're all rowing the same boat" energy
- It's valid to just be excited for someone

### Reply Generation Rules

1. **Decide your mode first** - Do you have value to add, or are you here to support?
2. **Lead with insight OR genuine excitement** - Both are valid, not just insight
3. **Use specific experience when relevant** - Marines (sparingly), solo founder journey, Curri integrations
4. **Context engineering angle** - When discussing AI, frame around memory/context IF relevant
5. **Be direct** - Cut filler words, lowercase casual
6. **Teammate energy** - We're in this together
7. **BuildOS mentions** - Only when genuinely relevant, use "shameless plug" framing
8. **It's okay to just encourage** - Not every reply needs to teach something

### Reply Templates by Topic

**AI/Context Posts - Value Mode:**
```
[observation about AI memory problem from experience]

[your experience - Curri integrations, BuildOS building]

[question to extend the conversation]
```

**AI/Context Posts - Cheerleader Mode:**
```
[genuine reaction to what they're sharing]

[curious question about their approach]
```

**Productivity Posts - Value Mode:**
```
[validate the struggle with specific detail from your experience]

[what actually works / what you've learned]

[question to open dialogue]
```

**Productivity Posts - Cheerleader Mode:**
```
[validate their struggle/insight genuinely]

[ask what's working for them]

[encouraging note - we're all figuring this out]
```

**Building/Startup Posts - Value Mode:**
```
[direct reaction or agreement]

[add your experience - solo founder journey]

[extend their point with your angle]
```

**Building/Startup Posts - Cheerleader Mode:**
```
[hell yes energy for their win/progress]

[specific thing that impressed you]

[curious question about what's next]
```

**Someone Sharing a Win:**
```
hell yes. [specific thing about the win that's impressive].

[curious question or genuine hype]
```

**Big Account Engagement:**
```
[reference their past content or framework]

[add unique angle from your experience OR genuine curiosity]

[ask a direct question - not generic praise]
```

---

## Phase 5: Output Document

### Document Format

```markdown
<!-- docs/marketing/social-media/daily-engagement/YYYY-MM-DD_twitter-warmup.md -->

# Twitter Warmup - [Date in words]

**Date:** [YYYY-MM-DD]
**Account:** @djwayne3
**Scan Time:** [timestamp]

---

## Notifications & Timeline Activity

**Notifications Checked:** [Yes/No - any notable activity?]
**Timeline Highlights:** [Any hot topics or trending conversations?]

---

## Priority Summary

| Priority | Account | Post Topic | Age | Why |
|----------|---------|------------|-----|-----|
| 1 | @handle | [brief topic] | Xh | [reason] |
| 2 | ... | ... | ... | ... |
[5-7 rows]

---

## 1. [Author Name] - [Topic]

**Post Link:** [full URL]

**The Tweet:**
> [full tweet text]

**Stats:** X replies, Y likes ([age])

**Why This Tweet:**
[1-2 sentences on why this is a good engagement opportunity]

**Suggested Reply Option 1 ([angle]):**
> [reply text]

**Suggested Reply Option 2 ([angle]):**
> [reply text]

**Suggested Reply Option 3 ([angle]):**
> [reply text]

---

[Repeat for all 5-7 tweets]

---

## Posting Strategy

**Recommended Order:**
1. [Most fresh/lowest competition first]
2. [Second priority]
...

**Timing:** [Best window based on freshness]
**Spacing:** 30+ min between replies

---

## New Accounts Discovered

Accounts from your Following feed worth adding to engagement tiers:

| Account | Followers | Theme | Suggested Tier | Why |
|---------|-----------|-------|----------------|-----|
| @handle | Xk | [AI/ADHD/Building] | [1/2/3] | [brief reason] |

### Account Details

#### @[handle] - [Name]
**Followers:** X,XXX
**Bio:** [their bio]
**Content Themes:** [what they post about]
**Recent Post That Stood Out:**
> [tweet text]

**Why Add to Tier [X]:**
[1-2 sentences on why this account is worth engaging with regularly]

---

## Competitor Intelligence

[Only include if notable competitor activity observed]

### @dannypostma (PostmaOS)
**Activity:** [new feature, content, etc.]
**Implications:** [what this means for BuildOS]
**Action:** [what we should do]

### @danidonovan (Anti-Planner)
**Activity:** [new content, product updates]
**Implications:** [partnership opportunity? differentiation needed?]

### @dexhorthy (Context Engineering)
**Activity:** [new posts about context engineering]
**Implications:** [content opportunities, engagement needed]

---

## Voice Reminder

### The Philosophy
**Interesting guy + cheerleader. NOT a thought leader.**

### Two Modes
1. **Value Mode:** When you have experience to share - lead with insight, be specific, ask smart questions
2. **Cheerleader Mode:** When you don't - genuine hype, curious questions, celebrate their wins

### The 3 Rules (for Value Mode)
1. Can I visualize it? (specific details)
2. Can I falsify it? (real experience)
3. Can nobody else say this? (unique perspective)

### Quick Do's
- Genuine excitement when cheering someone on
- "hell yes" and specific praise for wins
- Curious questions about their journey
- Teammate energy - we're all rowing together

### Quick Don'ts
- "love this" or "great post" (hollow)
- Preachy setups ("Most people don't realize...")
- Generic observations anyone could make
- Teaching when you're just supporting
- Thought leader energy

---

## Accounts Scanned & Last Visited Updates

| Account | Scanned | Notes |
|---------|---------|-------|
| @handle | Yes/No | [any notable observations] |

**Update the accounts tracker:** `docs/marketing/social-media/twitter-accounts-tracker.md`

---

## Profile Updates Made

| Account | Change | Old → New |
|---------|--------|-----------|
| @handle | Followers | 10K → 12K |
| @handle | Bio | [brief note] |

No significant changes observed for other profiles.

---

## Strategy Recommendations

[Based on today's scan, note any strategic observations or recommendations]

### Today's Observations
- [What patterns did you notice?]
- [Any shifts in the landscape?]
- [New opportunities or threats?]

### Recommendations
- [Any strategy adjustments needed?]
- [New accounts to prioritize?]
- [Content angles to explore?]

### Strategy Update Needed?
[ ] No changes - current strategy is working
[ ] Minor tweak - [describe]
[ ] Significant shift - [describe]

**Update the strategy log:** `docs/marketing/social-media/twitter-strategy-recommendations-log.md`

---

**Created:** [timestamp]
**Next Scan:** [tomorrow's date]
```

---

## Execution Notes

1. **Start with notifications and timeline** - This is the freshest activity
2. **Take screenshots** of relevant tweets for reference
3. **Wait 2 seconds** after page loads before capturing
4. **Use Latest tab** for searches to get fresh content
5. **Check for previous engagement** - don't suggest same posts twice
6. **Quality over quantity** - better to find 5 great opportunities than 10 mediocre ones

---

## When Complete

Present a summary to the user:

```
Twitter warmup complete for [date].

## Engagement Opportunities Found: X

- [count] from notifications/timeline
- [count] from Tier 1 accounts
- [count] from Tier 2/3 accounts
- [count] from topic searches

Top opportunities:
1. @[handle] - [topic] (Xh ago, Y replies)
2. @[handle] - [topic] (Xh ago, Y replies)
3. @[handle] - [topic] (Xh ago, Y replies)

## New Accounts Discovered: X

Worth adding to your engagement tiers:
- @[handle] ([followers]) - [theme] → Suggested: Tier [X]
- @[handle] ([followers]) - [theme] → Suggested: Tier [X]

## Strategy Notes
[Any observations or recommendations from today's scan]

Full doc: docs/marketing/social-media/daily-engagement/[filename]

Ready to post? Start with [recommendation] - it's the freshest with lowest competition.
```

### After Each Scan - Update Living Documents

**IMPORTANT:** After completing a warmup scan, update these living documents:

1. **Accounts Tracker** (`docs/marketing/social-media/twitter-accounts-tracker.md`)
   - Update `Last Visited` column for each account scanned
   - Add any newly discovered accounts to "Discovered Accounts" section
   - Update follower counts if changed significantly

2. **Strategy Recommendations** (`docs/marketing/social-media/twitter-strategy-recommendations-log.md`)
   - Add a log entry if there are strategic observations
   - Note any landscape shifts or new opportunities
   - Mark if strategy adjustments are needed

3. **Twitter Profiles** (`docs/marketing/social-media/twitter-profiles/[category]/[handle].md`)
   - Update frontmatter if profile info changed
   - Add notes for significant observations

---

## Profile Update Instructions

**IMPORTANT:** During each warmup scan, update the profile docs if you notice significant changes.

### When to Update Profiles

Update a profile doc (`/docs/marketing/social-media/twitter-profiles/[category]/[handle].md`) when you notice:

1. **Follower count changed significantly** (±5% or ±1K, whichever is larger)
2. **Bio changed** - New role, product, or positioning
3. **New product launched** - Add to Known Products section
4. **Viral post** - Note in Recent Activity or Notes section
5. **Competitor activity** - New features, partnerships, or strategy shifts

### How to Update

```bash
# Update the frontmatter fields:
followers: [new count]
scraped_date: [today's date YYYY-MM-DD]

# Add to Notes section if significant:
- [YYYY-MM-DD] [Notable observation]
```

### Priority Profiles to Keep Updated

**Always check and update these during scans:**
1. **Competitors:** @dannypostma, @danidonovan, @tdinh_me
2. **Context Engineering:** @dexhorthy, @datachaz
3. **ADHD Leaders:** @ADHD_Alien, @HowtoADHD, @StructuredSucc

---

## Strategic Alerts

**Flag immediately if you see:**

1. **@dannypostma announces PostmaOS feature** that overlaps with BuildOS
2. **@danidonovan launches Anti-Planner digital version** or app
3. **@dexhorthy posts viral context engineering thread** - engage within hours
4. **Any ADHD account with 50K+ followers mentions "AI productivity"**
5. **@karpathy or @emollick posts about personal AI/productivity**

**Action for Strategic Alerts:**
1. Note in daily engagement doc with HIGH PRIORITY flag
2. Draft engagement options immediately
3. Consider whether this warrants a BuildOS content response
4. Update relevant strategy docs if landscape is shifting

---

## Cross-Reference Files

After completing a warmup scan, ensure these files stay in sync:

| File | Update If... |
|------|--------------|
| `twitter-accounts-tracker.md` | Update Last Visited dates for all scanned accounts |
| `twitter-strategy-recommendations-log.md` | Add observations and recommendations |
| `twitter-profiles/INDEX.md` | New accounts added or follower counts significantly changed |
| `twitter-profiles/[category]/[handle].md` | Profile info changed, notable observations |
| `twitter-engagement-targets.md` | New accounts should be added to engagement tiers |
| `adhd-productivity-os-strategy.md` | Competitor landscape changes |
| `twitter-context-engineering-strategy.md` | Context engineering space evolves |

---

*Last Updated: 2026-01-09*
*Accounts Tracker: `/docs/marketing/social-media/twitter-accounts-tracker.md`*
*Strategy Log: `/docs/marketing/social-media/twitter-strategy-recommendations-log.md`*
*Profile Database: `/docs/marketing/social-media/twitter-profiles/INDEX.md`*
