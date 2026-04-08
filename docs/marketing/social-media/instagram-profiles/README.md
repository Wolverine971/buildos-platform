<!-- docs/marketing/social-media/instagram-profiles/README.md -->

# Instagram Profiles

This directory is the relationship-memory layer for BuildOS Instagram warmups.

Use one markdown file per account:

`docs/marketing/social-media/instagram-profiles/<handle>.md`

Use the handle without `@` as the filename.

---

## What Lives Where

- `docs/marketing/social-media/instagram-engagement-targets.md`
  The master universe of accounts, tiers, competitors, and discovery lanes.
- `docs/marketing/social-media/instagram-profiles/<handle>.md`
  The living profile, condensed research, and running relationship history for one account.
- `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_instagram-warmup*.md`
  The sourcing doc and reply queue for one scan.
- `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_instagram-replies*.md`
  The drafted replies and execution notes for one scan, using the same basename pattern as the source warmup doc.
- `docs/marketing/social-media/buildos-platform-growth-plan-2026.md`
  The cross-platform rulebook for how Instagram should support BuildOS growth.

---

## When To Create A Profile

Create a profile when:

- An account is queued for reply.
- An account has already interacted with `@djwayne3`.
- An account shows up repeatedly across scans.
- An account is clearly strategically relevant to BuildOS.
- An account is a realistic peer-growth relationship or a high-value competitor/intel source.

Do not wait for perfect history. Start the file as soon as the account matters.

---

## Update Rules

The profile is a living document.

- Keep the top summary short and current.
- Append new relationship-history rows instead of deleting old ones.
- Mark whether an interaction was only reviewed, queued, drafted, or actually posted.
- Record the specific post link whenever possible.
- If you know the exact comment that was posted, record it.
- Refresh follower counts, bio notes, and content themes when they materially change.
- Use the profile to avoid repeating the same comment angle over and over.

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
- `Watering hole`
- `Adjacent builder`
- `Competitor`
- `Monitor only`

For `Action` or `Status` rows in the history table:

- `Reviewed`
- `Queued`
- `Drafted`
- `Commented`
- `Story reply`
- `DM`
- `Liked our comment`
- `Followed us`

---

## File Template

Use:
`docs/marketing/social-media/instagram-profiles/_template.md`

The key idea:

1. A fast one-screen summary at the top
2. A current profile snapshot
3. A running relationship log
4. Open loops and next-best engagement angles

---

## Daily Workflow

1. Run `/instagram-warmup`
   It should load or create profiles, refresh intel, and queue opportunities.
2. Run `/instagram-reply`
   It should read the profiles before drafting replies.
3. Reconcile drafted replies after posting:
   mark each one `Posted`, `Skipped`, or `Still pending`.
4. After replies are actually posted, update the profile with the exact comment if known.
5. Use the profile next time to avoid repetitive engagement and to deepen real relationships.

---

_Last Updated: 2026-04-07_
