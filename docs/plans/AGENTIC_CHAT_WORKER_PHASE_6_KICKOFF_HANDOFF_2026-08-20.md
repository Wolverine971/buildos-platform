<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_6_KICKOFF_HANDOFF_2026-08-20.md -->

# Agentic Chat Worker Phase 6 kickoff handoff

**Prepared:** 2026-08-20  
**Mission:** physically isolate the proven Agentic Chat runtime, then ramp real production traffic
through explicit, reversible cohorts.  
**Repository:** `/Users/djwayne/buildos-platform`  
**Starting branch/revision:** `main` at `d2d261e623912f9484f9c85aacde78a71f261b8f`  
**Master plan:**
[`AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md`](./AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md)
§ Phase 6  
**Phase 5 record:**
[`tasker/57-worker-phase5-reliability-hardening.md`](../../tasker/57-worker-phase5-reliability-hardening.md)

## 1. The one thing to preserve

Phase 5 is exited. Do not reopen the reliability design or add another safety mechanism before
trying to deliver user value. The Phase 6 kernel is smaller:

> Run the already-proven chat runtime in its own Railway service, prove deployment/drain behavior,
> and move an observable cohort onto it without changing the semantics of an admitted turn.

The current process has a chat-only queue internally, but the process also starts the general queue,
all unrelated processors, the scheduler, and a large shared HTTP API. Phase 6 makes the isolation
physical and deployable.

## 2. Verified starting state

This section is a receipt, not an assumption. It was rechecked on 2026-08-20.

### Source and deployments

| Surface         | Verified state                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git             | Local `main` and `origin/main` both at `d2d261e623912f9484f9c85aacde78a71f261b8f`                                                                                          |
| Railway         | Service `daily-brief-worker`, deployment `bc703782-67af-4abe-bbdf-cec70ca53802`, `SUCCESS`/`RUNNING`, exact source revision `d2d261e623912f9484f9c85aacde78a71f261b8f`     |
| Railway process | One replica, start command `node apps/worker/dist/index.js`, health path `/health`                                                                                         |
| Web             | Vercel production deployment `dpl_3k8GDwEMoTqns9Z1g4bMvcn7NZ98` is `READY` and serving `build-os.com`; the inspection output did not expose a Git SHA, so do not claim one |

The production worker health response was healthy and running: database connected, zero consecutive
claim failures, Agentic Chat enabled/running/healthy, zero active turns at inspection, Realtime
healthy/idle with zero failures, and stalled recovery healthy with no candidates requiring attention.
Startup logs confirmed the retention schedule `30 3 * * *`; no worker-artifact cleanup error was
present.

### Database migration parity

The following local migrations are recorded remotely and their exact behavior/catalog objects were
audited before repairing the missing history receipts:

- `20260815173000_agentic_chat_provider_observation_logical_round.sql`
- `20260817010000_agentic_chat_prompt_snapshot_runtime_augmentation.sql`
- `20260817020000_agentic_chat_provider_attempt_timing_receipts.sql`
- `20260820010000_agentic_chat_worker_retention_cleanup.sql`

An isolated remote dry run reports the database up to date. The Phase 5 retention contract is live:
minimum terminal artifacts 7 days, ordinary resolved effects 30 days, uncertain-reconciliation audit
effects 90 days, service-only cleanup, and active/unresolved work protected by both selection and
database guards.

### Verification receipts

Current post-deployment rerun:

- shared types: 31/31 tests, typecheck, and build passed;
- worker: 1,081/1,081 tests across 120 files passed, with one intentional workflow-evaluation skip;
- focused Phase 5 matrix/reliability/scheduler set: 20/20 passed;
- focused web retention/Realtime set: 12/12 passed;
- worker typecheck passed.

The completion package also previously passed the broader focused web suite at 141/141, disposable
PostgreSQL retention proof, and full web diagnostics with zero errors and zero warnings. Exact
implementation details and the production orphan-recovery sequence live in tasker 57.

## 3. Phase 5 exit decision

All Phase 5 deliverables are closed:

| Deliverable                | Exit evidence                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Stale-turn recovery        | Two retained production orphans converged to `terminal_reconciled` after a real deployment restart; no manual row mutation |
| Current-generation fencing | Shared typed fence plus executable inventory over all durable writer modules                                               |
| Stable mutation effects    | Reviewed adapter inventory, stable `effect_id`, and boundary audit                                                         |
| Retry policy               | Exhaustive typed mapping into five Phase 5 decisions with structured observations                                          |
| Uncertain commits          | Supported stable-key reconciliation only; unsupported downstreams fail closed                                              |
| Shutdown                   | Claims close before HTTP shutdown, bounded drain, reclaimable ownership                                                    |
| Retention                  | Bounded 7/30/90 cleanup with database-enforced guards                                                                      |
| Realtime fallback          | Persistent outage converges through authenticated polling                                                                  |
| Health                     | Claim, DB, Realtime, active-turn, recovery, and event-loop signals                                                         |
| Failure matrix             | 54 unique executable evidence anchors                                                                                      |

There is no remaining Phase 5 implementation slice. Two inherited tasker 50 production proofs still
gate the first traffic widening, but they do not reopen Phase 5:

1. Read-only production-versus-disposable `pg_constraint` diff for the final chat contract.
2. One deliberately over-budget live provider canary proving `provider_budget_exhausted` behavior.

Treat these as **Phase 6 Gate 0**. The second operation spends provider capacity and writes a real
turn, so it requires the operator's explicit authorization, a named test user/project, a same-day
legacy comparator where applicable, and unconditional routing-state restoration/readback.

## 4. Non-negotiable rollout invariants

- Production routing stays exact `false` until the operator authorizes a named canary or cohort.
- The last documented cohort is exactly `76c04859-837c-4d13-88ea-9a39ed15ed81`. Perform a safe
  operator readback before changing it; do not bulk-download production secrets merely to inspect
  one flag.
- Keep both worker mutation-capability lists as exact empty strings unless a separate mutation
  rollout is explicitly approved.
- An admitted worker turn stays owned by its stored mode. Rollback affects new/unused leases; never
  silently replay an in-flight worker turn on legacy.
- Ordinary rollback returns new leases to legacy. Emergency rollback also rotates the kill epoch so
  unused worker leases renegotiate.
- Every canary script restores routing, cohort, and capability state in `finally`, then performs an
  independent readback. A failed test does not get to leave production enabled.
- Grade stochastic behavior against a same-day legacy run, not a historical score.
- Do not add a chat-level hard wall to solve provider latency. The standing product constraint is no
  chat-level hard timeout; measure the long tail first.

## 5. Architecture already available

Do not copy the Phase 3 runtime into a new implementation.

- `apps/worker/src/workers/agentic-chat/phase3Bootstrap.ts` validates configuration and constructs
  the provider, isolated chat queue, publisher, cancellation observer, stalled recovery, and capacity
  collector.
- `apps/worker/src/workers/agentic-chat/consumerRuntime.ts` owns the chat-only lifecycle. It proves
  the queue registers only `agentic_chat_turn`; starts publisher → cancellation → recovery → queue;
  and drains recovery → queue → cancellation → publisher.
- `apps/worker/src/http/agenticChatCapacity.ts` is the authenticated, bounded capacity projection.
- `apps/worker/src/lib/workerOperationalHealth.ts` owns event-loop monitoring and the existing
  operational projection, although its current builder assumes both general and chat queues.
- `apps/worker/src/index.ts` is the existing combined entrypoint. It starts `startWorker()`,
  `startScheduler()`, and the full API. This is the code the dedicated entrypoint must not import or
  duplicate wholesale.
- `apps/worker/src/worker.ts` currently registers all general processors and combines the general
  queue with `AgenticChatPhase3Bootstrap`; it is not a chat-only entrypoint.

Configuration parsing already rejects malformed booleans, malformed UUID allowlists, non-positive
integer bounds, an invalid drain timeout, and a provider budget at or above the worker timeout. Phase
6 should add a production profile that requires the critical chat capacity/timeout/high-water values
to be explicitly present, while retaining convenient defaults for local development and tests.

## 6. Important web/service boundary

The web currently fetches Agentic Chat capacity from `PUBLIC_RAILWAY_WORKER_URL`, authenticated by
`PRIVATE_RAILWAY_WORKER_TOKEN`. That same URL also carries daily briefs, onboarding, SMS,
classification, braindump, job-status, and other general-worker routes.

**Do not repoint `PUBLIC_RAILWAY_WORKER_URL` to the dedicated chat service.** Doing so would break
unrelated production jobs.

Add a chat-specific server-only URL, for example `PRIVATE_AGENTIC_CHAT_WORKER_URL`, used only by
`worker-turn-capacity.server.ts`. A safe transition is:

1. Prefer the dedicated chat URL when configured.
2. Fall back to the existing general-worker URL while the new service is absent.
3. Keep the bounded exact-schema capacity evaluator and its fail-closed behavior unchanged.
4. Reuse the existing bearer token initially unless there is a deliberate secret-rotation step;
   isolating the URL is required, rotating authentication is not required for the first canary.

This lets general jobs remain on `daily-brief-worker` while web admission observes the physically
isolated chat service.

## 7. Recommended implementation sequence

Work in substantial, reviewable chunks. Do not recreate the Phase 5 slice sprawl.

### Gate 0 — receipts before traffic

- Run the read-only constraint diff from tasker 50 and retain the exact output.
- With explicit operator authorization, run the deliberately over-budget provider canary and prove
  its terminal status/code, queue convergence, billing/usage receipt, and routing restoration.
- Read back the current web routing flag, cohort, kill epoch, and capability lists without exposing
  secret values in logs or documents.

Gate 0 may be completed alongside local entrypoint work, but must pass before widening traffic.

### Chunk A — dedicated entrypoint and characterization tests

1. Add `apps/worker/src/chat-worker.ts` with only:
    - Supabase client/bootstrap construction;
    - `AgenticChatPhase3Bootstrap` start/stop/wake/capacity;
    - minimal Express `/health` and `/agentic-chat/capacity` routes;
    - event-loop lag monitoring;
    - bounded SIGTERM/SIGINT and fatal-error drain;
    - analytics flush only if the chat runtime actually owns buffered analytics.
2. Extract a small shared lifecycle/server helper only where that removes duplication from
   `index.ts`; do not turn this into a general entrypoint rewrite.
3. Add a chat-only health projection rather than faking a healthy general queue to satisfy
   `buildWorkerOperationalHealthChecks`.
4. Add `start:chat` and `dev:chat` package scripts. The existing TypeScript build already includes
   all of `src/**/*`, so it should emit `dist/chat-worker.js` without a second compiler pipeline.
5. Add characterization tests proving the dedicated composition starts and stops exactly once,
   becomes unhealthy before draining, bounds HTTP close, exposes authenticated capacity, and never
   starts the scheduler or general queue.
6. Add a source/import guard that fails if the chat entrypoint imports `./index`, `./worker`,
   `./scheduler`, or any unrelated processor tree.

The first implementation action should be the composition characterization test, followed
immediately by the smallest entrypoint that makes it pass.

### Chunk B — deployment configuration and compatibility

- Preserve the root `railway.toml` and the existing `daily-brief-worker` start command.
- Create the new Railway service from the same repository/build output with service-level start
  command `node apps/worker/dist/chat-worker.js` and health path `/health`.
- Give the service independent `CHAT_CONCURRENCY`, worker/provider/drain timeouts, poll cadence,
  publisher high-water bounds, and replica count. In production, missing critical values should fail
  startup rather than silently use defaults.
- Add a release/version field to health and verify the web capacity observer is talking to the
  expected source revision before a rollout step.
- Deploy with web routing still false. Prove healthy startup, authenticated capacity, SIGTERM drain,
  restart recovery, and no scheduler/general-processor startup log lines.

There may be a short period with both the combined service and dedicated service able to claim chat
jobs. Generation fencing makes that safe, but keep the overlap bounded. Once the dedicated service is
healthy and its capacity URL is wired, disable `AGENTIC_CHAT_WORKER_ENABLED` on the general service
and independently confirm its health reports chat disabled. Keep it enabled only on the dedicated
service.

### Chunk C — canary observability and reversible ramp

- Add a dashboard/readout comparing legacy versus worker: admissions, rejects by reason, queue pickup,
  TTFT/final latency, terminal outcome, recovery actions, provider/tool error class, Realtime fallback,
  cost, active turns, CPU/RSS, DB claim health, publisher pressure, and drain duration.
- Start with a developer/admin named user, then named internal users, then 1%, 10%, 25%, 50%, and
  100% of eligible turns.
- At each stage, hold long enough to observe at least one deployment/restart and a meaningful mix of
  read-only/tool/research/cancel/reconnect behavior.
- Record the exact cohort, observation window, legacy comparator, pass/fail thresholds, incidents,
  cost, and restoration readback before advancing.

## 8. Rollout gate template

Use this for every cohort change:

| Gate        | Required receipt                                                                             |
| ----------- | -------------------------------------------------------------------------------------------- |
| Source      | Dedicated health reports the intended revision and service name                              |
| Config      | Explicit concurrency/timeouts/high-water values validated; mutation lists empty              |
| Capacity    | Authenticated endpoint fresh/open; malformed/missing evidence still closes admission         |
| Safety      | No stale executor writes, duplicate effect, overlapping supersede, or indefinite active turn |
| Delivery    | Realtime and polling fallback both converge to durable terminal truth                        |
| Quality     | Same-day legacy comparison is within the ratified threshold                                  |
| SLO         | Queue pickup, TTFT, final latency, errors, and recovery rate inside the cohort threshold     |
| Operations  | CPU/RSS/DB/publisher/drain headroom measured and recorded                                    |
| Rollback    | New leases return to legacy; in-flight worker turns are not duplicated                       |
| Restoration | Routing/cohort/capabilities independently read back after test or rollback                   |

Stop the ramp on any durable safety violation. Product-quality or latency misses should first be
compared with the same-day legacy baseline; do not misclassify a shared provider long tail as worker
migration failure.

## 9. Known non-blocking debt

These are real but do not block creating the service:

- legacy and worker both exhibit provider long-tail latency;
- `research-turn-finalizes` / `research-log-readback` remain scenario/prompt-quality work;
- some activity-log writes report non-blocking `agent_call_session_id` context-linkage errors;
- prompt-snapshot capture noise should be rechecked, but the current runtime augmentation likely
  closed the earlier v2 mismatch.

Escalate any item to a rollout blocker only with fresh cohort evidence.

## 10. Phase 6 definition of done

Phase 6 exits only when:

- the dedicated service contains no scheduler, general queue, or unrelated processors;
- it survives deploy/restart and drains predictably under live in-flight work;
- the general worker no longer starts the chat runtime;
- the web observes the dedicated capacity URL without redirecting general-worker traffic;
- production critical chat configuration is explicit and invalid/missing values fail closed;
- every cohort stage has comparable SLO, quality, cost, headroom, and rollback receipts;
- the 100% rollout completes after soak and audit sign-off;
- the two Gate 0 operator proofs are attached to the rollout record.

Phase 7, not Phase 6, owns the 1/2/5/10/25/50/100 simultaneous-turn capacity campaign. Phase 6
should measure canary headroom but should not turn the first production cohort into that load test.
