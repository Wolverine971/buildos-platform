<!-- docs/operations/worker/queue-architecture-audit-verification-2026-07-23.md -->

# Queue Architecture Audit — Verification & Extension

**Date:** 2026-07-23

**Status:** Verified audit. Companion to [Queue and Workflow Architecture Assessment (2026-07-23)](./queue-and-workflow-architecture-assessment-2026-07-23.md).

**Fix status (2026-07-23, same day):** P0 items 2–4 and P1 items 5–11 implemented (SMS intentionally left dormant per founder decision — entry points carry DORMANT comments listing the pre-integration fix list). Four migrations pending prod apply: `20260723010000` (stalled backoff + retry jitter + in-app delivery unique), `20260723020000` (agent_runs execution_generation), `20260723030000` (trigger-enforced run cap + atomic dispatch RPC), `20260723040000` (chat message idempotency unique index). ⚠️ Apply migrations BEFORE deploying worker/web — the new code references the column/RPC. Run `pnpm gen:types` after applying.

**Method:** Five parallel verification agents ran the assessment's claims against source with file:line evidence (queue core, Agent Runs, notifications, chat stream, plus a fresh-eyes sweep of areas the assessment skipped), and production `queue_jobs` was queried directly for depth, age, duration percentiles, and failure history.

---

## Verdict on the assessment

**The assessment is accurate.** Every P0/P1/P2 claim checked out; several are _worse_ in code than described. Three refinements:

| Assessment claim                                                          | Verdict                                                                                                                                                                                                    |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Promise.race` timeout doesn't cancel processors; no AbortSignal anywhere | CONFIRMED — `supabaseQueue.ts:481-504`; `ProcessingJob` has no signal                                                                                                                                      |
| Notification retry state defeats itself                                   | CONFIRMED, worse: **no notification ever gets a real second send attempt** (see below)                                                                                                                     |
| External sends at-least-once                                              | PARTIAL — true for push/SMS/in-app; **email has real app-level idempotency** (`emailAdapter.ts:161-183` + webhook-side atomic claim) that the assessment undersold                                         |
| Non-atomic two-write agent-run dispatch                                   | CONFIRMED — `dispatch.ts:414-440` then `:470-477`                                                                                                                                                          |
| Per-user run admission races                                              | CONFIRMED for the ordinary max-3 cap (count-then-insert, `dispatch.ts:229-248,381,414`); **REFINED: deep-research capacity IS DB-enforced** via `pg_advisory_xact_lock` trigger (`20260719020000:183-260`) |
| No domain execution fencing; retry attaches to `running` runs             | CONFIRMED — `isAgentRunQueueRetryResume` (`agentRunWorker.ts:262-264`); finalize updates by `.eq('id', runId)` alone (`:1330-1339`)                                                                        |
| 20-min run budget vs 10-min queue timeout                                 | CONFIRMED — `MAX_AGENT_RUN_WALL_CLOCK_MS = 20m` (`dispatch.ts:21`) vs `QUEUE_WORKER_TIMEOUT` default 600000 (`queueConfig.ts:133`)                                                                         |
| Batch barrier / head-of-line blocking                                     | CONFIRMED — `supabaseQueue.ts:262-266`; prod batchSize 10; **visible in prod data** (below)                                                                                                                |
| Config drift (`enableConcurrentProcessing`, `retryBackoffBase`)           | CONFIRMED — both dead; `retryBackoffBase` is _doubly_ dead (ProgressTracker hardcodes `50 * 2^n` ms, `progressTracker.ts:242-244`)                                                                         |
| SQL backoff `2^attempts` minutes, no jitter; no `retrying` status written | CONFIRMED — nuance: `retrying` exists in the enum and cleanup code filters on it, but no SQL ever sets it                                                                                                  |
| Token fencing protects queue rows                                         | PARTIAL, **weaker than claimed**: `complete_queue_job`/`fail_queue_job` accept `p_processing_token IS NULL` as a bypass; heartbeat and progress are direct table updates, tokenless callers unfenced       |
| Unused `processNotificationJobs` consumer                                 | CONFIRMED dead code (no caller repo-wide), with comments claiming mitigations ("SMS deduplication") that don't exist                                                                                       |
| Chat message idempotency is check-then-insert, no unique index            | CONFIRMED — `session-service.ts:879-933`; lookup also _degrades open_ on error                                                                                                                             |
| Chat recovery is transport-detach only; no stale-turn sweeper             | CONFIRMED — `last_progress_at` heartbeat is written but has **zero readers**; reclaim is lazy, same-session, age-based only (`turn-admission.ts:91-118`)                                                   |
| Untracked fire-and-forget agent-state reconciliation                      | CONFIRMED — `void (async ...)` at `stream/+server.ts:4079-4121`, not registered with the detached-task tracker; runs an LLM call after `done`                                                              |

**Assessment corrections: none material.** Nothing it asserts was found wrong; the deep-research advisory lock and email idempotency are the only places it was too pessimistic.

---

## Production reality check (queried 2026-07-23)

- **Scale is tiny.** ~426 jobs in 14 days (~30/day), 1,806 rows all-time (back to 2025-07), **zero pending/processing backlog**, 0% retries on all happy paths.
- **Durations fit inside the 10-min timeout so far**: max observed — `buildos_project_loop` 4.8m, `agent_run` 4.8m, `generate_daily_brief` 6.0m. The 20-min budget overhang is real but not yet exercised.
- **Head-of-line blocking is visible at zero load**: dispatch waits p95 — `send_notification` 1.9m, `buildos_project_loop` 1.3m, `project_activity_batch_flush` 2.3m — on a queue with a 5s poll and no backlog. Nightly batches barrier fast jobs behind slow ones exactly as predicted.
- **`send_sms` has NEVER succeeded in production. 220/220 jobs failed all-time, zero completed, since 2025-10-14.** Current cause (all 15 failures in the window): `queue_sms_message` (migration `20260421000000_notification_risk_cleanup.sql`) builds job metadata with only `message_id/phone_number/message/priority` — no `user_id` — while the worker validator (`queueUtils.ts:227`) requires `user_id` in the payload. Every SMS (brief-ready pings, admin new-user alerts) fails 3 attempts and dies. Earlier failures were a different schema error. **220 consecutive failures of one job type produced zero alerts** — the strongest possible evidence for the observability findings.

Implication: this is a **correctness problem space, not a scale one**. Recommendations below re-weight the assessment's roadmap accordingly.

---

## Confirmed P0 detail: notifications never retry

Full trace (`notificationWorker.ts`): provider failure → `status='failed'`, `attempts+1` (`:962-999`) → throw to request queue retry (`:1025-1028`) → same function's catch re-reads and increments `attempts` AGAIN (`:1058-1070`; `'failed'` deliberately excluded from `CLEANUP_EXCLUDED_STATES`) → queue reschedules → retry hits `FINAL_STATES` (includes `'failed'`, `:693-709`) **before** the max-attempts check → returns early → wrapper reports success → queue completes. One transient provider failure permanently strands the delivery with `attempts=2/3`. The `'failed', // Already failed max attempts` comment is false. Additionally, both optimistic-lock `count === 0` checks are dead code (supabase-js returns `count: null` without `{ count: 'exact' }`), so concurrent-modification detection never fires.

---

## New findings (not in the assessment)

### Live product bugs (user-visible today)

| #   | Finding                                                                                                                                                                                                                                                                                                                      | Evidence                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| N1  | **SMS channel dead since birth** — `queue_sms_message` omits `user_id` from job metadata; validator rejects; 220/220 failed                                                                                                                                                                                                  | migration `20260421000000:100-110`; `queueUtils.ts:227`; prod data |
| N2  | **Daily SMS event reminders schedule the wrong local day** — cron fires 00:00 UTC, computes "today" in user TZ at that instant (evening of the _previous_ local day for US users), then skips already-passed reminders; the dedup key locks in the wrong date. US users only ever get reminders for events after ~8 PM local | `scheduler.ts:246-248,1240-1251`; `dailySmsWorker.ts:203-207`      |
| N3  | **`schedule_daily_sms` duplicates on retry** — no per-(user, event, date) idempotency; retry re-runs LLM generation and re-inserts a full second set of scheduled messages + send jobs                                                                                                                                       | `dailySmsWorker.ts:306-321,367-370,389-446`                        |
| N4  | **Saved-operative schedule lock leaks on crash** — `schedule_locked_at` cleared only on success/defer/user-edit; no expiry sweep; a crash between lock and enqueue silently kills that operative's schedule forever                                                                                                          | `scheduler.ts:574-581,546,526-535`                                 |
| N5  | **Hourly brief scheduling has no missed-tick catch-up** — a deploy straddling a tick skips that day's briefs for users in the window, silently                                                                                                                                                                               | `scheduler.ts:240-243,890-897,1093-1095`                           |

### Infrastructure/correctness

| #   | Finding                                                                                                                                                                                                                                                             | Evidence                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| N6  | **`/health` is a static 200** — a worker with dead DB credentials or a wedged poll loop stays "healthy"; Railway never restarts it; combined with no queue alerts, a fully dead worker is invisible                                                                 | `index.ts:125-131`; swallowed claim errors `supabaseQueue.ts:247-249` |
| N7  | **Production profile silently overrides env vars** — `{...baseConfig, ...profileConfig}` means `QUEUE_BATCH_SIZE`/`QUEUE_POLL_INTERVAL`/`QUEUE_STALLED_TIMEOUT` are ignored in prod; operators believe they changed the system when they didn't                     | `queueConfig.ts:162-169,196`                                          |
| N8  | **Successful job re-executes if the completion RPC fails** — transient `complete_queue_job` error is caught as job failure → full requeue → duplicate side effects                                                                                                  | `supabaseQueue.ts:395-430`                                            |
| N9  | **Stall-recovery requeues with NO backoff** (`scheduled_for = NOW()`) — a job that reliably kills its worker hot-loops through its attempts                                                                                                                         | migration `20260502000001:201-204`                                    |
| N10 | **Shutdown drains but never relinquishes** — jobs outliving the 25s drain stay `processing` until stalled-reclaim (10 min prod) and are charged an attempt; the unhandled-rejection path `process.exit(1)`s without draining at all                                 | `supabaseQueue.ts:176-229`; `index.ts:815-846`                        |
| N11 | **Sweep grace math uses the wrong config** — stranded sweep computes `2 × stalledTimeout` from base config (300s) while prod runs 600s; grace is half of intended                                                                                                   | `agentRunStrandedSweep.ts:26,501-506`; `queueConfig.ts:118,165`       |
| N12 | **Agent-run finalize can double-insert the chat completion message** — insert precedes the terminal update; finalize retry re-inserts; no DB dedup                                                                                                                  | `agentRunWorker.ts:1328,1340-1347`                                    |
| N13 | **Agent-op mutations have zero idempotency in the Agent Run path** — the machinery exists (`onto_task_create_atomic` + unique index; `agent_call_tool_executions` reservation) but serves only the web route / external gateway; run-path creates are plain inserts | `op-execution-gateway.*.ts`; `20260702010000:32-47`                   |
| N14 | **Chat: persist-failure still reports success** — if the final assistant message fails to persist, the route logs, emits `done` with `completion_status: 'completed'`, and the reply vanishes on reload                                                             | `stream/+server.ts:3990-3997,4138`                                    |
| N15 | **Stale-turn reclaim ignores its own heartbeat** — ages by `started_at` only; dead turns lock the session for the full 285s, and a slow-but-alive turn at 286s is cancelled under a live lambda that can later overwrite the status                                 | `turn-admission.ts:92-97`; migration `20260702000000`                 |
| N16 | **Strict priority with no aging** — `ORDER BY priority ASC` can starve priority-10 scheduled briefs under sustained lower-number traffic; distinct from the batch-barrier issue                                                                                     | migration `20260502000001:56`                                         |
| N17 | **`/classify/ontology` runs LLM synchronously in the HTTP handler**, outside the queue — lost on restart, unbounded parallelism under bursts                                                                                                                        | `index.ts:134-193`                                                    |
| N18 | **Retention gaps** — cleanup only covers `completed` `generate_daily_brief` rows by default; `failed`/`cancelled` rows of every type retained forever; `agent_run_events`/`notification_deliveries`/`chat_turn_runs` grow unbounded (low urgency at current scale)  | `queueCleanup.ts:77,201-221`                                          |
| N19 | **Retries re-bill LLM spend with no guard outside agent runs** — brief retry deliberately regenerates; onboarding and daily SMS likewise; cost ledger exists only for agent runs                                                                                    | `briefWorker.ts:296-298`                                              |
| N20 | **Committed scratch file in the prod route dir** — `stream/djtryserver.ts` resurrects the banned client-supplied `prewarmed_context` pattern; not routable, but dead code with a footgun                                                                            | `apps/web/src/routes/api/agent/v2/stream/djtryserver.ts`              |
| N21 | **`sms_messages`/notification status lie** — notification delivery marked `sent` when the SMS is merely _queued_; Twilio failures never update `notification_deliveries`                                                                                            | `smsAdapter.ts:782-791`; `smsWorker.ts:356-409`                       |
| N22 | **`agent_runs` rows also created outside `dispatchAgentRun`** (`startHereCaptureProcessor.ts:218`), bypassing budget defaults and the active-run cap                                                                                                                | —                                                                     |

---

## Revised prioritized roadmap

Re-weighted from the assessment using production data. Ordering principle: **user-visible breakage first, then execution-integrity debt, then architecture. Scale work and Temporal are deferred — at ~30 jobs/day they solve problems BuildOS does not have.**

### P0 — Broken today, small fixes (do first)

1. **Revive SMS** (N1): include `user_id` in `queue_sms_message`'s job metadata (one-line migration) _or_ have the validator fall back to the queue row's `user_id` column. Backfill/ignore the 220 corpses.
2. **Make notification retries real** (assessment P0, confirmed): remove `'failed'` from `FINAL_STATES` for sub-max-attempts deliveries (or introduce `retry_scheduled`), stop the double increment, pick ONE attempts owner (queue). Integration test: first transient failure → actual second provider call.
3. **Fix daily-SMS day-boundary scheduling** (N2): compute the target date per-user in their timezone (or run per-timezone crons as briefs do), and cover the _upcoming_ local day.
4. **Minimum viable observability** (N6 + assessment): make `/health` reflect last-successful-claim age; add one alert on (a) failed-job count by type and (b) oldest-pending age. This single item would have caught the 9-month SMS outage, the operative lock leak, and any dead worker.

### P1 — Execution integrity (before any new long-running features)

5. **Real cancellation**: `AbortSignal` in the processor contract, threaded to smart-llm (`getJSONResponse` currently accepts none) and tools; per-job-type timeouts; raise the agent-run wrapper timeout above the 20-min budget + margin.
6. **Domain fencing for Agent Runs**: execution generation column; claim bumps it; finalize/pause/checkpoint predicated on it (finalize today is `.eq('id', runId)` alone). Kill or fence `isAgentRunQueueRetryResume`'s attach-to-running behavior.
7. **Atomic dispatch RPC** (insert run + queue job in one transaction) + enforce the max-3 cap in the same place (the deep-research trigger is the template — advisory lock already proven in-house).
8. **Idempotency where duplicates hurt**: unique index + upsert for chat message idempotency keys; wire `onto_task_create_atomic`-style keys into run-path creates; unique `user_notifications.delivery_id`; SMS worker checks `sms_messages.status` before sending; make `schedule_daily_sms` replay-safe (N3).
9. **Config truth** (N7 + assessment): one resolved runtime config injected everywhere (queue, sweep, progress tracker); delete `enableConcurrentProcessing`/`retryBackoffBase`; decide env-vs-profile precedence deliberately. Delete dead code: `processNotificationJobs`, `djtryserver.ts`.
10. **Operative lock expiry + brief missed-tick catch-up** (N4, N5): both are "scheduled thing silently dies" bugs in the retention-critical path.
11. **Stale-chat-turn sweeper**: read `last_progress_at` (already written) in admission reclaim; add the planned sweeper or a cron.

### P2 — Architecture (when usage justifies)

12. **Replace the batch barrier with per-slot refill + per-type concurrency caps** — this is the 20%-effort version of "split worker pools" that fixes the observed 2-minute notification waits without new deployments. Full pool separation and dedicated interactive workers can wait for real load.
13. Typed error classification + jitter (assessment P1/P2) — fold into #5's contract change.
14. Retention/cleanup expansion (N18) and correlation IDs web→queue→worker (F12).
15. Durable chat-turn execution (assessment P2): keep as the eventual direction; the 285s in-process bound + reconcile path is acceptable at current scale.

### Deferred — with reasons

- **Temporal**: rejected for now, more firmly than the assessment. At 1,806 lifetime jobs the operational cost of a second stateful system exceeds the entire queue's workload. The assessment's own precondition ("P0 correctness first") plus its decision gate would not pass today. Revisit only if deep-research orchestration grows real fan-out or run volume grows ~100×. Items 5-7 deliver most of Temporal's practical value here.
- **Backpressure/quotas/admission control**: zero backlog observed; an age/depth alert (item 4) is the tripwire that tells us when this stops being deferred.
- **Splitting API/worker/scheduler deployments**: shared-fate is real but acceptable at this scale; fix the unhandled-rejection exit path (N10) instead.

---

## Tests worth writing first (highest information per test)

1. Notification: transient provider failure → assert a second provider call happens (currently fails — this is the repro for P0 #2).
2. Queue: processor that outlives its timeout → assert it cannot commit domain writes after a retry claims (currently fails; drives #5/#6).
3. Dispatch: two concurrent dispatches at 2 active runs → assert ≤3 (currently fails; drives #7).
4. Daily SMS: user in `America/New_York`, cron at 00:00 UTC → assert reminders scheduled for the correct upcoming local day (currently fails; drives P0 #3).
5. `queue_sms_message` → `send_sms` payload contract test (currently fails; drives P0 #1).

---

## Cross-references

- Original assessment: `./queue-and-workflow-architecture-assessment-2026-07-23.md`
- Prior related audits: Worker Flow Audit 2026-07-01 (flagged config/HOL as open), Worker Contract Audit 2026-03-28 (introduced the payload validators that N1 trips), Daily Brief Flow Audit 2026-07-06.
