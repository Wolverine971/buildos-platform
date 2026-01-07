# LinkedIn Warmup - Daily Engagement Scan

You are conducting a daily LinkedIn engagement scan for DJ to find high-quality comment opportunities that align with the BuildOS brand.

## Output

Create a daily engagement doc at:
`docs/marketing/social-media/daily-engagement/YYYY-MM-DD_linkedin-warmup.md`

---

## Phase 1: Load Context

### Read These Files (Required)

1. **Founder Context** (shared across platforms):
   - `docs/marketing/social-media/FOUNDER_CONTEXT.md`

2. **LinkedIn Voice Reference** (platform-specific):
   - `docs/marketing/social-media/linkedin-voice-quick-ref.md`

3. **Engagement Targets** (accounts to scan):
   - `docs/marketing/social-media/linkedin-engagement-targets.md`

4. **Search Strategy** (for topic searches):
   - `docs/marketing/social-media/linkedin-search-discovery.md`

### Check for Duplicates

Scan the last 7 days of engagement docs to avoid suggesting posts already seen:
- `docs/marketing/social-media/daily-engagement/` (all LinkedIn files from last 7 days)

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

*Context Engineering & AI:*
- Ethan Mollick (https://linkedin.com/in/emollick) - AI applications, Wharton
- swyx / Shawn Wang (https://linkedin.com/in/shawnswyxwang) - AI Engineer, Latent Space
- Dan Shipper (https://linkedin.com/in/danshipper) - Every, AI productivity

*Founders & Building:*
- Lenny Rachitsky (https://linkedin.com/in/lennyrachitsky) - Product leadership
- Sahil Lavingia (https://linkedin.com/in/sahillavingia) - Gumroad, Minimalist Entrepreneur
- Greg Isenberg (https://linkedin.com/in/gregisenberg) - Startup Ideas, community building

**Round 2: Tier 2 Accounts (AI/LLM)**
- Simon Willison (https://linkedin.com/in/simonwillison) - Datasette, LLM writing
- Harrison Chase (https://linkedin.com/in/harrison-chase-961287118) - LangChain
- Relevant AI founders posting about context, agents, memory

**Round 3: Tier 2 Accounts (Productivity/PKM)**
- Tiago Forte (https://linkedin.com/in/taborte) - Building a Second Brain
- Ali Abdaal (https://linkedin.com/in/aliabdaal) - Productivity, content creation
- Productivity tool founders and thought leaders

**Round 4: Tier 2 Accounts (Indie Hackers/Solopreneurs)**
- Justin Welsh (https://linkedin.com/in/justinwelsh) - Solopreneur, content
- Arvid Kahl (https://linkedin.com/in/arvidkahl) - Bootstrapped founder
- Other solo founders building in public

**Round 5: Topic Searches**
Use LinkedIn's search bar → Filter by "Posts" → Sort by "Latest":

*Context & AI Memory:*
- `context engineering AI`
- `AI memory problem`
- `context window limitation`
- `LLM context`
- `RAG knowledge base`

*AI Productivity:*
- `AI productivity workflow`
- `ChatGPT workflow`
- `AI assistant productivity`
- `using AI at work`

*Productivity Tool Frustration:*
- `productivity app overwhelm`
- `Notion complicated`
- `too many productivity tools`
- `task management frustration`

*Building in Public:*
- `building in public`
- `founder journey`
- `startup lessons learned`
- `indie hacker`

*AI Agents (Contrarian):*
- `AI agents`
- `autonomous AI`
- `AI agent limitations`

**Round 6: Hashtag Scanning**
Check recent posts under these hashtags:

| Hashtag                 | Why                    |
| ----------------------- | ---------------------- |
| #ArtificialIntelligence | Broad AI discussions   |
| #Productivity           | Productivity tips      |
| #FutureOfWork           | AI + work intersection |
| #BuildingInPublic       | Founder community      |
| #FounderLife            | Startup content        |
| #KnowledgeManagement    | PKM space              |

**Round 7: Feed Discovery (New Accounts)**
Navigate to LinkedIn home feed and scroll through recent posts to discover:
- Accounts posting relevant content that aren't in Tier 1/2/3 lists
- Fresh voices with good engagement who align with BuildOS themes
- People discussing context, AI memory, productivity frustrations

### New Account Discovery Criteria

**Flag accounts for potential Tier addition if they:**
- Post about AI tools, context, productivity, or building
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
- Relevant to: AI/context, productivity, building in public, tool frustration
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
| Brand Fit | 3x | How aligned with BuildOS messaging/pillars |
| Author Relevance | 2x | Tier 1 = 10, Tier 2 = 7, Tier 3 = 5, Discovery = 6 |
| Comment Competition | 2x | <10 comments = 10, 10-20 = 7, 20-30 = 5, 30+ = 3 |

Select **top 5-7 opportunities** based on total score.

---

## Phase 4: Generate Comments

For each selected post, create 2-3 comment options following DJ's voice:

### Comment Generation Rules

1. **Add value, don't agree** - No "great post" or "love this" - extend the thought
2. **Use specific experience** - Curri integrations, solo founder journey, Marines (sparingly)
3. **Context engineering angle** - When discussing AI, frame around memory/context
4. **Learning voice, not authoritative** - "What I'm finding..." not "The answer is..."
5. **BuildOS mentions** - Only when genuinely relevant, be transparent about it
6. **Ask questions** - Opens dialogue, shows curiosity
7. **2-4 sentences minimum** - LinkedIn rewards thoughtful comments

### Comment Templates by Topic

**AI/Context Posts:**
```
[Observation about the context/memory problem]

[Your experience - Curri integrations or BuildOS building]

[Question or extension of their point]

[Optional: soft BuildOS mention if natural - be transparent]
```

**Productivity/Tool Posts:**
```
[Validate with specific experience - "I hit this same wall with..."]

[What actually works / what you've learned]

[Tie to clarity > time management philosophy]

[Question to open dialogue]
```

**Building/Founder Posts:**
```
[Direct reaction - acknowledge their insight]

[Add your experience - solo founder, what you're learning]

[Extend with your angle or contrarian perspective]

[Optional: ask about their approach]
```

**AI Agents Posts (Contrarian):**
```
[Acknowledge the point, but...]

[Share your "context > agents" perspective from building]

["I was doing tool use at Curri before AI made it trendy" angle]

[Question about their experience with context/memory]
```

**Big Account Engagement:**
```
[Reference their past content, framework, or specific work]

[Add unique angle from your experience]

[Ask a direct question - not generic praise]

[Show you've actually thought about their ideas]
```

### Voice Reminders

**DO:**
- Lead with observation or insight
- Be specific - use real examples
- Ask thoughtful questions
- Professional but authentic
- "What I'm finding..." / "In my experience building..."

**DON'T:**
- "Love this!" / "Great post!"
- Generic observations anyone could make
- Preachy setups ("Most people don't realize...")
- Sycophantic praise
- "I think..." (just say it directly)

---

## Phase 5: Output Document

### Document Format

```markdown
<!-- docs/marketing/social-media/daily-engagement/YYYY-MM-DD_linkedin-warmup.md -->

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
| [Name] | Xk | [AI/Productivity/Building] | [1/2/3] | [brief reason] |

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

Full doc: docs/marketing/social-media/daily-engagement/[filename]

Ready to engage? Start with [recommendation] - it's the freshest with lowest competition.
```

### After Each Scan

If new accounts are discovered, ask the user:
```
I found X new accounts worth engaging with regularly. Should I update your engagement targets doc (linkedin-engagement-targets.md) to add them to the appropriate tiers?
```
