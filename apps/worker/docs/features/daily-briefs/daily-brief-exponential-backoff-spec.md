<!-- apps/worker/docs/features/daily-briefs/daily-brief-exponential-backoff-spec.md -->

# Daily Brief Engagement Backoff

**Last updated:** 2026-07-05

## Purpose

Engagement backoff reduces daily brief email fatigue for inactive users while still sending occasional re-engagement and dormant-account check-ins. The feature is controlled by `ENGAGEMENT_BACKOFF_ENABLED`; when the flag is not `true`, the scheduler queues briefs on the normal user preference cadence.

## Current Implementation

The active implementation lives in `apps/worker/src/lib/briefBackoffCalculator.ts` and is called from `apps/worker/src/scheduler.ts`.

The calculator uses existing data only:

- `users.last_visit` to determine inactivity.
- `ontology_daily_briefs` to find the user's latest generated brief.
- `get_latest_ontology_daily_briefs(user_ids)` RPC for scheduler batch mode.

No dedicated backoff table or persistent backoff state exists. Returning activity updates `users.last_visit`, which naturally resets the user to standard brief cadence.

## Backoff Schedule

| Inactivity age | Decision                                                                               |
| -------------- | -------------------------------------------------------------------------------------- |
| 0-2 days       | Send standard daily briefs.                                                            |
| 3 days         | Skip during the cooling-off period.                                                    |
| 4 days         | Send re-engagement if the last brief was at least 2 days ago; otherwise skip.          |
| 5-13 days      | Skip during first backoff.                                                             |
| 14 days        | Send re-engagement if the last brief was at least 10 days ago; otherwise skip.         |
| 15-59 days     | Skip during long backoff.                                                              |
| 60+ days       | Send dormant check-in only if the last brief was at least 90 days ago; otherwise skip. |

The resulting engagement metadata is:

- `isReengagement`
- `daysSinceLastLogin`
- `engagementStage`: `standard`, `reengagement`, or `dormant`
- `reason` for logs and debugging

## Scheduler Integration

`apps/worker/src/scheduler.ts` performs the backoff check before queueing `generate_daily_brief` jobs:

1. Load active `user_brief_preferences`.
2. Batch-load user timezone/name data from `users`.
3. If `ENGAGEMENT_BACKOFF_ENABLED=true`, call `shouldSendDailyBriefBatch(userIds)`.
4. Skip users whose backoff decision returns `shouldSend=false`.
5. Attach engagement metadata to the queued job options for users who should receive a brief.
6. Queue `generate_daily_brief` with the user's notification time and a 2-minute generation buffer.

Batch mode uses two queries for all users: one `users` query and one latest-brief RPC. If either batch query fails, the calculator falls back to per-user checks and defaults to sending if an individual check errors.

## Brief Generation Integration

`apps/worker/src/workers/brief/ontologyBriefGenerator.ts` reads the engagement metadata from job options.

- Standard briefs use the normal ontology analysis prompt.
- Re-engagement and dormant briefs use `OntologyReengagementPrompt` in `apps/worker/src/workers/brief/ontologyPrompts.ts`.
- The final `ontology_daily_briefs.metadata` includes `isReengagement`, `daysSinceLastLogin`, and `engagementStage`.
- Email presentation uses notification adapters, including engagement-stage-aware subject/action copy in `apps/worker/src/workers/notification/emailAdapter.ts`.

## Known Behavior to Watch

The current implementation uses exact-day gates for the 4-day and 14-day re-engagement sends. If the scheduler misses that day because of downtime or deployment timing, the user can fall into the skip band until a later dormant check-in. The dormant check-in also requires both 60+ days since login and 90+ days since last brief, so a user who received the 14-day re-engagement cannot receive the first dormant check-in until roughly day 104.

Track follow-up cleanup in `apps/worker/docs/features/daily-briefs/DAILY_BRIEF_CLEANUP_PLAN_2026-07-06.md`.

## Tests

Primary coverage:

- `apps/worker/tests/briefBackoffCalculator.test.ts`
- `apps/worker/tests/scheduler.test.ts`
- `apps/worker/tests/scheduler-parallel.test.ts`

Useful focused command:

```bash
pnpm --filter @buildos/worker test -- tests/briefBackoffCalculator.test.ts
```

## Rollback

Set the feature flag off and restart the worker:

```bash
ENGAGEMENT_BACKOFF_ENABLED=false
```

Because backoff state is computed dynamically, rollback does not require data cleanup.
