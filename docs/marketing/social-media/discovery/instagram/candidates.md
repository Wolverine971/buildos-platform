<!-- docs/marketing/social-media/discovery/instagram/candidates.md -->

# Instagram Discovery Candidates

This is the current Stage 0 queue for Instagram. `/instagram-discover` appends and updates rows here. `/instagram-warmup` should check this before scanning from scratch.

## State Definitions

- `new` - found but not yet profiled
- `profiled` - account profile exists
- `queued_for_warmup` - ready for the next warmup pass
- `engaged` - real touch happened and is logged
- `monitor` - worth watching, no immediate engagement
- `skip` - disqualified; do not rediscover without a new reason

## Active Queue

| Date Added | Account | Lane | Lead Class | Source | Candidate Post / Thread | Comment Fit | Track Worthiness | State | Profile | Next Action | Notes |
|------------|---------|------|------------|--------|-------------------------|-------------|------------------|-------|---------|-------------|-------|
| 2026-05-07 | @mariepoulin | PKM | direct_user | engagement-targets.md (PKM lane) + 2026-05-06 research | Live profile-walk required — pick most-recent post in-app | 9 | 9 | queued_for_warmup | ../../instagram-profiles/mariepoulin.md | First-touch peer comment on most-recent Notion / life-OS / AuDHD-bridge post; soft thinking-environment language; no product link | "Highest single-account leverage" PKM peer per 2026-05-06 pivot. Bridge: PKM + ADHD + creator-business. ~4.8K (size correction noted in research; verify in-app). |
| 2026-05-07 | @notionwithro | PKM | direct_user | engagement-targets.md (PKM lane) + 2026-05-06 Lane B #18 | Live profile-walk required — pick most-recent Notion teardown | 8 | 8 | queued_for_warmup | ../../instagram-profiles/notionwithro.md | First-touch peer comment on a specific design detail in a recent template walkthrough; soft framing only | Sweet-spot peer (~8.5K). Real Notion-user comment culture. Confirm follower count in-app. |
| 2026-05-07 | @notion_for_productivity | PKM | direct_user | engagement-targets.md (PKM lane) + 2026-05-06 Lane B #17 | Live profile-walk required — pick most-recent Notion-or-PhD post | 8 | 8 | queued_for_warmup | ../../instagram-profiles/notion_for_productivity.md | First-touch peer comment on academia-meets-Notion overlap; lived "context across long-running projects" angle | Sweet-spot peer (~3.9K). Cross-niche academia + Notion = stronger thinking-env fit than mainstream productivity creators. |
| 2026-05-07 | @mattragland | PKM | direct_user | engagement-targets.md (PKM lane) + peer-of-jayclouse note | Live profile-walk required — pick most-recent Notion-or-analog post | 8 | 8 | queued_for_warmup | ../../instagram-profiles/mattragland.md | First-touch peer comment on hybrid analog+digital workflow; one DJ moment where paper-capture preceded BuildOS execution | Sweet-spot peer (~3.8K). Podcast host. Peer of @jayclouse — landing here puts DJ in the Creator Science peer graph. |
| 2026-05-07 | @jayclouse | Course | audience_multiplier | engagement-targets.md (Solo + Course lanes) + 2026-05-06 Lane C #22 | Live profile-walk required — pick most-recent creator-tools / AI-workflow post | 8 | 9 | queued_for_warmup | ../../instagram-profiles/jayclouse.md | Direct peer comment on creator-tooling consolidation lesson + commenter-mining slot — capture 5-10 sub-50K creator-builder handles | 11K, sweet-spot peer-tier. Course lane has been empty in recent warmups; he closes the gap and the comment thread is the highest-quality creator-economy peer surface on IG. |
| 2026-05-07 | @jodigrahamcoach | PKM | direct_user | engagement-targets.md (PKM lane) | Profile-walk + freshness check before queueing for engagement | 7 | 7 | new | none yet | Profile if she still posts ≥1×/wk and her Notion content is workflow-shaped (not coaching-funnel-shaped) | ~1.6K Notion + Productivity coach. Bridge to Course lane. Smaller than primary PKM picks; promote to queued only after profile freshness check. |
| 2026-05-07 | @notionflows | PKM | direct_user | engagement-targets.md (PKM lane) | Profile-walk + freshness check before queueing for engagement | 7 | 7 | new | none yet | Profile if she still posts ≥1×/wk; tiny but exact-niche (Certified Notion Consulting Partner) | ~1.3K. Solo Notion consultant — workflow-credibility commenter. Floor is small but signal-quality is high. |

## Monitor

| Date Added | Account | Lane | Lead Class | Reason To Monitor | Recheck After | Profile |
|------------|---------|------|------------|-------------------|---------------|---------|

## Skip

| Date Added | Account | Reason | Source |
|------------|---------|--------|--------|

## Weekly Notes

- 2026-05-07 — First batch of PKM peer-tier candidates seeded. PKM peer-week experiment now actionable: next warmup can stage 4–5 of 5–7 queue items from PKM lane (per `instagram-engagement-targets.md` PKM peer-week recommendation).
- Course lane was empty in recent warmups; @jayclouse seeded to fix that.
- WebFetch cannot authenticate against Instagram — live follower counts and post URLs require in-app or public-API confirmation at warmup time. The `Next Action` field captures that as part of every queued row.

## Operating Rules

- Keep this file short enough to use operationally.
- Move completed or stale rows into dated discovery notes if it gets noisy.
- A candidate with no concrete next action should become `monitor` or `skip`.

## Example Row

| Date Added | Account | Lane | Lead Class | Source | Candidate Post / Thread | Comment Fit | Track Worthiness | State | Profile | Next Action | Notes |
|------------|---------|------|------------|--------|-------------------------|-------------|------------------|-------|---------|-------------|-------|
| YYYY-MM-DD | @handle | Solo | direct_user | #solofounder | URL | 8 | 9 | queued_for_warmup | ../instagram-profiles/handle.md | Inspect in next warmup | Example only |
