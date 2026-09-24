<!-- tasker/102-gate-case13-db-stall-permanent-failure.md -->

# Tasker 102 — Case 13: a 40 s database stall turned a read-only question into a dead turn

**Status:** Fixes built + free tests green; worker code UNCOMMITTED/undeployed; migration 20260924150000 APPLIED to QA + prod; gate 09-24 21:03Z FAILED 33/52 (case 13 3/3 pass; failures = reviewer 429s + QA stall on finalize) · **Opened:** 2026-09-24
**Source:** gate run `output/agentic-gate/tasker100-20260924T025502Z` (commit f46e9090c). Case 13
("cold retrieval": budget, task count, cabinet due date, two lines of a document), rep 2, was the only
turn of 45 that did not complete. It ended `transport_failure`. The user would have seen "An error
occurred while streaming." and no answer. It cost the gate 4 of 52 points.
**Scope guard (DJ):** fix what helps every user; free local tests first; paid runs need DJ's approval.

## What happened (UTC, 2026-09-24)

| Time         | Event                                                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 03:13:38     | Turn admitted (`ab2aca4f-adc4-4b34-aded-bca0bbdc7aeb`); the database is normal (calls 0.1–0.4 s).                                                                                                                                                              |
| 03:13:40.6   | Database slows: event persistence 0.6–0.9 s at the gateway.                                                                                                                                                                                                    |
| 03:13:42.7–8 | The acting pass ends and fires ~6 concurrent writes on this turn: usage log, provider-attempt observation, semantic event, ack, and **`persist_agentic_chat_prompt_snapshot_v3`**. They take 2.4–4.3 s; the snapshot runs **11.9 s**, then fails with `57014`. |
| 03:13:46.6   | The four read tools (the model asked for 4 reads in parallel) wait on the tool-execution fence (`claim_agentic_chat_turn`). The fence and a stream ack both fail at 8.5–8.8 s with `57014` (statement timeout). All 4 reads fail.                              |
| 03:13:50     | Even `select users` takes **10.6 s** at the database. The whole database is stalled, not one table.                                                                                                                                                            |
| 03:14:04     | The executor classifies the failure `unknown` → `permanent` and finalizes the turn as failed. No retry.                                                                                                                                                        |
| 03:14:07–26  | `claim_pending_jobs` still times out (9.4 s), then the database recovers. A smaller stall repeats at 03:16:46 (5–11.5 s writes) without failing a turn.                                                                                                        |

## Three defects, in order of what to fix first

**1. A retryable error is treated as permanent (worker bug, affects prod).**
`apps/worker/src/workers/agentic-chat/shared/postgres-failure.ts` lists `57014` as transient, and the
stream publisher and workflow runner use `isTransientDatabaseFailureCode`. The turn executor does not:
`classifyFailure` in `turn/executor-failures.ts` ends with
`return executionStarted ? 'unknown' : 'transient_infra'`. A raw Supabase error that carries a transient
SQLSTATE after execution starts therefore becomes `unknown` → `retry_classification: permanent`.
**Fix:**

- classify errors whose `code` passes `isTransientDatabaseFailureCode` as `transient_infra` (or a
  retryable class), so the lease/recovery path re-runs the turn;
- retry the tool-execution fence claim once with backoff before failing the round;
- check that retrying after reads is safe, and that writes stay idempotent through the effect ledger.

**2. The prompt-snapshot RPC holds the turn row lock for its whole run.**
`persist_agentic_chat_prompt_snapshot_v3` (latest body in
`supabase/migrations/20260914165546_agentic_chat_workflow_prompt_snapshot.sql`) starts with
`SELECT … FROM chat_turn_runs … FOR UPDATE` and then rebuilds the history with jsonb functions.
Everything else that touches the same turn row queues behind it: claims, acks, fences. Here that queue
reached the statement timeout. Blocked statements hold PostgREST pool connections, so a pile-up on one
row can starve unrelated requests (which fits `select users` taking 10.6 s). It is wired in prod
(`host/composition-root.ts:288`); across the gate it was the slowest routine call (p50 0.4 s, p95 1.3 s,
max 11.9 s).
**Fix:** take the lock last or not at all: compute first, then a short guarded insert/update; or use
`FOR SHARE` / a snapshot-specific row. Also stop firing ~6 writes on the same turn row at pass end: that
bursts row-lock contention every pass.

**3. The trigger: why the gate database stalled at 03:13:40.** Unknown.

- Ruled out: the gate's own traffic (the web side made only a few light calls in the window) and the
  new turn-lease
  recovery sweep (p50 170 ms over 92 calls; it was caught in the stall, not causing it).
- Check the QA project's (`daudvq…`) compute size, CPU and IO graphs, and Postgres logs (lock waits,
  long transactions, autovacuum) for 03:13:30–03:14:30 and 03:16:40–03:17:00 UTC in the Supabase
  dashboard.
- If the QA instance is undersized for the gate, say so and size it. Do not relax the gate.

**User-facing copy.** A failed turn with no receipts shows "An error occurred while streaming." For
an infrastructure failure with nothing saved, it should say what happened and what to do: "I couldn't
reach your project data just now. Nothing was changed. Try again." Keep this in the existing
failure-copy path, built from structure (failure class, empty ledger), never from text matching.

## Evidence

- Turn: `turns/cedar-13-cold-retrieval-2-1.json`. `result.rawEvents` holds the error event, and
  `checkOutcome` the assert.
- Worker: `worker.log` lines 6336–6362 (snapshot 57014, the typed execution failure with
  `execution_error_code: 57014`, `failure_class: unknown`, `retry_classification: permanent`), plus all
  `agentic_gate_http_trace` lines 03:13:38–03:14:30 (status and `upstreamServiceMs` = time spent at
  the gateway/database).
- Web: `web.log` traces in the same window (`users` 10.7 s at 03:13:50).
- Latency summary: `latency-analysis.json` (`slowHttpRequests`, the per-turn `publisherAttempts`).

## Acceptance

- Free first:
    - a unit test that a post-start error with `code: '57014'` classifies as retryable, and that the
      turn requeues/recovers instead of finalizing as failed;
    - a Postgres test (the `workflowPostgres` helper exists) where one session holds the snapshot's
      lock while another claims the turn: the claim no longer waits behind the snapshot's work.
- Then, with DJ's approval: one gate (≈ $0.30) with no `transport_failure`, plus a written answer on
  the QA stall trigger.

## Work log 2026-09-24

### What the investigation found

- **Trigger (defect 3):** the QA gate database (`daudvq…`, a Supabase branch on default **Nano**
  compute) is memory-starved and swapping: 455 MB RAM, 480 MB of 1 GB swap in use, only 27 MB of the
  224 MB `shared_buffers` resident, 82.8M major page faults since the 09-11 boot. "Buffer hits" are
  swap-ins, so any IO burst stalls every statement. Latency climbed through the whole gate (p50
  5 ms at 03:01 → 105 ms at 03:17). Slow clusters repeat each minute at :44–:54, lining up with
  autovacuum (suggestive, not proven). Ruled out: checkpoints, pg_cron (not installed), stray
  clients, connection spikes, deadlocks. Postgres logs show five lock waits on `chat_turn_runs`
  03:13:43.9–50; each waiter got its lock within 20 ms of a 57014 cancel, so the cancelled
  statements were the lock holders. The 03:14:15 and 03:14:26 timeouts had no lock waits: the whole
  box was slow. No CPU/IO-budget history was available with our token.
- **Proposed fix #1 alone would not have saved the turn.** `decideAgenticChatRecoveryV1` (and the SQL
  mirror) only retries a turn before execution starts. Classifying 57014 as `transient_infra` after
  start fixes the label and the copy, but the turn still finalizes failed. What actually saves it is
  an in-turn retry of the fence check.
- **The fence check never needed the lock.** For a running turn, `claim_agentic_chat_turn` writes
  nothing, but it takes `FOR UPDATE` on the turn and queue-job rows. The lock is released the moment
  the check returns, so it protected nothing, and it put the check in the queue behind every writer
  on the turn row. Tool results are fenced again when they persist, so this is only the early check.
- **Same defect in the cancellation poll.** `observe_agentic_chat_turn_cancellations` runs every 2 s
  per worker with every running turn. It took `FOR UPDATE` on all of them even when none had a
  cancel request. One slow writer on one turn stalled cancel checks for every turn on that worker,
  and the poll in turn blocked those turns' writers. In the window it took 1.5–8.7 s.
- **Why the snapshot overlapped the tool round:** it is dispatched before the first model request by
  design (case 14 fix), but the turn's opening status writes took ~2 s on the slow DB. The fast
  model finished first, so the snapshot, usage, observation, ack, and fence all landed together.
- **Tasker 101 doesn't touch this path.** Its fixes are reviewer, watchdog, parallel creates, and the
  gateway memo. Case 13 is a read-only turn, so they would not have prevented this failure.

### Built (UNCOMMITTED)

| Change                                                                                                                                                                                                                                                                                | Files                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A coded transient DB error (or a control RPC that never reached the DB) classifies `transient_infra`, not `unknown`.                                                                                                                                                                  | `turn/executor-failures.ts` (`hasTransientDatabaseCode`)                                                                             |
| The read-tool fence retries once after a transient failure (DB code or its own deadline): 1 s pause, fresh deadline. Parallel reads share the retry.                                                                                                                                  | `turn/turn-run-services.ts`                                                                                                          |
| Infra failure with no write in the ledger says "I couldn't reach your project data just now. Nothing was changed. Try again." The copy comes from failure class + ledger. If recovery reclassifies the failure (e.g. `uncertain_external_commit`), it falls back to the generic line. | `turn/executor-failures.ts` (`failurePublicError`), `turn/turn-executor.ts`, `turn/turn-finalizer.ts`                                |
| Lock-free `check_agentic_chat_turn_read_fence`: same receipt and failures as claim for a running turn, never claims. The worker uses it via `checkReadFence`, falls back to claim on PGRST202/42883 (worker deployed before the migration), then stays on claim.                      | `supabase/migrations/20260924150000_agentic_chat_lock_free_turn_checks.sql`, `turn/execution-control.ts`, `tools/read-tool-fence.ts` |
| `observe_agentic_chat_turn_cancellations` returns `[]` from committed state when no named turn has a cancel request; otherwise the 20260802035000 body runs unchanged.                                                                                                                | same migration                                                                                                                       |

Tests (all free, all green): `tests/agenticChatExecutorFailures.test.ts` (new),
`tests/agenticChatLockFreeTurnChecks.postgres.test.ts` (new, 7: parity with claim; with the
snapshot's turn + queue-job locks held, claim hits `lock_timeout` 55P03 while the check answers in
<300 ms; the cancellation poll answers under a held lock; signal consume + replay unchanged; stale
token rejected; queued turn never claimed; service_role only), plus case-13 reproductions in
`tests/agenticChatTurnExecutor.test.ts` (57014 once → retry → all 4 reads run; twice →
`transient_infra` + new copy) and adapter fallback in `tests/agenticChatExecutionControl.test.ts`.
The disposable-DB helper now applies the migration. The whole `tests/agenticChat*` suite: 1,703 pass,
1 failure that was already there (`agenticChatPhase5FailureMatrixAudit`: the anchor
"stops at effect reconciliation…" isn't in the committed test file either). Worker typecheck and
lint are clean.

### Not done / open

- **The snapshot still holds the turn row lock for its whole transaction** (v3 → v2 → v1, including
  three writes of the ~66 KB snapshot row). Acks, semantic events, and FK inserts (`llm_usage_logs`,
  `chat_turn_events` need KEY SHARE, which `FOR UPDATE` blocks) for that turn still queue behind it.
  Follow-ups: (a) `FOR UPDATE` → `FOR NO KEY UPDATE` in the per-turn RPCs, so child-row inserts stop
  queueing; (b) rewrite the snapshot to compute first and lock last, with one insert.
- **QA branch sizing** (and whether prod is sized right) moved to
  [Tasker 104](104-supabase-fitness-sizing-and-efficiency.md), per DJ, for research before any resize.
- **Migration applied 2026-09-24 ~17:05Z (DJ asked):** QA branch and prod, through the management
  API. Before replacing it, I confirmed the live `observe_agentic_chat_turn_cancellations` body
  matched the 20260802035000 source (md5 `2d3d29ae…`) on both. After applying: both new bodies
  match the file (check `af45a708…`, observe `45e35db9…`), execute is service_role only, and smoke
  calls pass (empty poll → `[]`, unknown turn → `agentic_chat_read_fence_turn_not_found`). The prod
  ledger row is recorded (`supabase_migrations.schema_migrations` 20260924150000). QA keeps no ledger
  rows since 09-23. I did not use `db push`, because it would also have pushed another session's
  `20260924120000_email_scan_checks`, which is not in the prod ledger. The cancellation-poll fast
  path is live in prod now. The read-fence check is unused until the worker code ships; the worker
  falls back to claim if the function is ever missing.
  Prod check still owed: `still waiting for ShareLock` on `chat_turn_runs` in prod Postgres logs and
  max times for the snapshot and ack RPCs.
- **Gate** (paid, needs DJ's approval): acting model `deepseek/deepseek-v4.1-flash`, reviewer
  `openai/gpt-6-luna` (reviewer cost on the gate unmeasured). Expect ≈ $0.30–0.35. The migration must
  is already applied to the QA branch.

### Gate 2026-09-24 21:03Z (DJ approved) — FAILED 33/52

`output/agentic-gate/tasker102-20260924T210252Z`. It ran from a clean worktree snapshot of
`76302509d`, because other sessions were editing main; the snapshot has since been removed. Before
the run I applied ten migrations to QA that prod already had: `120000`, `190000`–`190600`
(`190350` and `193000` were already there). Spend was **$0.2619** (usage counter delta).

- **Case 13: 3/3 pass** (28.1 / 33.2 / 14.4 s). **Case 2** (Tasker 101): reps 2–3 pass at 35 s
  (limit 60 s; was 50–62 s).
- **4 failures = reviewer outage, not product logic** (cases 1 rep 2, 2 rep 1, 7 rep 3, 8 rep 1).
  The gate env pins `AGENTIC_CHAT_REVIEWER_MODEL="openai/gpt-6-luna"` (Azure only, ZDR), and 14 of 32
  reviewer passes got "temporarily rate-limited upstream". On 4 turns every attempt failed, so the
  write was correctly refused ("my safety check couldn't confirm…"). The code default at
  `76302509d` is already `gpt-5.6-luna` (bootstrap.ts: "gpt-6-luna's Azure ZDR endpoints are
  degraded"). **Fixed 09-24 (DJ):** I removed the pin from `.env.agentic-gate.local`, so the gate now uses the code's reviewer: gpt-5.6-luna → gemini-3.7-flash, glm-5.3, deepseek-v4-pro (all have ZDR endpoints). Prod Railway `agentic-chat-worker` pins no reviewer and runs 76302509d, so prod already had the fallbacks.
- **Case 14 rep 1 = QA stall again, at the terminal step.** The answer streamed completely
  (21:24:15). Then `finalize_agentic_chat_turn_with_terminal_events` hit 57014 and was not retried,
  so the turn ended `timeout_post_start` at 200 s. The whole box was slow: `users` 9.3 s, the new
  lock-free cancel poll 3–9 s. That is swap, not locks (Tasker 104). **Next fix:** retry the
  terminal finalize once on a transient DB code (finalize is idempotent: replay returns the
  committed winner).
- **Case 9 rep 3:** the model stored the supplier note without its exact override text (one run,
  model behavior).

### Deployed-stack battery built 2026-09-24 (DJ: "run this test in prod")

DJ's picks:

- post-deploy check; the QA gate stays for testing before a change ships;
- reuse the prod harness account `agentic-e2e-harness@example.com`;
- connect a QA Google Calendar for case 10;
- hard-delete everything after each run.

Built, UNCOMMITTED:

- `pnpm agentic:prod-battery` (`scripts/agentic/prod-battery.ts`, `prod-battery-policy.ts` + test).
  `--preflight-only` is free; `--confirm-prod` is the paid run.
- Harness hooks: `AGENTIC_BATTERY_TARGET=deployed` expects the deployed commit and reads web
  provenance from Vercel (`harness/provenance.ts` + tests). Evidence capture is allowed for the
  harness account's own rows (`harness/gate-evidence.ts`).
- Runbook section in `docs/testing/agentic-chat-gate.md`.
- `.env.agentic-prod-battery.local` (ignored, 0600).

Free preflight against prod passes up to the calendar step:

- acting model `deepseek/deepseek-v4.1-flash`, read from Railway;
- web (Vercel `dpl_Cm6VZvMB…`) and worker both on `76302509d`, clean;
- harness account found.

It then stops: **no Google Calendar connection** for the harness account in prod (DJ must connect
it). Only 1 prod user has a multi-calendar connection. If the new connect flow does not appear for
the harness account, its user ID must be added to Vercel
`PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS`.

Tests: policy tests 4/4, harness oracle 121/121, provenance + evidence 12/12.

### Prod battery run 2026-09-24 22:09–22:25Z (cases 1, 2, 7, 8, 9, 14; $0.36)

Evidence: `output/agentic-prod-battery/failed-cases-20260924T220920Z/`. Cost was $0.18 for the model
(V4.1 flash) plus $0.18 for the judge. The earlier estimate of $0.12–0.15 was too low. Cleanup
hard-deleted 18 sessions and left none behind.

- Cases 1, 7, 8, 9 and 14 passed 3/3.
- Case 2 failed 3/3 (`uncertain_external_commit`, 20–28 s).
    - What happened: 2 or 3 of the 5 parallel `create_onto_task` calls hit Postgres deadlocks
      (`40P01`) in `onto_task_create_with_relationships_atomic`.
    - Prod postgres logs show 21 `deadlock detected` lines between 22:11:20 and 22:12:20Z, and
      none since then.
    - Why: migration `20260924193000_task_create_project_lock_first` (Tasker 101's fix) was
      applied to prod at **22:19:56Z**. The tasker 103 session applied it after the run had
      started, so case 2 ran on the old lock-upgrade body. That is the known Tasker 101 deadlock,
      not a new bug.
    - The prod function now matches the fix (md5 `cac030…`). Nothing more to apply.
- Hardening gap this run exposed (not built):
    - The gateway turns `40P01` into `INTERNAL`, so the adapter treats it as `outcome_uncertain`.
      The executor tries twice, then ends the turn with the generic error copy.
    - A PostgREST error that carries a Postgres code means the RPC's transaction was rolled
      back. So `40P01`, `57014` and `55P03` are known not to have committed, and the call can be
      retried with the same idempotency key.
