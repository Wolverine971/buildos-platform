# Twitter Warmup - Daily Engagement Scan

You are conducting a daily Twitter/X engagement scan for @djwayne3 to find high-quality reply opportunities that align with the BuildOS brand.

**This command runs in TWO STAGES:**

1. **Stage 1 (This Agent):** Source tweets using the browser. Find opportunities. Update the document AS YOU GO - don't wait until the end.
2. **Stage 2 (Separate Agent):** After sourcing is complete, launch a separate agent to craft replies using the anti-marketing playbook.

---

## Output

Create a daily engagement doc at:
`docs/marketing/social-media/daily-engagement/YYYY-MM-DD_twitter-warmup.md`

**Create this file FIRST before scanning. Update it continuously as you find tweets.**

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

# STAGE 1: SOURCE TWEETS

> **Your job in Stage 1 is ONLY to find tweets.** Do not craft replies. Just find good opportunities, capture the tweet data, and explain why each one is relevant. Update the document after EVERY tweet you find - do not batch updates.

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

**Capture any engagement opportunities from notifications/timeline FIRST. Write them to the document immediately.**

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

### For Each Potential Tweet, Capture & Write to Document Immediately:

- Author handle and name
- Tweet text (full content)
- Post age (how long ago)
- Current engagement (replies, likes, retweets)
- Link to tweet
- Why it's relevant (which content pillar it matches)
- **Opportunity type:** One of: `AI reality check` | `Tool frustration` | `ADHD/productivity` | `Building in public` | `Context engineering` | `Indie hacker win` | `Community` | `Competitor intel`

**IMPORTANT: Write each tweet to the document as you find it. Don't wait.**

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

After all scanning is complete, go back through the document and score each tweet:

| Factor | Weight | Criteria |
|--------|--------|----------|
| Freshness | 3x | <2h = 10, 2-6h = 8, 6-12h = 6, 12-24h = 4 |
| Brand Fit | 3x | How aligned with BuildOS messaging |
| Engagement Potential | 2x | Author reach + topic interest |
| Reply Competition | 2x | Fewer replies = higher score |

Select **top 5-7 opportunities** based on total score. Update the priority summary table in the document.

---

## Stage 1 Output Document Format

```markdown
<!-- docs/marketing/social-media/daily-engagement/YYYY-MM-DD_twitter-warmup.md -->

# Twitter Warmup - [Date in words]

**Date:** [YYYY-MM-DD]
**Account:** @djwayne3
**Scan Time:** [timestamp]
**Status:** STAGE 1 COMPLETE - Awaiting reply crafting

---

## Notifications & Timeline Activity

**Notifications Checked:** [Yes/No - any notable activity?]
**Timeline Highlights:** [Any hot topics or trending conversations?]

---

## Priority Summary

| Priority | Account | Post Topic | Age | Opportunity Type | Score | Why |
|----------|---------|------------|-----|------------------|-------|-----|
| 1 | @handle | [brief topic] | Xh | [type] | XX | [reason] |
| 2 | ... | ... | ... | ... | ... | ... |
[5-7 rows]

---

## Tweet Opportunities

### 1. [Author Name] - [Topic]

**Post Link:** [full URL]

**The Tweet:**
> [full tweet text]

**Stats:** X replies, Y likes ([age])
**Opportunity Type:** [AI reality check / Tool frustration / ADHD / etc.]

**Why This Tweet:**
[1-2 sentences on why this is a good engagement opportunity]

**Engagement Mode:** [Value / Cheerleader] — [brief note on which angle]

**Replies:** _Pending Stage 2_

---

[Repeat for all found tweets - add as you go]

---

## New Accounts Discovered

Accounts from your Following feed worth adding to engagement tiers:

| Account | Followers | Theme | Suggested Tier | Why |
|---------|-----------|-------|----------------|-----|
| @handle | Xk | [AI/ADHD/Building] | [1/2/3] | [brief reason] |

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

---

## Strategy Observations

[Raw observations from today's scan - strategy recs will be finalized after Stage 2]

- [What patterns did you notice?]
- [Any shifts in the landscape?]
- [New opportunities or threats?]

---

**Created:** [timestamp]
**Stage 1 Completed:** [timestamp]
**Stage 2 Status:** Pending
```

---

# STAGE 2: CRAFT REPLIES (Separate Agent)

> **After Stage 1 is complete, launch a separate agent to craft replies.**

## How to Launch Stage 2

After Stage 1 scanning is complete, present the summary to the user and then launch the reply-crafting agent:

```
Stage 1 complete for [date].

## Tweets Sourced: X

- [count] from notifications/timeline
- [count] from Tier 1 accounts
- [count] from topic searches
- [count] total prioritized (top 5-7)

## New Accounts Discovered: X

## Notable Competitor Activity: [Yes/No]

Launching Stage 2 to craft replies...
```

Then use the Task tool to launch a separate agent with this prompt:

---

### Stage 2 Agent Prompt

```
You are crafting Twitter reply suggestions for @djwayne3.

## Required Reading (Load These First)

1. **The daily engagement doc (Stage 1 output):**
   `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_twitter-warmup.md`

2. **Reply Strategy & Tone Guide (CRITICAL - this defines how we respond):**
   `docs/marketing/social-media/twitter-reply-strategy.md`

3. **Voice Reference:**
   `docs/marketing/social-media/twitter-voice-quick-ref.md`

4. **Founder Context:**
   `docs/marketing/social-media/FOUNDER_CONTEXT.md`

## Your Job

For each prioritized tweet in the document (the top 5-7), craft 2-3 reply options.

## Reply Crafting Rules

### The Anti-Marketing Playbook (from twitter-reply-strategy.md)

1. **80% of replies should have ZERO product mention.** Pure value, pure community.
2. **Hold the tension:** Excited about AI AND honest that it's not there yet.
3. **Add to conversations, don't hijack them.**
4. **Include honest caveats** whenever mentioning BuildOS.
5. **Never mention BuildOS** on ADHD struggles, personal wins, or emotional posts.

### The Two Modes (from voice reference)

**Mode 1: Add Value (When You Have Something)**
- Share specific experience or insight
- Lead with curiosity, not authority
- Be direct and lowercase casual
- Teammate energy, not teaching

**Mode 2: Cheerleader (When You Don't)**
- Genuine hype and encouragement
- Curious questions
- Celebrate their wins specifically
- "hell yes" energy

### The 3 Rules (for Value Mode)
1. Can I visualize it? (specific details)
2. Can I falsify it? (real experience)
3. Can nobody else say this? (unique perspective)

### Tone Calibration

Read the "Reply Tone Guide" section in twitter-reply-strategy.md carefully. Every reply should live at "excited pragmatism" - not pure hype, not pure cynicism.

**Phrases to use:** "honestly...", "here's what I've found...", "still figuring this out, but...", "not gonna lie, this is hard."

**Phrases to avoid:** "game-changer", "the future of...", "most people don't realize...", "I've cracked the code on..."

## Reply Format

For each tweet, add this to the document:

**Suggested Reply Option 1 ([mode: value/cheerleader] - [angle]):**
> [reply text]

**Suggested Reply Option 2 ([mode] - [angle]):**
> [reply text]

**Suggested Reply Option 3 ([mode] - [angle]):**
> [reply text]

**Product mention?** [Yes - with caveat / No]

## After All Replies Are Crafted

1. Update the document status from "Awaiting reply crafting" to "COMPLETE"
2. Add a "Posting Strategy" section:
   - Recommended order (freshest/lowest competition first)
   - Timing window
   - Spacing: 30+ min between replies
   - Which replies include product mentions (max 2-3 per day)

3. Add final "Strategy Recommendations" section:
   - Today's observations
   - Recommendations
   - Strategy update needed? [No / Minor tweak / Significant shift]

4. Update the strategy log: `docs/marketing/social-media/twitter-strategy-recommendations-log.md`

5. Present final summary to user.
```

---

## Execution Notes

1. **Start with notifications and timeline** - This is the freshest activity
2. **Take screenshots** of relevant tweets for reference
3. **Wait 2 seconds** after page loads before capturing
4. **Use Latest tab** for searches to get fresh content
5. **Check for previous engagement** - don't suggest same posts twice
6. **Quality over quantity** - better to find 5 great opportunities than 10 mediocre ones
7. **Write to the document as you go** - Don't accumulate everything in memory

---

## After Each Scan - Update Living Documents

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

*Last Updated: 2026-02-07*
*Accounts Tracker: `/docs/marketing/social-media/twitter-accounts-tracker.md`*
*Strategy Log: `/docs/marketing/social-media/twitter-strategy-recommendations-log.md`*
*Reply Strategy: `/docs/marketing/social-media/twitter-reply-strategy.md`*
*Profile Database: `/docs/marketing/social-media/twitter-profiles/INDEX.md`*
