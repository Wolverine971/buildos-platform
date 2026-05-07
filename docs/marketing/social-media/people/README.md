<!-- docs/marketing/social-media/people/README.md -->

# People Graph

This folder stores canonical person records across platforms.

Use `instagram-profiles/` for Instagram-specific relationship memory. Use `people/` when the same person matters beyond one platform or becomes a real relationship target.

## When To Create A Person Node

Create `people/<canonical-id>.md` when:

- the person has multiple platform identities
- they are a high-value creator, founder, writer, or operator
- they could become a direct user, proof lead, audience multiplier, or research lead
- they have repeated touches across warmup, replies, DMs, or email
- you need a single place for the relationship summary

Do not create a person node for every discovered account. Profile first, promote when the relationship matters.

## Canonical ID

Use lowercase first-name-last-name when possible:

- `nathan-barry.md`
- `david-perell.md`

If ambiguous, append a short discriminator:

- `alex-smith-founder.md`
- `ali-abdaal-youtube.md`

## Relationship To Other Files

- `../instagram-profiles/<handle>.md` - platform-specific facts and post history
- `../comment-log.md` - cross-run touchpoint ledger
- `../discovery/instagram/candidates.md` - current discovery queue
- `../daily-engagement/` - warmup and reply working docs

## Ladder Stages

Use these stage names:

- `stage_0_discovered`
- `stage_1_reviewed`
- `stage_2_queued`
- `stage_3_commented_once`
- `stage_4_visible_presence`
- `stage_5_dm_ready`
- `stage_6_dm_sent`
- `stage_7_activated`
- `stage_-1_cold_or_skip`

Only advance a stage when a real touch or reaction is logged.
