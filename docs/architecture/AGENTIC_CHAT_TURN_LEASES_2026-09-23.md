<!-- docs/architecture/AGENTIC_CHAT_TURN_LEASES_2026-09-23.md -->

# Agentic Chat turn leases: dead-worker recovery in ~90 s, Stop without a worker

Status (2026-09-23): **built on main, uncommitted, not deployed.** Migration
`20260924000100_agentic_chat_turn_leases.sql` is not applied anywhere. It needs the pending
`20260924000000` reaper migration first. The SQL, worker, and web tests pass locally. No live or
paid run has happened. Deploy order and rollback are below. `CHAT_STALLED_TIMEOUT_MS` is retired
and ignored if still set.

## What changes for a person using chat

| Moment                             | Before                                                | After                                                                                                      |
| ---------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Worker process crashes mid-reply   | "Thinking…" for 6–8 min, then a failure               | A failure, or a silent retry, about 90–105 s after the crash                                               |
| Whole chat service is down         | Running replies hang until the service is back        | The web cron recovers them within ~2.5 min, with no worker at all                                          |
| Stop while the worker is dead      | "Stopping response…" until recovery (6–8 min)         | The reply ends as soon as the worker has been silent ≥ 45 s. The chat shows the ended turn right away.     |
| A write was in flight at the crash | Turn stuck forever (`effect_reconciliation_required`) | The turn ends and says the change "may already be saved. Check before trying again." (on Stop as well)     |
| New message in that session        | Rejected (`active_turn_conflict`) the whole time      | Accepted as soon as the dead turn ends                                                                     |
| A turn that keeps failing recovery | Blocks nothing, but is retried forever                | Backed off and sorted last, ended with less detail after 3 failures, and parked with a loud report after 8 |

## How a dead worker is noticed

A worker that holds a turn renews the turn's lease every 15 s. The database gives the lease
meaning. The lease is `held` while it is fresh. It is `stale` after 45 s without a renewal, which
is enough for Stop. It is `expired` after 90 s, when recovery may take the turn. It is `abandoned`
after 180 s, when the database ends a workflow turn that no worker is left to render.

The chat worker runs a recovery sweep every 15 s. The web cron runs the same SQL function every
minute. Either one recovers a dead turn 90–105 s after its last renewal (90–150 s when only the
cron is running). A turn whose worker never renewed a lease is judged by the old rule: 420 s after
its last queue heartbeat, which the 360 s hard cap keeps safe. That rule covers rows claimed by a
pre-lease worker during a deploy.

## The lease

- Two nullable columns on `chat_turn_runs`: `worker_lease_generation` and
  `worker_lease_renewed_at` (database clock). A lease belongs to one execution generation.
- `renew_agentic_chat_turn_lease(turn, job, token, generation)` locks the turn row, then renews
  only if the turn is running at that generation, its queue row is `processing` with that token,
  and the lease has not already expired. It returns `renewed` or `lost` and never throws for
  ownership. An expired lease cannot be revived.
- The worker (`AC/turn/turn-lease.ts`) renews from the main event loop, starting right after the
  claim. Each renewal RPC is abandoned after 10 s, so a hung socket never blocks the next one. A
  late answer is still applied: it can only move the fence forward, and a `lost` is still a loss.
- Self-fence. Once one renewal has been acknowledged, the turn aborts on `lost`. It also aborts
  60 s after the send time of the newest acknowledged renewal. The database stamps a renewal after
  it was sent, so measuring from send time keeps the worker ahead of the database whatever the
  round trip. A generation that never got an acknowledgement is not fenced; the 420 s rule and the
  hard cap govern it.
- An abort ends the turn with failure code `worker_lease_lost`, so logs and the transcript say why.
- `isFresh()` is a synchronous check. The mutation executor calls it before every external write
  attempt (`worker_lease_stale`), which catches an event-loop stall the fence timer has not seen
  yet. Before any attempt, a refusal is a known non-write. After an ambiguous attempt, it stays
  "may have happened".
- A missing renewal function (`PGRST202` / `42883`) means the database predates leases. The worker
  keeps the pre-lease behavior. This is honored only before any renewal succeeded; after one, it
  counts as a failed renewal.
- Renewal stops, without aborting, 30 s after the job's 360 s hard cap fires (the terminal budget
  for finalizing). It also stops unconditionally 390 s after the claim. So a stuck turn's lease
  always expires, and hard cap plus budget stays below the 420 s unleased rule.
- The shared queue (`lib/supabaseQueue.ts`) is unchanged for other queues. The chat queue keeps
  its 60 s row heartbeat, which the unleased rules read.

## Who may move a running turn, and under which fence

Every transition locks the turn row first (turn → effects → queue), so all of them are totally
ordered.

| Actor                                        | May act when                                           | Fence it uses / leaves behind                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Owning worker (writes, finalize)             | its token and generation still match                   | existing per-RPC checks (status, generation, token)                                                                                        |
| Lease renewal                                | same, and the lease is not yet `expired`               | an expired lease cannot be revived                                                                                                         |
| Recovery (`recover_dead_agentic_chat_turns`) | the lease is `expired`, re-checked under the lock      | a requeue clears the token (the next claim bumps the generation); a finalize makes the turn terminal; a workflow handoff rotates the token |
| Stop (`request_agentic_chat_turn_cancel`)    | a cancel is recorded and the lease is `stale` or worse | finalize (terminal)                                                                                                                        |

Every worker write RPC already rejects a cleared or rotated token, a terminal turn, or another
generation. That covers text batches, semantic events, effect reserve/begin/reconcile, tool ledgers,
session handoff, prompt snapshots, begin, and finalize. The slow-but-alive worker is therefore
fenced by state the recovery transaction changes atomically, and no separate generation bump is
needed.

The finalize primitive, `agentic_chat_finalize_dead_turn_v1`, re-proves liveness itself. It raises
`agentic_chat_dead_turn_worker_alive` unless the lease is expired or abandoned, or stale with a
Stop pending. No service-role caller can end a turn that a live worker holds.

One SQL function, `agentic_chat_turn_lease_state_v1`, owns every threshold and returns `held`,
`stale`, `expired`, or `abandoned`. Renewal, both sweeps, Stop, and the finalize guard all read it.

## Thresholds and the rules that tie them together

Each value lives in one place: SQL `agentic_chat_turn_lease_state_v1`, with the TS mirror
`AGENTIC_CHAT_TURN_LEASE_POLICY_V1`.

| Value                             | Setting      | Why                                                                                            |
| --------------------------------- | ------------ | ---------------------------------------------------------------------------------------------- |
| Renew every                       | 15 s         | Four chances before self-fencing. The cost is one tiny RPC per turn every 15 s.                |
| One renewal or sweep RPC gives up | 10 s         | Always before the next one is due.                                                             |
| Worker self-fences after          | 60 s         | Rides out 3 consecutive failed renewals (pooler restarts take ~10–30 s).                       |
| Dead (recovery) after             | 90 s         | Self-fence plus 30 s (2 renew periods) of margin for late timers and abort unwinding.          |
| Stop finalizes after              | 45 s         | Three renew periods, so a missed renewal plus a slow one never lets Stop bypass a live worker. |
| Workflow turn without a worker    | 180 s        | Lets a live worker's sweep render the rich workflow terminal first.                            |
| Unleased running turn             | 420 s        | Rows claimed by a pre-lease worker keep the old rule, which relies on the 360 s hard cap.      |
| Claimed-but-never-started row     | 90 s         | Queue row `processing`, turn still `queued`: nothing ran, so release it.                       |
| Worker hard cap / terminal budget | 360 s / 30 s | Renewal stops at cap + budget (390 s), below the 420 s unleased rule.                          |
| In-worker sweep cadence           | 15 s         | Recovery lands 90–105 s after the last renewal when any worker is up.                          |
| Web cron cadence                  | 60 s         | The backstop when the chat service is down: 90–150 s.                                          |

`validateAgenticChatTurnLeaseTimingV1` holds the rules. The keeper, the consumer config, and the
drift test all call it:

- renew ≥ 1 s, and one renewal RPC gives up before the next is due;
- self-fence ≥ 2 × renew (one missed renewal is weather);
- self-fence + 2 × renew ≤ the 90 s expiry;
- Stop threshold (45 s) ≥ 3 × renew;
- sweep cadence between 1 s and 90 s;
- hard cap + terminal budget < 420 s.

The drift test reads every migration, takes the newest one that defines
`agentic_chat_turn_lease_state_v1`, and fails if its constants differ from the TS mirror.

**The Supabase-blip trade-off.** A database outage longer than 60 s now ends every in-flight
reply. Each worker self-fences at 60 s. Once the database is back, the leases read as expired, and
recovery fails those turns (or retries them if the model never started), keeping partial text.
Before, a turn could in principle outlive a blip of up to 6 minutes. In practice a turn cannot
persist text, tool results, or its terminal during such a blip either, so it was already broken.
The new behavior ends it cleanly instead of leaving it half-alive. We chose 60/90 over 120/180
because the product goal is a ~90 s recovery, and pooler restarts sit well under 60 s.

## Recovery, one turn at a time

`recover_dead_agentic_chat_turns(batch, workflow_handoff)` picks candidates and settles each one in
its own locked step. It covers two kinds of candidate:

- Owned turns: the queue row is `processing` with a token, and the lease is expired.
- Orphaned turns: a running worker turn whose queue row is not `processing` or has no token (for
  example, failed or completed by another path). No worker can ever finish these. Each is judged
  by the 90 s rule on its last sign of life and finalized as `queue_orphaned`, or as `cancelled`
  if a Stop is pending. The orphaned queue row is adopted and released inside the same
  transaction.

For each candidate:

- If the model never started, the turn is requeued (while attempts remain).
- If it had started, the turn is finalized `failed`, keeping the durable partial text. A Stop that
  is pending makes it `cancelled`.
- A turn whose queue row is already terminal is reconciled.

Each candidate is locked with `FOR UPDATE SKIP LOCKED`, with a 2 s `lock_timeout` as a backstop.
Two overlapping sweeps, the worker's and the cron's, never wait on each other and never settle a
turn twice. A turn that is locked right now is reported `skipped`. A turn found alive when
re-checked under the lock is reported `not_dead`.

**Poison turns cannot starve the others.** When a recovery raises, the database records it in
`chat_turn_recovery_failures`. The turn then backs off (15 s × 2ⁿ, capped at 10 min) and sorts
after healthy candidates. After 3 failures it is finalized bare: the durable text is kept, and the
projection, the one large structured value that can make finalize refuse, is dropped. After 8
failures it is parked. It is no longer attempted, and every sweep reports `parked_count`. The
worker logs that as an alert, and the cron receipt turns into a warning. The ledger row is
cleared when recovery succeeds.

## Stop

`request_agentic_chat_turn_cancel` finalizes a running turn as `cancelled` at once when its lease
is stale (≥ 45 s) or worse. Otherwise it signals the live worker exactly as before. A workflow turn
is left for a worker's handoff, or for the cron once abandoned. When the receipt is already
terminal, the chat requests an immediate reconcile, so the ended turn shows without waiting for
realtime.

## Effects (writes to calendar, tasks, documents)

- A trigger on every terminal transition resolves dangling effects. `reserved → cancelled` means
  never started. `started → uncertain` means it may have happened. Uncertain rows stay for audit
  and can later be reconciled to succeeded or failed by effect id.
- `recover_agentic_chat_turn` no longer returns `effect_reconciliation_required`, and the worker
  no longer has a branch for it. A turn with a started or uncertain effect ends with failure code
  `uncertain_external_commit`. That includes a Stop, which ends `cancelled` with that code. Effects
  never allow a retry, and nothing sits forever.
- For a failed or cancelled turn with `uncertain_external_commit`, the chat says: "BuildOS stopped
  partway through a change, so it may already be saved. Check before trying again." Any queued
  follow-up goes back to the composer instead of being sent.

## Workflow turns (prototype lane, flag-gated)

Recovery first asks the existing `recover_agentic_chat_workflow_turn_v1`, and retryable runs are
requeued in SQL exactly as before. A run that must end, including one with a pending Stop, is
handed to the worker sweep. The handoff carries a rotated token and the workflow outcome. The
sweep renders the terminal from durable workflow truth with no claim, no model call, and no second
workflow recovery.

A handoff does not refresh the lease. For a pre-lease turn, the lease is pinned to its real
silence, so the token rotation's heartbeat bump cannot reset the clock. If rendering fails, the
turn is handed off again on a later sweep, but only until it is abandoned (180 s). After that the
database finalizes it generically, as failed `workflow_<outcome>`, or cancelled for a Stop. It keeps
the durable answer prefix: for workflow answer batches, `chat_turn_stream_state.assistant_text`
mirrors the durable answer, which the crash-cut test checks. Like any failed partial, that text
stays reconnectable but does not join the assistant history. The web cron never renders workflow
terminals: it defers them until they are abandoned.

## The queued-turn reaper

A worker turn still queued ten minutes after it entered its current queued state is timed out
through the atomic queued-cancel path. That state starts at admission, or at a requeue. Before,
the clock started at `created_at`, so a turn requeued by recovery could be reaped before its
retry ever ran.

## Health and deploy guard

The worker's sweep runs once at boot, then every 15 s. It reports unhealthy in three cases:

- until its first successful sweep;
- after 3 consecutive failed sweeps;
- when one sweep has been in flight for more than 3 intervals (45 s).

The chat worker's `/health` returns 503 while the sweep is unhealthy, and Railway's 300 s
healthcheck uses that endpoint. So a worker deployed before this migration, or with a broken
recovery RPC, never passes its healthcheck, and the previous build keeps serving.

## Failure matrix

| Scenario                     | What happens now                                                                                                                                                   | Stop during it                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Worker crash / OOM / SIGKILL | Renewals stop. The turn is recovered 90 s after the last renewal (+ ≤ 15 s sweep or ≤ 60 s cron).                                                                  | Silent ≥ 45 s: finalized at once. Earlier: a signal, then recovery finalizes it as cancelled. |
| Event-loop stall (sync CPU)  | Renewals and the fence timer stop together, and recovery takes over at 90 s. When the loop wakes, `isFresh()` refuses writes at once and the overdue fence aborts. | Same as a crash.                                                                              |
| Hung renewal socket          | That renewal is abandoned after 10 s and the next one is sent on time. The fence decides only from acknowledgements.                                               | Unchanged.                                                                                    |
| Supabase blip < 60 s         | Renewals fail, the fence never fires, and the turn continues. A second failure in a row is logged as an error.                                                     | The Stop request may itself fail ("try again").                                               |
| Supabase blip > 60 s         | The worker self-fences at 60 s (`worker_lease_lost`). Recovery runs once the database returns.                                                                     | Same. Finalized once reachable and silent ≥ 45 s.                                             |
| Worker ↔ DB partition       | As a blip, from each side's view. The worker stops acting at 60 s.                                                                                                 | The web still reaches the DB: finalized at ≥ 45 s.                                            |
| Deploy drain (SIGTERM)       | Turns get the drain window to finalize themselves. Any cut off by SIGKILL are recovered 90 s later by the new worker.                                              | The live worker handles it (signal).                                                          |
| Whole chat service down      | The web cron recovers every dead turn and times out queued ones (10 min).                                                                                          | Finalized by the cancel RPC itself (workflow turns: by the cron once abandoned, 180 s).       |
| A turn whose recovery raises | Backed off and sorted last. Ended bare after 3 failures, parked and reported after 8. Healthy dead turns are still recovered.                                      | Same.                                                                                         |

## Migration and deploy order

1. Apply `20260924000000` (queued reaper), then `20260924000100` (this one). The migration runs
   with `SET LOCAL lock_timeout = '5s'`. The new columns are nullable with no default, and the
   lease CHECK constraint is added `NOT VALID`, so no table rewrite or full scan happens under
   lock. Both migrations are backward compatible. Pre-lease workers keep the 420 s rule, and
   `effect_reconciliation_required` simply stops appearing.
2. Deploy the chat worker. If it ships before the migration, the sweep RPC is missing, so health
   stays unhealthy and the Railway healthcheck blocks the deploy (renewal would report
   `unsupported` and harm no turn). Keep the order.
3. Deploy web. The cron calls `recover_dead_agentic_chat_turns` (batch 25, no handoff), then the
   queued reaper. A failure in one never skips the other, and either failure returns 500. The
   receipt includes `not_dead` and `parked`, and parked turns make it a warning.
4. The owner runs `pnpm gen:all`. The new RPCs, the columns, and `chat_turn_recovery_failures`
   were hand-added in generated style.

## Rollback

- Web or worker: redeploy the previous build. The database stays compatible with both.
- Database (only if needed, after rolling back code):
    - Drop the trigger `trg_chat_turn_runs_resolve_effects_on_terminal`.
    - Drop `recover_dead_agentic_chat_turns`, `renew_agentic_chat_turn_lease`,
      `agentic_chat_recover_dead_turn_v1`, `agentic_chat_finalize_dead_turn_v1`,
      `agentic_chat_turn_lease_state_v1`, and `resolve_agentic_chat_effects_on_terminal_v1`.
    - Drop the table `chat_turn_recovery_failures`.
    - Re-run the three patch blocks with needle and replacement swapped. They cover the recover
      classifier, cancel, and the reaper, and the migration lists the exact needles.
    - The two lease columns can stay: nothing else reads them.

## Tests

- SQL: `supabase/tests/20260924000100_agentic_chat_turn_leases.test.sql` runs on a throwaway
  socket-only Postgres. It covers the thresholds, fencing, Stop (including Stop with an uncertain
  effect), handoffs without lease refresh, repeated handoffs that reach the SQL fallback, poison
  turns (more failing turns than the batch, plus a healthy one that is still recovered; back-off
  order; bare finalize; parking), orphaned running turns, the finalize liveness guard, and the
  reaper's requeue timing. The migration is applied twice to prove it is idempotent.
- Worker tests:
    - `agenticChatTurnLease.test.ts`: cadence, `lost`, the fence measured from send time, no fence
      before the first acknowledgement, a renewal that never settles, late acknowledgements,
      `unsupported` before and after a renewal, the stop after the hard cap and at max hold,
      `isFresh`, the validator, and SQL-constant drift.
    - `agenticChatStalledRecovery.test.ts`: health until the first sweep, a missing RPC, a sweep RPC
      that never settles, overdue sweeps, `has_more` looping, defensive parsing, handoffs rendered
      from `workflowOutcome`, and repeated handoffs until the database finalizes the turn.
    - Executor tests: the `deadlineSignal`, `worker_lease_lost`, no partial completion after a lease
      loss even with durable writes, releasing the cancellation registration if the lease cannot be
      taken, and the lease reaching the mutation executor.
    - Mutation executor tests: the stale-lease refusal before and after an ambiguous attempt.
- Disposable-Postgres suites load both 0924 migrations:
    - Crash cuts and restart run through the real `recover_dead_agentic_chat_turns`.
    - A new crash cut shows the cron-only path finalizes an abandoned mid-stream workflow turn and
      keeps the durable prefix.
    - `agenticChatTurnLeases.postgres.test.ts` covers two overlapping sweeps (each turn settled
      once, the second never waits) and a renewal racing recovery in both lock orders, plus at the
      90 s boundary.
- Web: the cron route, the cancel gateway, the cancel route, and the stream controller (the "may
  already be saved" copy and the immediate reconcile after a terminal Stop).
