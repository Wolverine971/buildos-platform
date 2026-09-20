<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/lane-E-executor.md -->

<!-- doc-status: point-in-time -->

# Lane E — The executor and durable machinery

**Scope.** `apps/worker/src/workers/agentic-chat/turn-executor.ts` (3,971 lines) and the 27 modules
it composes (14,839 lines in the lane), the 32 SQL RPCs they call, and the recovery SQL. Working
tree at HEAD `6d70b36e1` plus the uncommitted 09-08 feedback-kind fix. Read-only; every claim
below cites `file:line` in the working tree. Line numbers are for `apps/worker/src/workers/agentic-chat/`
unless another path is given.

**One-paragraph verdict.** The executor is correct and its correctness core (effect ledger,
generation fences, one terminal CAS) should stay. Its cost is not in correctness: a 3-read + 1-write
turn makes **~72 sequential DB round trips plus ~60 cancellation polls**, of which only **~22 carry
the user's answer**; the rest are delivery acknowledgements nobody reads (17), observation rows
awaited on the tool critical path (14), a pre-read claim fence that duplicates the ledger fence (3),
cosmetic lifecycle events (10), and an O(N²) projection re-sent with every event. Separately,
because every provider pass is fully buffered before release, **the user never sees text stream** —
the final answer lands as a burst after the whole pass finishes (production
`time_to_first_response` p50 6.0 s; `response_generation` p50 12.1 s). Two capability gaps hurt a
weak acting model most: any thrown non-web read error kills the turn instead of being fed back as a
tool error, and any post-write failure other than budget exhaustion ends with "An error occurred
while streaming" and no disclosure of what was written. Resumability (tracker 80 WP-3) is not
reachable from today's persistence: the turn phase, contract SHA and revision counters live only in
a closure, and the recovery RPC refuses every post-start requeue.

---

## 1. How the executor actually runs today (subsystem map)

`AgenticChatTurnExecutor.execute` (turn-executor.ts:340-930) is one method with 18 `let`
state cells plus `terminalContext`, `projection`, two pending arrays, a read-epoch cell and a
`markToolExecution` closure. The phases, in order, and the durable writes each one makes:

| #   | Phase                                       | Code                                                                          | Durable writes (RPC)                                                                                                                                         | Count       |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| 1   | Envelope + claim                            | :342-359                                                                      | `claim_agentic_chat_turn`                                                                                                                                    | 1           |
| 2   | Cancellation registration                   | :393-397                                                                      | none (starts 500 ms poller, cancellationObserver.ts:97)                                                                                                      | 0           |
| 3   | Input load                                  | :432-434, executionInput.ts:145-196                                           | `chat_turn_runs` select, `chat_turn_input_artifacts` select                                                                                                  | 2           |
| 4   | Publisher register + reconcile hint         | :438-465                                                                      | Broadcast only                                                                                                                                               | 0           |
| 5   | Provider prepare                            | :468-489                                                                      | none (liveVision only with attachments)                                                                                                                      | 0           |
| 6   | Start fence                                 | :505-509                                                                      | `begin_agentic_chat_turn_execution`                                                                                                                          | 1           |
| 7   | Lifecycle `acknowledged` event              | :540-545                                                                      | `persist_agentic_chat_semantic_event` + `acknowledge_agentic_chat_stream_delivery`                                                                           | 2           |
| 8   | `session` + `context_usage` snapshot events | :546, :951-985                                                                | 2 × (persist + ack)                                                                                                                                          | 4           |
| 9   | Prompt snapshot (first step)                | :586, :621, :678                                                              | `persist_agentic_chat_prompt_snapshot_v3` (40–100 KB body, no deadline: executorEffects.ts:62-72)                                                            | 1           |
| 10  | Provider pass N                             | provider/openrouter-client.ts:469, :499                                       | 2 × `persist_agentic_chat_provider_attempt_observation` per pass; `agent_state` planning event on the opening pass (provider/turn-provider.ts:1401) = 2 more | 2 (+2)      |
| 11  | Tool round (per read)                       | :1857-2222                                                                    | see §2                                                                                                                                                       | 9 + domain  |
| 11m | Tool round (per mutation)                   | :1330-1600                                                                    | see §2                                                                                                                                                       | 12 + domain |
| 12  | Terminal text integrity + flush             | :789-820                                                                      | text batches: `flush_agentic_chat_text_batches` + ack per batch                                                                                              | 2–4         |
| 13  | Research + stated-future capture            | :822-827                                                                      | `load_agentic_chat_research_capture_evidence` (project ctx, always); stated-future gated by regex                                                            | 1           |
| 14  | Lifecycle `finalizing` event                | :828-833                                                                      | persist + ack                                                                                                                                                | 2           |
| 15  | Finalize                                    | :2757-2980                                                                    | one of 4 `finalize_agentic_chat_turn*` RPCs (executionControl.ts:258-266)                                                                                    | 1           |
| 16  | Committed pre-terminal delivery             | :2934-2960                                                                    | ack per pre-terminal event (2) + terminal ack (1)                                                                                                            | 3           |
| 17  | Queue completion                            | :3164-3199                                                                    | `complete_queue_job`                                                                                                                                         | 1           |
| —   | Cancellation poll, whole turn               | cancellationObserver.ts:97, shared-types `agentic-chat-worker-contract.ts:26` | `observe_agentic_chat_turn_cancellations` every 500 ms                                                                                                       | ~2/s        |

Every stream event goes through one per-turn serialized chain: `publishSemantic` chains on
`projection.semanticPublishTail` (:2517, :2564), the publisher has one busy slot per turn
(streamPublisher.ts:708, :758), and each event is persist → Broadcast → ack (streamPublisher.ts:785-824,
:873-900). Concurrent tool adapters therefore still publish their six events strictly one at a time.

Terminal truth is a single CAS RPC (`finalize_*`) whose receipt is re-validated field-by-field on
the worker (executionControl.ts:457-590), with a one-shot retry without the timing draft when the
RPC rejects (turn-executor.ts:3120-3150). Recovery (`recover`, :2571-2660) and the stalled sweeper
(stalledRecovery.ts:355-455) both converge through `recover_agentic_chat_turn`, which requeues only
pre-start failures (`supabase/migrations/20260802031000_agentic_chat_worker_execution_recovery.sql:472-490`).

Mutations run through `AgenticChatMutationExecutor` (mutation-executor.ts:96-178):
`reserve_agentic_chat_effect` → `begin_agentic_chat_effect` → adapter → `reconcile_agentic_chat_effect`,
then the executor persists the ledger row (`persist_agentic_chat_mutation_tool_execution`,
turn-executor.ts:1466-1490) on a fresh signal so cancellation cannot hide a committed write.

---

## 2. DB round trips per tool round and per turn (3 reads + 1 write)

Counted from the code paths above; "domain" = the read/write's own queries (lane C territory).

### 2.1 One read (`executeReadTool`, :1857-2222)

| Step                                 | Call                                                                                 | Line                                                             | Load-bearing for the answer?                                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fence claim                          | `claim_agentic_chat_turn`                                                            | :1867, :2465-2500                                                | No — the ledger persist receipt already returns `stale_generation / cancel_requested / already_terminal` and throws the same `AgenticChatToolExecutionFenceError` (toolExecution.ts:430-440) |
| `tool_call` event                    | persist + ack                                                                        | :1869-1889                                                       | Persist yes (UI), ack no                                                                                                                                                                     |
| Observation `tool_execution_started` | `persist_agentic_chat_execution_observation`                                         | :1922-1935, awaited before the read runs                         | No                                                                                                                                                                                           |
| Domain read                          | entity select + `actor_has_project_member_access` (+ `users.timezone` once per turn) | tools/execution-adapter.ts:411-420, workerAccessAdapter.ts:73-90 | Yes                                                                                                                                                                                          |
| Ledger row                           | `persist_agentic_chat_read_tool_execution`                                           | :2043-2065                                                       | Yes (terminal truth, memo, next-turn context)                                                                                                                                                |
| Observation `tool_execution_ended`   | observation RPC                                                                      | :2117-2134                                                       | No — duplicates the ledger row's `execution_time_ms`, `tool_name`, `sequence_index`                                                                                                          |
| `tool_result` event                  | persist + ack                                                                        | :2142-2173                                                       | Persist yes, ack no                                                                                                                                                                          |
| **Total**                            | **9 executor RPCs + ~2 domain**                                                      |                                                                  | **3 of 9 executor RPCs load-bearing**                                                                                                                                                        |

### 2.2 One mutation (`executeMutatingTool`, :1330-1600)

`tool_call` event (2) + observation started (1) + reserve (1) + begin (1) + adapter domain (~2) +
reconcile (1) + ledger `persistMutation` (1) + observation ended (1) + `tool_result` event (2) =
**12 executor RPCs + ~2 domain**; load-bearing: reserve/begin/reconcile (could be 2), ledger (1),
tool_call/tool_result persists (2) = 5–6.

### 2.3 Whole turn: 3 reads in one round, 1 write in the next, one final text pass (~30 s)

| Bucket                                                  | RPCs                | Notes                                                                                                                                                        |
| ------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Setup (claim, 2 loads, begin, prompt snapshot)          | 5                   |                                                                                                                                                              |
| Lifecycle + session + context_usage + planning events   | 10                  | 5 persists + 5 acks; the client has session/context data in the artifact already                                                                             |
| Provider attempt observations (3 passes)                | 6                   |                                                                                                                                                              |
| 3 reads                                                 | 27 + 7 domain       | 9 each; fences 3, obs 6, acks 6                                                                                                                              |
| 1 write                                                 | 12 + 2 domain       |                                                                                                                                                              |
| Text delivery                                           | 4                   | Burst-delivered (§4), so ≤2 batches × (flush + ack)                                                                                                          |
| Research capture evidence                               | 1                   | Runs even when no web tool ran (researchCapture.ts:98-119); takes `FOR UPDATE` on the queue row (`20260813030000_agentic_chat_research_capture.sql:159-162`) |
| Finalizing event                                        | 2                   |                                                                                                                                                              |
| Finalize + 3 committed/terminal acks + queue completion | 5                   |                                                                                                                                                              |
| **Subtotal**                                            | **~72 (+9 domain)** |                                                                                                                                                              |
| Cancellation poll @500 ms × 30 s                        | ~60                 | batched across active turns, but 1 RPC per tick regardless                                                                                                   |
| **Total**                                               | **~132**            |                                                                                                                                                              |

Of the 72: acks 17, observations 14, fence claims 3, cosmetic events 5 persists, prompt snapshot 1,
research evidence 1 → **41 non-load-bearing**, plus the 60 polls. At 40–80 ms per Railway→Supabase
RPC and with the per-turn publisher chain serialized, this is consistent with the 09-02 evidence of
**~7 s p50 of non-model time inside the loop** (`agentic-chat-turn-executor-audit-2026-09-02/evidence/evidence-notes.md:27-31`).
For a cheap model whose final answer generates in ~12 s, the harness adds more than half again.

---

## 3. Module-by-module: what failure each prevents, whether it is observed, and the minimal version

| Module (lines)                                                                                                                                                                                                                         | Failure prevented                                                                                                                         | Observed in production?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Minimal version                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `executionControl.ts` (947)                                                                                                                                                                                                            | Claim/begin/recover/finalize protocol; generation fences                                                                                  | Yes — fences are how superseded turns die cleanly                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Keep RPC adapter (:110-320). Delete the pre-terminal receipt re-validators `isLastTurnContextReceipt` / `isTimingReceipt` / `isErrorReceipt` / micro-timestamp diffing (:593-760, :878-890; 296 lines): they check the DB's echo of what we just sent, and the same contract on the DB side already rejected a live turn (1422ffc3, tasker/50:163-172). ~650 lines. |
| `effectControl.ts` (326) + `mutation-executor.ts` (315)                                                                                                                                                                                | Duplicate/uncertain writes; replay by stable `effectId`                                                                                   | Design-level; `uncertain_external_commit` never in any battery artifact (0 hits in 4 `-runs.json`) but the fence is what makes that true                                                                                                                                                                                                                                                                                                                                                                     | Keep. Merge `reserve`+`begin` into one RPC (always adjacent, mutation-executor.ts:118-140) — saves 1 RPC per write.                                                                                                                                                                                                                                                 |
| `toolExecution.ts` (449)                                                                                                                                                                                                               | Ledger row = terminal truth for tool calls; fence on persist                                                                              | Yes, load-bearing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Keep. It is already the read fence; §5 E3 removes the duplicate claim.                                                                                                                                                                                                                                                                                              |
| `toolExecutionGraph.ts` (611) + `toolExecutionPolicy.ts` (93) + sidecar (tool-surface.ts:196-268) + batching message (request-builders.ts:54, 581 chars ≈145 tokens) + `readPlanningTelemetry.ts` (133) + graph telemetry (:1195-1245) | Parallel reads; model-ordered same-batch writes; conflicting writes serialized                                                            | Parallel reads yes. Multi-mutation batches: 3 of 60 battery turns, all the "create exactly five tasks" case (`postdeploy-*-runs.json` aadd9245, 0784af15, b824405c) — five `create_onto_task` on one `project_id`, which `ROW_LOCAL_MUTATIONS` (toolExecutionPolicy.ts:21-35) marks as a write on `project:<id>` so `workerConflictKey` (toolExecutionGraph.ts:466-484) **serializes them anyway**. `after` carries no output substitution (only ordering), so a dependent write still needs a second round. | "Reads concurrently (limit 4), then mutations in provider order" ≈ 40 lines; drop `call_ref`/`after`, the batching message, and two failure codes (`provider_tool_execution_graph_invalid`, `provider_tool_scheduling_invalid`).                                                                                                                                    |
| `streamPublisher.ts` (1,299) + adapters (292)                                                                                                                                                                                          | Ordered durable stream; backpressure; Broadcast degradation → reconcile                                                                   | Ordering yes. `publisher_overload` never observed (0 in artifacts; not in the 14-day failure-code list). Reconcile-only fallback: designed for Realtime outages; no evidence either way.                                                                                                                                                                                                                                                                                                                     | persist → Broadcast per event, one slot per turn, no ack RPC, no soft/hard pressure tiers, no pressure waiters, no reconcile hints, no worker snapshot ≈ 350 lines. Text batching stays (it is the DB write bound).                                                                                                                                                 |
| `stalledRecovery.ts` (673) + `recoverySnapshot.ts` (380)                                                                                                                                                                               | Slot held forever when the process dies without a terminal                                                                                | Yes — twice on 2026-08-06 (tasker/50:163-200), **both self-inflicted** by strict validators (timing evidence mismatch; ledger 23514), and both before `finalizeWithTimingFallback` existed                                                                                                                                                                                                                                                                                                                   | Health state machine (:270-300), per-row candidate callbacks, drain/stop ≈ 300 lines of scaffolding. Minimal: a SQL `sweep_stalled_agentic_chat_turns()` on pg_cron that calls `recover` + the base `finalize` — 0 worker lines — or trim to sweep + converge (~250).                                                                                               |
| `cancellationObserver.ts` (307)                                                                                                                                                                                                        | Prompt abort of an in-flight provider stream on user cancel                                                                               | Cancel is rare (2 of 296 turns in 14 d)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Keep, poll at 2 s. The DB corrects classification anyway (`recover` returns `finalize_cancelled` whenever `cancel_requested_at` is set, recovery.sql:429-443), so the poller's only unique value is abort latency.                                                                                                                                                  |
| `statedFutureCapture.ts` (490) + SQL `20260813040000` + runtime helpers                                                                                                                                                                | User says "waiting to hear back" in a project, model updates something but creates nothing → a task is auto-created from the user's words | No evidence it has ever fired (no `stated_future_capture` source in any artifact). Trigger = 4 regexes (`packages/agentic-chat-runtime/src/loop/repair-instructions.ts:114-119`) ∧ project ctx ∧ successful write ∧ no create.                                                                                                                                                                                                                                                                               | Delete. If the behaviour is wanted, it is one prompt line; a deterministic auto-created task the user did not ask for is also a UX decision (E13).                                                                                                                                                                                                                  |
| `researchCapture.ts` (356) + SQL                                                                                                                                                                                                       | Web research evidence appended to a Research Log document                                                                                 | Yes when research happens (`research-postdeploy-2026-09-08.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                              | Keep, but gate on `terminalContext.toolExecutions` having a `web_search`/`web_visit` before the RPC (E12).                                                                                                                                                                                                                                                          |
| `liveVision.ts` (455)                                                                                                                                                                                                                  | An image swapped in Storage between admission and execution reaching the model                                                            | Not observed; single-tenant workspace                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | One signed URL with transform; trust the artifact's checksum, or a HEAD content-length check. Today: 2 signed URLs + full GET + SHA-256 + `onto_assets` lookup + observation per image (:205-237, :345-406).                                                                                                                                                        |
| `runtimeTiming.ts` (382) + `timingPayload.ts` (243) + executionControl timing receipts (part of the 296) + SQL `20260804000120` (431) + `20260806020000` (362)                                                                         | A `timing` terminal event with phase durations                                                                                            | Used for the 09-02 latency evidence — valuable data, but the cross-validation killed a turn                                                                                                                                                                                                                                                                                                                                                                                                                  | Compute the draft on the worker, store as opaque jsonb in the same finalize RPC, no DB-side evidence matching, no worker-side echo matching; 4 finalize RPC variants → 1.                                                                                                                                                                                           |
| `promptSnapshot.ts` (342)                                                                                                                                                                                                              | Exact first-pass prompt for admin/eval                                                                                                    | Yes, used by the admin UI and every audit                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Keep; make the write fire-and-forget with a deadline (today awaited inline in the step loop with no timeout, turn-executor.ts:586, executorEffects.ts:62-72).                                                                                                                                                                                                       |
| `executionObservation.ts` (188)                                                                                                                                                                                                        | Per-tool and per-pass start/end rows for forensics                                                                                        | Used by 08-06 canary forensics (tasker/50:184-188)                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Fold `graph_layer_*`, `read_epoch`, `memo_served` into the ledger row; keep only provider attempt observations. `started` rows exist to catch a hung tool — the 30 s tool deadline already bounds that.                                                                                                                                                             |
| `executorEffects.ts` (143)                                                                                                                                                                                                             | One never-fatal policy for 6 side-effect ports                                                                                            | Good design                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Keep.                                                                                                                                                                                                                                                                                                                                                               |
| `capacity.ts`, `consumerRuntime.ts`, `bootstrap.ts`, `composition-root.ts`, `config.ts`                                                                                                                                                | Process ownership, health, wiring, 24 env knobs                                                                                           | Fine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Keep.                                                                                                                                                                                                                                                                                                                                                               |

---

## 4. Streaming: the provider pass is atomic, so the user sees no tokens until the pass ends

`streamBufferedProviderPass` (provider/provider-pass.ts:31-124) buffers **every** event of a pass and
replays them only after `done` (:118-122); all three provider loops go through it
(provider/turn-provider.ts:1114, :1185, :1595, :1740). The publisher's 150 ms text batching,
`urgent` first-delta path, and soft-pressure machinery (streamPublisher.ts:382-437) were designed
for live deltas that never arrive live: when the buffered pass releases, all deltas are enqueued in
one microtask burst and coalesce into ≤2 batches. Production confirms it: `time_to_first_response`
p50 6.0 s (the opening pass's full duration) and `response_generation` p50 12.1 s
(evidence-notes.md:27-31) — the final answer appears ~12 s after the last tool round, all at once.

What the buffer buys: a clean retry when a pass fails mid-stream or returns truncated tool calls
(:41-66, :93-105). Lane I counts 25 failed acting passes in 48 turns, every one recovered by the
retry (`lane-I-live-evidence.md:141-143`) — the mechanism is load-bearing for tool-enabled passes on
the cheap route. But most of those failures are pre-stream (404 `No endpoints found`, 429), and on
a text-only pass (`toolChoice: 'none'`) the truncation check is inert (`detectToolCallPassTruncation`
returns null, provider/stream-tool-calls.ts:180).

This is a product fork, not a code fork (E6): stream live and accept a visible "restart" on the
~5 % of turns where a text pass dies mid-stream, or keep the burst. The lean, zero-risk half is to
stream `toolChoice: 'none'` passes live; the ambitious half is to release text eagerly on `auto`
passes and, on a retry after text was released, send a `text_reset` event the client already has
the reconcile machinery to honour.

---

## 5. Executor ↔ provider boundary: the same result is validated three times in one process

The 09-08 crash (`artifacts/agentic-chat-research-postdeploy-2026-09-08.md`) was
`validateToolFeedback` (provider/feedback.ts:36-88) rejecting the executor's own
`known_execution_failure` for a read because the contract said only mutations may fail that way
(`call.kind !== 'mutation'` removed in the working-tree diff at feedback.ts:62). Both sides are
worker code in the same process; the executor built the failure two hundred lines away
(turn-executor.ts:2225-2333). The pattern repeats:

| Data                                                                                                                                        | Validated by                                                                                                                                                                           | Where                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Provider-built step ids (`callTransitionId`, `resultTransitionId`, `logicalOperationId`, `providerToolCallId`, `toolName`, `operationName`) | executor, as if from an untrusted fixture                                                                                                                                              | turn-executor.ts:1343-1353, :1866-1870, :2510-2516 (6 `canonicalUuid` asserts, 27 `throw new Error('Fixture …')` sites) |
| Read result shape (`result` object, `affectedEntities`, `resultCount`↔`zeroResult` consistency, `toolCategory` ≤128, `requiresUserAction`) | executor `validateReadToolExecution` (:3567-3615), ledger `validateInput` (toolExecution.ts:258-300), provider `validateToolFeedback` (feedback.ts:36-88)                              | three copies of the same predicate                                                                                      |
| Memo-served result                                                                                                                          | executor `validateMemoServedExecution` (:3617-3626) re-checks what provider `resolveMemoServedExecution` (feedback.ts:174-198) just built                                              |                                                                                                                         |
| Arguments / result canonical JSON                                                                                                           | `canonicalizeAgenticChatJson` on the same 480 KB-max payload: execution-adapter.ts:531, toolExecution.ts:262-263, feedback.ts:41 and :74, memoizeCompletedRead                         | ≥4 passes per read                                                                                                      |
| Finalize receipt                                                                                                                            | executionControl.ts:457-590 re-derives event ids, sequence arithmetic, canonical JSON equality of the draft, and microsecond `total_request_ms` equality (:717) against the RPC's echo | duplicate of the RPC's own trigger-enforced invariants                                                                  |

Cheap-model impact: none of these checks can catch a model mistake — they catch harness mistakes,
and when they fire the user gets "An error occurred while streaming" with no retry (the 09-08 crash
took a research turn down after successful searches). One boundary should own each shape: the
ledger port for tool results (it is the durability boundary), the RPC for terminal receipts. The
provider should accept the executor's typed value.

---

## 6. Concurrency: what a real batch looks like

- 60 battery turns across four post-deploy runs: 174 read calls, 28 write calls; 16 turns with a
  write; **3 turns with more than one write, all the same five-independent-creates scenario**
  (§3 table row). Reads batch (3 parallel document reads are common). Those five creates share a
  `project_id` write resource and are serialized by the worker's own conflict rule, so the DAG
  produced five layers of one call — exactly what "run mutations in order" produces without a DAG.
- `after` is ordering-only (toolExecutionGraph.ts:401-440); there is no way to feed a created id
  into a dependent call in the same batch, so the batching message itself tells the model to wait
  a round (request-builders.ts:54). The sidecar is mounted only on contract carve-out and completion
  surfaces (turn-phase.ts:325-327), i.e. on the passes a weak model already struggles with, and it
  adds two optional parameters to every write tool there plus a 145-token system message.
- Lane I measured "Dependency edges ever saved by the battery: 0 of 15 requested" — the one battery
  case that wants intra-batch dependencies never gets them from this machinery.

Verdict: the ~930 lines (graph 611 + policy 93 + sidecar ~70 + telemetry 133 + executor glue ~50)
buy parallel reads, which a 40-line "reads concurrently, then mutations in order" gives for free,
and preserve the only invariant that matters (reads in a layer with a mutation see the
pre-mutation snapshot, turn-executor.ts:1495-1500 — trivially true when reads run first).

---

## 7. Resumability (tracker 80 WP-3): what it would actually take

**What is durable today.** Frozen input artifact; `chat_tool_executions` rows with arguments,
results, `sequence_index` and `logical_provider_round` (persisted before the result is fed back);
`chat_turn_effects` with stable `effectId` (replay returns `succeeded`, mutation-executor.ts:125-136);
`chat_turn_stream_state.assistant_text` + projection; the opening prompt snapshot.

**What is not.** Everything `AgenticChatTurnProviderAdapter.prepare` holds in its closure
(provider/turn-provider.ts:290-360): `phase` (advanced only in memory, :338-340), `turnContract`,
`pendingContractReviewSha256`, `approvedContractSha256`, `pendingProposalRevision`,
`contractRevisionCount`, `readOnlyRoundCount`, `readLoopRepairRank`, `providerPassCount`,
`currentRequest` (the message list incl. assistant tool-call turns), read memo, seen/resolved
entity maps, label bindings. Nothing writes the phase anywhere.

**What blocks it in SQL.** `recover_agentic_chat_turn` requeues only when
`execution_started_at IS NULL AND mutation_reserved_at IS NULL AND irreversible_boundary_at IS NULL AND effect_count = 0`
(recovery.sql:476-490); every post-start class returns `finalize_failed`. The stream-state trigger
already supports a generation bump with a reset (`20260802033000…stream_write_foundation.sql:114-125`)
and the publisher already accepts `initialAssistantText` / `initialSequence` on register
(streamPublisher.ts:315-345) — hooks the executor never passes (turn-executor.ts:448-460).

**Lean path (pre-write resume, ~1 day of code, 1 migration).**

1. Migration: allow post-start requeue when `blocking_effect_count = 0` and `cancel_requested_at IS NULL`,
   bumping `execution_generation` and preserving `chat_tool_executions` rows of prior generations.
2. Executor: on `claim.executionGeneration > 1` with `execution_started_at` set, load prior ledger
   rows into `terminalContext.toolExecutions` (so partial disclosure and `last_turn_context` stay
   right) and register the publisher with the stream-state prefix.
3. Provider: rebuild `currentRequest` from artifact prompt + ledger rows as
   `[assistant{tool_calls}, tool{result}]` pairs per `logical_provider_round`; derive
   `readOnlyRoundCount`, `providerToolCallCount`, `nextProviderRound`, seen-entity maps from the same rows.
4. Persist `phase`, contract SHA, approved SHA and `contractRevisionCount` on the run row at each
   `advance()` — one small UPDATE per transition (≤6 per turn), or ride the next ledger persist.

**Ambitious (across mutation rounds).** Nothing extra in the ledger: same `logicalOperationId`
(f(turnRunId, round, callIndex)) → same `effectId` → reserve replays `succeeded`. The only new
requirement is that the rebuilt round numbering matches, which step 3 guarantees.

**Is current phase persistence enough?** No. The 09-02 refactor made the phase a value but never
wrote it; today a worker restart mid-turn is `finalize_failed` with "An error occurred while
streaming" regardless of how much was done.

---

## 8. Counts

| Metric                                                                                                                                                                         | Value                                                                                                                                                                  | How                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Lane source lines (28 files)                                                                                                                                                   | 14,839                                                                                                                                                                 | `wc -l`                                                      |
| Observability-only modules (runtimeTiming, timingPayload, executionObservation, promptSnapshot, promptDump, researchCapture, statedFutureCapture, liveVision, executorEffects) | 2,795 lines                                                                                                                                                            | `wc -l`                                                      |
| Terminal-family SQL (6 migrations)                                                                                                                                             | 2,480 lines                                                                                                                                                            | `wc -l`                                                      |
| All `*agentic_chat*` SQL                                                                                                                                                       | 20,373 lines / 87 files                                                                                                                                                | `wc -l`, `ls`                                                |
| Distinct RPCs called from the lane                                                                                                                                             | 32                                                                                                                                                                     | grep union (`evidence/` scratch `rpcs.txt`)                  |
| Exported error classes across lane files + provider contracts                                                                                                                  | 30                                                                                                                                                                     | `grep -E "^export class .*Error"`                            |
| `let` cells in `execute()` (:340-930)                                                                                                                                          | 18 (+ `terminalContext`, `projection`, 2 pending arrays, `readInvalidationEpoch`, `markToolExecution`)                                                                 | grep                                                         |
| Distinct `AgenticChatProviderExecutionError` codes thrown in provider/ + tools/ + executor                                                                                     | 52                                                                                                                                                                     | grep union                                                   |
| Recovery failure classes                                                                                                                                                       | 10                                                                                                                                                                     | `AGENTIC_CHAT_RECOVERY_FAILURE_CLASSES_V1`                   |
| Durable stream event types published                                                                                                                                           | 12: `turn_phase`, `session`, `context_usage`, `agent_state`, `tool_call`, `tool_result`, `context_shift`, `text_delta`, `last_turn_context`, `timing`, `error`, `done` | executor `eventType:` sites + provider steps + finalize RPCs |
| Observation event types                                                                                                                                                        | 5                                                                                                                                                                      | executionObservation.ts:22-27                                |
| Finalize RPC variants                                                                                                                                                          | 4                                                                                                                                                                      | executionControl.ts:258-266                                  |
| Env knobs in config.ts                                                                                                                                                         | 24                                                                                                                                                                     | grep                                                         |
| Executor 'Fixture …' validation throws / `canonicalUuid` asserts on provider steps                                                                                             | 27 / 6                                                                                                                                                                 | grep                                                         |
| Executor test file                                                                                                                                                             | 5,362 lines, 71 `it`                                                                                                                                                   | wc/grep                                                      |
| Lane tests (publisher 18, stalled 15, graph 20, statedFuture 7, research 3, liveVision 8, executionControl 15)                                                                 | 86 `it` in 3,818 lines                                                                                                                                                 | wc/grep                                                      |
| Projection bytes sent for 20 events × 10 KB payloads                                                                                                                           | 2,318 KB (linear would be 400 KB); 60 × 8 KB → 15.3 MB and a 480 KB last projection against a 512 KB cap                                                               | node one-liner                                               |
| Batching system message                                                                                                                                                        | 581 chars ≈ 145 tokens                                                                                                                                                 | node                                                         |

---

## 9. Findings

Severity is against DJ's thesis (cheap acting model, harness carries it). "Delete" = dead or
redundant; "Simplify" = load-bearing but heavier than needed; "Add" = capability gap.

### E1 — Per-event delivery acknowledgement RPC that nothing reads (P1, delete)

Every persisted stream event is followed by `acknowledge_agentic_chat_stream_delivery`
(streamPublisher.ts:824, :873-900; text batches :739; terminal :553), which flips
`chat_turn_stream_state.reconcile_required` to false under three `FOR UPDATE` locks
(`20260802034000…stream_delivery_ack.sql:46-153`). No consumer branches on the flag: the web
coordinator only folds it into a change fingerprint (`apps/web/src/lib/services/agentic-chat-v2/worker-realtime-coordinator.ts:435-441`),
the inbox and reconciliation server only type-check it (:480, reconciliation.server.ts:142), and
the only SQL readers are the ack RPC itself and the generation-reset trigger, which the claim RPC
already satisfies (`20260802020100…claim_fencing.sql:214-221`). **Cost:** 17 of 72 RPCs on the
model turn, each on the serialized per-turn chain. **Cheap-model impact:** pure latency; every tool
round pays ~6 × ~60 ms before the next provider pass can start. **Fix:** delete `acknowledge` and
the `reconcile_required` clear; drop the column later. **Invariant:** none of the stream-state
trigger's ordering rules depend on it; the executor test suite's broadcast-order assertions
(`agenticChatTurnExecutor.test.ts:836-846`) guard delivery order.

### E2 — Observation rows on the tool critical path (P1, simplify)

`observeToolExecution` is awaited before a read runs (:1922-1935) and after it (:2117-2134), and
around every mutation (:1363-1376, :1509-1526); the provider adds two per pass
(openrouter-client.ts:469, :499). 14 RPCs per model turn, 5 s deadline each. The `ended` row
duplicates the ledger row; the planning fields (`graph_layer_*`, `read_epoch`, `memo_served`,
`exact_read_key`) are the only unique data (:2425-2455). **Cheap-model impact:** a weak model that
takes 5–8 passes with one tool each (lane I §3.10) pays this 10–16 times per turn. **Fix:** put
the planning fields on `persist_agentic_chat_read_tool_execution` / `…mutation_tool_execution`
(one migration), drop `tool_execution_started/ended`, keep provider attempt observations but fire
them without awaiting. **Invariant:** the 08-06 forensics use case (tool that never ends) is
covered by the 30 s tool deadline and the ledger `failure` row.

### E3 — Pre-read claim fence duplicates the ledger fence (P2, delete)

`assertCurrentReadToolFence` (:1867, :2465-2500) spends one `claim_agentic_chat_turn` RPC per read
to learn what `persistRead`'s receipt already reports and throws identically
(toolExecution.ts:430-440 → `AgenticChatToolExecutionFenceError`). Reads are side-effect-free; the
only externally visible reads (web/email) are already policy-gated. 3 RPCs per 3-read round.
**Fix:** delete the call; keep the fence in the ledger receipt. **Invariant:** "no durable row after
ownership loss" — held by the ledger RPC's own generation check.

### E4 — O(N²) projection and full assistant text re-sent on every event; 512 KB ceiling is a latent turn killer (P1, bug + cost)

`publishSemantic` pushes the full event (including the complete tool result) into
`projection.semanticEvents` and sends the whole array with every event (:2542, :2553; 128-event cap
:114), and text batches carry the whole `assistant_text` so far (streamPublisher.ts:411, :1127).
Measured: 20 events × 10 KB → 2.3 MB sent instead of 0.4 MB; 60 × 8 KB → 15 MB and a 480 KB last
projection. `validateSemanticInput` throws a plain `Error` above 512 KB (streamPublisher.ts:1258-1262)
→ `classifyFailure` → `unknown` → the turn fails after doing the work. The organize battery turns
(22–34 tool calls, 200–445 k prompt tokens, evidence-notes.md:41) are the shape that reaches it.
**Cheap-model impact:** the model that over-reads (lane I §3.11, 11–18 reads) is the one that
dies here. **Fix:** persist events as rows only (they already are, `chat_turn_events`) and let
`reconcile_agentic_chat_turn` build the projection; or keep the projection but store tool results
by reference (`tool_execution_id`) instead of by value. **Invariant:** the web adapter's
projection parse (`agent-chat-worker-ui-adapter.ts:256-278`) must still see ordered events on
reconnect.

### E5 — Cancellation poll at 500 ms (P2, config)

`observe_agentic_chat_turn_cancellations` runs every 500 ms while any turn is registered
(cancellationObserver.ts:97; interval in `agentic-chat-worker-contract.ts:26`) — ~60 RPCs on a
30 s turn, ~200 on a 100 s write turn. Cancels are 2 of 296 turns in 14 days. The DB corrects the
terminal outcome regardless (`recover` returns `finalize_cancelled` when `cancel_requested_at` is
set), so the poller's unique value is provider-stream abort latency. **Fix:** 2 s interval (a
user-visible cancel takes ≤2 s instead of ≤0.5 s). **Invariant:** none; the classification path
is unchanged.

### E6 — Atomic buffered passes mean no live streaming (P1, architecture; decision for DJ)

See §4. `provider-pass.ts:31-124` holds every event until `done`; the user sees "Processing…" for
the whole pass and then a burst. The buffer is load-bearing for tool-enabled passes on the cheap
route (25/48 turns needed a retry, lane I §3.9). **Cheap-model impact:** the thesis' cost
advantage is invisible to the user when a 12 s answer appears as a wall of text at second 12; the
perceived latency of a DeepSeek turn is the _sum_ of its passes, not the time to first token.
**Fork:** (lean) stream `toolChoice:'none'` passes live — no correctness change, covers forced
synthesis passes; (ambitious) release text eagerly on `auto` passes and emit a `text_reset` event
on retry, accepting a visible restart on ~5 % of turns. **Invariant:** a retried pass must never
duplicate already-delivered text without the client being told.

### E7 — Any thrown non-web read error kills the turn (P1, add)

`executeReadTool` feeds a failure back to the model only for `web_search`/`web_visit` and the two
egress-policy codes (:1993-2011; test `agenticChatTurnExecutor.test.ts:848-857` covers exactly
those). Every other throw from a shared read — `AgenticChatToolAccessDeniedError` on a hallucinated
or foreign `project_id` (workerAccessAdapter.ts:79-88), argument throws like
`'project_id is required for get_document_tree'` (`packages/agentic-chat-runtime/src/tools/ontology-structure-reads.ts:81-161`,
`ontology-search.ts:449-504`, `overview-reads.ts:260-388`), calendar/email errors, DB errors — is
mapped to `read_tool_execution_failed` (execution-adapter.ts:520-528) and re-thrown → terminal
`failed`, "An error occurred while streaming." The mutation path already does the right thing
(`persistKnownMutationFailure`, :1608-1717). Production: `read_tool_execution_failed` ×2 in 14 days
(evidence-notes.md:20); the weak model that guesses ids will raise the rate. **Fix:** route every
`permanent`/`unknown` read failure through `persistRecoverableReadFailure` with the adapter's
message as the model payload; keep `transient_infra` + ownership/cancellation as terminal.
**Invariant:** failure rows still persist (`failureKind: 'read_failure'`) so the next turn's context
sees the attempt.

### E8 — Partial-fulfilment completion only for budget exhaustion (P1, add)

`finalizeBudgetExhaustedAfterDurableWrites` runs only when `failureClass === 'timeout_post_start'
&& providerBudget.signal.aborted` (:855-877). A provider stream error after retry, a read timeout,
a ledger timeout, or E7's read throw after two of six moves committed still ends `failed`, without
`last_turn_context` (`includesTerminalEventPair` is completed/cancelled only, :2809-2816) and with
the generic error. The DB pending-contract trigger recomputes from tool rows, but the user is told
nothing was done. **Fix:** apply the same "durable writes exist → complete with disclosure" lane to
every post-start failure class except `cancelled`, `publisher_overload`, and
`uncertain_external_commit`. **Invariant:** never complete over an uncertain effect (already
enforced by `hasSuccessfulDurableEffects` + the effect ledger).

### E9 — Tool execution DAG, policy, and call_ref/after sidecar (P2, simplify)

See §6. ~930 lines, 145-token system message on multi-write passes, two extra optional parameters
per write tool there, two failure codes a malformed `after` can trigger, and the only real
multi-write batch is serialized by the worker's own rule. **Cheap-model impact:** more optional
parameters and a scheduling vocabulary on the hardest passes; `provider_tool_scheduling_invalid`
is a turn-killer with no model-visible repair. **Fix:** reads with a concurrency limit, then
mutations in provider order; drop the sidecar, the message, `readPlanningTelemetry.ts`, and the
graph telemetry. Optional 10-line keep: run `ROW_LOCAL_MUTATIONS` on distinct row keys
concurrently. **Invariant:** reads before mutations in a round see the pre-mutation snapshot;
`readInvalidationEpoch` semantics (:1495-1500) preserved by ordering.

### E10 — reserve + begin are always adjacent (P3, simplify)

mutation-executor.ts:118-140: `reserve` then `begin` with only an abort check between. One
`reserve_and_begin_agentic_chat_effect` RPC saves one round trip per write and keeps both states
(the SQL still transitions reserved→started inside one transaction). **Invariant:** the effect
state machine (`20260801041000…:136-142`) and `mutation_reserved_at`/`irreversible_boundary_at`
stamps.

### E11 — Terminal timing: ~1,700 lines and four finalize RPCs for one observability event (P2, simplify)

runtimeTiming.ts (382) + timingPayload.ts (243) + executionControl receipt validators (:593-760,
:878-890) + SQL (`20260804000120` 431, `20260806020000` 362) + `finalizeWithTimingFallback`
(:3120-3150) + the 4-way RPC selector (executionControl.ts:258-266). The DB validator matches the
worker's monotonic-clock draft against DB wall-clock rows and rejected a live turn (1422ffc3); the
worker then re-validates the DB's echo to the microsecond (:717). **Fix:** one finalize RPC with
optional opaque `p_timing jsonb`, no cross-validation either way; delete the three receipt
validators. **Invariant:** the `done` event id / sequence contract (kept in `parseFinalizeReceipt`
:457-500 minus the pre-terminal clauses).

### E12 — Research-capture evidence RPC on every project turn (P3, simplify)

researchCapture.ts:98-119 calls `load_agentic_chat_research_capture_evidence` whenever the context
has a `projectId`, before knowing whether any web tool ran; the RPC locks the queue row
(`20260813030000…:159-162`) and counts `chat_tool_executions`. The executor has
`terminalContext.toolExecutions` in memory at the call site (:822). **Fix:** skip unless a
`web_search`/`web_visit` succeeded this turn. Saves 1 locked RPC on ~95 % of project turns.

### E13 — statedFutureCapture: 490 lines for an auto-created task nobody asked for (P3, delete; decision for DJ)

Trigger is four regexes ∧ project ∧ a successful write ∧ no create
(statedFutureCapture.ts:118-136; patterns `repair-instructions.ts:114-119`), then a full effect
cycle (`ensure_actor_for_user` + `onto_task_create_atomic`) creates a task titled with the user's
clause and a description "BuildOS saved it" (`packages/agentic-chat-runtime/src/loop/stated-future-capture.ts:15-27`).
No artifact shows it firing. It is also the one place the harness writes without the model or the
user deciding to. **Fix:** delete module, SQL `20260813040000`, runtime helpers, 7 tests; if wanted,
one prompt sentence. **Decision:** whether BuildOS should ever auto-create from phrasing.

### E14 — liveVision downloads and hashes every image before the opening pass (P3, simplify)

liveVision.ts:205-237, :345-406: signed URL → full GET → SHA-256 → second signed URL, plus an
`onto_assets` row check (:154-203) and an observation row (:262-310), per image, inline before the
provider call. The artifact already froze `checksum_sha256` and `file_size_bytes` at admission; the
threat is a swap in the user's own Storage between admission and execution. **Fix:** one signed URL
with transform; optionally a HEAD content-length check. **Invariant:** never send a non-image or an
over-limit file — keep `assessAgenticChatLiveVisionEligibilityV1` (:106-110).

### E15 — Stalled sweeper as an in-process subsystem (P3, simplify)

stalledRecovery.ts (673) + recoverySnapshot.ts (380). Its two production firings were caused by the
executor's own strict validators (tasker/50:163-200), both since mitigated. The DB holds every input
it needs. **Fix:** a SQL sweep on pg*cron calling `recover_agentic_chat_turn` and the base
`finalize_agentic_chat_turn` for `finalize*\*` outcomes; or trim the health/candidate scaffolding to
sweep + converge (~250 lines). **Invariant:** exactly-once terminal via the same CAS RPCs.

### E16 — streamPublisher at 1,299 lines (P2, simplify)

Soft/hard pressure tiers, pressure waiters, `reconcileHint` throttling, three-attempt terminal
broadcast, worker-wide snapshot, metrics — for a stream that, given §4, receives text in ≤2 bursts
per pass and whose overload path has never fired. With E1 gone the class is persist → Broadcast per
event with one slot per turn and the DB write bounds. **Fix:** ~350-line publisher; keep
`abandonTurn` semantics and terminal-after-drain. **Invariant:** per-turn event order; terminal
published only after every prior event is durable (turn-executor.ts:2774-2780 relies on `pendingEvents`).

### E17 — Triple validation across the executor↔provider↔ledger boundary (P2, simplify; bug class of 09-08)

See §5. **Fix:** ledger port owns tool-result shape; provider trusts executor's typed feedback (drop
`validateToolFeedback`'s shape/kind rules, keep only the id/arguments identity check); delete the 27
"Fixture" throws on provider-built steps (or move them behind a test-only flag). **Invariant:**
`providerToolCallId` ↔ result pairing (the one check that guards against a real bug: a result fed to
the wrong call).

### E18 — Resumability needs phase persistence and a post-start requeue path (P2, add)

See §7. Today's persistence is not enough; the lean path is four steps and one migration.
**Invariant:** never re-invoke an adapter for an effect whose state is not terminal (already the
recovery RPC's `blocking_effect_count` rule).

### E19 — `recover_agentic_chat_turn` has no single source of truth (P3, architecture)

The live body is the 08-02 definition (`20260802031000…:213-560`) string-patched by
`20260825161846` (:60-103) and `20260902150000` (:24-63) via `pg_get_functiondef` + `replace`. The
repo cannot show the current function; the 09-02 lane report cites line numbers that no longer
correspond. **Fix:** one `CREATE OR REPLACE` with the merged body on the next recovery change;
tracker 80 WP-0 already proves the live body by probe.

### E20 — Five cosmetic stream events per turn (P3, delete)

`acknowledged`/`finalizing` lifecycle (:540-545, :828-833), `session` and `context_usage`
snapshots (:951-985), and the opening `agent_state` planning event — 10 RPCs to publish data the
client either already holds in the artifact or cannot see under burst delivery. **Fix:** publish
`session`/`context_usage` from the web at admission; drop `finalizing`; keep `acknowledged` as a
Broadcast-only hint. **Invariant:** the client's "queued → running" transition is already covered
by `publishReconcileHint` (:463-465).

### E21 — Prompt snapshot awaited inline with no deadline (P3, bug)

`persistPromptSnapshot` is awaited inside the step loop on the first text/tool step (:586, :621,
:678); `executorEffects.persistPromptSnapshot` wraps it in `abortable` without a timeout
(executorEffects.ts:62-72). A slow 100 KB write stalls replay of the already-buffered pass; a hung
RPC stalls it until the provider budget aborts the turn. **Fix:** fire-and-forget with the 5 s
observation deadline. **Invariant:** the snapshot id is stable (:922-925), so a late write is
idempotent.

---

## 10. What is right and must not be undone

- The effect ledger (`reserve → begin → adapter → reconcile`, stable `effectId`, replay of
  `succeeded`) and the post-start no-blind-retry rule. This is why `uncertain_external_commit` has
  never appeared in a battery.
- Fresh `AbortController().signal` for committed-mutation receipts, known-failure rows and session
  handoff (:1490, :1646, :3008): cancellation cannot hide a write.
- One terminal CAS RPC with stable event ids, `finalizeWithTimingFallback`, and `recover`'s
  DB-side reclassification (`cancel_requested_at` wins).
- The permanent-mutation-failure retry cap (`byTool`/`byCall`, :202-215, :3347-3400) — a cheap-model
  loop breaker with production provenance (turn 0fa59a3e).
- `finalizeBudgetExhaustedAfterDurableWrites` — the right shape; E8 asks to widen it.
- Ledger-receipt fences (`stale_generation` / `cancel_requested` / `already_terminal` →
  `AgenticChatToolExecutionFenceError`).
- `stripToolDiscoveryHintsFromPayload` at the feedback boundary (feedback.ts:117-135).
- `executorEffects` one-policy facade for never-fatal ports.
- The atomic buffered pass for tool-enabled passes on a flaky cheap route (25/48 turns retried) —
  E6 questions only whether text-only passes need it.
- Read memo (`resolveMemoServedExecution`) and the read-epoch invalidation on writes.
- The publisher's per-turn ordering and terminal-after-drain rule.

---

## 11. Proposed deletions and simplifications, with line counts and the invariant each preserves

| Change                                    | Lines removed (approx.)                                                          | RPCs saved per 3r+1w turn                            | Invariant to keep                            |
| ----------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| E1 delete stream acks                     | ~80 TS + 1 SQL fn                                                                | 17                                                   | per-turn event order (publisher slot)        |
| E2 fold observations into ledger rows     | ~120 TS (executor) + executionObservation.ts kept for provider attempts          | 12                                                   | forensics via ledger + attempt rows          |
| E3 delete pre-read fence                  | ~45                                                                              | 3                                                    | ledger receipt fence                         |
| E4 projection by reference / server-built | ~40 TS + reconcile SQL                                                           | 0 RPCs, −80 % bytes; removes the 512 KB turn-killer  | reconnect replay order                       |
| E5 poll 2 s                               | 1 constant                                                                       | ~45 on a 30 s turn                                   | DB-side cancel reclassification              |
| E9 reads-parallel / mutations-serial      | ~890                                                                             | 0 (latency neutral or better on writes)              | pre-mutation snapshot for reads in the round |
| E10 reserve+begin                         | ~20 TS + 1 SQL fn                                                                | 1 per write                                          | effect state machine                         |
| E11 one finalize RPC, opaque timing       | ~300 TS (executionControl) + ~150 (runtimeTiming/timingPayload trims) + ~800 SQL | 0                                                    | `done` id/sequence contract                  |
| E12 gate research RPC in memory           | +5                                                                               | 1 (locked)                                           | research capture when research happened      |
| E13 delete statedFutureCapture            | ~490 TS + ~400 SQL + 7 tests                                                     | 0–3                                                  | none (behaviour removed)                     |
| E14 trust artifact checksum               | ~120                                                                             | per image: −1 GET, −1 signed URL, −1 DB read, −1 obs | eligibility policy                           |
| E15 SQL sweep                             | ~900 TS (stalledRecovery + recoverySnapshot)                                     | 0                                                    | exactly-once terminal via CAS                |
| E16 minimal publisher                     | ~950                                                                             | (with E1)                                            | order + terminal-after-drain                 |
| E17 one validation boundary               | ~250 (27 fixture throws, 2 dup validators, memo re-check, feedback kind rules)   | 0 (CPU: −3 canonicalizations per read)               | call-id ↔ result pairing                    |
| E20 cosmetic events                       | ~60                                                                              | 10                                                   | reconcile hint for queued→running            |
| **Total**                                 | **≈5,000 TS + ≈2,100 SQL of 14,839 + 20,373**                                    | **≈72 → ≈29 executor RPCs; ≈132 → ≈44 with polls**   |                                              |

Adds (E7, E8, E18) are ~150, ~40, and ~400 lines respectively.

---

## Appendix A — Evidence pointers

- 09-02 production evidence: `docs/technical/reviews/agentic-chat-turn-executor-audit-2026-09-02/evidence/evidence-notes.md`
  (latency :27-31; failure codes :20; costliest turns :41).
- Stalled sweeper firings and the finalize/timing incident: `tasker/50-worker-provider-execution-hardening-slice16.md:163-200`.
- Battery runs used for the batch/mutation counts: `artifacts/agentic-chat-postdeploy-{4ac73bde7,6d787284c,a1771c1f7}-runs.json`,
  `artifacts/agentic-chat-failed-cases-ef4ad9a-runs.json` (60 turns; 174 reads, 28 writes, 3 multi-write turns).
- Route flakiness and retry counts: `lane-I-live-evidence.md:141-147`.
- 09-08 feedback-kind crash: `artifacts/agentic-chat-research-postdeploy-2026-09-08.md`; fix in the
  working-tree diff of `provider/feedback.ts:62` and `turn-executor.ts:2236-2333`.
- Projection size measurement: node one-liner in §8 (8/20/40/60 events × 5–10 KB).
