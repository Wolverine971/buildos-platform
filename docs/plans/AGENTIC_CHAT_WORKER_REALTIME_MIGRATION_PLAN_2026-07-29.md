<!-- docs/plans/AGENTIC_CHAT_WORKER_REALTIME_MIGRATION_PLAN_2026-07-29.md -->

# Agentic Chat Worker + Realtime Migration Plan

**Date:** 2026-07-29

**Status:** Phase 0 contract revision .5, target-database preflight, and the first exact-tree hosted quality battery are complete. The retained three-run timing/persistence cohort and final independent re-acceptance remain before the Phase 1 gate.

**Scope:** Move interactive agentic-chat execution out of the web request lifecycle and into a bounded worker pool while preserving the current product behavior, live updates, explicit cancellation, persistence, and recovery semantics.

**Target:** Begin with an internal-only, one-to-two-slot implementation on the existing Railway/Supabase footprint, then prove a path to 100 simultaneous active chat turns.

## Implementation progress — 2026-07-29

Completed locally:

- Added the executable `agentic_chat_worker_v1` contract to `packages/shared-types/src/agentic-chat-worker-contract.ts`, including canonical admission/input hashing, immutable history copying, generation-aware event identity, and the terminal-race decision model.
- Added pinned contract fixtures in `packages/shared-types/src/agentic-chat-worker-contract.test.ts` and exported the contract through `@buildos/shared-types` (six at first lock; 13 tests as of contract revision .4 — the contract-lock doc's revision history is authoritative for counts).
- Added the repeatable, read-only database/security inventory at `supabase/tests/20260729000000_agentic_chat_worker_phase0.preflight.sql`. It was exercised against a disposable PostgreSQL catalog and then captured SELECT-only against production on 2026-07-30.
- Locked local legacy parity for attachment-only input, compressed history, route-to-runtime exact-once current input, deterministic research capture, and stated-future idempotency/provenance.
- Updated the Phase 0 baseline, contract lock, and parity ledger to distinguish executable local proof from the database concurrency/fencing tests required in Phase 2.
- Updated the stream-route test double for the concurrently added living-workspace tool-profile call; the production route change itself was preserved unchanged.

Validation recorded:

| Check                           | Result                                             |
| ------------------------------- | -------------------------------------------------- |
| Focused agentic-chat web suite  | 75 files, 809 tests passed                         |
| Shared-types suite              | 2 files, 11 tests at capture; 13 after revision .4 |
| Shared-types typecheck/build    | Passed CJS, ESM, and declarations                  |
| Web `svelte-check`              | 0 errors, 0 warnings                               |
| Focused worker queue baseline   | 6 files, 47 tests passed                           |
| PostgreSQL preflight smoke test | Passed against disposable catalog                  |

Remaining Phase 0 exit work:

- Done 2026-07-29 — Write the missing forward-carry assertion into the hosted E2E scenario fixture (`task-complete-cold-reference` now asserts the stated-future path against ground-truth `onto_tasks.props` provenance). It passed in the first hosted battery on 2026-07-30.
- Done 2026-07-30 — Run and retain the first paid hosted quality battery on exact commit `d807d05ed`; 11 of 14 live scenarios passed. The date-fragile reschedule fixture and cross-run fixture-deletion hazard found by that battery are corrected and locally tested. `book-writing-journey` remains explicitly outside the enforceable bar until its reviewed implementation lands.
- Run the new clean-tree, retry-free Phase 0 gate cohort three times and retain its JSON artifact. The capture records client/server phase timings, tool duration, model/provider/cost attribution, terminal state, and payload-free retained row/byte footprint. It must prove the reschedule and research-readback corrections; no paid run has been started with this capture yet.
- Done 2026-07-30 — Run the read-only preflight against the intended target database and retain its JSON output: `docs/plans/evidence/agentic_chat_worker_phase0_preflight_prod_2026-07-30.json` (production, SELECT-only). **All four duplicate-hazard probes returned zero**, so the new `(user_id, client_turn_id)` and queued+running unique indexes need no pre-resolution pass. Note for operations: 56 of 619 turns sit in `running` with no terminal state — consistent with there being no stale-turn sweeper today, and a reason the Phase 5 sweeper matters beyond the worker path.
- Obtain independent audit acceptance or explicitly waive the gate. **Audit RUN 2026-07-29** (`AGENTIC_CHAT_WORKER_PHASE_0_INDEPENDENT_AUDIT_2026-07-29.md`): architecture and phase order affirmed; gate NOT yet accepted — 4 P0 contract/coverage defects (F1 retry-hash duplicate path, F2 sequence-writer serialization, F3 `queue_jobs` grants, F4 resolve-or-create ambiguity) plus conditions require a contract revision .4 and re-acceptance. **Correction pass APPLIED 2026-07-30** (contract revision 2026-07-30.4 covering F1–F23). **Re-audit RUN 2026-07-30:** the three REJECT verdicts were upgraded (phase order and the parity ledger to ACCEPT; session-inline admission and the twelve-corrections criterion to ACCEPT WITH CONDITIONS), leaving exactly two normative blockers — N1 (the excluded-field validation rule re-opened F1) and S1 (§12's session-scoped Realtime RLS line) — **both closed in revision 2026-07-30.5**, along with the editorial drift and test-strength residuals. Final audit re-acceptance of .5 is the remaining gate signature.
- Done 2026-07-30 — Resolve audit F14 with the isolated-worktree run at exact commit `d807d05ed`. Future gate cohorts also fail closed on a dirty tree and record `HEAD` plus its tree object in the artifact.

The authoritative remaining-gate checklist and paid-run handoff are in `AGENTIC_CHAT_WORKER_PHASE_0_CLOSURE_CHECKLIST_2026-07-30.md`.

Spec-gap closure (2026-07-29 review): the typed error taxonomy, per-transition idempotency/reconciliation lock, transport-lease validation, queue isolation topology, and publisher overflow semantics found missing in review are now locked in `AGENTIC_CHAT_WORKER_PHASE_0_CONTRACTS_2026-07-29.md` (revision 2026-07-29.2).

First-turn latency redesign (2026-07-29, DJ-approved, contract revision 2026-07-29.3): the Realtime topic is per-user (`chat-user:<user_id>`) subscribed at chat-surface mount; the session is resolved-or-created inside the atomic admission transaction keyed by `(user_id, client_turn_id)`; the separate session-bootstrap endpoint/claims table is removed; transport leases are prefetched at compose time; and the first text batch of each generation flushes immediately. This document reflects the revised design throughout.

No Phase 1 runtime extraction, worker routing, or worker schema implementation has started. Hosted activity is limited to the retained SELECT-only preflight and paid legacy-SSE baseline evidence described above.

## 1. Executive decision

BuildOS should decouple interactive chat using three separate concerns:

1. **Command delivery:** PostgreSQL-backed queue jobs deliver admitted turns to workers.
2. **Live event delivery:** Supabase Realtime Broadcast carries low-latency turn events to the browser.
3. **Durable truth:** PostgreSQL stores turn state, messages, tool executions, semantic events, coalesced output state/chunks, cancellation signals, and ownership fences.

The browser must not read the worker queue. The worker must not own the browser connection. The web tier continues to authenticate, authorize, admit, and expose reconciliation APIs; the worker owns model/tool execution.

This is a progressive migration, not a rewrite:

- Keep `POST /api/agent/v2/stream` as the production control and rollback path. Throughout this plan, "legacy SSE" names this current v2 route in its present in-request execution form; there is no older stream route.
- Extract one shared runtime instead of copying the current web implementation.
- Prove a thin worker + Realtime + cancellation slice before moving all behavior.
- Route only internal users until parity and failure-injection gates pass.
- Physically split a dedicated Railway chat-worker service only after the processor works correctly in the existing worker deployment.

## 2. Why the original three-step order changes

The original sequence was:

1. Worker parity.
2. Separate worker service.
3. WebSockets.

The components are correct, but WebSocket events, reconnect behavior, and cancellation are part of parity. They cannot be bolted on after the execution architecture is complete.

The revised sequence is:

1. Freeze the behavioral baseline and define contracts.
2. Extract a shared runtime while the legacy SSE path remains unchanged.
3. Add the durable control plane, direct-write lockdown, database-enforced execution fencing, chat-specific retry/recovery rules, terminal compare-and-set finalization, lossless reconciliation, stable mutation-effect reservations, server-authoritative transport selection, isolated chat capacity, bounded event/control loops, and a server-written immutable turn input artifact containing exact history plus trusted prepared context.
4. Only after those correctness gates pass, prove one thin, internal-only worker turn end to end, including Stop.
5. Complete worker behavioral parity.
6. Expand failure injection and operational hardening; do not defer first-line safety mechanisms to this phase.
7. Split the physical service and canary production traffic.
8. Load-test and scale toward 100 simultaneous turns.

The Phase 3 model call is the first point at which a real asynchronous executor runs. Therefore the essential ownership fences, pre/post-start retry classification, chat-specific stalled-job recovery, write authorization boundary, terminal race policy, transport decision, session/subscription sequence, publisher backpressure, batched cancel observation, immutable input-artifact trust/retention, and reconnect algorithm are Phase 2 prerequisites. Phase 3 must also use a separately bounded chat queue consumer. Phase 5 verifies these mechanisms under adversarial failures and adds operational depth; it does not introduce them for the first time.

## 3. Scope

### In scope

- Interactive agentic chat initiated from the existing chat UI.
- Session resolution and authorization.
- Turn admission and one-active-turn-per-session enforcement.
- Context, prepared prompts, history, attachments, model/tool orchestration, deterministic route-side behaviors, and finalization.
- A dedicated chat queue job type and processor.
- Supabase Realtime private Broadcast channels.
- Explicit Stop, supersede, disconnect, reconnect, timeout, and worker-death behavior.
- Durable output snapshots and bounded event replay.
- Feature-flagged rollout and immediate rollback to the legacy SSE route.
- Instrumentation and load validation for 100 simultaneous turns.

### Out of scope for this migration

- Rewriting the agentic-chat operating model, prompts, tool policies, or quality behavior.
- Migrating Agent Runs to the new chat worker.
- Adopting Temporal, Redis, NATS, Kafka, or another new infrastructure product.
- Exactly-once guarantees for external providers; this plan uses idempotency, fencing, and reconciliation.
- Persisting one database row per generated token.
- Automatically replaying an entire in-progress mutating turn after worker death.
- Removing the legacy SSE route before the worker path completes a production soak.

## 4. Existing foundations to reuse

| Foundation                  | Current location                                                         | Decision                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Current production behavior | `apps/web/src/routes/api/agent/v2/stream/+server.ts`                     | Keep as control and rollback path. Extract behavior incrementally.                                                 |
| Agent loop                  | `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/`         | Move toward a Node-portable shared runtime without policy changes.                                                 |
| Browser lifecycle           | `agent-chat-stream-controller.svelte.ts` and `agent-chat-sse-handler.ts` | Preserve rendering/event application; introduce a transport interface beneath it.                                  |
| Event envelope              | `AgentSSEMessage` plus `stream-protocol.ts`                              | Generalize to `AgentStreamEvent`; retain a compatibility alias during migration.                                   |
| Turn state                  | `chat_turn_runs`                                                         | Extend rather than replace.                                                                                        |
| Turn event history          | `chat_turn_events`                                                       | Reuse for durable/coalesced events; do not store every token.                                                      |
| Semantic checkpoints        | `chat_turn_checkpoints`                                                  | Keep for supervisor resume semantics; do not overload it as the live text snapshot.                                |
| Queue claims                | `SupabaseQueue`                                                          | Reuse processing tokens, per-slot refill, heartbeat, timeout AbortController, correlation IDs, and typed failures. |
| Atomic dispatch pattern     | `create_agent_run_with_job`                                              | Use as the template for atomic chat-turn + message + queue admission.                                              |
| Realtime pattern            | `agent-run:<run_id>` private Broadcast and RLS                           | Reuse the authorization approach for the private per-user chat topic.                                              |
| Message idempotency         | `uq_chat_messages_session_idempotency_key`                               | Use deterministic user and assistant message keys.                                                                 |
| Running-turn guard          | `uq_chat_turn_runs_one_running_per_session`                              | Replace with a guard covering both queued and running worker turns.                                                |
| Progress heartbeat          | `chat_turn_runs.last_progress_at`                                        | Continue updating; add a real stale-turn sweeper.                                                                  |
| Legacy turn admission       | `turn-admission.ts` plus later `session-service.persistMessage()`        | Replace the split write with one duplicate-first server transaction that returns pre-message fallback history.     |
| Prepared prompt cache       | `agentic_chat_prepared_prompts` and prewarm/consumer helpers             | Keep as a short-lived server-owned source; integrity-check and copy accepted inputs into the immutable artifact.   |

The existing policies are not yet a safe worker control boundary: authenticated callers can directly insert/update `chat_turn_runs`, insert `chat_turn_events`, insert/update `chat_turn_checkpoints`, directly read/write the supposedly server-owned `agentic_chat_prepared_prompts`, and execute its cleanup function. Before any worker turn is exposed, migrate every legacy/prewarm server write, prepared-prompt read/consume, and cleanup path to a controlled server-only writer/RPC; revoke those authenticated content-read/write/execute grants and policies; and add relational ownership plus artifact-integrity checks inside each worker RPC. Ordinary users receive only bounded prepared-prompt metadata and reconcile through authenticated web APIs rather than direct prompt, input-artifact, or event-table reads. Realtime Broadcast gets a separate read/subscribe topic-authorization policy; it does not grant control-table writes.

## 5. Architectural invariants

These are non-negotiable acceptance rules for every phase:

1. **One runtime:** Legacy SSE and worker execution use the same core turn implementation.
2. **One active turn per session:** `queued` and `running` both count as active.
3. **Atomic admission:** In worker mode, a durable user message cannot exist without its durable turn and queue job; a queue job cannot exist without its turn. When no session exists yet, the session row is resolved-or-created inside the same admission transaction — a failed admission leaves no orphan session. Legacy mode atomically owns its message/turn without a worker queue row. The UI may still render an explicitly optimistic local message until admission succeeds or rolls it back.
4. **Idempotent admission:** Repeating the same `(user_id, client_turn_id)` returns the existing turn — including the session its original admission created; `(session_id, client_turn_id)` uniqueness is also retained.
5. **Database-authoritative ownership:** Queue claims and domain execution generations fence stale workers. Every worker-owned insert/update is a conditional database operation or RPC that validates the current generation and allowed predecessor status; merely including a generation value in a payload is not a fence.
6. **Persist before terminal:** The final assistant message is durable before `done/completed` becomes visible.
7. **Disconnect is not Stop:** Closing the modal, losing the WebSocket, or navigating away does not cancel execution.
8. **Stop is durable:** Explicit cancellation is recorded in PostgreSQL and actively aborts the owning worker.
9. **No token-row flood:** Live text is broadcast promptly but persisted only in coalesced snapshots/chunks.
10. **Reconnect is deterministic:** The browser can reconstruct current output without assuming it received every live event.
11. **No blind mutation replay:** A turn that may have performed mutations is not automatically re-run from the beginning.
12. **Tenant checks exist at two boundaries:** The web gateway authorizes admission; the worker revalidates the stored user/session/project scope before execution.
13. **Legacy rollback remains available:** New turns can be routed back to SSE without a deployment.
14. **History is an immutable execution input:** Admission freezes the ordered IDs and normalized model-facing content/metadata in the bounded history window before inserting the new message. The worker loads the immutable snapshot—not mutable `chat_messages` rows—and always excludes the newly admitted `user_message_id`, so the current user input appears exactly once and cannot drift during queue delay or retry.
15. **Prepared context survives the queue and remains trusted:** Execution uses a server-written, integrity-checked, immutable turn input artifact containing the prepared context/history required for execution, never an expiring client nonce, a client-writable prepared-prompt row, or a cache row that cleanup may delete while the turn is active.
16. **Active-turn reconstruction is lossless:** Within the supported active-turn size/retention envelope, reconciliation can rebuild the complete text and semantic UI state for the current execution generation without relying on events that happened to arrive live.
17. **Terminal outcome has one linearization point:** Completion, failure, and cancellation use one database compare-and-set finalizer. A cancel that commits first prevents completion; a terminal outcome that commits first makes a later cancel a no-op.
18. **Chat capacity is independently bounded:** Interactive turns use a chat-only queue consumer and `CHAT_CONCURRENCY`; long general jobs cannot consume chat slots, and chat turns cannot consume the general queue's `QUEUE_BATCH_SIZE` slots.
19. **Mutation identities are server-owned and stable:** Before invoking a mutating tool, the runtime durably reserves an immutable `effect_id`. Provider tool-call IDs, execution generations, and retry attempts are correlation fields, not effect idempotency keys.
20. **Transport choice is server-authoritative and immutable:** A short-lived server-issued transport lease selects `legacy_sse` or `worker_realtime`; admission persists that mode, and no existing turn is switched or replayed because a flag changes.
21. **Hot paths are bounded:** Text persistence/publication uses bounded per-turn accumulators and a global flush loop; cancel observation uses one batched query per worker interval. There is no timer/query/promise fan-out proportional to event count times active turns.
22. **A live channel exists before worker admission:** Draft prewarm remains cache-only. The private per-user topic `chat-user:<user_id>` is subscribed at chat-surface mount, so readiness is a standing invariant rather than a send-time handshake. On Send the worker path verifies channel state (or proves authenticated polling readiness if the channel is down) and then admits; the session itself is resolved-or-created inside the admission transaction, never by a separate bootstrap call.
23. **Pressure rejection is side-effect free:** Duplicate admission still resolves under pressure; a genuinely new turn that exceeds hard/soft capacity limits is rejected before session creation, prompt claim, message, turn, or queue persistence with a typed retry response.

## 6. Target architecture

```text
Browser
  ├── mount: subscribe private chat-user:<user_id> channel
  ├── compose: prefetch POST /api/agent/v2/transport lease (silent TTL renewal)
  ├── worker mode: POST /turns (session resolved-or-created inline)
  ├── legacy mode: POST /api/agent/v2/stream with the lease
  ├── POST /api/agent/v2/turns/<turn_id>/cancel
  └── GET  /api/agent/v2/turns/<turn_id>/reconcile
           ?generation=<g>&after_durable_sequence=<n>
          │
          ▼
Web gateway
  ├── authenticate and authorize
  ├── choose transport from server flags/cohort/capabilities
  ├── resolve-or-create the session inside worker-mode atomic admission
  ├── normalize/validate request and attachments
  ├── resolve/claim and freeze trusted prepared context
  ├── freeze exact pre-message history + prepared inputs
  ├── worker mode: atomically insert message + turn + queue job
  └── return 202 with durable turn identity
          │
          ▼
Postgres control plane
  ├── chat_turn_runs
  ├── chat_turn_events
  ├── chat_turn_stream_state
  ├── chat_turn_input_artifacts (immutable history + prepared context)
  ├── chat_turn_signals
  ├── chat_turn_effects / chat_tool_executions
  └── queue_jobs(job_type=agentic_chat_turn)
          │
          ├── Realtime wake signal; one-second polling fallback
          ▼
Isolated interactive chat consumer (logical in Phase 3, physical in Phase 6)
  ├── fenced claim and execution generation via database RPCs
  ├── CHAT_CONCURRENCY slots independent of the general queue
  ├── shared AgenticChatTurnRuntime
  ├── in-process turn_id -> AbortController registry
  ├── one batched cancel observer for all active turn ids
  ├── bounded coalescing/persistence/publish loop
  └── compare-and-set terminal finalization before terminal Broadcast
```

## 7. Contracts and state machines

### 7.1 Turn command

The queue payload should be intentionally small:

```ts
type AgenticChatTurnJob = {
	turnRunId: string;
	correlationId: string;
};
```

The worker loads the authoritative command from `chat_turn_runs`. Do not put trusted prompt context, ownership, or arbitrary client JSON in queue metadata.

The stored command needs:

- `session_id`, `user_id`, `stream_run_id`, `client_turn_id`
- `context_type`, `entity_id`, `project_id`
- normalized user message and `user_message_id`
- normalized attachment references
- project focus and last-turn context
- `voice_note_group_id`
- `request_hash`, computed from the canonical admission request
- `history_cutoff_at`, the ordered bounded `history_message_ids`, and the immutable normalized history snapshot/hash stored in the turn input artifact, with an explicit exclusion of `user_message_id`
- claimed `prepared_prompt_id` for lineage plus a server-written immutable `input_artifact_id` containing the prepared context/history required for execution, guaranteed to remain readable for the turn lifetime and verified against its integrity hash, never the client nonce
- gateway/model feature selections required to preserve behavior
- `correlation_id`
- immutable `execution_mode = 'worker_realtime'` and the accepted transport-contract version/decision id

Use a bounded `request_payload jsonb` for fields that do not justify dedicated columns. Validate its version at admission and execution.

History construction must be deterministic across queue delay and retries. Before inserting the current user message, admission selects the configured bounded history window, records its ordered message IDs for lineage, normalizes the exact model-facing role/content/metadata payload, excludes `user_message_id` defensively, and writes that payload plus its hash into the immutable turn input artifact. `history_cutoff_at` remains an audit field, not the sole ordering or content mechanism. The history port reads only the frozen artifact; it must not reload mutable `chat_messages` or “latest history” at worker start. A prepared prompt that already contains prepared history is normalized and copied into the same artifact, recorded as `historySource = 'prepared_prompt'` (its messages carry no source ids, so the ID-exclusion filter and `history_message_ids` lineage apply only to `admission_window` artifacts). Divergence rule: prepared history is built at compose time and may predate messages persisted while the user was still drafting, so admission prefers the admission-window history whenever the prepared tail is older than the latest persisted session message; prepared history wins only when it is current. The proving test is `agentic_chat_prepared_history_divergence` (Phase 1 differential: a message landing mid-draft must not be dropped from the frozen artifact). This avoids timestamp ties, current-message duplication, edits/deletes after admission, and retry drift.

`chat_turn_input_artifacts` is server-write-only and immutable after the admission transaction. It contains the bounded normalized history snapshot, prepared context/prompt surfaces needed by execution, source prepared-prompt lineage, artifact version, content hash, and retention metadata. The worker verifies the content hash/version before provider work. Prepared-prompt and input-artifact cleanup must exclude artifacts referenced by a queued/running turn. If the queue age exceeds the configured prompt-freshness threshold, the worker follows one explicit policy recorded on the turn—use the frozen artifact, or fail with a typed stale-context outcome and require readmission. It must never silently rebuild from newer session state.

### 7.2 Turn state

Recommended domain state:

```text
queued ──► running ──► completed
  │           ├──────► failed
  │           └──────► cancelled
  └──────────────────► cancelled
```

`cancel_requested_at` and `cancel_reason` are control fields, not a separate terminal status. A running turn remains active until the worker acknowledges the cancellation and marks it `cancelled`.

All terminal transitions go through one `finalize_agentic_chat_turn(...)` RPC that locks/compares the current row and generation. The caller supplies the authoritative complete accumulated text, including any unflushed batch. The RPC atomically persists or resolves the complete terminal stream projection/event, terminal status/reason, finish timestamp, and the outcome-appropriate assistant message: exactly one for `completed`, and at most one nonempty partial/interrupted message for `failed`/`cancelled`. A queued cancellation produces no synthetic blank assistant message. Only after that transaction commits may the canonical terminal event be sent by Broadcast.

Proposed additions/changes to `chat_turn_runs`:

- Allow `status = 'queued'`.
- `request_payload jsonb` (staged to `not null default '{}'::jsonb`).
- `request_payload_version text` (staged to `not null default 'legacy_v1'`).
- `request_hash text null` for new admission idempotency; worker admissions require it.
- `execution_mode text` (staged to `not null default 'legacy_sse'`, constrained to `legacy_sse | worker_realtime`, and immutable after insert).
- `transport_contract_version text null` and `transport_decision_id uuid null` for rollout diagnosis; negotiated/server-internal decisions use a unique non-null decision id.
- `queue_job_id uuid null`.
- `correlation_id uuid` (staged to `not null default gen_random_uuid()`).
- `execution_generation integer not null default 0`.
- `cancel_requested_at timestamptz null`.
- `cancel_reason text null`.
- `worker_started_at timestamptz null`.
- `execution_started_at timestamptz null`.
- `mutation_reserved_at timestamptz null`.
- `irreversible_boundary_at timestamptz null`.
- `history_cutoff_at timestamptz null`.
- `history_message_ids uuid[] null` (bounded lineage; required for worker admissions even though execution reads the immutable snapshot).
- `input_artifact_id uuid null` (required for worker admissions; references immutable history/prepared inputs).
- `last_event_sequence integer not null default 0`.
- `terminal_event_id text null unique` and `terminalized_at timestamptz null` set only by the finalizer.
- Optional `failure_code` separate from user-safe `finished_reason`.

Replace the running-only unique index with a partial unique index on `session_id` where status is in `('queued', 'running')`.

Roll out non-null command fields without breaking legacy route inserts:

1. Add them nullable, with legacy-compatible defaults where safe.
2. Backfill existing rows (`request_payload = '{}'`, `request_payload_version = 'legacy_v1'`, and a generated `correlation_id`).
3. Deploy both writers; the worker admission RPC explicitly writes the worker contract version while legacy inserts continue using defaults.
4. Validate the backfill, then set `NOT NULL`. Do not add a no-default non-null column while the legacy writer is live.

### 7.3 Identities and idempotency

- The browser continues generating `client_turn_id` and `stream_run_id` before admission.
- Add a database unique constraint for `(session_id, client_turn_id)` when `client_turn_id` is non-null.
- Add a unique constraint for `(user_id, client_turn_id)` on worker admissions; it is the duplicate-lookup key when the client does not yet know its session id (session-inline creation) and the single-winner guard for concurrent first-turn admissions.
- Queue dedup key: `agentic-chat-turn:<turn_run_id>`.
- User message idempotency key: `chat-turn:<turn_run_id>:user`.
- Assistant message idempotency key: `chat-turn:<turn_run_id>:assistant`.
- Mutation effect key passed to domain/provider adapters: `chat-effect:<effect_id>`.
- Every worker domain insert/update is performed by a service-only conditional RPC (or `INSERT ... SELECT`) that validates `turn_run_id`, `execution_generation`, and the expected predecessor status in the same statement.

Queue `processing_token` fences the envelope. `execution_generation` fences domain writes and event publication. Both are required.

#### Mutation effect reservation

Provider/model `tool_call_id` is not stable enough to identify a side effect across adapter retries or recovery. Add a worker-owned `chat_turn_effects` ledger and link `chat_tool_executions.effect_id` to it for telemetry:

- immutable `effect_id uuid primary key`, generated by the runtime before its reservation call
- `turn_run_id`, `execution_generation`, `session_id`, and `user_id`
- `effect_state = 'reserved' | 'started' | 'succeeded' | 'failed' | 'cancelled' | 'uncertain'`
- `provider_tool_call_id` for correlation only
- normalized tool/op name, canonical argument hash, attempt metadata, and provider/domain receipt

Before a mutating adapter is invoked, the runtime normalizes the logical call, generates one UUID, remembers the provider-call-to-effect correlation for duplicate callbacks in that generation, and calls a fenced reservation RPC that requires the current owner/generation and no accepted cancellation, creates the effect row, and sets `mutation_reserved_at`—not `irreversible_boundary_at`—in the same transaction. If the reservation response is lost, the runtime queries/retries with the same UUID and canonical argument hash before deciding whether invocation is allowed; reuse with different arguments is a hard conflict. The runtime checks cancellation again after reservation and immediately before invocation, marking an unstarted reservation `cancelled` when needed. At that last boundary, a fenced begin RPC atomically moves `reserved -> started` and sets `irreversible_boundary_at` immediately before the adapter call; only that caller may invoke the effect. It passes the persisted `effect_id` through every internal retry and to the domain RPC/provider idempotency header where supported. A duplicate reservation/begin returns the existing receipt/state instead of independently invoking the effect. Recovery may retry a `started` effect only when the downstream adapter guarantees idempotency or can query the outcome by the same `effect_id`; otherwise a missing receipt becomes `uncertain` and is never retried automatically. A cancelled/unstarted reservation does not cross the irreversible boundary and may be safely abandoned. End-of-turn `chat_tool_executions` telemetry may link/enrich the effect row but is not the safety mechanism. `authenticated`/`anon` receive no direct DML on `chat_turn_effects`.

### 7.4 Server-authoritative transport selection

The browser must not choose a transport from a stale local feature flag. At compose time (first keystroke), it generates `client_turn_id`/`stream_run_id`, retains those ids through negotiation/admission retries, and prefetches a short-lived transport lease from `POST /api/agent/v2/transport`, silently renewing it when the TTL lapses while drafting so Send performs no lease round trip in the common case. It does not generate replacement ids unless the pending send is explicitly abandoned. The authenticated server evaluates the kill switch, cohort, client capabilities, and contract compatibility and returns a discriminated response:

```ts
type AgentChatTransportLease = {
	mode: 'legacy_sse' | 'worker_realtime';
	contractVersion: string;
	decisionId: string;
	token: string; // signed, user/client-turn bound, short lived
	expiresAt: string;
};
```

The lease request supplies the generated client/stream ids, normalized context target, and the client's supported mode/contract-version lists. A renegotiation also supplies the prior `decisionId`, even when its token has expired. It does not accept a client-selected authoritative mode.

Rules:

- The lease is bound to the authenticated user, `client_turn_id`, `stream_run_id`, normalized context target, and mode. The server, not client JSON, is authoritative.
- Negotiation/renegotiation first checks for an authorized existing turn by the prior unique decision id, then by the resolved session and `client_turn_id` when available. If one exists, it reissues a lease for the stored mode/contract/decision before evaluating current rollout flags; a lost admission response followed by lease expiry must resume, not reroute, that turn. An ambiguous or context-mismatched lookup is a typed conflict, never permission to create another turn. The admission route still compares the canonical request hash before treating the retry as the same command.
- Both `/stream` and `/turns` validate the lease before durable writes and persist its `execution_mode`, contract version, and decision id on the turn.
- During the compatibility window, an old client that calls `/stream` without a lease is assigned and persists a server-internal legacy contract/decision with `execution_mode='legacy_sse'`; it can never enter the worker path. Remove this exception only with the Phase 8 old-client cleanup.
- A feature-flag change does not invalidate an ordinary unexpired lease. An emergency kill epoch may reject an unused worker lease with typed `transport_renegotiate`; the browser obtains a new lease before admission.
- Once a turn exists, duplicate admission returns its persisted mode and handle. The UI, cancel path, and reconciliation dispatch by that stored handle, never by the current flag.
- A legacy turn cannot be attached to the worker transport, and a worker turn cannot be reissued through SSE. Rollback affects new, not admitted, turns.

### 7.5 Atomic admission RPC

The worker route calls a service-role-only RPC such as `create_agentic_chat_turn_with_job(...)` only after validating a `worker_realtime` lease and either resolving an owned session id or validating the normalized context target for inline session creation. The RPC performs one transaction:

1. Acquire a per-user advisory transaction lock (covers session-creation races and per-user caps; a per-session lock cannot exist before the session does).
2. Receive `request_hash` from the web gateway, which canonicalizes and computes it with the pinned TypeScript implementation (hash v2) — server code, so no browser-supplied hash is ever trusted, and the RPC compares/stores but never recomputes (a `jsonb` canonicalizer cannot reproduce the pinned digests). The hash covers only user-authored/user-chosen fields; client-recomputed state (`sessionId` — null for a create-inline send — `lastTurnContext`, `projectFocus`) is excluded and governed by the excluded-field rules in step 3. The hash version is never bumped outside a maintenance window: because the gateway computes the digest, a canonicalizer change mid-rolling-deploy would turn in-flight retries into hash mismatches.
3. Look up duplicate `(user_id, client_turn_id)` **before** anything else. If its stored hash matches, return the existing identities — including the session created by the original admission — without claiming another prompt or writing anything. Excluded fields must never manufacture a conflict: a **non-null** supplied `sessionId` must equal the stored `session_id` (a `null` from a byte-identical create-inline retry asserts nothing and resolves normally), and `lastTurnContext`/`projectFocus` are ignored because the first admission's frozen values win. If the same id carries a different hash, raise a typed `idempotency_conflict` mapped to HTTP 409, whose client response is to resolve the existing turn and reconcile — never to mint a new client turn id.
4. For a genuinely new turn, evaluate database hard caps and the server's current queue-age/provider/publisher pressure decision. If closed, return typed `capacity_exceeded` plus `Retry-After` without creating a session, claiming the prompt, or writing any message/turn/job.
5. Resolve the supplied session id (validating ownership) or, when `sessionId` is null, CREATE the session from the validated context target — the transaction's first write, rolled back with everything else on failure. The only resolve-by-context exception is `daily_brief`'s canonical session lookup, which must be race-safe (unique canonical key or the per-user lock, not a best-effort `limit 1`); no other context resolves by context target.
6. Validate there is no other active queued/running turn in the session and that the per-user active-turn cap holds.
7. Pre-generate `turn_run_id`, `user_message_id`, and `correlation_id`, then derive `chat-turn:<turn_run_id>:user`.
8. Through server-only access, revalidate and idempotently claim the prepared prompt against user, session, scope, expiry, integrity/version, and consumption state; never copy client-writable or unsigned prepared content into the execution command. A freshly created session has no prepared prompt or history; its artifact freezes empty history plus the prepared inputs built at admission.
9. Before inserting the current user message, record `history_cutoff_at`; select the bounded history window; exclude the current message id; normalize the exact ordered model-facing history payload; and write the history plus prepared execution inputs, source lineage, artifact version, and content hash into one immutable `chat_turn_input_artifacts` row.
10. Insert `chat_turn_runs(status='queued', execution_mode='worker_realtime')` with the frozen command, request hash, transport decision, history lineage, and `input_artifact_id`.
11. Insert or resolve the user message with the pre-generated id and deterministic idempotency key.
12. Insert `queue_jobs(job_type='agentic_chat_turn')` with a stable dedup key.
13. Store `queue_job_id` on the turn and return the turn, session, user-message, and queue-job identities.

Authorization and attachment validation remain in the web gateway before this RPC. The RPC is the authoritative atomic handoff, not the only security boundary.

### 7.6 Event contract and publisher backpressure

Introduce `AgentStreamEvent` as the transport-neutral name and preserve `AgentSSEMessage` as a temporary alias.

Every event contains:

- `event_id`
- `stream_run_id`
- `client_turn_id`
- `session_id`
- `turn_run_id`
- `execution_generation`
- `sequence_index`
- `phase`
- `event_type`
- `durable`
- event payload

`sequence_index` is scoped to an execution generation and starts at 1 for each generation. Add/backfill `chat_turn_events.execution_generation` and enforce `unique (turn_run_id, execution_generation, sequence_index)`. Use a deterministic event identity such as `<turn_run_id>:<execution_generation>:<sequence_index>`. Every retry/reclaim receives a new generation; the fenced claim RPC resets that generation's stream state and sequence counter atomically before returning ownership, so a client never joins two attempts into one output.

After the claim/reset RPC succeeds, the event sink serializes emissions. Sequence numbers are allocated inside the write RPC itself (`last_event_sequence = last_event_sequence + 1 RETURNING`) — callers never assert a sequence — and the database accepts each state/event write only for the current generation; the worker never resumes or publishes into an abandoned generation. All durable writes for a turn (text batches, semantic events, projection updates) pass through one serialized per-turn in-flight slot, so the text flusher and semantic-event writer cannot race each other, including on the immediate first-text flush.

Event handling policy:

- `text_delta`: coalesce provider tokens by time/size, append the complete new text to fenced `chat_turn_stream_state` (or an ordered durable coalesced chunk), then Broadcast that batch. The persisted unit is a batch, never a token.
- `tool_call`, `tool_result`, `context_shift`, supervisor/checkpoint, and nonterminal error: update the complete UI projection and insert the durable event in one fenced transaction, then Broadcast.
- `timing` and `last_turn_context`: durable. Terminal `done` is created only inside `finalize_agentic_chat_turn`, never through the ordinary event writer.
- No database insert for each provider token.

For every user-visible text batch or durable semantic event, the event sink must complete its fenced database write before publishing it. For any remaining ephemeral event, the sink must first verify that its signal is active and its execution generation is still current. A failed or stale write is never followed by a Broadcast.

Initial coalescing defaults, subject to load testing:

- The first text batch of each execution generation persists and Broadcasts immediately on arrival — the coalescing window exists to bound steady-state write rate, not to delay first visible text. From the second batch onward, coalesce and persist/Broadcast text at most every 100–250 ms or each 2–4 KB, plus phase and terminal flushes. Tune this only after measuring the write budget; never decouple Broadcast from its reconstructable persisted prefix.

The event sink must use bounded memory and bounded asynchronous work:

- Keep one bounded accumulator per active turn and one worker-level flush loop; do not create an independent timer or unawaited write promise for every token/turn.
- Flush dirty turns through a batch RPC that validates each row's generation and allowed status independently and allocates its sequence internally. Broadcast only rows the database accepted.
- Preserve ordering by allowing at most one persistence write in flight per turn across ALL writers — text batches, semantic events, and projection updates share the slot. Merge adjacent text while a write is pending.
- Define per-turn and worker-wide pending-byte/event high-water marks. When crossed, pause provider consumption when supported and otherwise merge text more aggressively.
- Define a hard pending/output bound as well. If persistence cannot recover and provider consumption cannot pause before that bound, abort generation deliberately and terminalize it with a typed publisher-overload failure while preserving all accumulated text; never keep allocating, silently drop an unpersisted prefix, or report successful completion.
- If persistence succeeds but Realtime is slow/unavailable, discard redundant live text/progress notifications and rely on reconciliation; never discard durable state, tool events, cancellation, or terminal state.
- Mark the durable projection `reconcile_required` while live notifications are being suppressed and attempt a rate-limited hint. The active-turn client also runs a low-frequency cursor-aware reconciliation watchdog, so a completely failed Broadcast path still converges before terminal timeout.
- A saturated publisher cannot grow memory without bound or block terminal finalization forever. Emit pressure/drop-to-reconcile metrics and enforce a bounded terminal Broadcast retry budget after the terminal transaction commits.

Add a one-row-per-turn `chat_turn_stream_state` table containing:

- `turn_run_id` primary key
- `session_id`, `user_id`
- `execution_generation`
- `snapshot_sequence` and `durable_through_sequence`
- the complete accumulated assistant text for the current generation
- the complete current phase/status/tool projection required by the UI, including retained semantic history through `snapshot_sequence`
- `updated_at`

This table is distinct from `chat_turn_checkpoints`, whose purpose is semantic supervisor resume.

The active-turn reconstruction path must not truncate the output prefix. Enforce a runtime output limit below the stream-state storage limit, or spill full text to ordered coalesced chunks when the limit is reached. “Bounded snapshot” means bounded by an explicit supported turn limit, not “keep only the latest suffix.” Retain all durable semantic events for an active turn; terminal cleanup follows the documented retention window.

### 7.7 Channel lifecycle, Realtime, and reconnect protocol

Private topic: `chat-user:<user_id>`, subscribed once at chat-surface mount.

Draft-time prewarm remains cache-only and creates no sessions; the current client's `ensure_session: false` drafting behavior is preserved. There is no separate session-bootstrap endpoint or claims table: in worker mode the session is resolved-or-created inside the atomic admission transaction (Section 7.5), keyed by unique `(user_id, client_turn_id)`. Because the topic is user-scoped, it exists and is subscribable before any session does — first-turn readiness is not a special case. All of a user's sessions multiplex on the one channel; every event carries `session_id` and `turn_run_id`, and clients ignore events for turns they hold no handle for (other tabs' turns are simply not applied).

Realtime authorization verifies that the topic's user id equals the authenticated `auth.uid()`. Service role may publish/subscribe for worker operation.

Realtime is an acceleration path, not durable truth. The worker-mode flow is:

1. At chat-surface mount, the browser opens the private `chat-user:<user_id>` channel. It re-establishes the channel on auth/network changes; channel state is observable at any time.
2. At compose time, the browser generates `client_turn_id`/`stream_run_id` and prefetches the transport lease, silently renewing on TTL expiry while drafting.
3. On Send with a `worker_realtime` lease, the browser checks channel state. If the channel is `SUBSCRIBED` (the overwhelmingly common case), it admits immediately. Only if the channel is down does it first prove polling readiness through an authenticated readiness request that shows the turn APIs are reachable and authorized, initializing the bounded reconcile poller that will receive the admitted handle; it does not wait forever or treat a local timer alone as readiness.
4. The browser admits the turn via `POST /turns`, passing its session id when it has one or the normalized context target for inline session creation; the 202 returns the durable turn and session identities. Admission failure removes the optimistic message and, because session creation is transactional, leaves no orphan session.
5. Browser applies live events by `(turn_run_id, execution_generation, sequence_index)` while tracking a separate durable semantic-event cursor. Duplicates and stale generations are ignored.
6. A sequence gap, reconnect, tab wake, or Broadcast error triggers reconciliation. During reconciliation, the client buffers newly arriving live events without applying them.
7. Through one reconciliation RPC/transaction, the endpoint returns the current generation; the complete text/UI projection through `snapshot_sequence`; `durable_through_sequence`; retained durable events newer than both the projection's included durable cursor and the caller's cursor; the response watermark; and the final assistant message when present. A fresh client needs no pre-snapshot semantic events because the complete projection already contains their UI effects/history. If the requested generation is stale, the server ignores its cursor and returns the complete current-generation snapshot.
8. The client discards prior-generation state when the returned generation changes, applies the snapshot, applies returned durable events in order, then applies buffered live events newer than the response watermark. Duplicates are ignored by deterministic event identity. If the endpoint cannot obtain a generation-consistent view, it returns a retryable reconciliation response instead of mixing generations.
9. If a gap remains, the client repeats reconciliation; it never advances a cursor across a gap merely because a newer live event arrived.

If Realtime cannot connect, the transport falls back to bounded polling of the same reconciliation endpoint. It must not fall back to re-running the turn.

### 7.8 Cancellation, terminal races, and supersede protocol

Add `chat_turn_signals` or an equivalent append-only control table:

- `id`
- `turn_run_id`
- `kind = 'cancel'`
- `reason = 'user_cancelled' | 'superseded' | 'timeout' | 'operator_cancelled'`
- `source`
- `created_at`
- `consumed_at`
- `consumed_by_generation`

`POST /api/agent/v2/turns/<id>/cancel` must be idempotent and:

1. Verify turn ownership and lock the turn row in `request_agentic_chat_turn_cancel(...)`.
2. If the turn is already terminal, make no change and return `200 { outcome: 'already_terminal', status, terminal_event_id }`.
3. If it is queued and unclaimed, atomically cancel the queue row and finalize the turn as `cancelled`, including its terminal projection/event; return the terminal outcome.
4. If it is running, atomically set the first accepted `cancel_requested_at/reason` and insert-or-resolve one cancel signal. Return `202 { outcome: 'cancel_requested' }`.
5. After commit, publish a low-latency internal control notification. Notification failure does not erase the durable request.

Completion/cancellation race policy:

- `finalize_agentic_chat_turn(... outcome in ('completed', 'failed'))` locks the row and succeeds only for the current generation/owner while status is `running` and `cancel_requested_at is null`.
- If cancel committed first, completion/failure is rejected; the worker follows the cancellation finalization path and cannot publish a competing terminal outcome.
- If completion committed first, a later cancel returns `already_terminal` and cannot rewrite the message, status, reason, or terminal event.
- Cancelled/failed finalization uses the same compare-and-set RPC. Repeated calls return the already-committed terminal record.
- The outcome-appropriate final/partial assistant message (when required), stream-state terminal projection, terminal durable event, and status are committed together. Broadcast happens afterward, so reconciliation and live delivery cannot disagree about the winner.

Worker behavior:

- Maintain `Map<turnRunId, AbortController>` for active turns.
- Listen for targeted cancellation notifications.
- Poll durable cancellation state every 500–750 ms as a fallback using one batched query/RPC for all active `(turn_id, generation)` pairs on that worker, then fan out locally. Size the RPC's accepted-id bound to at least the configured per-consumer concurrency, fail startup when that invariant is false, and do not split one interval into per-turn/chunk queries or timers.
- Combine user cancel, queue timeout, shutdown, and wall-clock deadline signals.
- Thread the combined signal through model streaming and every tool adapter.
- Stop emitting application events after the signal except cancellation/finalization events.
- Supply the partial assistant response and existing interrupted-message metadata to the terminal finalizer; do not persist it through a separate racing path.
- Finalize terminal `cancelled` through the compare-and-set RPC before emitting terminal `done`.

The UI enters `stopping` only for a nonterminal acknowledgement (`cancel_requested` or `legacy_abort_requested`), continues listening until terminal cancellation/reconciliation or a definitive legacy not-admitted result, and immediately renders a returned terminal outcome for `cancelled`/`already_terminal`.

Supersede is a durable two-step flow, not the current best-effort cancel hint followed by a fixed delay:

1. Request cancellation of the active turn with reason `superseded`.
2. Keep the replacement draft/attachments locally and wait until Realtime or reconciliation proves the old turn terminal.
3. Only then negotiate/admit the replacement turn. If cancellation exceeds its deadline, show “still stopping” and do not create a second active turn.

This rule applies when the previous handle is worker or legacy. For a legacy request that has not exposed a durable `turn_run_id` yet, the controller must wait until abort/start completion proves that it was not admitted or yields the durable id to await; a timeout remains “still stopping,” not permission to send. The ordinary admission RPC never cancels an existing turn implicitly. The active-turn conflict response includes the existing turn id/mode so the UI can resume the wait. This preserves the one-active-turn invariant even when a provider ignores abort.

Cancellation cannot undo an already committed external/domain side effect. Every mutating tool must check cancellation before reservation, after reservation, and at the closest safe pre-invocation/commit boundary, while carrying the stable effect idempotency key.

### 7.9 Disconnect, retry, and recovery policy

- Browser disconnect: execution continues.
- Realtime disconnect: execution continues; UI reconciles on reconnect.
- Cancel before claim: queue job and turn become cancelled without model work.
- Cancel during model/tool I/O: AbortSignal is triggered; worker finalizes partial/cancelled state.
- Admission/claim failure before `execution_started_at`: queue retry is allowed when explicitly classified transient.
- Immediately before the first provider/model call, atomically set `execution_started_at` under the current generation. Unknown errors and timeouts after that point are non-retryable by the generic queue processor.
- Worker failure after model/tool execution starts but before any possible mutation: a bounded retry may be allowed only when the error is explicitly classified safe; the retry receives a new execution generation and a reset current-generation stream state.
- Before invoking a mutating tool or external operation, reserve its stable effect id and set `mutation_reserved_at`. At the final fenced `reserved -> started` transition immediately before adapter invocation, atomically set `irreversible_boundary_at` under the current generation as specified in Section 7.3. A cancelled/unstarted reservation remains safely abandonable; crossing the started boundary permanently disables automatic full-turn replay.
- Worker failure after a mutating tool may have started: do not replay the whole turn automatically. Mark it honestly failed/recoverable, reconcile known tool executions, and let the user initiate a new turn.
- Stale worker: processing token and execution generation prevent every domain write and publication, not only finalization; the event sink drops events after abort/ownership loss.
- Stale queued/running turns: a chat-specific recovery routine inspects `execution_started_at`, `mutation_reserved_at`, effect state, `irreversible_boundary_at`, current generation, queue ownership, and wall-clock limits before retrying, cancelling, or failing them.
- If the domain turn is already terminal but its queue row is still processing because queue completion failed, chat-specific recovery reconciles the queue row to that terminal result and never invokes the processor again.
- The generic stalled-job recovery query must exclude `agentic_chat_turn` (or delegate those rows to the chat-specific routine). Chat processor errors must be exhaustively mapped to typed queue outcomes; they must not fall through the current unknown-error-is-transient behavior.
- Status note (2026-07-29): the 2026-07-23 queue hardening already gives generic stalled recovery exponential backoff with jitter, attempt caps into `failed`, and a per-job heartbeat that refreshes `updated_at` while a job runs. It remains job-type-indiscriminate, so the chat exclusion above is still required — the hardening reduces blast radius but does not make requeue of a post-start chat turn safe.

## 8. Runtime boundaries

### 8.1 Shared package

Create a Node-portable package such as `packages/agentic-chat-runtime`.

The package must not import:

- `$app/environment`
- request/response/SSE primitives
- browser state
- Vercel-specific APIs
- Railway-specific APIs
- a global service-role Supabase client

Recommended top-level interface:

```ts
runAgenticChatTurn(command, ports): Promise<AgenticChatTurnOutcome>
```

Ports should cover:

- context/history/prepared-prompt loading
- prompt construction
- LLM streaming
- tool catalog and execution
- event sink
- turn/message/tool persistence
- supervisor/checkpoints
- deterministic post-processing
- telemetry/cost accounting
- cancellation and clock
- debug artifacts

### 8.2 Parity includes route-owned behavior

Moving only `streamFastChat` is insufficient. The current route also owns behaviors that affect product quality and persistence, including:

- access and scope checks
- session/prepared-prompt handling
- attachments/live vision validation
- context/history composition
- tool execution adapters
- incremental tool-execution persistence
- context shifts
- turn supervisor/checkpoints
- deterministic research capture and forward-carry safeguards
- assistant-message persistence
- timing/prompt observability
- agent-state reconciliation
- cancellation and partial-message finalization

Phase 0 must produce a parity ledger mapping each current behavior to its target shared-runtime or adapter owner and its proving test.

### 8.3 Frontend transport interface

The existing stream controller should depend on a transport contract rather than raw `fetch`/SSE details:

```ts
interface AgentChatTransport {
	startTurn(input, handlers): Promise<TurnHandle>;
	cancelTurn(handle, reason): Promise<CancelTurnResult>;
	detach(handle): void;
	reconcile(
		handle,
		cursor?: { executionGeneration: number; afterDurableSequence: number }
	): Promise<TurnSnapshot>;
}

type TurnHandleBase = {
	contractVersion: string;
	streamRunId: string;
	clientTurnId: string;
};

type TurnHandle =
	| (TurnHandleBase & {
			executionMode: 'legacy_sse';
			sessionId: string | null; // may be stream-created
			turnRunId: string | null; // hydrated from the earliest acknowledgement
	  })
	| (TurnHandleBase & {
			executionMode: 'worker_realtime';
			sessionId: string;
			turnRunId: string;
	  });

type CancelTurnResult =
	| { outcome: 'cancel_requested' }
	| {
			outcome: 'cancelled';
			status: 'cancelled';
			terminalEventId: string;
	  }
	| {
			outcome: 'already_terminal';
			status: 'completed' | 'failed' | 'cancelled';
			terminalEventId: string;
	  }
	| { outcome: 'legacy_abort_requested' };
```

Implementations:

- `LegacySseAgentChatTransport`
- `WorkerRealtimeAgentChatTransport`

An `AgentChatTransportResolver` obtains/validates the server lease and selects the implementation. Both feed the existing event application layer so message rendering and tool/thinking UI do not fork. The controller stores the returned `TurnHandle` and uses it for cancel, detach, and reconcile; it does not re-read a feature flag for an active turn.

### 8.4 Logical queue and control-loop isolation

Phase 3 runs in the existing worker deployment but must not register `agentic_chat_turn` on the existing general `queue`, whose single `batchSize` is shared by every registered processor. Instantiate a separate `SupabaseQueue`/consumer filtered only to `agentic_chat_turn` with:

- `CHAT_CONCURRENCY` (default `1` for Phase 3; independently validated and capped)
- `CHAT_POLL_INTERVAL_MS` (one-second durable fallback)
- `CHAT_WORKER_TIMEOUT_MS`, `CHAT_STALLED_TIMEOUT_MS`, and chat-specific drain/recovery settings
- its own active-job registry, wake-up, health snapshot, claim-failure metrics, and graceful drain

Refactor retry limits, timeout resolution, error classification, and stalled recovery into instance/processor policy inputs. The current class still consults module-global `queueConfig` while executing/failing jobs, so constructing a second instance with only a different `batchSize` is not sufficient isolation.

The general consumer never claims `agentic_chat_turn`; the chat consumer never claims general jobs. Starting both consumers in one process is logical isolation, not resource isolation, so provider, memory, event-loop, and database-connection ceilings still apply across the process. Phase 6 moves the same chat-only entrypoint/configuration into its own Railway service without changing queue semantics. Health is unhealthy if either required consumer is wedged, and dashboards report chat slots separately from general slots.

The batched text flush and batched cancel observer are worker-level services owned by the chat consumer. Their timers stop during drain, reject new work after shutdown begins, and flush/finalize within the bounded drain budget.

## 9. Phased implementation plan

| Phase                           | Outcome                                                                                                              | User exposure                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 0. Baseline and contracts       | Audited parity ledger, contracts, SLOs, and transition rules                                                         | None                                  |
| 1. Shared runtime extraction    | Legacy SSE runs through the reusable runtime                                                                         | Existing production path only         |
| 2. Safe durable control plane   | Adds terminal CAS, leases, session-inline admission, batching, fencing, lossless reconciliation, and retained inputs | Fixture/internal transport tests only |
| 3. Thin worker slice            | One constrained real turn runs on isolated chat slots with durable Stop and server-selected transport                | Developers/admins only                |
| 4. Full parity                  | Worker covers the complete current agentic-chat behavior                                                             | Internal users only                   |
| 5. Reliability verification     | Failure injection, fencing coverage, idempotency, sweepers, and fallback paths pass                                  | Internal users only                   |
| 6. Dedicated service and canary | Chat workers are physically isolated and traffic ramps gradually                                                     | 1% → 100% cohorts                     |
| 7. Capacity validation          | Safe slot/replica configuration for 100 simultaneous turns is measured                                               | Controlled load tests                 |
| 8. Default and retirement       | Worker path becomes default; legacy is retired after soak                                                            | General availability                  |

### Phase 0 — Baseline, contracts, and audit lock

**Purpose:** Make parity measurable before code moves.

Deliverables:

- Record fresh test baselines; do not rely only on counts in older docs.
- Create the parity ledger covering every route-owned behavior listed above.
- Freeze and version `ChatTurnCommand`, `AgentStreamEvent`, `TurnSnapshot`, and `ChatTurnSignal` contracts.
- Freeze and version `AgentChatTransportLease`, `TurnHandle`, `CancelTurnResult`, and mutation-effect reservation/receipt contracts.
- Document the state transition table, allowed owners, idempotency key, fence, and reconciliation mechanism for each transition.
- Lock the canonical request-hash algorithm, per-generation sequence rules, deterministic event identity, normalized immutable history-snapshot format/hash, and turn-input-artifact retention/freshness policy.
- Lock the terminal race truth table, supersede wait contract, mutation-effect lifecycle, transport-lease validation/kill semantics, session-inline admission key, queue isolation topology, publisher high-water behavior, and batched cancel query.
- Inventory every direct `authenticated` content-read/write/execute policy or grant on worker-owned chat tables, `agentic_chat_prepared_prompts`, and its cleanup/consume functions, plus every legacy/prewarm code path that currently depends on them.
- Define the chat-specific queue error mapping and stalled-turn decision table for pre-start, execution-started, and irreversible-boundary states.
- Define preliminary SLOs and error taxonomy.
- Write migration rollback rules before schema work begins.
- Resolve the audit decisions in Section 15.

Tests/baselines to record:

- Focused orchestrator/unit suites.
- Route-level stream suite.
- Stream controller and SSE handler suites.
- Agentic E2E scenario suite, with special coverage for restraint, multi-operation turns, rescheduling, research capture, forward-carry, and project organization.
- Current timing distribution for admission, first event, first text, tool execution, final persistence, and done.

Exit gate:

- Independent audit accepts the contracts, phase order, and parity ledger.
- All 12 corrections locked in Section 15 have named proving tests and no unresolved implementation choice that can change their safety semantics.
- No known current behavior lacks an owner or proving test.

### Phase 1 — Shared runtime extraction under legacy SSE

**Purpose:** Create one reusable turn runtime without changing production transport or behavior.

Deliverables:

- Add `packages/agentic-chat-runtime` with transport-neutral contracts and ports.
- Remove `$lib`/`$app` coupling from code moved into the package.
- Introduce an event-sink interface; wrap current SSE as one sink.
- Add a type-level exhaustiveness test proving every current `AgentSSEMessage` payload variant is representable as an `AgentStreamEvent` — the transport-neutral type must be a generalization, not a parallel type that silently drops variants.
- Introduce the transport-neutral `TurnHandle`/cancel-result contracts and route the current SSE controller through them without changing the server-selected mode yet.
- Move route-owned execution behaviors behind composable services/adapters in small steps.
- Add a service-only `admit_legacy_agentic_chat_turn(...)` RPC. Under the same per-user advisory transaction lock domain as worker admission (so the two modes mutually exclude during canary) it resolves duplicate `client_turn_id` first, selects and returns the bounded fallback history as it existed before the new message, inserts/resolves `chat_turn_runs(status='running', execution_mode='legacy_sse')`, and inserts/resolves the user message atomically. The SSE route uses the returned history when no prepared history wins and no longer persists the user message later through a detached promise.
- Centralize subsequent legacy writes to `chat_turn_runs`, `chat_turn_events`, and `chat_turn_checkpoints` behind controlled server-side writers/RPCs so Phase 2 can revoke authenticated direct writes without breaking SSE.
- Move prepared-prompt content reads, creation, consume/update, and cleanup behind reviewed server-only writers/RPCs, and route `chat_prompt_snapshots` writes through the server-only observability writer so Phase 2A can revoke its authenticated INSERT policy. Return only bounded client metadata through the authenticated web route, and remove every dependency on authenticated direct table access or cleanup-function execution before Phase 2 revokes those capabilities.
- Keep route auth, HTTP parsing, and SSE response creation in `apps/web`.
- Preserve the current endpoint and request body.
- Add normalized event-log and persistence snapshots to tests.

Migration rule:

- Extract behavior first; do not simplify policies while moving them.
- The approved Phase 1 correctness change is atomic legacy turn/user-message admission with transactionally pre-message fallback history; it must be differential-tested against the current prompt/history behavior before rollout.
- Every extraction lands with focused regression tests and the legacy path remains green.

Exit gate:

- Legacy SSE uses the shared runtime for the intended turn lifecycle.
- Legacy duplicate admission produces exactly one running turn and one user message, and fallback history is transactionally captured before that message.
- Legacy SSE and prewarm no longer depend on authenticated direct table writes/function execution that Phase 2 will revoke.
- Baseline behavior and scenario scores are no worse than Phase 0 thresholds.
- No worker path is exposed to users yet.

### Phase 2 — Safe durable turn control plane and Realtime foundation

**Purpose:** Establish durable admission, database-enforced ownership, safe retry/recovery boundaries, retained execution inputs, lossless reconstruction, and authenticated live transport before any real asynchronous model execution.

Phase 2 is a gated sequence of small work packages, not one migration or pull request:

1. **Phase 2A — Trust and schema foundation:** staged columns/tables, server-only prepared/input artifacts, permission lockdown, active-turn/idempotency indexes, generated types, and rollback verification.
2. **Phase 2B — Ownership and atomicity:** claim/generation fencing, worker atomic admission plus legacy-admission interoperability, effect reservation/begin, terminal compare-and-set finalization, typed retry/recovery boundaries, and capacity rejection.
3. **Phase 2C — Event and control transport:** bounded publisher, generation-aware event writes, stream projection, batched cancel observation, private Realtime authorization, and reconciliation transaction.
4. **Phase 2D — Client/fixture proof:** compose-time lease prefetch, mount-time user-channel lifecycle, session-inline admission, worker transport adapter, duplicate/supersede behavior, and the complete Phase 2 exit matrix using fake providers/tools only.

Each work package must be independently deployable with the worker rollout flag still disabled. A package advances only after its own migration rollback, security, and focused regression tests pass. Phase 3 remains the first real asynchronous model execution.

Deliverables:

- Staged, backward-compatible migrations for `chat_turn_runs` extensions: nullable/additive columns, legacy backfill/defaults, dual-writer deployment, validation, and only then `NOT NULL` constraints.
- `chat_turn_stream_state`, `chat_turn_signals`, and server-write-only immutable `chat_turn_input_artifacts` containing the exact normalized history snapshot plus prepared execution inputs, with version/hash validation and active-turn retention protection.
- Staged `execution_mode`/transport-decision columns with legacy defaults and database immutability after insert.
- `chat_turn_events.execution_generation`, per-generation uniqueness, and deterministic event identities, with existing rows backfilled to the legacy generation.
- Worker-owned `chat_turn_effects` schema/reservation RPC plus nullable `chat_tool_executions.effect_id` telemetry link, effect states, canonical argument hash, and downstream receipts.
- Updated active-turn unique index covering queued/running states.
- Unique `(user_id, client_turn_id)` and `(session_id, client_turn_id)` turn admission keys.
- Atomic `create_agentic_chat_turn_with_job` RPC with duplicate-first resolution, canonical request-hash conflict detection, pre-generated identities, immutable normalized history snapshot, and trusted prepared-context claim/copy into the turn input artifact.
- Atomic/idempotent `request_agentic_chat_turn_cancel` RPC implementing queued cancellation and the terminal-race truth table.
- One compare-and-set `finalize_agentic_chat_turn` RPC that atomically persists/resolves the assistant message, terminal projection/event, and terminal status before Broadcast.
- Service-only claim/heartbeat/write/finalize/effect-reservation primitives that atomically validate the processing token, current execution generation, allowed predecessor state, and ownership relationship on every worker-owned event, snapshot, checkpoint, message, tool, and status write.
- `execution_started_at`, `mutation_reserved_at`, and fenced effect `reserved -> started`/`irreversible_boundary_at` transitions plus an exhaustive chat queue outcome mapping; exclude chat jobs from unconditional generic stalled-job requeue.
- `agentic_chat_turn` queue enum/type and shared payload/result types.
- Chat-only consumer configuration and claim filters independent of general `QUEUE_BATCH_SIZE`, with `CHAT_CONCURRENCY=1` as the internal default.
- A pre-admission capacity gate with database-enforced hard queued/active caps and server-observed queue-age/provider-pressure thresholds. Rejection returns typed `429/503` plus `Retry-After` before the user message, turn, prompt claim, or queue row is written.
- `POST /api/agent/v2/transport` with signed user/client-turn/context-bound leases, contract versioning, decision ids, and an emergency kill epoch.
- Session-inline admission: `create_agentic_chat_turn_with_job` accepts a null session id and resolves-or-creates the session in-transaction from the validated context target, with unique `(user_id, client_turn_id)`; draft prewarm remains `ensure_session: false` and no separate bootstrap endpoint/claims table exists.
- Private `chat-user:<user_id>` Broadcast authorization policy (topic user id must equal `auth.uid()`), subscribed at chat-surface mount.
- Authenticated `POST /turns`, `GET /turns/<id>`, `GET /turns?session_id=<id>` (active-turn handle discovery for reload/second-tab adoption), `GET /reconcile`, and `POST /cancel` routes; `GET /reconcile` is backed by one generation-consistent database RPC/transaction rather than independent table reads.
- `queue_jobs` write lockdown: `add_queue_job` definer-gated with a job-type allowlist (or authenticated INSERT revoked with user-triggered enqueues moved behind definer RPCs), plus a guard rejecting `agentic_chat_turn` from non-service roles.
- `reset_stalled_jobs` gains a job-type include/exclude parameter; each consumer instance passes only its own registered types, in both directions.
- A Phase 2C interleaving fixture: an immediate first-text flush racing three semantic events through the single per-turn writer slot must produce zero rejected writes and a gap-free durable prefix.
- Server-side Realtime publisher and a fake/fixture event producer using bounded per-turn accumulators, one global batch flush, accepted-row fencing, and explicit high-water degradation to reconciliation.
- One batched cancel-observation RPC/loop for all active turn/generation pairs on a consumer; its accepted-id bound is validated against that consumer's maximum concurrency, with no per-turn/chunk polling timers or queries.
- Generation-aware reconciliation with a complete current text/projection snapshot, independent durable semantic cursor, subscribe-time live buffering, and active-turn retention that cannot truncate the text prefix.
- History/prepared-context ports that verify and use the immutable turn input artifact instead of mutable message rows, client-writable prepared rows, or current worker-start state.
- Retention cleanup for terminal stream/event/effect/input-artifact rows and expired prepared prompts that never deletes active-turn data or referenced input, or an `uncertain` effect before it is explicitly reconciled and reaches its separately documented audit-retention boundary.
- RLS/grant lockdown: create every new worker-owned table with no `anon`/`authenticated` DML from its first migration; input artifacts also have no direct client `SELECT`. After the Phase 1 legacy/prewarm-writer migration is deployed, revoke existing direct authenticated writes to `chat_turn_runs`, `chat_turn_events`, and `chat_turn_checkpoints`; revoke direct authenticated `SELECT`/writes on `agentic_chat_prepared_prompts`; and revoke authenticated execution of prepared-prompt cleanup/consume functions. All control/prepared-input writes are RPC-only and validate session/user/project relationships and artifact integrity. Client-visible prepared-prompt metadata is returned only through a bounded authenticated web API.

Schema rollout rule:

- Migrations must be additive until the worker path completes rollout, with three explicit exceptions handled as safe create-new-then-drop-old sequences: the event-sequence unique key becomes generation-scoped, the running-only session index becomes queued+running, and the status CHECK gains `queued`. `CREATE INDEX CONCURRENTLY` cannot run inside a migration transaction — those steps are separate non-transactional migrations. `queue_type` is a Postgres enum: `ALTER TYPE ... ADD VALUE 'agentic_chat_turn'` is irreversible and must commit before any migration that uses the value.
- Audit and deterministically resolve any existing duplicate client-turn/active-turn rows before validating new unique indexes; never let constraint creation choose/delete a winner implicitly.
- Legacy `status='running'` inserts and command-column omissions must continue to work through the compatible server writer/defaults.
- Generated database types are refreshed in the same change.

Exit gate:

- Duplicate admissions create one turn, one user message, and one queue job.
- A duplicate submitted while its original turn is active returns that turn; a reused `client_turn_id` with different canonical content returns 409 and creates/claims nothing.
- Unauthorized users cannot subscribe, query, cancel, or directly insert/update another user’s turn data; authenticated direct writes to worker control/input tables, direct reads of input artifacts/prepared-prompt contents, and direct execution of prepared-prompt cleanup/consume functions fail even for owned rows.
- Two simulated workers cannot persist an event, snapshot, checkpoint, message, tool row, or terminal state from a stale generation.
- A fixture turn can stream, disconnect, reconnect during concurrent event publication, rebuild its full text and semantic projection, change generation, and cancel without invoking a real model.
- A cancellation that commits before completion always wins; completion that commits first makes later cancellation an idempotent terminal no-op. Exactly one terminal event/status exists, with exactly one assistant message for completion and at most one nonempty partial message for failure/cancellation.
- Supersede never admits the replacement until the previous turn is durably terminal, including when abort is ignored.
- A mutation fixture reserves one effect and sets only `mutation_reserved_at`, can cancel/abandon it safely before invocation, sets `irreversible_boundary_at` only in the fenced `reserved -> started` transition, rejects reservation/begin after accepted cancellation or ownership loss, reuses the effect for adapter retries, returns the existing receipt on duplicate, and never uses provider `tool_call_id` as the idempotency key. A crash with no queryable/idempotent downstream result becomes `uncertain`, not an automatic retry.
- Server/client transport disagreement, an admission-response loss followed by lease expiry/flag change, kill-epoch rejection of a genuinely unused lease, and duplicate admission all converge to the stored execution mode without starting both transports.
- A no-lease compatibility client can enter only the persisted legacy path; it cannot admit, attach to, or reconcile a worker turn.
- A first-turn worker flow with a mount-time user channel creates exactly one session inside admission — including under concurrent duplicate admissions — and receives/reconciles the first event; a failed admission leaves no session behind.
- General jobs saturating `QUEUE_BATCH_SIZE` do not consume the chat slot; a chat turn does not consume a general slot.
- A 100-turn fixture uses one batched cancel query per interval and respects configured publisher memory/high-water bounds.
- The same 100-turn fixture records database statements, affected rows, payload bytes, flush latency, and WAL/write rate per second; the measured snapshot/event cadence must remain inside the preliminary Phase 0 database budget before Phase 3 can begin.
- Capacity rejection creates no session, prompt claim, message, turn, or queue row. Concurrent admissions cannot exceed a hard cap, while soft pressure thresholds may use a documented sampling tolerance.
- The admitted user message is present exactly once in prompt construction, including a delayed claim and a retry generation. Editing/deleting a source history row after admission cannot change the frozen worker prompt.
- A queued turn remains executable after the normal prepared-prompt cache TTL and cleanup pass; cleanup cannot delete an input artifact referenced by an active turn, and an authenticated caller cannot tamper with the source prepared prompt before claim/copy.
- Pre-start transient failures can retry, while unknown/post-start failures and generic stalled recovery cannot blindly replay the turn.
- Legacy SSE remains unaffected.

### Phase 3 — Thin internal worker vertical slice

**Purpose:** Prove queue pickup, shared runtime invocation, live output, persistence, Stop, and reconciliation with the smallest real path.

Initial operating envelope:

- Internal/admin accounts only.
- One worker process.
- `CHAT_CONCURRENCY=1`, optionally `2` after the first load smoke.
- One active turn per session.
- No generic automatic replay after execution has begun; only a retry explicitly classified safe under Section 7.9 may receive a new generation.
- Phase 2 security, terminal-CAS, transport, session-inline admission, batching, fence, retry, history, prepared-artifact, and reconciliation gates are already active—not feature-flagged follow-up work.
- Start with a constrained tool surface; mutating tools remain disabled until their idempotency review is complete.

Deliverables:

- Start a separate chat-only queue instance and register `agentic_chat_turn` only there; do not add it to the general queue instance.
- Add a chat-specific low-latency wake mechanism with a one-second polling fallback; do not change the generic five-second queue globally.
- Claim/increment execution generation before runtime execution.
- Set `execution_started_at` atomically before the first provider call; never let post-start exceptions fall through to the generic transient retry path.
- Add active AbortController registry and the worker-level batched durable cancellation watcher.
- Publish Realtime events and persist coalesced stream state only through the fenced, bounded Phase 2 batcher.
- Verify and load the immutable turn input artifact—exact normalized history plus prepared execution inputs—before starting the provider; do not reload source messages or prepared-prompt rows.
- Finalize the assistant message, terminal projection/event, and status atomically before terminal Broadcast.
- Implement compose-time transport-lease prefetch, `TurnHandle` dispatch, mount-time user-channel subscription, and the worker Realtime frontend transport behind the server-controlled rollout.
- Replace fixed-delay supersede with cancel-terminal-wait-admit.
- Add a kill switch that routes all new turns to legacy SSE.

Exit gate:

- Internal user completes a real read-only turn end to end.
- Navigation/Realtime loss does not cancel the turn.
- Reconnect restores the exact partial/final output.
- Stop works while queued, during provider streaming, and between tool stages.
- Stop/completion races produce exactly one durable terminal outcome, and supersede cannot produce overlapping active turns.
- Saturating general-worker slots does not delay an otherwise claimable chat turn beyond the chat consumer's SLO.
- Realtime pressure degrades to reconciliation without unbounded memory, unbounded promises, or loss of terminal truth.
- Admission pressure rejects new work before persistence with a clear retryable response while admitted turns continue normally.
- Worker restart produces an honest terminal/recoverable state rather than an orphaned running turn.
- Forced two-worker, timeout, stale-generation-write, source-history mutation, prepared-prompt tamper/cleanup, normal cache-cleanup, and chat-stalled-recovery tests pass before increasing concurrency above one.

### Phase 4 — Full worker behavioral parity

**Purpose:** Make the worker path as capable as the current web path.

Workstreams:

1. Session/prewarm/context/history parity.
2. Attachment and live-vision parity.
3. Prompt, gateway, skill, and direct-tool parity.
4. Tool execution, validation, affected-entity, context-shift, and stable mutation-effect reservation/receipt parity.
5. Supervisor/checkpoint parity.
6. Deterministic research/forward-carry and other route-side quality safeguards.
7. Message, tool-execution, prompt snapshot, timing, cost, and session-metadata parity.
8. Cancellation, partial result, error, and finalization parity.
9. Consumption-billing gate parity: frozen-account rejection at admission and gate re-evaluation at terminal finalization, so worker-mode spend is measured no later than legacy-mode spend.

Required test mechanism:

- A deterministic adapter uses canned provider streams and mock tool results to run the legacy and worker adapters against the same fixtures.
- Compare normalized ordered events, messages, tool rows, checkpoints, turn outcomes, and metadata.
- Live tests run against isolated test users/projects; never shadow live mutating turns.

Exit gate:

- Parity ledger is complete.
- Differential tests pass for success, clarification, read-only tools, mutating tools, supervisor checkpoint, cancellation, timeout, and provider error.
- Every reachable mutating adapter accepts the reserved `effect_id`; unsupported downstream idempotency is classified no-retry/uncertain and covered by reconciliation tests.
- Agentic E2E quality scores meet or exceed the Phase 0 baseline.
- Feature remains internal-only.

### Phase 5 — Reliability verification and operational hardening

**Purpose:** Expand failure injection and operational coverage for the safety mechanisms required before Phase 3; close gaps, but do not postpone their first implementation to this phase.

Deliverables:

- Productionized chat-specific stale-turn sweeper using turn progress, queue claim state, execution/irreversible boundaries, generation, and wall-clock limits.
- Automated coverage/audit proving Phase 2 domain execution fencing remains present on every checkpoint, event, snapshot, message, tool execution, and finalization write.
- Automated inventory/coverage proving the Phase 4 stable effect-id contract remains enforced for every mutating tool reachable by chat.
- Expand the Phase 2 typed retry classification and observability: safe-before-start, transient-safe, permanent, cancelled, uncertain-external-commit.
- Reconciliation path for uncertain external commits where supported.
- Graceful shutdown: stop claims, broadcast unhealthy/draining state, abort or drain within budget, and leave reclaimable work.
- Event/snapshot retention cleanup.
- Realtime outage and polling-fallback handling.
- Health endpoint reporting last successful claim, Realtime connectivity, DB connectivity, active turns, and event-loop lag.

Failure-injection matrix:

- Duplicate POST admission.
- Completion and cancellation race with cancellation committing first.
- Completion and cancellation race with completion committing first.
- Supersede where the provider honors abort, ignores abort, and terminal reconciliation is delayed.
- Two workers race for one job.
- General queue is saturated while a chat slot is free, and vice versa.
- Cancel before claim.
- Cancel during model stream.
- Cancel before and after a mutating tool commit.
- Cancel after effect reservation but before `reserved -> started`; the effect remains unstarted and the turn has not crossed `irreversible_boundary_at`.
- Mutating adapter retries with a changed provider tool-call id but the same reserved effect id.
- Worker dies after effect reservation, after downstream commit, and before receipt persistence.
- Browser/Realtime disconnect.
- Missed or duplicated Broadcast event.
- Sequence gap and snapshot reset.
- Reconciliation response racing with live events and a generation change.
- Realtime publisher exceeds per-turn/global high-water and hard bounds while persistence/Broadcast remain unavailable through terminal finalization, including a provider that cannot pause.
- Batched cancel polling returns mixed current/stale generations or fails for one interval.
- Transport flag changes between lease issuance and admission; emergency kill epoch rejects an unused lease; an admitted turn with a lost response is renegotiated only to its stored mode.
- Concurrent duplicate first-turn admissions race inline session creation; the user channel is down at Send and readiness falls back to authenticated polling.
- An authenticated caller attempts to forge an `agentic_chat_turn` queue job directly; the guard rejects it and no capacity is consumed.
- The access token refreshes or expires during a mounted chat surface; the channel re-authenticates on `TOKEN_REFRESHED` and auth expiry reads as not-ready at Send.
- Page reload during a running worker turn; the client discovers and adopts the active-turn handle and resumes live output.
- Legacy supersede occurs before and after the stream exposes its durable turn id.
- Worker termination before provider call.
- Worker termination after a read tool.
- Worker termination after an uncertain mutating call.
- Timeout where provider ignores abort.
- Stale worker attempts event publication/finalization.
- Generic stalled-job recovery encounters a post-start chat job.
- Prepared-prompt cache cleanup runs while a turn is queued/running.
- Authenticated direct prepared-prompt mutation/cleanup attempts fail after lockdown.
- A source history message is edited/deleted after admission; the delayed/retried worker still receives the exact frozen normalized history artifact.
- Final message/terminal event transaction commits but terminal Broadcast is not delivered.
- Domain finalization commits but queue completion RPC fails; recovery must reconcile the queue row without rerunning the turn.
- Terminal state saved but client has stale partial text.

Exit gate:

- No failure case leaves an indefinitely active turn.
- No stale executor can finalize or mutate after losing ownership.
- Mutating tool retries do not duplicate effects in covered scenarios.
- Cancellation/completion produces one terminal record/event in both lock orderings, and supersede never overlaps turns.
- Chat concurrency remains isolated from general queue saturation.
- Publisher/cancel control loops remain within configured query, promise, and memory bounds.
- Transport/channel failures cannot start both transports or lose an admitted turn's first output.
- Reconnect always converges to the durable final message/status.

### Phase 6 — Dedicated service and canary rollout

**Purpose:** Physically isolate interactive chat capacity and gradually expose it to production traffic.

Deliverables:

- Add a dedicated worker entrypoint, for example `apps/worker/src/chat-worker.ts`, that starts the already-proven chat-only consumer, batch publisher, cancel observer, and health endpoint without changing their Phase 3 semantics.
- Create a Railway service using the existing repository/image with the dedicated start command.
- Do not start the general scheduler or unrelated processors in the chat service.
- Reserve independent chat concurrency and timeout configuration.
- Validate `CHAT_CONCURRENCY`/timeout/high-water environment values at startup and fail closed on invalid production configuration.
- Add deployment drain handling and release compatibility checks.
- Add cohort routing and dashboards comparing legacy versus worker paths.

Rollout cohorts:

1. Developers/admins.
2. Named internal users.
3. 1% of eligible turns.
4. 10%.
5. 25%.
6. 50%.
7. 100% after soak and audit sign-off.

At every step, new transport leases can be returned to legacy SSE immediately. Ordinary unused worker leases remain valid for their short TTL; an emergency rollback rotates the kill epoch so those unused leases renegotiate. In-flight/admitted worker turns continue under their stored owner/mode or are explicitly cancelled; they are not silently duplicated on legacy.

Exit gate:

- Dedicated service survives deploy/restart and drains predictably.
- Canary SLOs and quality parity remain inside thresholds.
- Operational cost and resource headroom are measured, not inferred.

### Phase 7 — Capacity validation for 100 simultaneous turns

**Purpose:** Separate infrastructure capacity from provider capacity and find the safe worker-slot configuration.

Load stages:

1. 1, 2, 5, 10 simultaneous turns.
2. 25 simultaneous turns.
3. 50 simultaneous turns.
4. 100 simultaneous turns.

Run each stage twice:

- Synthetic provider/tool adapters to measure BuildOS, Postgres, queue, and Realtime overhead without model limits/cost.
- Rate-limited real-provider tests on a smaller statistically useful sample to measure provider behavior and total turn latency.

Measure:

- admission latency
- queue pickup latency
- time to first worker event and first text
- active/queued turn counts
- event-loop lag, CPU, RSS, open sockets, and graceful-drain time
- model/tool concurrency and provider 429/5xx rates
- Realtime send/receive failures and reconnect count
- Realtime fanout factor (delivered messages per published event across tabs × sessions on the per-user topic) and message quota/cost headroom
- database connections, query latency, lock waits, writes/second, and table growth
- snapshot/event write rate
- publisher pending bytes/events, flush batch size/latency, high-water duration, and reconcile-only transitions
- cancel fallback queries per interval, ids per batch, and query latency
- cancellation acknowledgement and terminal latency
- duplicate/stale event rejection
- transport lease renegotiation/mismatch and inline session-creation dedup rates
- effect reservation/replay/uncertain-commit counts by tool
- completion/error/cancel rates
- cost per completed turn

Scale policy:

- Scale worker slots based on observed I/O concurrency, memory, and provider limits, not daily active users alone.
- Add replicas only after a single replica’s safe concurrency is known.
- Preserve per-session and per-user fairness.
- Tune the admission backpressure already required in Phase 2/3 when queue-age, active-turn, publisher-pressure, or provider-cap thresholds are exceeded; return `429/503` with a typed code and `Retry-After` before durable admission rather than accepting unbounded work.

Exit gate:

- 100-turn synthetic test meets the infrastructure SLOs without correctness failures.
- Real-provider concurrency limits and the required replica/slot count are documented.
- Railway and Supabase headroom/cost are measured for the chosen production configuration.

### Phase 8 — Default routing and legacy retirement

**Purpose:** Make worker execution the default only after a stable production soak.

Deliverables:

- Route 100% of eligible new turns to worker execution.
- Retain legacy SSE behind the kill switch for a defined soak window.
- Confirm old clients and in-flight legacy turns remain compatible.
- Use no-lease compatibility telemetry to set and satisfy an explicit minimum-client-version/usage cutoff before removing the server-internal legacy decision path.
- Remove compatibility aliases, old cancel-hint metadata, and legacy-only code only in separate cleanup changes.
- Update canonical agentic-chat documentation and runbooks.

Exit gate:

- Soak window has no unresolved P0/P1 worker-path incidents.
- Rollback drill has been executed successfully.
- Independent review approves legacy retirement.

## 10. Preliminary SLOs and go/no-go thresholds

These are proposed targets for audit and Phase 0 measurement, not claims about current performance.

| Signal                                                      | Initial target                                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Turn admission p95                                          | < 300 ms excluding attachment upload                                                                  |
| User-channel readiness at Send                              | Pre-subscribed at mount; >= 99% of sends see `SUBSCRIBED`; fallback readiness only on channel failure |
| Queue pickup after commit p95 (wake path)                   | < 150 ms; the wake signal is the SLO path                                                             |
| Queue pickup via polling fallback (wake failure only)       | < 1.5 s bound; fallback engagement < 1% of turns                                                      |
| Worker overhead versus legacy time-to-first-model-event p95 | <= 250 ms regression (holds only on the wake path)                                                    |
| Realtime live chunk cadence                                 | 100–250 ms coalesced, matching persisted batch cadence                                                |
| Cancel API acknowledgement p95                              | < 300 ms                                                                                              |
| Running worker observes cancel p95                          | < 1 second                                                                                            |
| Cancellation terminal state p95                             | < 2 seconds when provider/tool honors abort                                                           |
| Reconnect reconciliation p95                                | < 1 second for retained snapshot window                                                               |
| Duplicate assistant messages                                | 0                                                                                                     |
| Stale executor finalizations                                | 0                                                                                                     |
| Turns active beyond max duration + sweep grace              | 0                                                                                                     |
| Final message missing after visible completion              | 0                                                                                                     |
| Contradictory/duplicate terminal outcomes                   | 0                                                                                                     |
| Duplicate mutation effects for one reserved `effect_id`     | 0                                                                                                     |
| Cross-pool slot consumption                                 | 0                                                                                                     |
| Cancel fallback queries per interval                        | 1 batched query per chat consumer                                                                     |
| Publisher pending memory                                    | At or below the Phase 0 per-turn/global hard limits                                                   |
| Worker-path quality suite                                   | No regression beyond predeclared statistical tolerance                                                |

Provider time-to-first-token is tracked separately from BuildOS overhead.

The two queue-pickup rows resolve an earlier internal inconsistency: a single `< 750 ms` pickup p95 cannot compose with a `<= 250 ms` total overhead regression. The wake signal (Realtime notification or `pg_notify`) is the primary delivery path and must carry the p95; one-second polling is a durability fallback whose engagement rate is itself an alerting signal, not an accepted latency budget. Sustained fallback engagement is an incident.

## 11. Observability and operations

Every log, event, queue job, model pass, tool execution, and message should carry:

- `correlation_id`
- `turn_run_id`
- `session_id`
- `stream_run_id`
- `client_turn_id`
- `execution_generation`
- queue job id and processing token where server-only logs permit
- deployment/service identity
- immutable execution mode, transport contract version, and decision id
- mutation `effect_id` and effect state for mutating tool executions

Dashboards and alerts:

- queued/running/terminal turns by execution mode
- oldest queued interactive turn
- queue pickup and end-to-end latency
- active slots and saturation
- chat versus general slot utilization and cross-pool claim violations
- model/provider failure and throttle rates
- cancellation latency and failures
- stale turns and sweeper actions
- Realtime publish failure and client fallback rates
- publisher pending bytes/events, coalescing ratio, high-water transitions, dropped-live/reconcile counters, and flush latency
- cancel batch size/query latency/failures rather than per-turn poll counts
- transport lease decisions, expirations, renegotiations, and stored-mode mismatch attempts
- inline session creations versus attaches, and channel-ready rate at Send
- reconciliation frequency and sequence-gap rate
- final-persistence failures
- worker restarts, event-loop lag, memory, and DB connection use
- cost per turn and retry-attributed cost

Operational runbooks must cover:

- disable worker routing
- drain/restart chat workers
- identify and cancel a stuck turn
- diagnose a cancel/completion winner and a supersede wait
- reconcile a final message
- reconcile an uncertain mutation by `effect_id`
- handle Realtime outage
- handle publisher high-water/reconcile-only mode
- rotate the transport kill epoch and diagnose a stored-mode mismatch
- handle provider throttling
- inspect a turn by correlation id
- recover from a bad schema/application deployment order

## 12. Security and data boundaries

- Admission endpoints use the user-scoped Supabase client for authentication and explicit session/project access checks.
- Service-role RPCs are not executable by `anon` or `authenticated` roles.
- Every privileged function migration explicitly revokes default `PUBLIC`, `anon`, and `authenticated` execute privileges and grants only the intended server role; do not rely on function defaults.
- `authenticated` and `anon` have no direct insert/update/delete grants or permissive policies on worker-owned `chat_turn_runs`, `chat_turn_events`, `chat_turn_stream_state`, `chat_turn_signals`, `chat_turn_checkpoints`, `chat_turn_effects`, `chat_turn_input_artifacts`, or `chat_prompt_snapshots`; legacy web writes use reviewed server-only writers before those permissions are revoked.
- `queue_jobs` is not writable by `authenticated`: `add_queue_job` becomes a definer function with a caller-permitted job-type allowlist (or authenticated INSERT is revoked and user-triggered enqueues route through definer RPCs), and a guard rejects `agentic_chat_turn` from non-service roles — otherwise a forged job bypasses the entire pre-admission capacity gate. This is also a live pre-migration hardening item.
- Worker-mode turns re-evaluate the consumption-billing gate: the gateway pre-checks at admission, and the worker calls the gate evaluation RPC at terminal finalization so spend that occurred after the 202 is measured and freeze/auto-upgrade decisions are not deferred past a full turn. **DECIDED 2026-07-30 (DJ): option A — finalization re-check.** Worker mode must never be worse than legacy on billing. Credit pre-reservation/settlement (option B, true metering) is explicitly deferred until paying-user overage justifies a credit-ledger feature; it is not a Phase 4 requirement.
- `authenticated` and `anon` also cannot directly select input-artifact contents; reconciliation exposes only the bounded projection needed by the client.
- `agentic_chat_prepared_prompts` is server-only before worker execution is enabled. Authenticated clients cannot directly select, insert, update, or delete prepared content or execute its cleanup/consume functions; bounded metadata needed by the client is returned through an authenticated web API. Server-side claim/copy verifies owner, scope, expiry, version, and integrity hash before producing the immutable turn input artifact.
- Workers load the authoritative turn row and re-check that the referenced session belongs to the recorded user and that project/entity/prepared-context relationships are inside that session/user scope.
- Worker mutations execute through narrowly scoped service-only RPCs that enforce relationship checks, allowed predecessor status, processing ownership, and execution generation inside the same database statement as the write.
- Queue metadata is treated as an identifier envelope, not trusted authorization data.
- Transport leases are signed, short-lived, audience/version scoped, and bound to the authenticated user, client turn, normalized context target, and selected mode. Raw lease tokens are never logged or persisted.
- Session-inline admission can only attach or create sessions owned by the authenticated user and matching the authorized context target; a forged client-turn id cannot attach another user's session or turn, and the per-user Realtime topic exposes only the authenticated user's own events.
- Mutation effect reservation validates turn ownership/generation and canonical tool scope before issuing an `effect_id`; downstream receipts and argument hashes follow existing sensitive-payload redaction rules.
- Realtime topic RLS validates that the topic's user id equals the authenticated `auth.uid()` — the topic is `chat-user:<user_id>`, so the predicate compares `split_part(topic, ':', 2)::uuid` to `auth.uid()` and must NOT be written as a `chat_sessions` lookup (a session-scoped predicate would parse a user id as a session id, deny every subscribe, and invite "fixing" it by dropping the ownership check entirely). The working pattern to copy is the `agent-run:` topic policy in `supabase/migrations/20260615000000_agent_work_phase0.sql`. It grants only the intended subscribe/read capability to users; service-role publication does not imply table-write access.
- Cancel endpoints require ownership; they may mutate only active turns and return an immutable no-op result for terminal turns.
- Prompt snapshots, frozen history/prepared input artifacts, tool payloads, and event retention keep their current sensitivity controls and redaction rules.
- User-safe errors are separated from internal/provider details.

## 13. Rollback strategy

### Application rollback

- Server-controlled feature flag selects `legacy_sse` or `worker_realtime` when issuing a new transport lease.
- Kill switch defaults all new leases to `legacy_sse` without a deploy. Emergency kill-epoch invalidation applies only to unused leases; admitted turns keep their stored mode.
- A turn’s execution mode is persisted and never changed in place.
- In-flight worker turns are not duplicated on legacy; the UI reconciles or explicitly cancels them.

### Schema rollback

- Phases 2–7 use additive columns/tables/functions and compatible constraint changes.
- Do not drop legacy statuses, metadata fields, routes, or indexes until Phase 8.
- Every migration documents its reverse operation, but destructive rollback is avoided while either application version may be live.

### Deployment rollback

- Deploy order: additive database migration → shared code compatible with both modes → worker → web feature flag.
- Rollback order: disable flag → drain worker → roll back web/worker code if needed; leave additive schema in place.

## 14. Risks and mitigations

| Risk                                            | Mitigation                                                                                                                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two implementations drift                       | One shared runtime; legacy and worker are adapters, not copies.                                                                                                                                      |
| Route-only quality behavior is lost             | Phase 0 parity ledger and differential persistence/event tests.                                                                                                                                      |
| WebSocket event loss/reordering                 | Per-generation identities, complete text/projection snapshots, independent durable cursors, live buffering during reconcile, and polling fallback.                                                   |
| Database overloaded by token writes             | Persist coalesced text state/chunks rather than tokens, persist semantic events only, and validate the batch cadence under load.                                                                     |
| Worker retry duplicates mutations               | Pre-provider and pre-mutation durable boundaries, typed chat-only retry/recovery, execution fencing, and no blind post-start fallback retry.                                                         |
| Stop/completion race contradicts terminal state | One locked compare-and-set finalizer; the first committed terminal decision wins and Broadcast follows commit.                                                                                       |
| Supersede creates overlapping turns             | Wait for durable terminal cancellation before admitting the replacement; no fixed-delay hint shortcut.                                                                                               |
| Stop appears to work but provider continues     | Active AbortController plus event-sink fencing; UI waits for durable terminal state.                                                                                                                 |
| Generic jobs delay chat                         | Separate chat-only consumer/slots from Phase 3; physical service isolation before broad canary.                                                                                                      |
| Provider tool-call id changes on retry          | Reserve a server-owned `effect_id` before invocation and reuse it through adapter retries/receipts.                                                                                                  |
| Browser/server choose different transports      | Signed server-issued lease plus immutable stored mode and typed pre-admission renegotiation.                                                                                                         |
| First-turn send needs a ready channel           | Per-user topic subscribed at chat-surface mount; session created inside atomic admission; fallback readiness check only when the channel is down.                                                    |
| Event/cancel fan-out overloads the worker       | Bounded global text flush, high-water degradation to reconciliation, and one batched cancel query per interval.                                                                                      |
| Service split duplicates schedulers             | Dedicated chat-only entrypoint.                                                                                                                                                                      |
| Prepared prompt is read/tampered/consumed/lost  | No direct client content access, server-only prepared-prompt writes/cleanup, duplicate-first transactional claim, integrity check, immutable turn input artifact, and active-turn cleanup exclusion. |
| History drifts or duplicates current input      | Freeze exact normalized model-facing history content plus ordered source IDs before message insertion; execute only from the immutable artifact and exclude the admitted message ID.                 |
| Authenticated caller bypasses the gateway       | Revoke direct control-table writes after legacy writer migration; expose only ownership-validating server RPCs/APIs.                                                                                 |
| Worker has excessive service-role reach         | Minimal queue payload, narrow fenced RPCs, stored relationship checks, owner/project predicates, and security tests.                                                                                 |
| Feature flag rollback duplicates active work    | Persist execution mode; never reroute an existing turn.                                                                                                                                              |
| Full live shadowing doubles cost/writes         | Use deterministic fixtures and isolated canary users; do not shadow live mutations.                                                                                                                  |

## 15. Decisions for the independent audit

### Locked by the complete audit correction pass

All 12 corrections are part of the plan's required design, not Phase 5 follow-ups:

1. **Safety before execution:** Database-enforced worker-write fencing, typed pre/post-start retry behavior, irreversible-boundary recording, and chat-specific stalled recovery must pass in Phase 2 before Phase 3 invokes a real model.
2. **RPC-only control and prepared-input access:** Create new worker-owned tables without client DML, keep input-artifact contents unreadable directly by clients, migrate legacy and prewarm writers, then revoke authenticated direct writes to existing turn/event/checkpoint tables, all direct prepared-prompt content access, and prepared-prompt cleanup/consume execution. Every service RPC validates relational ownership, scope, and input integrity as well as identifiers.
3. **Lossless generation-aware reconnect:** Sequence numbers and event identities are generation-scoped and allocated inside the write RPC (callers never assert one); all durable writes for a turn share one serialized per-turn writer slot; active-turn snapshots contain the full supported text/projection; semantic replay uses its own cursor; the client buffers live events while reconciling.
4. **Duplicate-first atomic admission:** Resolve an existing `(user_id, client_turn_id)` before the active-turn guard, compare the gateway-computed `request_hash_v2`, return the existing turn (and its session) on a match, and return 409 without side effects on a mismatch — whereupon the client resolves the existing turn rather than minting a new id. Fields excluded from the hash never manufacture a conflict: non-null `sessionId` asserts, `null` asserts nothing, `lastTurnContext`/`projectFocus` are ignored. New non-null command columns use a staged legacy-compatible migration.
5. **Immutable history input:** Admission records the exact ordered bounded history IDs and normalized model-facing content before inserting the user message (with a cutoff for audit), writes them to the immutable turn input artifact with its `historySource`, and excludes `user_message_id` so current input appears once and cannot drift. Prepared-prompt history wins only when it is not staler than the latest persisted session message.
6. **Durable trusted prepared context:** Prepared prompts become server-write-only; admission integrity-checks and copies required prepared inputs into the immutable turn input artifact; cleanup excludes active references, and stale-context behavior is explicit rather than silently rebuilt.
7. **Terminal CAS and durable supersede:** One database finalizer linearizes cancellation/completion/failure. Supersede waits for the previous terminal outcome instead of sleeping after a best-effort hint.
8. **Independent chat slots:** A separate chat-only consumer honors `CHAT_CONCURRENCY` from Phase 3 onward and never shares the general queue's active-slot pool.
9. **Stable mutation effect identity and boundary:** A server-owned `effect_id` is durably reserved before a mutating invocation and reused across adapter retries; reservation sets `mutation_reserved_at`, while only the fenced `reserved -> started` transition sets `irreversible_boundary_at`; provider tool-call IDs are correlation only.
10. **Server-authoritative transport:** A signed lease selects the mode, the turn persists it immutably, and flag changes affect only new/unused turns according to the explicit kill-epoch rule.
11. **Bounded publisher/control loops:** Text uses bounded per-turn accumulators plus one batch flush/high-water policy; cancel fallback uses one batched query per consumer interval; admission rejects work before unbounded buildup.
12. **Channel before admission; session inside admission:** Draft prewarm remains cache-only. The private per-user channel is established at chat-surface mount; Send admits on `SUBSCRIBED` or `JOINING` and proves authenticated polling readiness only when the channel is `CLOSED`/`CHANNEL_ERROR`. The session is resolved-or-created atomically inside the admission transaction keyed by `(user_id, client_turn_id)`: `sessionId: null` creates, with `daily_brief`'s race-safe canonical lookup the sole resolve-by-context exception. (Revised 2026-07-29: supersedes the on-Send session-bootstrap formulation while preserving its safety intent — no admission without a live event path, and exactly one session per client turn.)

### Remaining plan defaults

The plan recommends these defaults. The auditor should explicitly accept or change each one:

1. **Realtime topic:** `chat-user:<user_id>` subscribed at chat-surface mount (revised 2026-07-29 for first-turn latency; supersedes the earlier per-session default). One user channel multiplexes all sessions; events carry `session_id`/`turn_run_id` for routing.
2. **Initial deployment:** isolated chat consumer/slots in the existing worker process, then a dedicated Railway service before broad canary.
3. **Queue wake-up:** Realtime notification plus one-second durable polling fallback.
4. **Recovery:** no automatic full-turn replay after execution may have mutated state.
5. **Cancellation state:** `cancel_requested_at` control field; terminal status remains `cancelled`.
6. **Live persistence:** one stream-state row per turn plus durable semantic events; no token rows.
7. **Catch-up authorization:** authenticated web endpoint first; no direct user select on `chat_turn_events` initially.
8. **Runtime ownership:** shared package plus explicit ports; no worker import from `apps/web`.
9. **Rollout:** internal fixture slice before full parity, but no external canary before full parity and reliability gates.
10. **Physical split:** separate service is a rollout phase, not a prerequisite for proving the processor.
11. **Initial concurrency:** `CHAT_CONCURRENCY=1`, then `2` after measurement; it never inherits `QUEUE_BATCH_SIZE`.
12. **One active turn per session:** queued and running both block another turn.

Open values to set during Phase 0 — **all of these are now set** in the locked operating-values table of `AGENTIC_CHAT_WORKER_PHASE_0_CONTRACTS_2026-07-29.md`, which is the authoritative register; the list below is retained only as the coverage checklist it was written to be:

- per-user simultaneous session/turn limit
- final turn wall-clock limit
- snapshot cadence and the supported maximum full-output size/spill threshold (truncating the prefix is not allowed)
- turn-input-artifact schema/version/hash algorithm, maximum normalized history/prepared-input size, freshness threshold, maximum queue residence, and terminal retention duration
- user-channel readiness thresholds and fallback readiness policy
- durable event retention and cleanup window
- cancellation/sweeper grace intervals
- supersede terminal-wait deadline and subscription readiness timeout
- transport lease TTL, supported contract versions, and emergency kill-epoch rotation procedure
- publisher per-turn/global pending-byte/event limits, flush batch size, and Broadcast retry budget
- active-turn reconciliation-watchdog interval/backoff and `reconcile_required` clearing rule
- batched cancel polling interval and accepted active-id bound (must be at least the configured per-consumer concurrency)
- hard admission caps, queue-age/provider-pressure thresholds, and `Retry-After` policy
- mutation-effect/receipt retention and tool-specific downstream idempotency capability matrix
- provider-specific concurrency caps
- canary cohort definitions and soak duration
- statistical tolerance for quality-suite parity

## 16. Independent audit checklist

The reviewing agent should report findings by severity and cite code/schema evidence. At minimum, challenge:

### Architecture

- Does the shared-runtime boundary actually include every behavior currently owned by the ~4,600-line stream route?
- Is any proposed component duplicating an existing Agent Run, queue, or chat mechanism unnecessarily?
- Is Supabase Realtime being used as an acceleration channel rather than durable truth?
- Can the system operate correctly during a Realtime outage?
- Is `agentic_chat_turn` claimed only by a separately bounded consumer, or can general jobs still consume its slots?
- Can the browser and server ever select different transports for the same client turn, including across a flag/kill-switch change?

### State and integrity

- Can duplicate admission create more than one message, run, or job?
- Does legacy SSE atomically create/resolve its running turn and user message, returning fallback history as it existed before that message, so rollback mode preserves the same one-turn/message invariant without a queue row?
- Does duplicate lookup occur before the active-turn check, and does a conflicting canonical request hash return 409 without consuming a prepared prompt?
- Can a stale worker persist events, tool effects, or final state?
- Are fences enforced by the database statement/RPC rather than checked only in application memory?
- Is the one-active-turn constraint correct during queued, running, cancellation, and legacy modes?
- Are all state transitions conditional on the expected predecessor and execution generation?
- Can an authenticated client bypass the gateway and write any worker-owned control/input table or prepared-prompt source directly?
- Does the immutable history artifact preserve exact normalized content—not only message IDs—while excluding the newly admitted message for delayed and retried executions?
- Can prepared-context mutation or cleanup invalidate/tamper with a queued/running command?
- Can completion, cancellation, failure, or a stale generation create more than one terminal record/event?
- Is `execution_mode` immutable, legacy-backfilled, and returned on duplicate admission?
- Is a mutation effect reserved before invocation with an identity independent of provider tool-call id and generation?

### Cancellation and recovery

- Does Stop reach a worker during model I/O rather than only between loop iterations?
- What happens when a provider/tool ignores AbortSignal?
- Can a cancellation race with final persistence and produce contradictory terminal states?
- Does each completion-first/cancel-first lock ordering have an explicit expected result and proving test?
- Does supersede wait for durable terminal state rather than a timer/HTTP acknowledgement?
- Can a crashed mutating turn be retried without duplicate side effects?
- Do internal adapter retries reuse the same `effect_id`, and do unsupported providers become `uncertain` instead of retrying?
- Can cancellation after reservation but before `reserved -> started` abandon the effect without setting `irreversible_boundary_at`?
- Can an unknown post-start error or the generic stalled-job sweeper accidentally requeue a chat turn?

### Events and UI

- Can subscribe/admit ordering lose the first event?
- Does first-turn worker Send resolve-or-create exactly one session inside atomic admission, with the user channel already open from mount and draft-time prewarm still creating no sessions?
- Can the client recover from a sequence gap, duplicate, stale generation, or tab sleep?
- Are live events buffered during reconciliation, and are semantic-event and text-snapshot cursors independent?
- Does a new execution generation reset prior text/projection without sequence-key conflicts?
- Is final-message persistence guaranteed before visible completion?
- Does detach remain distinct from explicit Stop?
- Are text accumulators, in-flight flushes, Broadcast retries, and cancel polling bounded under 100 active turns?
- Can publisher overload degrade to reconciliation without losing a durable prefix or terminal truth?

### Security

- Can a forged queue payload cross user/project boundaries?
- Can a user subscribe to or cancel another session’s turn?
- Are service-role RPC permissions appropriately revoked?
- Do those RPCs validate user/session/project/prepared-artifact relationships atomically with each write?
- Can a forged/expired transport lease, forged client-turn id, or mutation-effect request cross user/context/mode boundaries?
- Can an authenticated caller directly read or mutate prepared-prompt/input-artifact content or invoke prepared cleanup/consume after the server-only migration, and does claim/copy reject an artifact with a mismatched version/hash?

### Rollout and operations

- Does the feature flag affect only new leases, with documented behavior for unused leases and immutable admitted turns?
- Can the dedicated service start without the general scheduler/processors?
- Does Phase 3 already prove chat/general slot isolation before the physical service split?
- Are health checks sufficient to detect a wedged queue or Realtime connection?
- Does the 100-turn load plan isolate BuildOS capacity from provider limits and cost?
- Does that load test quantify database write amplification and prove the chosen persistence cadence remains inside its stated budget?

## 17. Definition of plan completion

This planning baseline is ready for implementation handoff when:

- The independent audit corrections and final consistency findings are incorporated and internally checked.
- Every locked decision in Section 15 is mapped to a proving phase and acceptance test.
- Every remaining numeric/operational value in Section 15 has an explicit Phase 0 decision/measurement gate before it can affect later work.
- Phase 0 baselines and parity-ledger work are explicitly authorized.

Conditions 2 and 3 are satisfied by this planning baseline. Condition 1 (independent-audit corrections incorporated) is satisfied through the 2026-07-30 revision .5 pass for every finding raised so far, but final audit re-acceptance is still open — see the status header. Explicit authorization was received on 2026-07-29, and Phase 0 began with the artifacts linked below. Later runtime, schema, worker, and deployment phases remain gated by the Phase 0 exit criteria.

## 18. Related documents

- `docs/operations/worker/queue-and-workflow-architecture-assessment-2026-07-23.md`
- `docs/operations/worker/queue-architecture-audit-verification-2026-07-23.md`
- `docs/specs/AGENTIC_CHAT_DETACHED_TURN_EXECUTION_PLAN.md`
- `docs/specs/agentic-chat-operating-model.md`
- `docs/technical/reviews/AGENTIC_CHAT_QUALITY_STATE_2026-07-26.md`
- `apps/web/docs/features/agentic-chat/README.md`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/README.md`
- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_PARITY_LEDGER_2026-07-29.md`
- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_CONTRACTS_2026-07-29.md`
- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_BASELINE_2026-07-29.md`
- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_INDEPENDENT_AUDIT_2026-07-29.md`
- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_0_CLOSURE_CHECKLIST_2026-07-30.md`
