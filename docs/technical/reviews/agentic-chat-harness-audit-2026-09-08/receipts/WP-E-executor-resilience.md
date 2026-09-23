<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/receipts/WP-E-executor-resilience.md -->

# WP-E — executor resilience

Package: `E-executor-resilience` from
`docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/evidence/work-packages.json`.
Findings: F55, F53, F67, F118, F56, F50 (executor half).

Files changed (all left unstaged):

- `apps/worker/src/workers/agentic-chat/turn/turn-executor.ts`
- `apps/worker/src/workers/agentic-chat/effects/executor-effects.ts`
- `apps/worker/src/workers/agentic-chat/effects/prompt-snapshot.ts`
- `apps/worker/src/workers/agentic-chat/turn/cancellation-observer.ts`
- `apps/worker/src/workers/agentic-chat/effects/pending-effects.ts` (new, shared with WP-D: this package
  wrote the per-turn `AgenticChatPendingEffects` class with the agreed `enqueue(promise)` /
  `drain(deadlineMs)` API; WP-D appended the turn-keyed `AgenticChatPendingEffectsRegistry` and the
  `AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY` singleton, which the executor now shares)
- `apps/worker/tests/agenticChatTurnExecutor.test.ts`
- `apps/worker/tests/agenticChatExecutionPendingEffects.test.ts` (new)

Not changed: `apps/worker/src/workers/agentic-chat/tools/execution-adapter.ts` (owned; the
verifier's F55 fix keys on the code the adapter already emits, so no adapter edit was needed),
`apps/web/src/lib/services/agentic-chat-v2/turn-persistence.ts` (F118 does not live there).

## Per finding

### F55 — any thrown non-web read error kills the turn (P1) — FIXED (verifier version)

`turn-executor.ts`

- `executeReadTool` catch: the recoverable set is now keyed on `error.code === 'read_tool_execution_failed'`
  (the adapter's catch-all for everything a shared read implementation throws) for every tool,
  plus the two egress-policy codes, plus the existing web-only list (`read_tool_timeout`,
  `read_tool_research_review_unavailable`, `read_tool_egress_security_capacity_exceeded`,
  `read_tool_result_too_large`, `read_tool_result_invalid`) for `web_search` / `web_visit`.
  Nothing else changed: `read_tool_not_allowlisted`, `read_tool_context_invalid`, the ownership
  fence (`assertCurrentReadToolFence` runs before the try), `read_tool_timeout` on a private
  read, ledger failures, and cancellation (`signal.aborted`) still terminate through recovery.
- `persistRecoverableReadFailure` now takes the `AgenticChatProviderExecutionError` (was the code
  string) and branches the model text: web tools keep the fixed "Live research did not return
  usable evidence" line; private reads get `privateReadFailureMessage(error)` — the adapter's
  message verbatim for `'permanent'` (the shared logic's own throws: "Project not found or access
  denied", not-found, semantic argument checks, control-tool validation text) and the generic
  "The read could not be completed." for any other class (`'unknown'` = PostgREST/DB errors), so
  raw driver messages never reach the model. The instruction line for private reads is new and
  short ("Do not repeat this call with the same arguments. If the id was guessed, locate the record
  with a search or list tool that is available this turn; otherwise continue with the loaded
  context and tell the user what could not be read."); web and policy-denied instructions are
  byte-identical to before.
- Unchanged, as required: `failureKind: 'read_failure'` (`'read_policy'` for egress denials), the
  persisted `error` string `${code}: ${message}`, `executed: null` / `retryable: false`, and the
  identity triple check in `provider/feedback.ts` (not touched; it already accepts
  `known_execution_failure` for reads since 226e51c31).

Tests (`agenticChatTurnExecutor.test.ts`):

- New `feeds a private read that threw ($label) back to the model instead of failing the turn`
  (x2): `get_onto_project_details` rejecting with `read_tool_execution_failed` as `'permanent'`
  ("Project not found or access denied") and as `'unknown'` ("canceling statement due to statement
  timeout"). Asserts the turn completes, `recover` is never called, one `read_failure` row lands
  with `read_tool_execution_failed: <model text>`, the round-2 feedback carries the model text /
  `error_code` / `retryable: false` / the new instruction, the published `tool_result` carries the
  same text, and the raw DB message is absent from the feedback.
- New `still fails the turn when a private read is rejected with %s` (x2):
  `read_tool_not_allowlisted` and `read_tool_context_invalid` stay terminal (`failed`, no failure
  row, `recover` called with `permanent`) — the fail-closed-on-unknown-tool behaviour the audit
  said must survive.
- Existing `continues after a $toolName batch is rejected by $code` (web cases) and
  `writes a terminal outcome when a read-tool network call exceeds its local deadline` (private
  `read_tool_timeout` stays terminal) are unchanged and green.

### F53 — cancellation poll at 500 ms (P2) — FIXED in owned file; two handoffs

`cancellationObserver.ts`

- New exported `DEFAULT_AGENTIC_CHAT_CANCELLATION_POLL_INTERVAL_MS = 2_000`, used as the
  observer's default `pollIntervalMs`. The doc comment records the trade: worst-case cancel latency
  during a silent phase rises from 0.5 s to 2 s (every write RPC already returns
  `cancel_requested` and the publisher aborts on it; `recover` returns `finalize_cancelled`
  whenever `cancel_requested_at` is set, so terminal truth never depends on the tick) for 4x fewer
  `observe_agentic_chat_turn_cancellations` RPCs on every turn. Event-driven was not taken: no
  cheap push signal exists (the RPC is the signal).
- The import of `AGENTIC_CHAT_CANCEL_OBSERVATION_INTERVAL_MS` from `@buildos/shared-types` was
  dropped; the constant (still `500`) is now unused by the worker. See Handoffs.

Tests: none owned pin this value. The non-owned observer test now fails until its handoff lands
(verified: `tests/agenticChatCancellationObserver.test.ts > uses one worker-level 500 ms timer for
every registered turn` — `expected [] to have a length of 3 but got +0`).

### F67 — prompt snapshot awaited inline with no deadline (P3) — FIXED (verifier version)

`executorEffects.ts`, `promptSnapshot.ts`, `turn-executor.ts`

- `AgenticChatExecutorEffects.persistPromptSnapshot` is now synchronous: it starts the write under
  `runWithAbortableDeadline` (parent = the turn's combined signal, local deadline = new
  `AGENTIC_CHAT_PROMPT_SNAPSHOT_TIMEOUT_MS = 15_000` in `promptSnapshot.ts`) and enqueues the
  attempt into the turn's pending set. The executor's `persistPromptSnapshot` is void and no longer
  awaited at the three first-durable-step sites, so the already-buffered pass replays without
  waiting on the RTT.
- `AgenticChatPromptSnapshotPortV1.persist(input, signal?)` gained the optional deadline signal;
  `SupabaseAgenticChatPromptSnapshotAdapter` threads it via `request.abortSignal(signal)` (same
  pattern as `executionObservation.ts`) so a hung fetch is cancelled, not orphaned. The RPC client
  type now declares the optional `abortSignal` like the observation client.
- The write is joined, bounded by `AGENTIC_CHAT_EXECUTION_OBSERVATION_TIMEOUT_MS` (5 s), by the
  same `drainPendingEffects` call that F50 adds before both terminal fences. A write that misses
  the fence is reported via `onExecutionObservationError` and still lands or is rejected by the
  generation fence; the stable snapshot id keeps it idempotent.

Tests (`agenticChatTurnExecutor.test.ts`):

- `persists one exact prompt snapshot after the first durable response only`: the
  `toHaveBeenCalledWith` assertion now also expects `expect.any(AbortSignal)` as the second
  argument (honest flip: the port now receives the deadline signal). Log-order assertion unchanged.
- New `replays the buffered pass without waiting on the prompt snapshot, then joins it before
finalizing`: a 120 ms snapshot write; the provider's `finish` step is reached while the write is
  still pending, and `control.finalize` sees it settled.
- `reports prompt-snapshot failure without overturning durable response truth` unchanged and green
  (the error is reported during the drain, before `execute` resolves).

Tests (`agenticChatExecutionPendingEffects.test.ts`, new): `bounds the detached prompt snapshot with
a deadline signal the adapter can cancel on` — fake timers; the port's signal aborts at exactly
15 s and the timeout is reported through `onPromptSnapshotError`.

`tests/agenticChatPromptSnapshot.test.ts` (not owned) run to confirm the optional parameter keeps
the adapter tests green: 4/4 pass.

### F118 — interrupted-turn receipts spend their six slots on control results (P2) — HANDOFF (not in owned files)

The composer is `buildInterruptedToolHistorySummary` /
`summarizeInterruptedToolResult` in
`apps/web/src/lib/services/agentic-chat-v2/session-service.ts` (:443-457 and :459-494 as of this
tree), not `turn-persistence.ts`, so per the package note it was not edited. Another session is
editing that file right now (A2, loaded-skills summary only, F69). Exact change is under Handoffs.

### F56 — partial-fulfilment completion only for budget exhaustion (P1) — FIXED (verifier version)

`turn-executor.ts`

- New module constant `PARTIAL_COMPLETION_FAILURE_CLASSES = {timeout_post_start, permanent,
transient_infra, unknown, provider_throttle}`. The catch-block conjunct
  `failureClass === 'timeout_post_start' && providerBudget.signal.aborted` became
  `PARTIAL_COMPLETION_FAILURE_CLASSES.has(failureClass) && !isExecutionFenceLost(error)`; every
  other conjunct is kept (`executionStarted`, `executionInput !== null`, `!cancellationSignal.aborted`,
  `!job.signal.aborted`, `!overload.signal.aborted`, `hasSuccessfulDurableEffects(...)`). So
  `cancelled`, `publisher_overload`, `stale_context`, `uncertain_external_commit`, worker shutdown
  (`job.signal`) and the pre-start classes stay on the failure path. `isExecutionFenceLost` is a
  small extra guard the verifier did not name: `AgenticChatToolExecutionFenceError` /
  `AgenticChatSessionHandoffFenceError` (stale generation / already terminal, classified `unknown`)
  mean this worker no longer owns the turn, so appending disclosure text and finalizing `completed`
  would be wasted work against a fence; they keep the recovery path.
- `finalizeBudgetExhaustedAfterDurableWrites` renamed `finalizePartialAfterDurableWrites`; it reuses
  the existing budget-expiry path unchanged (same disclosure floors, `mutation_unfulfilled`, fresh
  terminal signals, `null` fallback to the failure path) and now takes `partialFailureClass` /
  `partialFailureCode`.
- `finalize` gained the optional `partialFailure` input and records
  `partial_failure_class` and `partial_failure_code` (the typed code, e.g. `provider_stream_failed`,
  `provider_budget_exhausted`, `tool_execution_persist_timeout`) in `assistantMetadata` so
  telemetry can still count the infra failure on a `completed` row. The typed failure log
  (`agentic_chat_typed_execution_failure`) is still written before the lane runs, so it remains the
  operational signal for post-write failures that no longer show as `status='failed'`.

Tests (`agenticChatTurnExecutor.test.ts`):

- `completes with the partial disclosure when the provider budget expires after a durable write`:
  added the `partial_failure_class: 'timeout_post_start'` / `partial_failure_code:
'provider_budget_exhausted'` metadata assertion.
- New `completes with the partial disclosure when $label follows a durable write` (x2): one move
  committed, then round 2 throws `provider_stream_failed` (`permanent`) or `provider_unavailable`
  (`transient_infra`). Asserts `completed` / `mutation_unfulfilled`, `recover` never called,
  `publicError: null`, "Done: 1 of 2 moves." + "Not yet moved: Task B.", the metadata pair, and
  the typed failure log still carrying the original code and class.
- New `keeps the failure path when a stale-context fence is lost after a durable write`:
  `provider_context_stale` (`stale_context`) after one committed move still finalizes `failed`.
- Existing `matches provider-error structure while retaining only reconnect-safe failed text`
  (permanent stream failure with zero writes → `failed`) unchanged and green: zero-write terminals
  keep failing.

### F50 — observation rows on the tool critical path (P1, executor half) — FIXED (verifier version)

`pendingEffects.ts` (new), `executorEffects.ts`, `turn-executor.ts`

- `AgenticChatPendingEffects`: `enqueue(promise)` tracks a settled-absorbing wrapper and forgets it
  on settle; `drain(deadlineMs)` is `Promise.race(Promise.allSettled(snapshot), deadline)` and
  returns whether everything tracked at call time settled in time. WP-D's registry keys sets by
  `turnRunId` and forgets a turn on `drain`.
- `AgenticChatExecutorEffects` takes an optional `pendingEffects` port (`Pick<Registry, 'forTurn' |
'drain'>`, default `AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY` — the same singleton the provider
  client files its attempt receipts into). `observeToolExecution` is now synchronous: it starts
  `port.observe` under the existing 5 s `runWithAbortableDeadline` and enqueues the attempt into
  `forTurn(input.turnRunId)`. New `drainPendingEffects(turnRunId)` joins the turn's set under the
  same 5 s constant and reports a miss through `onExecutionObservationError`; never throws.
- `turn-executor.ts`: the private `observeToolExecution` is void and its 10 call sites no longer
  `await` (the read no longer waits for its `started` row; the `ended` row no longer sits between
  the ledger ack and the result publish; same for mutations, known-failure, dependency-failure
  and validation-failure rows). `drainPendingEffects` runs at both terminal fences: in `finalize`
  immediately before `finalizeWithTimingFallback`, and in `recover` immediately before
  `control.recover` (recovery may retire the generation, which would fence the rows out). Both
  are idempotent, so the `recover -> finalize` path drains once. Zero migrations; the same rows
  with the same stable observation keys land, inside the same generation.
- Call order into the observation port is unchanged (the port is invoked synchronously at enqueue),
  so every existing ordering assertion on `executionObservationInputs` still holds.

Tests:

- `agenticChatTurnExecutor.test.ts`, new `keeps tool observations off the critical path and joins
them before the terminal fence`: a 60 ms observation port; the read runs with the `started` row
  issued but not settled (`settledWhenReadRan === 0`, one input recorded), and `control.finalize`
  sees both rows settled.
- `agenticChatExecutionPendingEffects.test.ts` (new, 8 tests): join/absorb/forget, deadline miss
  returns false and keeps the straggler, non-positive deadline rejected, registry keys by turn and
  forgets on drain, `observeToolExecution` returns synchronously and its error surfaces on drain,
  a hung observation is aborted at its own 5 s deadline and reported, and a fence-deadline miss is
  reported (never thrown) and forgets the turn.

## Tests run

| Command                                                                                                                   | Result                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatExecutionPendingEffects.test.ts`                          | 8/8 pass                                                                                                         |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatTurnExecutor.test.ts`                                     | 86/86 pass (10 new/updated cases confirmed by name with `--reporter=verbose`)                                    |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatPromptSnapshot.test.ts` (not owned; port signature check) | 4/4 pass                                                                                                         |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatCancellationObserver.test.ts` (not owned; F53 pin)        | 10/11 — `uses one worker-level 500 ms timer for every registered turn` fails as expected until the handoff lands |

Not run (per machine rules): typecheck, lint, svelte-check, any suite.

## Handoffs (exact changes in files this package does not own)

1. **F53 pinned test** — `apps/worker/tests/agenticChatCancellationObserver.test.ts:190-208`
   (`'uses one worker-level 500 ms timer for every registered turn'`): rename to `... 2 s timer ...`
   and change `await vi.advanceTimersByTimeAsync(1_500)` to
   `await vi.advanceTimersByTimeAsync(3 * DEFAULT_AGENTIC_CHAT_CANCELLATION_POLL_INTERVAL_MS)`
   (import it from `../src/workers/agentic-chat/turn/cancellation-observer`); the `toHaveLength(3)`
   assertion then holds.
2. **F53 shared constant** — `packages/shared-types/src/agentic-chat-worker-contract.ts:26`
   `AGENTIC_CHAT_CANCEL_OBSERVATION_INTERVAL_MS = 500` is no longer imported anywhere in the
   worker (the observer default now lives in `cancellationObserver.ts`). Preferred: delete the
   export and its pin at `packages/shared-types/src/agentic-chat-worker-contract.test.ts:161`
   (`expect(...).toBe(500)`), and drop it from line 4 of that test's import. Alternative if the
   contract export must stay: set it to `2_000`, update the test to `toBe(2_000)`, and re-point
   `DEFAULT_AGENTIC_CHAT_CANCELLATION_POLL_INTERVAL_MS` in `cancellationObserver.ts` at it (one-line
   edit in this package's file; the comment stays).
3. **F118** — `apps/web/src/lib/services/agentic-chat-v2/session-service.ts`,
   `buildInterruptedToolHistorySummary` (:459-494) and `summarizeInterruptedToolResult` (:443-457).
   Add `import { CONTROL_TOOL_NAMES, isLikelyWriteToolName } from '@buildos/agentic-chat-runtime/loop';`
   (both are exported from `packages/agentic-chat-runtime/src/loop/tool-classification.ts` via
   `loop/index.ts`). In `buildInterruptedToolHistorySummary`, after sorting by `sequence_index`:
   (a) drop rows whose `tool_name` (trimmed, lower-cased) is in `CONTROL_TOOL_NAMES`
   (`declare_turn_contract`, `declare_read_only_turn`, `request_turn_clarification`,
   `cancel_turn_contract`, `approve_turn_contract_review`, `approve_mutation_batch_review`,
   `request_proposal_revision`); (b) partition the remainder into `writes` = rows with
   `row.success && isLikelyWriteToolName(row.tool_name, row.gateway_op)` and `reads` = the rest;
   (c) render every write, in sequence order, as one line `- ${verb} ${kind} "${title}" (${id})`
   capped with `previewText(line, 100)`, where `verb`/`kind` come from the tool name
   (`create_onto_task` → `created task`, `update_onto_document` → `updated document`, else
   `${row.gateway_op ?? row.tool_name}` as the verb with no kind), `title` is the first string of
   `result.title`, `result.name`, `result.task?.title`, `result.document?.title`,
   `arguments.title`, `arguments.name`, and `id` is the first string of `result.id`,
   `result.task?.id`, `result.document?.id`, `result.entity_id`; these lines are NOT subject to the
   3,000-char `previewText` cap at :494; (d) fill the remaining slots with the read summaries
   exactly as today (`summarizeInterruptedToolResult`, `.slice(0, 6)`), then the existing
   `Interrupted or failed calls:` line, and apply the 3,000-char cap only to that read/failure
   tail. Output shape: `['Previous interrupted assistant turn tool results:', ...writeLines,
previewText(readAndFailureLines.join('\n'), 3000)]`. This keeps
   `session-service.test.ts:455-520` (web_search "Launch risks" survives) and `:524-560`
   (web_visit content survives) green, per the verifier. Add one test: six task creates + three
   control calls + one web_search in an interrupted turn → all six creates appear as one line
   each, no control line, the web_search summary still present. A2 currently owns only the
   loaded-skills summary in this file, so this goes to the integration agent (or A2 by adjacency).
4. **README** — `apps/worker/src/workers/agentic-chat/README.md` "Executor side effects" (:101):
   append one sentence: "Tool observations, provider attempt receipts and the prompt snapshot are
   started detached into the turn's `pendingEffects` set and joined once, under the observation
   deadline, immediately before each terminal fence (`finalize` and `recover`); a join that misses
   the deadline is reported, never fatal, and the rows are still fenced by generation."

## Behaviour changes

- A private read that throws inside the shared implementation (access denied on a well-formed
  guessed id, not-found, semantic argument checks, control-tool validation text, DB/PostgREST
  errors) no longer ends the turn with "An error occurred while streaming."; the model receives a
  failed tool result (adapter message for `permanent`, "The read could not be completed." for DB
  errors), a `read_failure` ledger row lands, and the turn continues. Allowlist/context
  violations, private-read timeouts, ownership fences and cancellation are unchanged (terminal).
- A post-start failure of class `permanent`, `transient_infra`, `unknown`, `provider_throttle` or
  `timeout_post_start` after at least one durable write now finalizes `completed` /
  `mutation_unfulfilled` with the "Done: N of M ... Not yet ..." disclosure, `last_turn_context`
  and a `done` event, instead of `failed` with the generic error. Health dashboards keyed on
  `status='failed'` stop seeing these; `assistantMetadata.partial_failure_class/_code` and the
  typed failure log carry the signal. Zero-write failures, cancellation, overload, stale context,
  uncertain effects and lost fences still fail.
- Worst-case user-visible cancel latency during a silent provider phase rises from 0.5 s to 2 s;
  RPC load from the cancellation poller drops 4x. Cancel during a write is unchanged (write RPCs
  return `cancel_requested`).
- Tool observation rows and the prompt snapshot no longer sit on the tool critical path (about 2
  serial RPC round trips per tool call and one per turn removed); they are joined once before the
  terminal fence, so a turn's tail can wait up to 5 s for a slow observation RPC that previously
  would have stalled mid-turn instead. Same rows, same keys, same generation.
- `persist(input)` on the prompt-snapshot port now receives a deadline `AbortSignal` as a second
  argument; a write hung past 15 s is cancelled and reported through `onPromptSnapshotError`.
- `AgenticChatExecutorEffects` accepts an optional `pendingEffects` port; default is the
  process-wide registry shared with the provider client.

## Deliberately left alone

- `execution-adapter.ts`: no change. The verifier's F55 fix keys on the `read_tool_execution_failed`
  code the adapter already assigns, so the adapter's failure-class mapping, allowlist and context
  fences stay byte-identical.
- The web-tool failure texts, `executed`/`retryable` semantics, `failureKind` values, and the
  feedback identity triple: untouched, as the F55 note requires.
- `tool_execution_started` / `tool_execution_ended` rows and their planning fields: still written
  (the verifier rejected the schema move; views, harness telemetry and the read canary are
  untouched).
- Provider attempt observations in `openrouter-client.ts`: WP-D's half of F50; not touched here
  beyond sharing the registry it created.
- Cancellation classification and the DB-side `finalize_cancelled` reclassification: unchanged.
- The Finding 11 addendum, direct-write floor, SHA-bound approvals, reviewer prompt, context-only
  surfaces and idempotent usage receipts: no file on those paths was edited.
