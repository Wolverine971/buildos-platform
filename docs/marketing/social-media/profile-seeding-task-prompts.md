<!-- docs/marketing/social-media/profile-seeding-task-prompts.md -->

# Profile Seeding Task Prompts

Use these when you want to run a one-off research task that seeds or refreshes account profiles without doing live engagement.

These prompts are intentionally narrower than the warmup commands:

- no comments
- no likes
- no follows
- no DMs
- no reply drafting

They are for profile research and CRM seeding only.

---

## Instagram Profile Seeding Prompt

```text
You are running a one-off Instagram profile seeding pass for BuildOS.

Goal:
Research and seed high-value Instagram account profiles for future engagement. Do not comment, like, follow, DM, or draft final comments.

Read these first:
- docs/marketing/brand/brand-guide-1-pager.md
- docs/marketing/social-media/buildos-platform-growth-plan-2026.md
- docs/marketing/social-media/FOUNDER_CONTEXT.md
- docs/marketing/content/drafts/why-i-built-buildos.md
- docs/marketing/social-media/instagram-voice-quick-ref.md
- docs/marketing/social-media/instagram-engagement-targets.md
- docs/marketing/social-media/instagram-niche-expansion-research.md
- docs/marketing/social-media/instagram-profiles/README.md
- docs/marketing/social-media/instagram-profiles/_template.md

Primary output:
- Create or update 10-15 files in docs/marketing/social-media/instagram-profiles/

Selection priority:
1. Tier 1 ADHD creators
2. Tier 1 solo founders / AI creators / PKM creators
3. Competitors worth ongoing monitoring
4. New peer-growth accounts discovered during browsing

For each selected account:
1. Capture the canonical handle and profile URL
2. Record current follower ballpark
3. Summarize bio/positioning
4. Identify 3-5 recurring content themes
5. Note formats used most often
6. Assess audience quality and comment culture
7. Determine strategic role:
   - Core target
   - Peer
   - Watering hole
   - Adjacent builder
   - Competitor
   - Monitor only
8. Add voice/community notes:
   - tone
   - language style
   - what lands well
   - what to avoid
9. Add or refresh relationship-history rows from recent daily-engagement docs if the account already appears there
10. Add 2-3 next-best engagement angles

Quality bar:
- Do not create empty placeholder files
- If an account is too weak or too stale, skip it
- Prefer fewer high-signal profiles over many thin ones
- Keep each profile concise but useful for future reply-writing

At the end, produce a summary:
- profiles created
- profiles updated
- strongest new targets discovered
- any accounts that should be added to instagram-engagement-targets.md later
```

---

## LinkedIn Profile Seeding Prompt

```text
You are running a one-off LinkedIn profile seeding pass for BuildOS.

Goal:
Research and seed high-value LinkedIn account profiles for future engagement. Do not comment, react, connect, DM, or draft final comments.

Read these first:
- docs/marketing/brand/brand-guide-1-pager.md
- docs/marketing/social-media/buildos-platform-growth-plan-2026.md
- docs/marketing/social-media/FOUNDER_CONTEXT.md
- docs/marketing/content/drafts/why-i-built-buildos.md
- docs/marketing/social-media/linkedin-voice-quick-ref.md
- docs/marketing/social-media/linkedin-engagement-targets.md
- docs/marketing/social-media/linkedin-search-discovery.md
- docs/marketing/social-media/linkedin-profiles/README.md
- docs/marketing/social-media/linkedin-profiles/_template.md

Primary output:
- Create or update 10-15 files in docs/marketing/social-media/linkedin-profiles/

Selection priority:
1. Tier 1 category voices and direct strategic accounts
2. ADHD / productivity / founder accounts with clear BuildOS audience overlap
3. AI workflow and context voices worth repeated engagement
4. New peer or adjacent-operator accounts discovered during feed/search browsing

For each selected account:
1. Capture the canonical LinkedIn slug and profile URL
2. Record headline, role, company, and follower ballpark if available
3. Summarize what they post about
4. Identify 3-5 recurring content themes
5. Assess audience quality and comment culture
6. Determine strategic role:
   - Core target
   - Peer
   - Category voice
   - Adjacent operator
   - Competitor
   - Monitor only
7. Record connection level if visible
8. Add voice/comment notes:
   - tone
   - language style
   - what lands well
   - what to avoid
9. Add or refresh relationship-history rows from recent daily-engagement docs if the account already appears there
10. Add 2-3 next-best engagement angles

Critical rule:
- Whenever possible, capture the real canonical profile URL, not a search URL
- If you cannot confirm the canonical profile URL, note that clearly in the profile file instead of guessing

Quality bar:
- Do not create empty placeholder files
- Skip weak accounts with no clear strategic value
- Prefer fewer high-signal profiles over many shallow ones
- Optimize for future reply quality, not profile count

At the end, produce a summary:
- profiles created
- profiles updated
- strongest new targets discovered
- any accounts that should be added to linkedin-engagement-targets.md later
```
