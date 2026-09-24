<!-- docs/plans/DAILY_BRIEF_CYCLE_CANARY_REVIEW_2026-09-02.md -->

# Daily Brief Cycle Canary Review — 2026-09-02

Status: **NO-GO for canary activation**
Reviewed at: 2026-09-02 09:09 UTC
Observation window: 2026-08-26 02:49 UTC through 2026-09-02 09:00 UTC

## Decision

Do not enable the Cycle coordinator or activate a paused Daily Brief Cycle yet.

The 20 definitions created by the initial backfill continue to match their legacy schedule projections, but
the shadow cohort is no longer complete. A new active Daily Brief preference was created after the backfill and
has no Cycle. The current health endpoint is correctly degraded, and the current `100%` match-rate metric only
describes the 20 comparable rows; it does not mean all 21 active preferences are covered.

The shared legacy-versus-Cycle ownership cohort gate is also still unimplemented. That gate is required before
one user can move to Cycle scheduling without risking legacy and Cycle admission for the same occurrence.

No production state was changed during this review.

## Evidence

### Production controls and health

Read-only Railway checks at 2026-09-02 09:01 UTC confirmed:

- `PRIVATE_CYCLE_DAILY_BRIEF_SHADOW_ENABLED=true`
- `PRIVATE_CYCLE_COORDINATOR_ENABLED=false`
- the `daily-brief-worker` deployment was healthy and running;
- the Cycle coordinator health state was `disabled`, with no starts, completions, summaries, or errors;
- the Daily Brief shadow health state was `degraded` with
  `shadow_projection_drift_detected`.

The current deployment was `fcc4b48b-f849-4365-addb-fae4e20c3d32`, built from commit
`98c5dffdaeee7a22c9ff9b427bdd0a2a5a4b9278`.

The 09:07 UTC shadow snapshot reported:

| Field                      | Value |
| -------------------------- | ----: |
| Active preferences scanned |    21 |
| Comparable                 |    20 |
| Matching projections       |    20 |
| Projection mismatches      |     0 |
| Missing Cycles             |     1 |
| Invalid preferences        |     0 |
| Comparable-only match rate |  100% |
| Full cohort coverage       | 95.2% |

### Durable database state

A read-only production Supabase check at 09:08 UTC found:

- 21 active `user_brief_preferences` rows;
- 20 Daily Brief Cycles, all paused;
- 20 active schedule triggers owned by those paused Cycles;
- zero Cycle Runs in total;
- zero automatic Cycle Runs;
- zero manual Cycle Runs.

This confirms the shadow process did not admit work and the coordinator remained dark.

The missing definition belongs to preference `8c660746-ce14-4a0b-b0e5-4fc3188e225a`. It was created at
2026-08-26 18:54 UTC, after the original backfill, with a daily 09:00 schedule. The first degraded snapshot
appeared at 19:07 UTC, thirteen minutes later. This is a coverage lifecycle gap, not a schedule-calculation
mismatch: newly activated Daily Brief preferences are not yet guaranteed to receive a paused Cycle definition.

The latest-value `system_metrics` rows at 09:07 UTC agreed with health:

- match rate: 100%;
- mismatched: 0;
- missing Cycle: 1;
- invalid: 0.

### Seven-day Railway log window

The worker schedules shadow comparison hourly at minute `:07` and also runs once after each process startup.
From 2026-08-26 03:07 UTC through 2026-09-02 08:07 UTC, 174 hourly slots were expected.

The available logs across 76 non-skipped deployment records contained:

- 236 completed shadow summary logs;
- 165 summary logs emitted at minute `:07`;
- 163 unique hourly slots represented, or 93.7% of the expected window;
- 71 startup or other non-hourly summary logs;
- zero shadow execution failures;
- two hourly slots with duplicate summary logs, at 2026-08-28 01:07 and 2026-09-01 17:07 UTC;
- 11 expected hourly slots without an available summary log.

The unrepresented slots were:

- 2026-08-26 03:07 through 08:07 UTC;
- 2026-08-28 19:07 and 20:07 UTC;
- 2026-08-31 17:07 through 19:07 UTC.

The first six are an evidence-retention/query gap rather than six proven scheduler misses: the original review
record captured a healthy 02:49 startup snapshot, but Railway no longer returns that known summary from the
original deployment logs either. The later five gaps occurred during periods of frequent deployments and are
not explained by durable time-series metrics because the current writer upserts only the latest metric value.
Treat them as unproven observation gaps, not as successful checks.

Of all 236 available summary logs:

- 11 had the original clean `20/20/20/0/0/0` shape;
- 225 had `21 scanned / 20 comparable / 20 matched / 1 missing / 0 invalid`;
- none had a projection mismatch or invalid preference.

Frequent deployments also produced overlapping startup/hourly comparisons. That is harmless in read-only
shadow mode, but it reinforces why production admission must rely on database leases and an exact ownership
gate rather than process timing.

## Blockers Before Canary

1. **Restore complete Cycle coverage.** Run the idempotent Daily Brief backfill for the missing active
   preference and verify 21 paused Cycles with 21 valid schedule triggers.
2. **Close the lifecycle gap.** Creation or reactivation of a Daily Brief preference must transactionally
   ensure its corresponding paused Cycle/trigger exists, or a durable reconciler must guarantee this before
   the user can enter a Cycle cohort.
3. **Implement one authoritative ownership gate.** The legacy scheduler and Cycle coordinator must consult the
   same per-user ownership record. Turning on the global coordinator flag is not a cohort mechanism.
4. **Make activation atomic.** Moving a user to Cycles must refresh the stale materialized trigger projection,
   activate the parent Cycle, and make the legacy scheduler skip that user as one fenced transition.
5. **Improve the gate metric.** Keep projection match rate, but add an explicit coverage rate or require
   `scanned = comparable = matched` so a missing Cycle cannot look like a passing 100% result.
6. **Retain observation history.** Record append-only hourly shadow receipts, or another durable time series,
   so a canary decision does not depend on logs that can disappear across deployments.

After items 1–5 ship, require at least 24 consecutive hours with:

- `scanned = comparable = matched`;
- zero missing Cycles, invalid preferences, and projection mismatches;
- no unexplained hourly observation gaps;
- the coordinator still disabled and zero Cycle Runs.

The existing seven days already provide strong schedule-projection evidence for the original 20 definitions;
the additional clean window is to prove the repaired coverage lifecycle and observability.

## Recommended First Internal Canary

Use exactly one user: DJ's active admin account,
`255735ad-a34b-4ca9-942c-397ed8cc1435`.

Why this account:

- it is an admin/beta account and was active on the review day;
- its legacy preference and Cycle schedule match;
- it uses `America/New_York`, exercising local-time semantics;
- the result can be inspected immediately by the owner.

Current configuration:

- preference: daily at 11:00 America/New_York;
- Cycle: `88617a5d-e583-42cf-a00d-b1a495d0aeac`, paused;
- trigger: `e00a6bc2-6463-48a7-9da7-4e60b3655653`, active under the paused parent;
- materialized `next_run_at`: stale at 2026-08-26 15:00 UTC and therefore must be recomputed during activation.

Do not include the second admin account in the first cohort; it has not visited since 2025 and is less useful
for immediate artifact and delivery verification.

## Activation Plan Requiring Explicit Approval

1. Deploy the coverage repair, ownership gate, atomic activation command, coverage metric, and focused tests
   while keeping the coordinator disabled.
2. Backfill the one missing preference and complete the clean 24-hour shadow gate.
3. Ask DJ for explicit approval of the exact user, Cycle, target occurrence, activation time, and rollback
   window.
4. At least 30 minutes before the selected 11:00 America/New_York occurrence, use the atomic ownership command
   to refresh the next occurrence, assign scheduling authority to Cycles, and activate only DJ's Cycle.
5. Enable the coordinator only after verifying its production configuration restricts admission to the exact
   authoritative cohort. Keep every other Daily Brief Cycle paused and legacy-owned.
6. For the first occurrence, verify exactly one Cycle Run, one `run_cycle` queue job, one Daily Brief artifact,
   and at most one delivery per intended channel. Verify there is no legacy Daily Brief job for the same user
   and occurrence.
7. Observe at least two consecutive successful scheduled occurrences before adding another actively monitored
   internal user.
8. Roll back by disabling new Cycle admission first, waiting for any claimed Run to settle, then atomically
   returning the user to legacy ownership and pausing the Cycle. Preserve Run history.

No coordinator, Cycle, preference, trigger, or cohort state was mutated as part of this review.
