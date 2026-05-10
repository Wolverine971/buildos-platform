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

_Stage 0 active queue is currently empty. Both prior PKM candidates (@jodigrahamcoach, @notionflows) were demoted to Monitor in the 2026-05-08 morning warmup after failing today's gates. Next discovery run should seed fresh PKM candidates via @notionhq commenter mining or @mariepoulin prior-thread mining._

| Date Added | Account | Lane | Lead Class | Source | Candidate Post / Thread | Comment Fit | Track Worthiness | State | Profile | Next Action | Notes |
| ---------- | ------- | ---- | ---------- | ------ | ----------------------- | ----------- | ---------------- | ----- | ------- | ----------- | ----- |

## Monitor

| Date Added | Account          | Lane | Lead Class  | Reason To Monitor                                                                                                                                                                                                                                                                                                                                                                        | Recheck After                   | Profile                                  |
| ---------- | ---------------- | ---- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------- |
| 2026-05-07 | @mariepoulin     | PKM  | direct_user | Demoted from `queued_for_warmup`. AuDHD/Notion bridge is a strong strategic fit but most-recent post is 135.9h old (~5.6 days) per 2026-05-07 evening warmup. Confirm posting cadence resumes before promoting again.                                                                                                                                                                    | 2026-05-21 (recheck in 2 weeks) | ../../instagram-profiles/mariepoulin.md  |
| 2026-05-07 | @mattragland     | PKM  | direct_user | Demoted from `queued_for_warmup`. Most-recent post is 679h old (~28 days) per 2026-05-07 evening scan. Semi-active. Recheck if cadence returns; valuable if he posts because of the @jayclouse peer-graph entry point.                                                                                                                                                                   | 2026-05-28 (recheck in 3 weeks) | ../../instagram-profiles/mattragland.md  |
| 2026-05-07 | @notionwithro    | PKM  | direct_user | Demoted from `queued_for_warmup`. Most-recent post is 5479h old (~7.6 months) per 2026-05-07 evening scan. Effectively dormant. Recheck quarterly only.                                                                                                                                                                                                                                  | 2026-08-07 (quarterly)          | ../../instagram-profiles/notionwithro.md |
| 2026-05-08 | @jodigrahamcoach | PKM  | direct_user | Demoted from `queued_for_warmup`. Per 2026-05-08 morning warmup: 1,590 followers / 266 posts but content is **course-funnel-shaped, NOT workflow-shaped** (Highlights = Client Love, Courses, Shop, Freebies; pinned intro Dec 14 2024 with 12 likes). Fails the explicit "workflow-shaped, not coaching-funnel-shaped" gate. Could shift if she pivots away from course-funnel content. | 2026-08-08 (quarterly)          | (no profile created)                     |
| 2026-05-08 | @notionflows     | PKM  | direct_user | Demoted from `queued_for_warmup`. Per 2026-05-08 morning warmup: 1,304 followers / 57 posts. Most-recent post is April 28, 2026 (~10 days / ~240h) — fails freshness gate. Recent content is event/networking-shaped (YLAI trip), not Notion-workflow. Bilingual EN+ES. Recheck if posting cadence resumes.                                                                              | 2026-05-22 (recheck in 2 weeks) | (no profile created)                     |

## Skip

| Date Added | Account                  | Reason                                                                                                                                                                                                                                | Source                                 |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 2026-05-07 | @notion_for_productivity | Account is effectively dead — most-recent post is ~32,184h old (~3.7 years) per 2026-05-07 evening scan. PhD/Notion thesis was strong but the operator has stopped posting on this handle. Do not rediscover unless they re-activate. | 2026-05-07_instagram-warmup-evening.md |

## Weekly Notes

- 2026-05-07 — First batch of PKM peer-tier candidates seeded. PKM peer-week experiment now actionable: next warmup can stage 4–5 of 5–7 queue items from PKM lane (per `instagram-engagement-targets.md` PKM peer-week recommendation).
- Course lane was empty in recent warmups; @jayclouse seeded to fix that.
- WebFetch cannot authenticate against Instagram — live follower counts and post URLs require in-app or public-API confirmation at warmup time. The `Next Action` field captures that as part of every queued row.
- 2026-05-07 (evening) — **PKM peer-week experiment cannot run as designed.** Public-API freshness checks during the 2026-05-07 evening warmup revealed all four primary PKM peer candidates are dormant: @mariepoulin (135h), @notionwithro (5479h ~ 7.6 months), @notion_for_productivity (~3.7 years — moved to Skip), @mattragland (679h ~ 28 days). Demoted three to Monitor with future recheck dates; @notion_for_productivity moved to Skip. PKM lane sourcing must shift to **(a)** the smaller un-vetted candidates (@jodigrahamcoach, @notionflows) — both elevated above; **(b)** @notionhq comment-section mining (parent account is too big for direct engage but commenters are real Notion operators); **(c)** new PKM discovery via @mariepoulin's prior comment threads if/when she resumes. The PKM peer-week experiment is paused until at least one peer-tier PKM candidate produces a fresh post.
- 2026-05-07 (evening) — @jayclouse promoted from `queued_for_warmup` → `engaged` via the 2026-05-07 evening warmup. Course lane is now active in the reply queue. Removed from active queue.
- 2026-05-08 — **Stage 0 active queue is empty.** Both prior PKM candidates (@jodigrahamcoach, @notionflows) were demoted to Monitor by the 2026-05-08 morning warmup after live in-app freshness/shape checks. PKM lane is unblockable from current candidates: 4 prior peer-tier candidates dormant + 2 un-vetted candidates failed gates. **`/instagram-discover` should prioritize seeding fresh PKM candidates** via @notionhq commenter mining, @mariepoulin prior-thread mining, or new sub-15K Notion peer discovery. Sourcing should also explicitly avoid course-funnel-shaped accounts (Highlights = Client Love / Courses / Shop / Freebies / Coaching) — those fail the workflow-shape gate.
- 2026-05-09 — **Two-handle split (@djwayne3 ↔ @build.os) is unresolved.** Today's warmup discovered that @build.os already posted "honesty is key 🔑" on @leaturnerholt `DX9aMmXMaTk` ~2 days ago, with 1 like reaction. This is the first confirmed inbound on a BuildOS-handle reply since 2026-04-04. Implication: May 5–7 backlog may have been partially executed via @build.os, with reactions landing in @build.os notifications instead of @djwayne3's. **Next warmup must check @build.os notifications + recent activity tab**, and `/instagram-reply` must explicitly decide which handle (@djwayne3 personal or @build.os company) is posting each comment going forward. Stage 0 active queue remains empty — `/instagram-discover` is still the unblocker for PKM lane. Today's 4-item warmup queue (@thejustinwelsh / @nathanbarry / @notionhq mining / @gregisenberg mining fallback) sourced entirely from priority surfaces.
- 2026-05-09 — **Discovery candidates surfaced from watering-hole mining (deferred to `/instagram-discover`):** @opsdeck and @zappflow\_ from @notionhq Campus Leader thread (operator-voice "build before told" framing); @timhaydenclark and @powerreach.ai from @gregisenberg Claude Design thread (context-vs-output framing). All four need profile-eligibility check (size, voice, posting cadence) before being added to Stage 0 active queue — that work is queued for `/instagram-reply` as part of the mining slots, or for next `/instagram-discover` pass.
- 2026-05-09 — **Removed Accounts and Skip List candidates surfaced:** @indie_hackers (last post July 2024 — dormant; demote to Monitor only); @designjoyhq (page not available — move to Removed); @cassidoo (wrong account, resolves to Cassidy Schroll wedding/travel content not Cassidy Williams developer-advocate — move to Removed and re-research correct handle if it exists). All three need updates in `instagram-engagement-targets.md`.

## Operating Rules

- Keep this file short enough to use operationally.
- Move completed or stale rows into dated discovery notes if it gets noisy.
- A candidate with no concrete next action should become `monitor` or `skip`.

## Example Row

| Date Added | Account | Lane | Lead Class  | Source       | Candidate Post / Thread | Comment Fit | Track Worthiness | State             | Profile                         | Next Action            | Notes        |
| ---------- | ------- | ---- | ----------- | ------------ | ----------------------- | ----------- | ---------------- | ----------------- | ------------------------------- | ---------------------- | ------------ |
| YYYY-MM-DD | @handle | Solo | direct_user | #solofounder | URL                     | 8           | 9                | queued_for_warmup | ../instagram-profiles/handle.md | Inspect in next warmup | Example only |
