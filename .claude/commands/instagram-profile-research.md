---
description: Research one Instagram account and update BuildOS relationship memory without engaging.
argument-hint: "@handle"
disable-model-invocation: true
---

# Instagram Profile Research

Research one Instagram account for BuildOS relationship memory.

This command is for a deeper account pass than `/instagram-warmup`. It should produce durable intel in the account profile and, when warranted, the cross-platform person graph.

Do not comment, like, follow, DM, or draft replies in this command.

---

## Required Input

The user should provide one handle, for example:

`/instagram-profile-research @nathanbarry`

If no handle is provided, ask for one concise clarification.

---

## Required Context

Read:

- `docs/marketing/social-media/instagram-profiles/README.md`
- `docs/marketing/social-media/instagram-profiles/_template.md`
- `docs/marketing/social-media/people/README.md`
- `docs/marketing/social-media/people/_template.md`
- `docs/marketing/social-media/instagram-engagement-targets.md`
- `docs/marketing/social-media/comment-log.md`
- recent matching files in `docs/marketing/social-media/daily-engagement/`

If an Instagram browser automation skill exists at `.claude/skills/instagram/SKILL.md`, read and follow it before interacting with Instagram.

---

## Output

Create or update:

- `docs/marketing/social-media/instagram-profiles/<handle>.md`
- `docs/marketing/social-media/people/<canonical-id>.md` when appropriate
- `docs/marketing/social-media/discovery/instagram/candidates.md` if the account should enter or leave the queue

---

## Research Fields

Capture or refresh:

- handle, display name, profile URL
- follower count and following count when visible
- bio, link, offer, product, newsletter, or booking surface
- lane
- lead class
- strategic role
- relationship status
- ladder stage
- audience quality
- post cadence
- recent content themes
- comment-section quality
- whether the account replies to comments
- strongest BuildOS-relevant pain signal
- best engagement angles
- what to avoid
- open loops

---

## Relationship Classification

Use one `Strategic Role`:

- `Core target`
- `Peer`
- `Watering hole`
- `Adjacent builder`
- `Competitor`
- `Monitor only`

Use one `Lead Class`:

- `direct_user`
- `audience_multiplier`
- `research_lead`
- `proof_lead`
- `competitor_intel`
- `watering_hole`

Use one `Relationship Status`:

- `Prospect`
- `Warm`
- `Active`
- `Monitor only`
- `Do not engage`

---

## Ladder Recommendation

Set:

- `Ladder Stage`
- `Next Best Action`
- `Earliest Next Touch`

Default ladder:

- `stage_0_discovered`
- `stage_1_reviewed`
- `stage_2_queued`
- `stage_3_commented_once`
- `stage_4_visible_presence`
- `stage_5_dm_ready`
- `stage_6_dm_sent`
- `stage_7_activated`
- `stage_-1_cold_or_skip`

Do not advance the ladder unless a real touch is confirmed in `comment-log.md` or the profile relationship history.

---

## Completion Summary

End with:

```text
Instagram profile research complete for @handle.

Profile: docs/marketing/social-media/instagram-profiles/<handle>.md
Person node: [path or not warranted]
Lead class: [class]
Strategic role: [role]
Ladder stage: [stage]
Next best action: [action]
```
