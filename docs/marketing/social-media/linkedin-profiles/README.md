<!-- docs/marketing/social-media/linkedin-profiles/README.md -->

# LinkedIn Profiles

This directory is the relationship-memory layer for BuildOS LinkedIn warmups.

Use one markdown file per person or company:

- People: `docs/marketing/social-media/linkedin-profiles/<profile-slug>.md`
- Companies: `docs/marketing/social-media/linkedin-profiles/company-<slug>.md`

Use the canonical LinkedIn slug from the profile URL whenever possible.

---

## What Lives Where

- `docs/marketing/social-media/linkedin-engagement-targets.md`
  The master universe of people, tiers, and strategic categories.
- `docs/marketing/social-media/linkedin-profiles/<slug>.md`
  The living profile, condensed research, and running relationship history for one account.
- `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_linkedin-warmup*.md`
  The sourcing doc and reply queue for one scan.
- `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_linkedin-replies*.md`
  The drafted replies and execution notes for one scan, using the same basename pattern as the source warmup doc.
- `docs/marketing/social-media/buildos-platform-growth-plan-2026.md`
  The cross-platform rulebook for how LinkedIn should support BuildOS growth.

---

## When To Create A Profile

Create a profile when:

- A person or company is queued for reply.
- The account has replied to, liked, or otherwise interacted with DJ on LinkedIn.
- The account shows up repeatedly across scans.
- The account is strategically relevant to BuildOS positioning or distribution.
- The account is a realistic peer relationship, category voice, competitor, or partner candidate.

Do not wait for perfect data. Start the file as soon as the account matters.

---

## Update Rules

The profile is a living document.

- Keep the top summary short and current.
- Append new relationship-history rows instead of deleting old ones.
- Record the direct post URL whenever possible.
- Mark whether an interaction was only reviewed, queued, drafted, or actually posted.
- If you know the exact comment that was posted, record it.
- Refresh headline, company, follower ballpark, and content themes when they materially change.
- Use the profile to avoid repeating the same angle or overusing the same founder story.

---

## Recommended Status Language

For `Relationship Status`:

- `Prospect`
- `Warm`
- `Active`
- `Monitor only`

For `Strategic Role`:

- `Core target`
- `Peer`
- `Category voice`
- `Adjacent operator`
- `Competitor`
- `Monitor only`

For `Action` or `Status` rows in the history table:

- `Reviewed`
- `Queued`
- `Drafted`
- `Commented`
- `Replied in thread`
- `Connected`
- `DM`
- `Liked our comment`

---

## File Template

Use:
`docs/marketing/social-media/linkedin-profiles/_template.md`

The key idea:

1. A fast one-screen summary at the top
2. A current profile snapshot
3. A running relationship log
4. Open loops and next-best engagement angles

---

## Daily Workflow

1. Run `/linkedin-warmup`
   It should load or create profiles, refresh intel, and queue opportunities.
2. Run `/linkedin-reply`
   It should read the profiles before drafting replies.
3. Reconcile drafted replies after posting:
   mark each one `Posted`, `Skipped`, or `Still pending`.
4. After replies are actually posted, update the profile with the exact comment if known.
5. Use the profile next time to keep the relationship history cumulative and specific.

---

_Last Updated: 2026-04-07_
