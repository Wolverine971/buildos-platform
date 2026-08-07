<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2C_SLICE_1_STREAM_PERSISTENCE_PLAN_2026-08-02.md -->

# Agentic Chat Worker Phase 2C Slice 1 — Stream Persistence Plan

**Date:** 2026-08-02

**Status:** Implemented, applied, and verified on the hosted database through exact receipt `20260802033200`. Generated database types are refreshed; worker routing remains disabled.

## Objective

Create the durable write boundary that the later bounded publisher will use for coalesced assistant text and semantic UI events. A successful database receipt is the only authority to Broadcast. Stale, cancelled, terminal, duplicate, or failed writes never authorize live publication.

This slice deliberately stops before Realtime publication, provider/model execution, cancellation polling, reconciliation APIs, or worker routing.

## Locked scope

- Add an idempotency identity for worker-authored semantic transitions.
- Persist one coalesced text batch by appending its complete prefix and allocating its sequence inside the database.
- Persist one semantic event and its complete UI projection atomically.
- Flush up to 128 independent text batches through one RPC, with one row's rejection unable to roll back accepted rows.
- Return typed post-commit receipts with an explicit `publish_allowed` decision.
- Preserve generation fencing, queue ownership, service-only access, output bounds, and the existing `turn -> queue -> stream` lock order.
- Prove gap-free sequence allocation under real contention and prove rollback, idempotency, security, cancellation, terminal, and stale-generation behavior in disposable PostgreSQL.

## Migration package

1. `20260802033000_agentic_chat_worker_stream_write_foundation.sql`
    - additive last-text-batch receipt fields on `chat_turn_stream_state`;
    - additive `worker_transition_id` on `chat_turn_events`;
    - generation-reset and monotonicity validation for the new receipt fields.
2. `20260802033100_agentic_chat_worker_create_transition_index.sql`
    - non-transactional `CREATE UNIQUE INDEX CONCURRENTLY` for `(turn_run_id, execution_generation, worker_transition_id)` when the transition id is present.
3. `20260802033200_agentic_chat_worker_stream_write_rpcs.sql`
    - service-only `persist_agentic_chat_text_batch(...)`;
    - service-only `flush_agentic_chat_text_batches(...)`;
    - service-only `persist_agentic_chat_semantic_event(...)`.

## Persistence contract

### Coalesced text

The caller supplies a unique batch id, the newly accumulated delta, and the complete assistant-text prefix after that delta. The database locks and validates the current turn owner, requires the supplied full text to equal the stored prefix plus the delta, allocates the next sequence, and advances both the snapshot and durable cursors. It does not insert a row per token or per text batch into `chat_turn_events`.

The most recent batch identity, sequence, and ending byte count remain on the stream row. A replay of that batch returns the committed sequence with `publish_allowed=false`; a conflicting replay fails closed. The later publisher must reconcile rather than infer permission after a lost persistence response.

### Semantic event

The caller supplies a stable transition UUID, complete assistant-text prefix, complete UI projection, phase, type, and payload. One transaction allocates the next sequence, appends one immutable durable event, advances every projection cursor, and stores the complete text/projection. The ordinary writer rejects `done`, `text`, and `text_delta`; only `finalize_agentic_chat_turn(...)` creates the terminal `done` event.

A transition replay returns its committed sequence with `publish_allowed=false`. The transition index is generation-scoped, so a retried generation cannot collide with or adopt an abandoned generation's event.

### Batch isolation

`flush_agentic_chat_text_batches(...)` accepts a JSON array of at most 128 items and 16 MiB. Each item runs in a PL/pgSQL subtransaction. The response preserves input order and includes a result for every item; only results with `outcome='persisted'` and `publish_allowed=true` may be Broadcast.

## Invariants

- Every mutating path is service-only and validates the worker-mode turn, exact generation, queue job, processing token, job type, dedup key, user, turn metadata, and correlation metadata.
- Sequence numbers are allocated only while the owning turn row is locked; callers never assert them.
- A running stream's `snapshot_sequence` and `durable_through_sequence` must equal `chat_turn_runs.last_event_sequence` before a new write.
- Assistant text is prefix-monotonic and never exceeds 2 MiB.
- One text batch is at most 512 KiB; semantic payloads and projections retain the established 256 KiB / 512 KiB bounds.
- Every committed write sets `reconcile_required=true` before returning. A later publisher slice will add the fenced acknowledgement that can clear it only after durable backlog flush and successful Broadcast.
- Persistence failure, stale generation, cancellation, terminal state, or duplicate replay never authorizes Broadcast.

## Required proof

- Service role succeeds; anonymous, authenticated, and signed-definer authenticated calls are denied.
- Text and semantic writes produce one gap-free, generation-scoped sequence.
- The immediate first-text batch interleaved with three semantic writes has zero rejected writes and a gap-free durable prefix.
- Real two-connection contention allocates distinct adjacent sequences without uniqueness errors.
- A stale generation, wrong queue/token/envelope, cancellation, and terminal turn cannot write or publish.
- Replaying a text batch or semantic transition changes no rows and returns `publish_allowed=false`.
- A conflicting replay fails closed.
- Semantic write failure rolls back the stream, event, and turn cursor together.
- Mixed batch input commits valid rows while returning typed errors for invalid rows.
- Claiming a new generation clears all prior text-batch receipt state.

## Deferred to later Phase 2C slices

- The bounded in-memory publisher, single worker-level flush loop, high-water degradation, and terminal Broadcast retry budget.
- Generation-consistent reconciliation reads. Exact-sequence reconciliation acknowledgement is now hosted in Phase 2C Slice 2.
- Batched cancellation observation.
- Private per-user Realtime Broadcast authorization.
- Retention cleanup and the large-output spill writer.
- Any real provider/model execution or user-visible worker route.

## Local implementation result

Completed locally on 2026-08-02:

- added replay-safe latest-text receipt state that is cleared automatically on an execution-generation reset without changing the already-hosted claim signature;
- added generation-scoped semantic transition identity behind a separately deployable concurrent unique index;
- added the service-only text, isolated batch-flush, and semantic-event RPCs with database-allocated sequences and explicit publication authority;
- kept ordinary event writes unable to create terminal `done` or token-level text rows;
- added shared bounds, RPC receipt types, and a fail-closed publication helper;
- added disposable PostgreSQL proof for service-role fencing, signed-definer denial, gap-free text/semantic interleaving, replay suppression, mixed-batch isolation, stale/cancelled/terminal behavior, injected partial-write rollback, two-connection contention, generation reset, and package-only rollback.

Migration SHA-256 values:

- `20260802033000`: `0b39ee16b64b63f5db434e5898b91ea18c1efdfabf68407a7f8e8ccd713e7704`
- `20260802033100`: `819a26e74ee3dc173e949fe369ffb87309d9b23b9196542f7df2fcf4bbe6db87`
- `20260802033200`: `9367e1046c49ad8d0e264f11628a862fb9d52cfe176901797a696ea3b43e325c`

Validation:

- focused Phase 2C PostgreSQL runner: 1/1;
- cumulative Agentic Chat PostgreSQL gate: 12 files / 16 tests;
- complete `agentic-chat-v2` suite: 84 files / 737 tests;
- shared worker contract: 15/15;
- shared-types package: 20/20 plus typecheck/build;
- hosted RPC drift: clean at 220 function names;
- OpenAPI type-generator unit proof: 3/3;
- web `svelte-check`: 0 errors / 0 warnings;
- formatting and `git diff --check`: clean.

No application publisher, queue consumer, provider/model call, feature-flag change, staging, commit, or push was performed.

## Hosted application result

Hosted application completed on 2026-08-02:

- the read-only preflight found zero active or historical worker-mode turns, 10,324 existing event rows, and no target columns or RPC conflicts;
- a receipt-isolated dry run named only `20260802033000`–`20260802033200`, and their staged hashes matched the reviewed values above;
- all three migrations applied in order, including the isolated non-transactional concurrent-index receipt, and the post-apply dry run reported the remote database up to date;
- the linked ledger is aligned through exact receipt `20260802033200`, and `uq_chat_turn_events_worker_transition` exists on the intended generation-scoped transition columns;
- hosted service-role OpenAPI exposes all three RPCs, an invocation probe reached the new routine, and anonymous access is denied;
- the hosted schema exposes all new stream/event columns; regenerated types/schema align at 241 tables / 13 views and 220 RPC function names;
- the full validation matrix above remained green after regeneration.

Phase 2C Slice 1 is complete. Slice 2 was subsequently implemented and hosted through exact receipt `20260802034000` as the bounded in-memory publisher, single worker-level flush loop, shared per-turn write slot, post-persistence Broadcast adapter, high-water reconcile-only behavior, and fenced reconciliation acknowledgement; see `AGENTIC_CHAT_WORKER_PHASE_2C_SLICE_2_PUBLISHER_PLAN_2026-08-02.md`. Worker routing remains disabled.
