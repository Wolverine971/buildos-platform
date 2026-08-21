<!-- tasker/57-worker-phase5-reliability-hardening.md -->

# 57 — Phase 5: worker reliability verification and operational hardening

**Created:** 2026-08-19
**Status:** ✅ **EXITED 2026-08-20.** Phase 5 implementation, deterministic exit evidence, production
stale-turn convergence, database migrations, and the final worker deployment are verified. Phase 6
starts at
[`docs/plans/AGENTIC_CHAT_WORKER_PHASE_6_KICKOFF_HANDOFF_2026-08-20.md`](../docs/plans/AGENTIC_CHAT_WORKER_PHASE_6_KICKOFF_HANDOFF_2026-08-20.md).
**Start here:** [`docs/plans/AGENTIC_CHAT_WORKER_PHASE_5_KICKOFF_HANDOFF_2026-08-19.md`](../docs/plans/AGENTIC_CHAT_WORKER_PHASE_5_KICKOFF_HANDOFF_2026-08-19.md)
**Mission:** Make the worker path survive real operational failure — restarts, disconnects,
cancellation races, stalled turns — so that Phase 6 can ramp a real cohort onto it.

## MEASURED FIRST SLICE — orphaned worker turns are real, permanent, and invisible (2026-08-19)

The suggested first slice below ("stale-turn sweeper") is no longer hypothetical. The tasker/56
battery produced one, and querying production found a second from five days earlier. **Both were
still non-terminal at the post-deployment inspection on 2026-08-20.**

### Ground truth

| `chat_turn_runs.id`                    | started                  | status now | queue job status |
| -------------------------------------- | ------------------------ | ---------- | ---------------- |
| `d8df5343-731d-4f9a-8348-6a6020517e71` | 2026-08-19 22:05:31Z     | `running`  | `processing`     |
| `64efe8bf-c65f-4e6c-8260-869423763de7` | **2026-08-14 07:16:33Z** | `running`  | `processing`     |

Rate, `execution_mode = worker_realtime`: **210 completed / 88 failed / 2 running / 2 cancelled**
— about **0.7%** of turns orphan. Both orphans are `worker_realtime`; legacy has none. The 08-14
row has survived five days and multiple worker restarts.

### What the orphaned turn actually did

From the retained artifact (`agentic_chat_tasker56_three_scenario_WORKER_3rep_2026-08-19_36955954c.json`):

- `responseHeadersMs` 2.1s, `firstSseEventMs` 2.9s, **`ttftMs` 5.3s** — it was streaming in five seconds.
- It executed `get_project_overview`, `declare_read_only_turn`, `approve_read_only_turn_review`;
  the reviewer **approved** the read-only disposition.
- Then it never terminated. Client gave up at 317s. `finished_at` null, `assistant_message_id` null,
  `timing_metric_id` null, and durable `tool_call_count` / `tool_round_count` are **0** despite three
  observed tool executions (the ledger attaches at finalize, which never ran).

**This is a finalization hang, not a provider long tail.** That matters: the inherited Phase 5 item
frames the problem as "90s configured deadline vs ~140.5s observed provider boundary." This turn was
fast at the provider and hung _after_ the semantic review approved it. Do not spend the slice tuning
provider timeouts on the strength of this case.

### Why nothing reclaims it

1. `apps/worker/src/workers/agentic-chat/consumer.ts:80` sets **`genericStalledRecovery: false`**,
   opting the agentic chat queue out of the generic reclaim every other consumer gets
   (`supabaseQueue.ts:133` defaults it `true`). The dedicated sweep is therefore the _only_ path.
2. The dedicated sweep IS wired and running — `AgenticChatStalledRecoverySweep`, constructed at
   `phase3Assembly.ts:435`, started at `consumerRuntime.ts:116`, on a 60s interval
   (`stalledRecovery.ts:167`).
3. Its candidate query matches these rows exactly (`job_type=agentic_chat_turn`, `status=processing`,
   stale `updated_at` — `stalledRecovery.ts:69-75`), and **both rows validate cleanly**: real
   `processing_token`, `user_id`, `metadata.turnRunId`, `metadata.correlationId`. (A "one malformed
   row poisons the whole batch" hypothesis was checked against production and **disproved** — the
   `data.map` in `list()` does throw for the whole batch on any bad row, which is worth hardening on
   its own, but it is not what is happening here.)
4. So the sweep is picking these up every 60 seconds and classifying them
   **`manual_recovery_required`** — one of six outcomes (`stalledRecovery.ts:266, 305, 329, 352`).
   That classification is deliberately fail-closed and **leaves the queue job `processing` and the
   turn run `running`**. It never terminalizes.

### The actual defect: no observability, no operator surface

`manual_recovery_required` is a reasonable safety stance. What is not reasonable is that it is
**silent**. Railway logs for the running worker show the consumer config (`Stalled timeout:
420000ms`) but **no sweep report, no per-candidate outcome, no metric**. The sweep has been
declining these same two candidates every 60 seconds — for five days in one case — and nothing
surfaces it. There is no operator surface to complete the manual recovery it is asking for.

**Recommended slice shape, in order:**

1. **Make the sweep observable first.** Log/emit `AgenticChatStalledRecoveryReportV1` (it is already
   a structured type: `candidateCount` + per-candidate `outcome`/`error`). Until this exists, the
   branch that fires is a guess — this investigation could not name it from the DB alone.
2. **Alert on non-terminal age.** A `chat_turn_runs` row `running` for >10 minutes is always wrong.
3. **Then** decide the policy: either auto-terminalize a `manual_recovery_required` turn as
   `failed` with an honest failure code after a bounded age, or build the operator surface. Do not
   pick before step 1 says which branch fires.
4. **Separately**, harden `list()` so one malformed candidate cannot abort the whole sweep batch.

**User-facing severity.** A user whose turn orphans sees it in-flight forever with no error and no
assistant message. At `concurrency: 1` it also holds the single slot until `workerTimeoutMs` (360s,
`consumer.ts:8`) expires — the harness's three `WORKER_CAPACITY_EXCEEDED` rejections were downstream
of exactly this. Real users degrade more gracefully than the harness did:
`WORKER_CAPACITY_EXCEEDED` is in `WORKER_KNOWN_NOT_ADMITTED_CODES`
(`agent-chat-stream-controller.svelte.ts:200-207`), so the client clears admission state and
renegotiates on retry — one visibly failed turn, not a wedged session.

**Do not clean up the two production rows before the slice starts** — they are the only live
reproduction, and one is five days old.

## Why this work exists

**Twenty-one days in, no user has received anything.** Routing has been `false` with a one-user
cohort since 2026-07-29. Phases 0–4 are complete. Phase 5 is the last engineering gate before
**Phase 6, the cohort ramp** — the first phase that delivers user value.

The standing test for every item here: _does this get us to a ramp, or is it gate theater?_
Phase 4 lost four days to the second thing — see the handoff §3 for the four inherited rules.

## Scope

Master plan `docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md` §Phase 5
(line 889): nine deliverables plus a 40+ case failure-injection matrix.

**Do not attempt it as one block.** That shape produced Phase 4's slice sprawl — 27 dead slice plan
documents. Slice it by operational failure mode, and let each slice carry its own exit evidence.

**Suggested first slice — graceful shutdown + health endpoint + stale-turn sweeper.** These three
are what make a Railway restart during a live turn safe, and a Railway restart is the failure this
campaign has actually observed in production (`e995c1c2` — a dangling rejected provider promise
restarted the worker). Everything else in the matrix is hypothetical by comparison.

The handoff's §4 table maps each deliverable to the code that already exists
(`stalledRecovery.ts`, `executionControl.ts`, `effectControl.ts`, `capacity.ts`, `effectIdentity.ts`)
versus what is genuinely missing.

## Inherited open items

Carried out of Phase 4 — full detail in handoff §5:

- **Latency**, the real product problem. Worker p50 ~97s / max ~268s; the 08-19 comparator measured
  **legacy at 90–151s**, so this is a _runtime_ property, not migration debt. DJ's standing
  constraint: **no chat-level hard wall.**
- **Provider long tail** — 90s configured deadline vs ~140.5s observed boundary. Instrument the
  timeline before proposing any timeout policy.
- `research-turn-finalizes` / `research-log-readback` — prompt/scenario work, not provider work.
- `agent_call_session_id` context linkage FK errors (non-blocking).
- Prompt-snapshot capture noise — may already be closed; confirm.
- [`tasker/50`](50-worker-provider-execution-hardening-slice16.md) has **two authorized production
  gates still open** (constraint diff, provider-budget overrun canary). **These gate the ramp.**

## Progress — slice 1: restart claim fencing + operational health

Implemented on 2026-08-19 and deployed in exact Railway revision `733a29eca282f7fd80ba1845a2986d9ba43c7e05`
on 2026-08-20:

- SIGTERM/SIGINT now marks both queue runtimes draining and stops new claims **before** closing the
  HTTP listener. This closes the previous bounded-but-real window where a job could be claimed while
  the process was already shutting down.
- Composite lifecycle health becomes unhealthy as soon as drain begins, so readiness/capacity no
  longer advertises a stopping worker.
- `/health` now reports the Phase 5 operational signals: latest successful claim (general and chat),
  DB connectivity derived from successful/failing claim RPCs, Agentic Chat Realtime connectivity,
  active chat turns, and event-loop lag (mean/p99/max).
- Realtime channel state is observable as idle/connected/degraded/closed. A cached channel that emits
  a post-subscription failure is evicted; the next durable event reconnects. Degraded Realtime does
  not make the worker itself unhealthy because persistence plus authenticated polling is the intended
  fallback.
- The existing chat-specific stalled recovery loop remains wired ahead of queue drain and its focused
  recovery tests remain green. Full Phase 5 stale-turn failure injection is still open.

Verification:

- `pnpm --filter @buildos/worker exec vitest run tests/workerRuntimeLifecycle.test.ts tests/workerOperationalHealth.test.ts tests/queueHealthAndAlerts.test.ts tests/agenticChatConsumer.test.ts tests/agenticChatPhase3Bootstrap.test.ts tests/agenticChatStreamPublisher.test.ts tests/supabaseQueueDrain.test.ts --retry=0`
- `pnpm --filter @buildos/worker typecheck`
- `pnpm --filter @buildos/worker lint` (passes with the repository's existing warning backlog; no
  lint errors)

## Progress — slice 2: orphan visibility + deterministic restart failure injection

Implemented on 2026-08-19 and deployed in exact Railway revision `733a29eca282f7fd80ba1845a2986d9ba43c7e05`
on 2026-08-20. The two production reproduction rows above were not manually modified:

- A real claimed, processor-managed chat job is injected past the queue drain budget. The queue
  aborts its executor, starts no new claim, performs no generic complete/fail write, and leaves the
  row processing for generation-aware recovery.
- Realtime send failures now evict the cached channel. A terminal event whose durable transaction is
  already committed reconnects on the next bounded Broadcast attempt instead of retrying one dead
  socket three times.
- Stalled recovery now proves convergence for: domain-terminal/queue-processing mismatch, a lost
  finalization response after commit, cancellation winning finalization, stale generation, and an
  uncertain effect requiring reconciliation. None reruns or refinalizes work after ownership loss.
- Every non-empty sweep emits a structured report containing candidate/result identities and
  timestamps. `manual_recovery_required`, `effect_reconciliation_required`, `failed`, or any
  candidate older than ten minutes emits an explicit error-level alert.
- Repeated sweep-level failures are visible in Agentic Chat runtime health and trip liveness after
  three consecutive failures; a successful sweep resets the failure streak.
- Malformed/duplicate candidate rows are isolated and reported by index rather than aborting the
  entire batch and hiding valid orphaned turns.

Verification:

- 80 focused tests pass across drain, stale recovery, Realtime publisher, runtime/bootstrap,
  assembly reporting, and operational health.
- Full worker suite: 1,072 passed, 1 workflow evaluation skipped.
- `pnpm --filter @buildos/worker typecheck`
- Focused ESLint on all changed worker source files, with zero warnings/errors.

## Progress — slice 3: bounded orphan terminalization contract repair

The observability deployment resolved the decision gate with direct production evidence:

- Railway deployment `2ac51831-ab31-4a88-accd-0603fb36f545` is `SUCCESS`, running one replica on
  exact revision `733a29eca282f7fd80ba1845a2986d9ba43c7e05`.
- Its first structured sweep report at `2026-08-20T01:06:12Z` found exactly the two known candidates,
  set `attentionRequiredCount: 2`, and classified both `manual_recovery_required`. The oldest age was
  `496178375ms`. The same classification repeated every minute.
- The 08-19 turn is read-only: three successful durable tool ledger rows, no effect receipt,
  `mutation_reserved_at = null`, and `irreversible_boundary_at = null`.
- The 08-14 turn crossed a mutation boundary, but its one `update_onto_task` effect is durably
  `succeeded`; there is no `reserved`, `started`, or `uncertain` effect. Whole-turn replay remains
  forbidden for both cases.
- Both durable recovery snapshots are valid and complete (`projection_durable_sequence` equals
  `durable_through_sequence`: 71/71 and 88/88). The failure is after snapshot load.

The first local repair inferred that failed partial text needed a stable assistant-message ID. That
inference was wrong: migration `20260804034000_agentic_chat_provider_failure_terminal_events.sql`
deliberately keeps failed partial text in reconnect stream state but forbids inserting it into trusted
assistant conversation history. Only completed turns and cancelled partial turns create assistant
message rows.

Post-deployment evidence from exact revision `42eceb6b0dde65fa0434b767d239c049787ee440`, Railway
deployment `51b6dbdc-dff3-43b9-92ef-cfe20dd1439e`:

- Both candidates still reported `manual_recovery_required` once per minute.
- The new retained error made the introduced mismatch explicit for both rows:
  `agentic_chat_finalize_invalid_assistant_message`.
- Neither production row was mutated.

The correction deployed in revision `d64f3c75fd8d7ba8ba289b4458c7e64ba787a813`, Railway
deployment `d3d99651-dd5c-42a3-8449-8de33f053f9b`. Its first two sweeps, beginning at
`2026-08-20T03:59:23Z`, cleared the assistant-message error and exposed the next shared blocker for
both rows: `agentic_chat_finalize_invalid_tool_counts`.

That invariant is deliberate. Terminal finalization derives tool-call count from the durable ledger,
but requires a worker-owned tool-round count when ledger rows exist. An interrupted process no
longer owns the exact in-memory round count; the database finalizer therefore explicitly accepts
`tool_round_count: 0` for failed/cancelled turns and promotes it to the conservative one-round
fallback when durable ledger rows exist. Stalled recovery omitted the field entirely.

Corrected locally:

- Failed recovery once again carries non-empty reconnect-only text with `assistantMessageId: null`.
  Cancelled partial recovery still receives the stable UUIDv5-shaped message ID required for history.
- `SupabaseAgenticChatExecutionControlAdapter` now enforces that exact status/text/message-ID policy
  before making an RPC, preventing this class of worker/database drift from reaching production.
- Exhausted snapshot/finalize convergence retains the exact last error in the structured report. That
  made the next tool-count blocker directly observable; this slice is not claimed closed until both
  live rows become terminal.
- Stalled failed/cancelled recovery now sends `tool_round_count: 0`, exercising the database's
  designed recovery fallback without inventing an exact count or overriding ledger-derived calls.

Verification:

- Corrected execution-control, recovery-snapshot, and stalled-recovery contract tests: 34/34 passed.
- Full worker suite: 1,078 passed, 1 workflow evaluation skipped.
- Worker TypeScript check passed.
- Focused ESLint passed with zero warnings/errors.
- No production row was manually mutated during diagnosis. The production closure below confirms the
  tool-round recovery repair emitted `terminal_reconciled` for both IDs.

Production closure:

- Revision `7dd1787fbff19e475b7973b20ee920d92f3c4aff` deployed successfully as Railway
  deployment `1368513e-33d0-45e7-ab75-42e0076508fb`.
- Its startup sweep at `2026-08-20T04:30:37Z` processed exactly the two retained reproduction rows.
- Both returned `terminal_reconciled` with `error: null`; `attentionRequiredCount` was zero.
- The stale-turn sweeper deliverable now has a real restart reproduction, bounded repair sequence,
  deterministic tests, and production convergence evidence. No manual row mutation was used.

## Progress — slice 4: executable fencing and stable-effect inventory

The Phase 5 audit found that the individual production writers were already passing the required
turn/queue/token/generation fence and all reviewed adapters were already calling the common mutation
boundary. The weakness was structural: each writer assembled the same four RPC fields independently,
so a future omission depended on review noticing it.

Implemented locally:

- Added one typed `agenticChatGenerationWriteFenceArgsV1` envelope and routed 17 current-generation
  RPC calls through it: effect reserve/begin/reconcile, execution begin/recover/finalize, execution
  observations, prompt snapshots, research/stated-future capture, semantic event persistence,
  delivery acknowledgement, supervisor checkpoints, and all three tool-ledger writes.
- Added an executable Phase 5 audit that locks the expected helper usage across nine writer modules.
  Adding or removing a durable write now requires an explicit inventory decision.
- The same audit discovers every `*MutationAdapter.ts` module and proves it invokes
  `assertMutationAdapterBoundary`, which enforces the stable `effectId`, `chat-effect:<id>` downstream
  key, operation/tool identity, admitted immutable tool surface, and reviewed idempotency class.
- The existing mutation-surface audit still partitions all 39 signed writes into 20 reviewed and 19
  explicitly deferred tools; the all-capabilities assembly test proves every reviewed tool has an
  installed adapter.

Verification:

- 70/70 focused writer/audit tests passed before the terminal-contract correction; the final focused
  terminal/fencing set passes 33/33.
- Full worker suite passes: 1,078 tests passed across 119 files; the one workflow evaluation remains
  intentionally skipped.
- Worker TypeScript check passed.
- Focused ESLint passed with zero warnings/errors.

## Progress — slice 5: typed retry taxonomy and supported uncertain-commit reconciliation

The Phase 2 recovery classes and mutation replay behavior already existed, but their Phase 5 policy
was split across a type union, a second parser list, recovery conditionals, provider-only logs, and
per-adapter booleans. That made it possible for classification or observability to drift without a
single exhaustive contract.

Implemented locally:

- Added one exported runtime inventory for every recovery failure class and one typed Phase 5
  classification: `safe_before_start`, `transient_safe`, `permanent`, `cancelled`, or
  `uncertain_external_commit`.
- Whole-turn recovery now consumes that classifier while retaining the existing boundary gates:
  transient classification alone never authorizes replay after provider start, effect reservation,
  an irreversible boundary, or any durable effect.
- `agentic_chat_typed_execution_failure` now covers input, cancellation, publisher, tool/effect,
  timeout, unknown, and provider failures instead of provider errors only. Every record carries the
  raw failure class, Phase 5 retry classification, execution-started boundary, and bounded error code;
  provider diagnostics remain additive.
- The reliability audit now pins the only two reviewed downstreams that support stable-key replay of
  an ambiguous commit: `create_onto_task` and `create_task_document`. All other 18 reviewed mutation
  tools remain single-attempt and reconcile to `uncertain` when commit truth cannot be proven.
- Existing mutation-executor injection proves supported replay reuses the exact effect/idempotency
  key, while unsupported or unresolved outcomes stop at `uncertain_external_commit` without a second
  downstream write.

Verification:

- Full shared-types suite: 31/31 passed, including exhaustive classification of all ten detailed
  recovery failure classes.
- Focused worker retry/effect/fencing set: 92/92 passed.
- Full worker suite: 1,081 passed across 120 files; the one workflow evaluation remains intentionally
  skipped.
- Shared-types and worker TypeScript checks passed after rebuilding the local shared-types artifact.
- Focused worker ESLint and Prettier checks passed with zero warnings/errors.

## Phase 5 completion push: retention, Realtime outage, and complete failure matrix

Implemented locally on 2026-08-20 as one completion package:

- Added bounded, service-only `cleanup_agentic_chat_worker_artifacts`. Each run independently caps
  durable-event, stream-state, cancel-signal, frozen-input, and effect deletions. Candidate queries
  and row-level delete guards both exclude queued/running turns.
- Locked terminal stream/event/signal/input retention at a minimum seven days. Input deletion also
  respects a later artifact-specific `retain_until`, and event rows now receive the same database
  retention guard that already protected stream state and cancel signals.
- Locked ordinary resolved-effect retention at 30 days and explicit uncertain-reconciliation audit
  retention at 90 days. `started` and `uncertain` effects are never cleanup candidates. A new
  database-owned `uncertain_reconciled_at` timestamp makes the 90-day boundary enforceable; existing
  succeeded/failed rows are conservatively grandfathered onto that longer policy because historical
  rows cannot prove whether they previously passed through `uncertain`.
- Wired worker artifact cleanup into the existing scheduled queue-retention path without coupling it
  to prompt cleanup. A missing/new RPC cannot prevent the already-deployed prompt-artifact cleanup or
  prepared-prompt fallback from running.
- Added a disposable-PostgreSQL proof covering: exact deletion counts, minimum-policy clamping,
  fresh-terminal protection, active-turn protection, unresolved-uncertain preservation, elapsed
  direct/resolved-effect cleanup, frozen-input link clearing, and service-only execution.
- Added persistent Realtime-outage injection. After channel loss, the client reconciles immediately,
  receives unchanged running truth, continues the five-second authenticated watchdog with no
  Broadcast recovery, converges to durable terminal truth, and stops polling.
- Added a 54-case executable Phase 5 coverage ledger. Every master-plan branch is tied to an exact
  worker, web, or disposable-PostgreSQL evidence anchor; removing or renaming an owning proof now
  fails the worker suite instead of silently shrinking the matrix.
- Refreshed the generated database contract for the effect audit timestamp and cleanup RPC.

Deliverable closure:

| Phase 5 deliverable                       | Closure evidence                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| Chat-specific stale-turn sweeper          | Production restart closed both retained orphans as `terminal_reconciled` |
| Complete write fencing audit              | Shared fence envelope + nine-module executable usage inventory           |
| Stable effect-id inventory                | 20 reviewed mutation tools + adapter discovery/boundary audit            |
| Typed retry classification/observability  | Exhaustive ten-class mapping into five Phase 5 decisions                 |
| Supported uncertain-commit reconciliation | Two idempotent downstreams replay by stable effect; 18 fail closed       |
| Graceful shutdown                         | Claims stop before listener close; bounded ordered drain                 |
| Event/snapshot/effect/input retention     | Bounded cleanup RPC + database guards + disposable proof                 |
| Realtime outage + polling fallback        | Persistent-outage terminal-convergence injection                         |
| Operational health endpoint               | Claim/DB/Realtime/active-turn/event-loop signals                         |
| 40+ failure-injection matrix              | 54 unique executable evidence anchors                                    |

The remaining work before Phase 6 is deployment/receipt verification for this final package plus the
separate authorized operator gates already tracked in tasker/50. Those gates are not missing Phase 5
implementation.

Final local verification:

- Full shared-types suite: 31/31 passed across 2 files.
- Full worker suite: 1,081 passed across 120 files; 1 workflow evaluation remains intentionally
  skipped.
- Focused web transport/Realtime/adoption/UI plus retention suite: 141/141 passed across 16 files.
- Disposable-PostgreSQL retention proof: 1/1 passed against a clean migrated database.
- Scheduler retention integration: 15/15 passed, including failure isolation between the new worker
  cleanup and the existing prompt cleanup.
- Shared-types and worker TypeScript checks passed. Full web diagnostics passed with zero errors and
  zero warnings. Focused changed-source ESLint passed with zero errors; the scheduler retains its
  pre-existing warning backlog. Prettier and `git diff --check` passed.

Deployment and receipt order:

1. Apply `20260820010000_agentic_chat_worker_retention_cleanup.sql` before deploying code that calls
   the new RPC. The scheduler is intentionally tolerant of a temporarily missing RPC, so a reversed
   rolling order is non-fatal, but migration-first gives a clean receipt.
2. Deploy shared contracts and the worker scheduler. No routing, cohort, mutation-capability, or
   timeout setting changes are part of this package.
3. Confirm startup retains the configured queue-retention schedule (default `30 3 * * *`) and the
   first scheduled run emits no worker-artifact cleanup error. A zero-deletion run is intentionally
   quiet; the existing queue-cleanup completion line plus absence of the explicit warning is the
   healthy receipt.
4. Re-run the service-only cleanup RPC readback if an immediate database receipt is desired, then
   verify active turns and unresolved `started`/`uncertain` effects remain untouched. Do not shorten
   the database-enforced 7/30/90-day minimums.

### Pre-deployment release audit correction (2026-08-20)

An adversarial second pass found and fixed one deployment blocker before the migration was applied:

- The first retention migration draft backfilled `uncertain_reconciled_at` on existing
  succeeded/failed effects with an ordinary `UPDATE`. Production already has those rows, and the
  existing terminal-effect immutability trigger correctly rejects any update to them. The original
  disposable proof applied the migration before seeding effects, so it could not expose the
  production upgrade failure.
- The migration now runs in an explicit transaction, disables only the effect-transition trigger
  while the table lock is held, performs the one-time conservative metadata backfill, restores the
  trigger, and commits. Concurrent application writes cannot observe the trigger disabled.
- The PostgreSQL runner now seeds an immutable succeeded effect before applying the migration and
  verifies its backfill. It also proves caller-supplied reconciliation timestamps are overwritten by
  the database, direct deletion independently rejects fresh/active/uncertain effects, and a cleanup
  invocation with two eligible rows and batch size one deletes exactly one.
- The 54-case ledger's worker-death-after-reservation entry now points to the real cross-generation
  stable-effect recovery proof rather than the related cancellation-before-begin proof.

Post-correction verification remains green: shared types 31/31 plus build/typecheck; worker 1,081
passed with one intentional skip plus typecheck; focused web/Realtime/PostgreSQL 141/141; full web
diagnostics at zero errors and zero warnings.

## Next exit condition

The master plan's Phase 5 exit gate (line ~946): no failure case leaves an indefinitely active turn;
no stale executor can finalize or mutate after losing ownership; mutating retries don't duplicate
effects; cancellation/completion yields one terminal record in both lock orderings; chat concurrency
stays isolated from general queue saturation; publisher/cancel loops stay within bounds; transport
failures can't start both transports or lose first output; reconnect always converges.

The deterministic gate is complete locally. Grade any later stochastic canary behavior against a
same-day legacy baseline, never a historical number.

## Final production exit receipt — 2026-08-20

- `main` and `origin/main` both resolve to `d2d261e623912f9484f9c85aacde78a71f261b8f`.
- Railway `daily-brief-worker` deployment `bc703782-67af-4abe-bbdf-cec70ca53802` is
  `SUCCESS`/`RUNNING` on that exact revision, with one replica, `/health`, and
  `node apps/worker/dist/index.js`.
- Production health is green for DB claims, Agentic Chat runtime, Realtime, stalled recovery, and
  active-turn state. Startup scheduled retention cleanup at `30 3 * * *`; no worker-artifact cleanup
  error was present.
- Migrations `20260815173000`, `20260817010000`, `20260817020000`, and `20260820010000` have exact
  local/remote history parity after catalog-backed receipt repair. An isolated dry run is up to date.
- Post-deployment verification passed: shared types 31/31 plus typecheck/build; worker 1,081/1,081
  across 120 files plus typecheck; focused Phase 5 worker 20/20; focused web retention/Realtime 12/12.
- The two tasker 50 operator proofs (constraint diff and deliberately over-budget live provider
  canary) are carried into Phase 6 Gate 0. They gate traffic widening, not Phase 5 implementation
  exit.

## Landmines

- **Production is OFF and must stay off** until DJ authorizes: routing exact `false`, cohort exactly
  `76c04859-837c-4d13-88ea-9a39ed15ed81`, both worker mutation-capability lists exact empty strings.
  Any run restores this unconditionally, pass or fail, with an independent read-back.
- **`legacy_sse` mode needs no flag changes at all** and cannot reach the worker — use it freely for
  baselines (handoff §7). Worker-mode runs need explicit DJ authorization every time.
- **Never commit without DJ's approval, always with an explicit pathspec.** The shared worktree
  carries ~116 unrelated modified files.
- **Parallel work:** [55](55-project-organize-contract-review-assertion.md) owns the e2e scenarios;
  [56](56-worker-task-complete-over-clarification.md) owns `readOnlyProvider.ts`. Phase 5 owns the
  reliability/ops modules. Don't edit `readOnlyProvider.ts` without coordinating through DJ.
