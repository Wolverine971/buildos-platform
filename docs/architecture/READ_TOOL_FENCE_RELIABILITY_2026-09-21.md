<!-- docs/architecture/READ_TOOL_FENCE_RELIABILITY_2026-09-21.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-21; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Read-tool ownership checks under contention — September 21, 2026

Tasker 92, slice A. A burst of parallel reads must not turn one slow database
moment into a failed turn. This change makes each read burst issue one shared,
cancellable ownership check, moves the detached prompt-snapshot write off the
tool batch, and classifies a fence deadline as retryable infrastructure with a
specific code. No schema, flag, deployment, or routing policy changed.

## Evidence

Case 14, repetition 1 of the failed 48/52 gate (turn
`8f1ed224-f229-411f-a3cf-ae4fd0d5ed4d`, 49.393 s against 40 s). The model asked
for document detail, three searches, and a document list in one batch. Retained
worker HTTP traces (`output/agentic-gate/search-reliability-final-2026-09-21/worker.log`)
give this timeline; all times are UTC on 2026-09-21.

| Time         | Request                                          | Result                                         |
| ------------ | ------------------------------------------------ | ---------------------------------------------- |
| 20:49:44.810 | `persist_agentic_chat_prompt_snapshot_v3`        | aborted by the worker at 15,005 ms             |
| 20:49:44.811 | `claim_agentic_chat_turn` ×4 (read fences)       | HTTP 500 after 45,951–46,934 ms, never aborted |
| 20:49:46.157 | `observe_agentic_chat_turn_cancellations`        | 200 after 45,393 ms                            |
| 20:49:54.813 | `claim_agentic_chat_turn` (fifth read)           | 200 after 7,836 ms                             |
| 20:50:02.652 | `persist_agentic_chat_semantic_event`            | 200 after 5,278 ms                             |
| 20:50:07.933 | `persist_agentic_chat_execution_observation`     | aborted by the worker at 5,002 ms              |
| 20:50:15.178 | `persist_agentic_chat_read_tool_execution`       | 200 after 4,511 ms                             |
| 20:50:22.380 | `finalize_agentic_chat_turn_with_failure_events` | 200 after 3,437 ms                             |

The execution-graph log for the turn recorded five calls, four-wide concurrency,
four failures at 10,002–10,004 ms (the executor overhead deadline), and the fifth
call starting at offset 10,002 ms. The turn failed as `failure_class: unknown`,
`execution_error_code: Error`, `retry_classification: permanent`.

Across the whole gate, `claim_agentic_chat_turn` had a 179 ms median, but
four-claim bursts occurred in every grounded-status and cold-retrieval
repetition. Three database latency spikes appear in the log (about 20:41:33–51,
20:45:44–48, 20:49:44–20:50:31). Only the spike that coincided with a four-claim
burst plus the snapshot write killed a turn.

### What the code proves

- `assertCurrentReadToolFence` issued one `claim_agentic_chat_turn` per read,
  and the graph runner starts up to four reads at once, so a burst produced four
  concurrent identical checks within one millisecond.
- The RPC body (`20260802020100_agentic_chat_worker_claim_fencing.sql`, amended
  only for `first_text_persisted_at` by `20260806020000`) locks the turn row
  `FOR UPDATE` before returning the running-generation receipt. The snapshot RPC
  (`20260914165546_agentic_chat_workflow_prompt_snapshot.sql`) takes the same
  exclusive lock first and then does its heavy JSON work inside that
  transaction. The cancellation poll (`20260802035000`) takes it too. Every one
  of these serializes on that row.
- The snapshot write was dispatched at the first tool step, one millisecond
  before the batch's fences.
- The execution-control adapter never forwarded an abort signal, so a fence
  check the executor had abandoned at 10 s kept its HTTP request and database
  session alive until the server answered 46 s later. The snapshot and
  observation adapters already forwarded theirs, which is why those show
  `aborted` in the trace.
- The four late HTTP 500s arrived after the turn had been finalized and its
  queue job closed. The claim RPC raises `agentic_chat_claim_ownership_lost`
  when the job is no longer `processing`, which fits, but the server error text
  was not captured, so this is the likely cause rather than a proven one.

### What remains unproven

- Why the database was slow for about 46 s. The traces bound the failing stage
  to lock waits plus general slowness (unrelated reads such as `onto_documents`
  took 3.7 s in the same window) and do not establish a deadlock, one blocking
  statement, or pool saturation. Cancelling an HTTP request does not prove the
  server statement stopped.
- Whether the abandoned claims' server statements stopped when the turn was
  finalized, or only when they errored.

## Change

Worker only. Files: `apps/worker/src/workers/agentic-chat/readToolFence.ts`
(new), `executionControl.ts`, `turn-executor.ts`.

1. **One cancellable check per burst.** `AgenticChatSharedReadToolFenceV1`
   shares an in-flight `claim` across callers with the same turn, queue job, and
   processing token. It is single-flight, not a cache: a settled check is never
   reused; a check older than 1,000 ms is never joined; a check any subscriber
   has already abandoned is never joined; a caller whose signal aborts rejects
   at once and never sees a later receipt; the shared request is aborted only
   when its last subscriber leaves. Each caller still validates the receipt
   against the full identity (turn, job, session, user, correlation, generation,
   artifact, user message), and `cancel_requested`, `already_terminal`, and
   stale receipts still throw the existing fence errors. Mutation authority is
   untouched; mutations keep their own fenced ledger RPCs.
2. **Abort forwarding.** `claim(input, signal?)` passes the caller's deadline to
   the Supabase builder's `abortSignal` modifier when present. The admission
   claim and its readback forward their deadline too.
3. **Snapshot scheduling.** The detached prompt-snapshot write now starts right
   after the provider stream is created, before the first provider request, so
   its row lock overlaps the model call rather than the first tool batch. Every
   started turn now gets a snapshot, including one with no response text; the
   earlier "first durable step" rule came from audit finding F67, whose concern
   was only that the write used to be awaited inline.
4. **Typed deadline.** A fence deadline throws
   `AgenticChatReadToolFenceTimeoutError` (`read_tool_fence_timeout`,
   `transient_infra`). No tool has started when it fires, so retrying the turn
   is safe; before, the generic error classified as `unknown` and permanent.

Deliberately not done: raising the 10 s deadline, caching a successful claim,
or changing the SQL lock modes. A follow-up could let the running-generation
read use a weaker lock than the snapshot's `FOR UPDATE`, but that is a schema
change with its own rollout and is not needed for this repair.

## Validation (free, local)

Workspace HEAD `57749651c932290fb6e11e6cbcb757203320a6ad` plus these uncommitted
changes.

- `tests/agenticChatReadToolFence.test.ts` (9), `tests/agenticChatExecutionControl.test.ts`
  (+1), `tests/agenticChatTurnExecutor.test.ts` (+5, one expectation updated):
  131 passed through `test-gate`.
- Worker typecheck (`@typescript/native` tsc) passed; eslint on the three source
  files reported nothing.
- Injected-port reproduction, recorded before and after in
  [read-tool-fence-probe.json](../research/specialist-quality-2026-09-21/read-tool-fence-probe.json):
  before (frozen worktree, unrepaired executor) six claim calls for five reads,
  no fence claim received a signal, failure class `unknown`; after, three claim
  calls, the shared claim aborted with the typed error at the deadline, the
  fifth read's fresh claim untouched, failure class `transient_infra`.

The reproduction stalls only the first check by injection. It proves the
worker-side mechanics, not the database cause, and it is not a gate result. The
failed 48/52 baseline stands until an approved live gate says otherwise.

## Live observation (2026-09-22 gate, failed 38/52 overall)

Zero `read_tool_fence_timeout`, zero claim HTTP 500s, zero aborted claims, 90 claim calls versus 127 in the 2026-09-21 run; case 14 finished under 40 s with at most four tool calls in every repetition. Its failures were judge verdicts on report content. One run on a different acting model (`unbiased/pareto`): consistent with the repair, not proof.

## Live observation 2 (2026-09-22 DeepSeek rerun, failed 43/52 overall)

Same acting model as the 2026-09-21 baseline, so this is the first like-for-like observation. Zero `read_tool_fence_timeout`, zero claim HTTP 500s, 108 claim calls; case 14 finished under 40 s with at most eight tool calls in all three repetitions. Its one failure was a judge verdict on an absence claim in the report. Record: `docs/research/specialist-quality-2026-09-21/tasker92-gate-2026-09-22-deepseek.json`.

## Residual risks

- The cancellation poll takes the same exclusive lock every two seconds and hung
  for 45 s in the incident, so a user cancel during such a stall is observed
  late. Every write RPC still returns `cancel_requested`, so terminal truth is
  unaffected.
- A turn whose only fence check is abandoned now retries as
  `transient_infra`, which re-runs the model round. Retry limits in the recovery
  RPC still apply.
- More prompt-snapshot rows: one per started turn instead of one per turn with a
  durable step.
