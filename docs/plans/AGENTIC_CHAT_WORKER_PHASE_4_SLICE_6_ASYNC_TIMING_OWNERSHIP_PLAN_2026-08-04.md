<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_6_ASYNC_TIMING_OWNERSHIP_PLAN_2026-08-04.md -->

# Agentic Chat Worker Phase 4 Slice 6 — Async Timing Ownership

**Prepared:** 2026-08-04 EDT
**Status:** Implementation complete, disposable-database verified, and present in the hosted migration ledger. Hosted PostgREST exposes the exact service-role RPC contract; worker deployment and one hosted internal-turn evidence capture remain separate gates.
**Authority:** The user asked to continue with the next slice after validating and documenting terminal last-turn context.

**Follow-on:** The next additive parity unit is implemented in `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_7_PROMPT_SNAPSHOT_PARITY_PLAN_2026-08-04.md`.

## Why this cannot be a copied payload

The legacy `AgentTimingSummary` describes one synchronous HTTP request whose route resolves a session, loads and composes history, builds context, calls the provider, inserts an assistant, emits timing, and emits done. The asynchronous worker architecture splits those actions across web admission, queue delay, worker claim/start, provider execution, a terminal database transaction, and post-commit Broadcast.

Several legacy names therefore do not have the same owner or meaning. Filling them with zero, `Date.now()` at finalization, or the input-artifact creation time would create precise-looking but false telemetry.

## Field ownership audit

### Exact or directly measurable in the worker architecture

- admitted/accepted time: `chat_turn_runs.created_at` / `started_at` from the atomic admission transaction;
- worker claim time: `chat_turn_runs.worker_started_at`;
- provider authority time: `chat_turn_runs.execution_started_at` and the begin receipt;
- first durable semantic event: persisted acknowledgement receipt time;
- first durable response text: first successful text persistence receipt time;
- assistant persisted time: the committed `chat_messages.created_at` now pinned by Slice 5;
- terminal committed time: `chat_turn_runs.terminalized_at` / terminal receipt;
- response generation and worker-finalization durations: worker monotonic measurements bounded by the provider-start and terminal calls; and
- queue wait and end-to-end admitted-to-terminal duration: database timestamps.

### Admission/preparation owned but not currently frozen

- session resolved time/duration;
- history load start/end and duration;
- history compose start/end and duration;
- context build start/end and duration;
- tool-selection duration;
- prepared-prompt consume duration; and
- prompt-snapshot insert duration.

The v3 artifact freezes the outputs needed by the model (`history`, prompt sections, tool surface, session snapshot, and context-usage snapshot), but not these preparation timestamps. They cannot be reconstructed honestly from artifact `createdAt`.

### Existing durable categorical/count evidence

The turn/artifact already owns history strategy, compressed state, raw/model history counts, cache source/age, prepared-prompt lineage, and request-prewarm state. These values can be copied only after their exact worker admission rows are included in the execution-input contract and validated against the artifact where applicable.

### Semantically obsolete or renamed

- Legacy `request_started_at` means synchronous route entry. Worker timing needs an explicit admitted/accepted timestamp; reusing the old name requires a documented compatibility interpretation.
- Legacy `done_emitted_at` is sampled before SSE send. A durable worker cannot know successful post-commit Broadcast while constructing a semantic event that must precede `done`. The authoritative replacement is `terminal_committed_at`; Broadcast/ack latency belongs to delivery telemetry, not the product timing event.
- Legacy `finalization_ms` ends at pre-send sampling. Worker finalization must end at terminal commit and report Broadcast/ack separately.

## Required ordering

Legacy public order is `last_turn_context`, `timing`, then `done`. Slice 5's atomic wrapper currently commits one preterminal context receipt followed by done. Timing cannot be written afterward, and writing it independently before the wrapper would reverse legacy order or weaken context/done atomicity.

The timing implementation therefore needs a second database-first terminal wrapper version that commits:

1. `last_turn_context`;
2. `timing`; and
3. `done`;

in one transaction, returning two ordered semantic receipts plus the terminal receipt. The publisher must deliver and acknowledge both committed receipts before attempting terminal Broadcast.

## First implementation unit

Before changing the terminal RPC again:

1. define a worker timing source contract that separates database wall-clock timestamps from monotonic durations;
2. extend execution input with the exact existing turn timing/category/count columns and strict timestamp validation;
3. capture first-event, first-response, provider-finish, and terminal-call boundaries through an injected clock so fixtures are deterministic;
4. decide whether admission-owned preparation timings warrant an `agentic_chat_input_v4` immutable snapshot or are intentionally absent from the asynchronous public payload; and
5. pin the expected asynchronous timing payload in both text-only and queued-delay fixtures before adding persistence.

No schema migration or event emission should land until that payload contract is reviewed against the admin/evidence consumers of `AgentTimingSummary`.

## First implementation increment completed

`SupabaseAgenticChatExecutionInputAdapter` now loads a typed `AgenticChatWorkerTimingBaselineV1` with the exact durable sources already owned by `chat_turn_runs`:

- admission `created_at` and `started_at`;
- `worker_started_at`, nullable `execution_started_at`, and `history_cutoff_at`;
- request-prewarm, cache source/age, history strategy/compression, and raw/model counts; and
- prepared-prompt id/hit/miss/surface lineage.

The adapter validates strict database timestamp syntax, causal ordering through worker claim, known cache-source values, nonnegative counts/age, prepared-prompt coherence, and immutable artifact lineage. When present, `history_for_model_count` must equal the frozen artifact history length. Malformed or cross-bound evidence fails with `invalid_timing_source` before provider preparation.

The contract explicitly keeps database wall-clock strings separate from the injected monotonic clock that will own runtime elapsed measurements. Existing worker fixtures now carry deterministic timing baselines, and focused execution-input/provider/executor coverage is green. This increment intentionally does not construct, persist, or Broadcast a `timing` event.

Validation after this increment is green at 88 complete worker test files / 718 tests, with one explicit opt-in file/test skipped; worker lint has no errors or new warnings, the HTTP module guard passes, and worker typecheck passes.

## Second implementation increment completed

`AgenticChatRuntimeTimingTracker` now keeps three timing domains explicit instead of collapsing them:

- exact database wall-clock evidence from the immutable execution baseline and the provider-start receipt;
- process-local monotonic observations for elapsed measurements; and
- post-call terminal-RPC duration, which is delivery telemetry and cannot be included in a timing event committed by that same RPC.

The executor creates the tracker only after `begin_agentic_chat_turn_execution` grants provider authority. The shared publisher now exposes an observational callback at the validated `persisted` database receipt boundary, before Broadcast and delivery acknowledgement. That placement matters: awaiting the publisher delivery promise would measure persistence plus Broadcast/ack latency and would falsely label the result as time to durable event. The tracker retains both the exact receipt `persisted_at` string and the monotonic instant when the worker observed it. A first text receipt can atomically establish both the first-event and first-response boundaries from one clock sample.

Provider finish is captured from the validated finish step. Terminal-call start is captured immediately before the finalize RPC, and terminal-call completion is recorded only after that call settles. `preterminalSnapshot()` is therefore available before terminal completion for the future product-payload builder, while the complete snapshot keeps terminal-call duration under `postcallTelemetry`.

The tracker fails closed on invalid persistence timestamps, a throwing/nonfinite/backward clock, missing boundaries, duplicate provider/terminal boundaries, or causal timestamp regressions. While timing is still observational and non-durable, executor integration isolates those failures so telemetry cannot invoke recovery after a valid provider response or override authoritative terminal database truth.

Immediate and queued-delay executor fixtures pin the same monotonic provider-authority-to-finish measurements while keeping queue delay exclusively in database timestamps. They also prove no `timing` payload enters the public Broadcast stream. Publisher coverage pins the order as database persistence, timing observation, Broadcast, then delivery acknowledgement.

Validation after this increment is green at 89 complete worker test files / 724 tests, with one explicit opt-in file/test skipped. Focused tracker/publisher/executor/assembly coverage is 4 files / 41 tests; touched-source lint and the worker HTTP-module guard are clean. The whole worker typecheck currently reaches three unrelated native-search evidence errors in `webResearchPort.ts` because the concurrent shared-agent-ops `native-search` public entrypoint does not export two newly imported evidence types; this timing slice introduces no reported type error.

## Third implementation increment completed

The public `AgentTimingSummary` contract now recognizes `agentic_chat_async_v1` without changing legacy synchronous payloads. The asynchronous payload uses these compatibility and ownership rules:

- legacy `request_started_at` means durable admission and equals explicit `admitted_at`;
- `accepted_at`, `worker_started_at`, `provider_authorized_at`, and `terminal_committed_at` retain their explicit asynchronous meanings;
- `done_emitted_at` is `null`, because an in-transaction timing event cannot prove its later post-commit Broadcast;
- assistant persistence and terminal commit timestamps remain database-owned terminal evidence;
- end-to-end time-to-first-event/response, queue wait, worker-start-to-authority, and total duration use one database wall clock;
- provider-authority-to-finish, response-generation, and provider-finish-to-terminal-call use the injected monotonic process clock because provider finish has no database timestamp; and
- cache/prewarm/history/prepared-prompt categorical evidence is copied only from the validated timing baseline.

`buildAgenticChatAsyncTimingDraftV1(...)` constructs only the worker-owned preterminal fields. `finalizeAgenticChatAsyncTimingSummaryV1(...)` is the reference contract for adding causal assistant/terminal evidence and total duration. It does not claim delivery. Both helpers reject malformed timestamps, causal regressions, negative/nonfinite durations, and invalid contract identity.

The immediate and one-hour queued-delay goldens prove that queue delay increases only database-clock end-to-end fields; the provider monotonic measurements remain identical. The goldens also prove that unsupported session resolution, history load/compose, context build, prompt snapshot, assistant-persist, and finalization measurements are absent rather than zero-filled.

No `agentic_chat_input_v4` is warranted for this payload. Preparation telemetry was never frozen by admission, and the immutable model-input artifact should not be versioned solely to hold retrospective observability. If those fields become a product requirement, admission must persist a dedicated preparation-timing source prospectively.

Consumer review found the E2E stream reader requires only `request_started_at` plus `phases`, while admin flow profiling already tolerates additive payload fields. The existing timing-metrics/admin rows remain a separate observability pipeline and are not fabricated by this public event slice.

Validation after this increment is green at 90 complete worker test files / 727 tests, with one explicit opt-in file/test skipped. Focused timing payload/tracker/publisher/executor/assembly coverage is 5 files / 44 tests. Shared types pass 24 tests, typecheck, and CJS/ESM/declaration build; the transport-neutral runtime passes 15 tests, typecheck, and build; worker typecheck and touched-source lint are clean.

## Fourth implementation increment completed

Migration `20260804000120_agentic_chat_terminal_timing.sql` adds a new service-only wrapper without changing either rolling predecessor. On a current successful generation it locks the turn, validates the context and exact `agentic_chat_async_v1` draft against the locked turn/event sources, rejects when three sequence slots are unavailable, retains the newest 126 prior projection events, and atomically writes:

1. `last_turn_context` at `N + 1`;
2. `timing` at `N + 2`; and
3. `done` at `N + 3`.

The wrapper now treats each internal receipt as a checked transaction invariant. A fresh completion must return an exact new `persisted` receipt at the reserved identity/sequence with the expected payload; an `already_persisted` semantic receipt cannot silently collapse the three-slot prefix. Lost successful responses, stale generations, cancellation winners, and already-terminal turns resolve through the established terminal CAS before optional-payload validation.

One transaction timestamp owns the context timestamp, `assistant_persisted_at`, `terminal_committed_at`, assistant-message `created_at`, done-event `created_at`, and terminal turn timestamps. `done_emitted_at` remains `null`, and `total_request_ms` is calculated from the durable admission timestamp. Commit evidence is rejected if it would predate provider authority or any first-event/first-response evidence. The projection delivered to the base finalizer contains at most 128 semantic events: 126 retained events plus context and timing.

The shared terminal receipt now carries the ordered `preterminal_events` tuple. `executionControl` selects the new RPC only when context and timing are both present and verifies exact identity, generation, sequence, deterministic event id, transition id, payload correspondence, database-owned timestamps, microsecond-aware total duration, and the absence of preterminal receipts on an already-terminal replay. The generated database function surface includes the new RPC.

The executor builds the timing draft immediately before finalization, uses a stable `timing` lifecycle transition id, and safely falls back to the existing context-plus-done wrapper if the optional monotonic timing source becomes untrustworthy. After commit it publishes/acknowledges context and timing in order before attempting done. If either committed semantic delivery degrades to reconciliation, done Broadcast is skipped and reconnect reconciliation remains authoritative; terminal database truth and queue reconciliation are not overturned.

The deterministic text-only differential now contains a public timing event at the legacy structural position. Its field-level differences from synchronous legacy timing are intentionally scoped under `/events/6/payload/timing/*`; unsupported synchronous preparation measurements remain absent rather than fabricated. The remaining non-timing differential is still the worker's two authoritative done additions, six legacy-only lifecycle observability rows, and prompt-snapshot count.

Disposable PostgreSQL coverage in `20260804000120_agentic_chat_terminal_timing.test.sql` proves service-only grants, successful ordered persistence, 130-to-128 projection retention, aligned commit evidence and total duration, lost-response replay, malformed database-source rollback with no partial writes, stale-generation and cancellation short-circuits, and three-slot exhaustion. The focused worker gate is green at 6 files / 54 tests. The full worker gate is green at 90 files / 730 tests with one explicit opt-in file/test skipped; worker typecheck, touched-source lint, and the HTTP module-size guard pass. Shared types pass 24 tests plus typecheck/CJS/ESM/declaration build, and the transport-neutral runtime passes 15 tests plus typecheck/build.

## Hosted verification and current next boundary

The linked migration ledger contains matching local and remote receipts for `20260804000120`; no duplicate apply was attempted. A live service-role PostgREST OpenAPI read returned the installed `finalize_agentic_chat_turn_with_terminal_events` surface with exactly the 20 required arguments checked into `Database['public']['Functions']`. The migration and disposable PostgreSQL proof retain the explicit `PUBLIC`/`anon`/`authenticated` revokes and service-role grant. An anonymous OpenAPI request was rejected at the gateway, so that request was not treated as independent function-grant evidence.

The remaining Slice 6 rollout gate is operational rather than structural:

1. deploy the worker changes if that deployment has not already completed;
2. run one internal text-only turn, proving durable event order, public payload, delivery/reconciliation behavior, and queue convergence from hosted evidence; and
3. retain that evidence before expanding the cohort.

The next additive Phase 4 unit proceeded as Slice 7 prompt-snapshot parity. Timing closes one text-only event gap; it does not claim full Phase 4 behavioral parity across clarification, tools, checkpoints, cancellation/error variants, quality safeguards, prompt snapshots, cost/session metadata, or billing re-evaluation.
