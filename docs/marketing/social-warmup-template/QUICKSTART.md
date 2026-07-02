<!-- social-warmup-template/QUICKSTART.md -->

# Quick Start Guide

Get your social warmup workflow running in 4 steps.

## Step 1: Copy the Template (5 minutes)

Copy the entire `social-warmup-template/` folder to your project:

```bash
cp -r social-warmup-template/ your-project/
```

Your project should now have:

```
your-project/
├── .claude/commands/
│   ├── twitter-warmup.md
│   └── linkedin-warmup.md
└── docs/social-media/
    ├── FOUNDER_CONTEXT.md
    ├── twitter-voice-quick-ref.md
    ├── linkedin-voice-quick-ref.md
    ├── twitter-engagement-targets.md
    ├── linkedin-engagement-targets.md
    ├── twitter-advanced-search-queries.md
    ├── linkedin-search-queries.md
    └── profiles/
        ├── INDEX.md
        └── PROFILE_TEMPLATE.md
```

## Step 2: Fill Out Founder Context (1-2 hours)

This is the most important file. Open:

```
docs/social-media/FOUNDER_CONTEXT.md
```

Fill in these sections first (minimum viable context):

1. **Quick Reference** - Basic facts about you
2. **Voice Characteristics** - How you communicate
3. **Content Pillars** - The 3-5 topics you talk about
4. **Background** - Your story and unique experiences
5. **Story Bank** - 5-10 stories you can reference

Skip sections you don't have answers for yet. You can always come back.

## Step 3: Set Up Engagement Targets (1 hour)

Open:

```
docs/social-media/twitter-engagement-targets.md
```

Fill in:

1. **Tier 1** - 5-10 accounts you want to engage with on every post
2. **Tier 2** - 15-30 accounts organized by category
3. **Search Queries** - 10-15 queries for your niche

Use Twitter search to find accounts in your space:

- Search for keywords in your niche
- Look at who influential people follow
- Check who's posting about your topics

## Step 4: Run Your First Warmup (15 minutes)

In Claude Code (or your AI assistant), run:

```
/twitter-warmup
```

The agent will:

1. Read your context files
2. Scan your target accounts
3. Find engagement opportunities
4. Generate reply options in your voice
5. Save everything to `docs/social-media/daily-engagement/`

Review the output and post your favorites!

---

## Ongoing Workflow

### Daily (15-30 minutes)

1. Run `/twitter-warmup` or `/linkedin-warmup`
2. Review the opportunities
3. Pick 5-7 replies and post them
4. Space replies 30+ min apart

### Weekly (30 minutes)

1. Review which engagements got responses
2. Add 1-2 new accounts to your targets
3. Update any profiles that changed

### Monthly (1 hour)

1. Review and update search queries
2. Clean up targets that aren't relevant
3. Add new accounts you've discovered

---

## Tips for Filling Templates

### Founder Context

- Write like you're explaining to a friend, not a business document
- Include specific stories, not just abstract principles
- Be honest about what you DON'T know or aren't expert in
- Your unique experiences are your superpower - include them

### Engagement Targets

- Start with accounts you already follow and respect
- Use the 1K-100K follower sweet spot for engagement
- Group accounts by category to make scanning easier
- Include competitors - you should know what they're up to

### Search Queries

- Think about what your audience complains about
- Include competitor names with "abandoned" or "frustrated"
- Focus on pain points, not solutions
- Use Twitter's advanced search syntax for better results

---

## Common Questions

**Q: How long until I see results?**
A: Genuine engagement takes time. Expect 2-4 weeks before you notice patterns in responses.

**Q: Should I mention my product?**
A: Only when genuinely relevant. Use "shameless plug" framing when you do. Most replies should NOT mention your product.

**Q: What if I don't have expertise in a topic?**
A: Use Cheerleader Mode! Genuine support and curious questions are valuable.

**Q: How many replies per day?**
A: Quality > quantity. 5-7 thoughtful replies beats 20 generic ones.

---

## Need Help?

- Check `README.md` for full documentation
- Review the template examples
- Iterate and improve as you learn what works
