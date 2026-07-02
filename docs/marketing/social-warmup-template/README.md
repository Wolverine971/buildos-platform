<!-- social-warmup-template/README.md -->

# Social Warmup System - Template Package

A portable AI-powered social media engagement workflow. Drop this into any project and fill in the templates to create a daily engagement system for your niche.

## What This System Does

1. **Daily Scans**: AI agent scans target accounts and topics for engagement opportunities
2. **Reply Generation**: Creates platform-specific reply/comment options in your voice
3. **Competitor Monitoring**: Tracks key players in your space
4. **Account Discovery**: Finds new accounts to add to your engagement list
5. **Profile Database**: Maintains detailed profiles of accounts you engage with

## Quick Start

1. Copy this entire folder to your project
2. Fill out the templates in order (see below)
3. Run the warmup command daily: `/twitter-warmup` or `/linkedin-warmup`

---

## Template Fill Order

**Fill these out in order - each builds on the previous:**

### 1. Founder Context (FILL FIRST)

`docs/social-media/FOUNDER_CONTEXT.md`

This is the foundation. Contains:

- Your background, story, and unique experiences
- Core beliefs and hot takes
- Content pillars (what you talk about)
- Stories you can reference in replies
- What makes you different

**Time to fill:** 1-2 hours (deep work)

### 2. Voice Quick Reference

`docs/social-media/{platform}-voice-quick-ref.md`

Platform-specific voice guidelines:

- Your identity summary
- Engagement philosophy
- Reply starters and templates
- What TO DO and NOT TO DO
- Content pillars for this platform

**Time to fill:** 30-45 minutes

### 3. Engagement Targets

`docs/social-media/{platform}-engagement-targets.md`

Accounts you want to engage with:

- Tier 1: Engage every post (5-10 accounts)
- Tier 2: Engage when relevant (15-30 accounts)
- Tier 3: Weekly check-in (10-20 accounts)
- Topic search queries for your niche

**Time to fill:** 1-2 hours (research)

### 4. Search Queries

`docs/social-media/{platform}-advanced-search-queries.md`

Platform-specific search queries to find:

- People with your pain points
- Tool frustration in your space
- Your target audience discussing problems
- Building in public / community discussions

**Time to fill:** 30-45 minutes

### 5. Profile Database (Optional - builds over time)

`docs/social-media/profiles/`

Detailed profiles of key accounts. Start with 5-10, add more as you discover them.

**Time to fill:** 15-30 min per profile (builds over time)

---

## Folder Structure

```
your-project/
├── .claude/
│   └── commands/
│       ├── twitter-warmup.md      # Main Twitter workflow command
│       └── linkedin-warmup.md     # Main LinkedIn workflow command
│
└── docs/
    └── social-media/
        ├── FOUNDER_CONTEXT.md           # Your story, voice, background
        ├── twitter-voice-quick-ref.md   # Twitter-specific voice
        ├── linkedin-voice-quick-ref.md  # LinkedIn-specific voice
        ├── twitter-engagement-targets.md
        ├── linkedin-engagement-targets.md
        ├── twitter-advanced-search-queries.md
        ├── linkedin-search-queries.md
        ├── profiles/
        │   ├── INDEX.md                 # Master list of all profiles
        │   ├── tier-1/
        │   │   └── {handle}.md
        │   ├── tier-2/
        │   │   └── {handle}.md
        │   └── competitors/
        │       └── {handle}.md
        └── daily-engagement/
            └── YYYY-MM-DD_{platform}-warmup.md
```

---

## Key Concepts

### The Engagement Philosophy

**Interesting Person + Cheerleader. NOT a thought leader.**

- Everyone tries to be a thought leader - it's overdone and inauthentic
- The goal: Be interesting when you have something to say, be supportive when you don't

### Two Engagement Modes

**Mode 1: Add Value (When You Have Expertise)**

- Share specific experience or insight
- Lead with curiosity, not authority
- Use your unique experiences
- Teammate energy, not teaching

**Mode 2: Cheerleader (When You Don't)**

- Genuine encouragement and support
- Curious questions about their journey
- Celebrate their wins specifically
- "We're all rowing the same boat" energy

### The 3 Rules for Value Replies

1. **Can I visualize it?** - Specific details, not abstractions
2. **Can I falsify it?** - Real experience you could defend
3. **Can nobody else say this?** - Your unique perspective

### Tiered Engagement System

| Tier       | What                        | Action                              |
| ---------- | --------------------------- | ----------------------------------- |
| **Tier 1** | Core accounts in your space | Engage every post within 30 min     |
| **Tier 2** | Relevant accounts           | Engage when topic aligns            |
| **Tier 3** | Big names / Weekly check    | Monitor, engage on high-value posts |

---

## Customization Points

When filling templates, pay special attention to:

1. **Content Pillars** - What 3-5 topics do you talk about?
2. **Unique Angles** - What perspective do only YOU have?
3. **Story Bank** - What experiences can you reference?
4. **Competitors** - Who should you monitor?
5. **Pain Points** - What problems does your audience have?
6. **Search Queries** - What are they searching/discussing?

---

## Platform Differences

| Aspect          | Twitter                          | LinkedIn                   |
| --------------- | -------------------------------- | -------------------------- |
| **Tone**        | lowercase casual, fragments fine | Professional but authentic |
| **Length**      | Short, punchy                    | 2-4 sentences minimum      |
| **Timing**      | Freshness matters, <2h ideal     | First hour is CRITICAL     |
| **Competition** | <50 replies = good               | <30 comments = good        |

---

## Daily Workflow

1. Run `/twitter-warmup` or `/linkedin-warmup`
2. Agent reads your context files
3. Agent scans target accounts + topic searches
4. Agent generates prioritized opportunities with reply options
5. Output saved to `daily-engagement/YYYY-MM-DD_{platform}-warmup.md`
6. You review, pick replies, post with 30+ min spacing

---

## Tips

- **Consistency > Volume**: 5-7 quality engagements daily beats 20 mediocre ones
- **Space your replies**: 30+ min apart on Twitter, 15-30 min on LinkedIn
- **Fresh posts win**: Posts <2h old have less competition
- **Update profiles**: When you notice follower changes, bio updates, etc.
- **Discover accounts**: Add 1-2 new accounts weekly to keep list fresh
- **Review weekly**: Which engagements got replies? Adjust strategy.

---

## Files Included

| File                                                   | Purpose                   |
| ------------------------------------------------------ | ------------------------- |
| `.claude/commands/twitter-warmup.md`                   | Main Twitter workflow     |
| `.claude/commands/linkedin-warmup.md`                  | Main LinkedIn workflow    |
| `docs/social-media/FOUNDER_CONTEXT.md`                 | Your story/voice template |
| `docs/social-media/twitter-voice-quick-ref.md`         | Twitter voice guide       |
| `docs/social-media/linkedin-voice-quick-ref.md`        | LinkedIn voice guide      |
| `docs/social-media/twitter-engagement-targets.md`      | Twitter targets template  |
| `docs/social-media/linkedin-engagement-targets.md`     | LinkedIn targets template |
| `docs/social-media/twitter-advanced-search-queries.md` | Twitter search queries    |
| `docs/social-media/linkedin-search-queries.md`         | LinkedIn search queries   |
| `docs/social-media/profiles/INDEX.md`                  | Profile database index    |
| `docs/social-media/profiles/PROFILE_TEMPLATE.md`       | Template for profiles     |

---

_This template system was extracted from a production workflow. Customize it for your niche, brand, and audience._
