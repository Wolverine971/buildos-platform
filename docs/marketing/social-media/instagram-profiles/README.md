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
- `docs/marketing/social-media/discovery/instagram/candidates.md`
  The Stage 0 discovery queue for accounts that should be inspected by a warmup pass.
- `docs/marketing/social-media/instagram-profiles/<handle>.md`
  The living profile, condensed research, and running relationship history for one account.
- `docs/marketing/social-media/people/<canonical-id>.md`
  The cross-platform person node for high-value targets and relationships.
- `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_instagram-warmup*.md`
  The sourcing doc and reply queue for one scan.
- `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_instagram-replies*.md`
  The drafted replies and execution notes for one scan, using the same basename pattern as the source warmup doc.
- `docs/marketing/social-media/comment-log.md`
  The cross-run ledger for queued, drafted, posted, reacted, DM, and converted touchpoints.
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
- Keep `Lead Class`, `Ladder Stage`, `Next Best Action`, and `Earliest Next Touch` current enough that `/instagram-intel` can choose the next action.
- Record the specific post link whenever possible.
- If you know the exact comment that was posted, record it.
- Mirror confirmed posting and reaction status in `docs/marketing/social-media/comment-log.md`.
- Refresh follower counts, bio notes, and content themes when they materially change.
- Use the profile to avoid repeating the same comment angle over and over.

---

## Recommended Status Language

For `Relationship Status`:

- `Prospect`
- `Warm`
- `Active`
- `Monitor only`
- `Do not engage`

For `Lead Class`:

- `direct_user`
- `audience_multiplier`
- `research_lead`
- `proof_lead`
- `competitor_intel`
- `watering_hole`

For `Ladder Stage`:

- `stage_0_discovered`
- `stage_1_reviewed`
- `stage_2_queued`
- `stage_3_commented_once`
- `stage_4_visible_presence`
- `stage_5_dm_ready`
- `stage_6_dm_sent`
- `stage_7_activated`
- `stage_-1_cold_or_skip`

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
4. Update `comment-log.md` with posted/skipped/reaction status.
5. After replies are actually posted, update the profile with the exact comment if known.
6. Use `/instagram-intel` to find stale pending replies, follow-up opportunities, and accounts ready for deeper research or DM.
7. Use the profile next time to avoid repetitive engagement and to deepen real relationships.

---

_Last Updated: 2026-05-07_
