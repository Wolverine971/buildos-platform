<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_SLICE_7_PROMPT_SNAPSHOT_PARITY_PLAN_2026-08-04.md -->

# Agentic Chat Worker Phase 4 Slice 7 — Prompt Snapshot Parity

**Prepared:** 2026-08-04 EDT
**Status:** Implemented, clean-database verified, and hosted. The linked ledger records matching local/remote receipt `20260804032000`, and live service-role PostgREST exposes the exact checked-in 12-argument RPC contract.
**Authority:** The user asked to double-check the preceding work, apply any still-pending migration, and continue through the next substantial part.

**Follow-on:** Partial-cancellation parity is implemented and hosted in `AGENTIC_CHAT_WORKER_PHASE_4_SLICE_8_PARTIAL_CANCELLATION_PARITY_PLAN_2026-08-04.md`.

## Preceding migration check

The linked hosted ledger already contains `20260804000120_agentic_chat_terminal_timing.sql`; no duplicate apply was attempted. Live service-role PostgREST exposes the exact checked-in 20-argument terminal timing RPC. Slice 6's plan now records that hosted receipt and leaves worker deployment/internal-turn evidence as the remaining operational gate.

## Outcome

The real read-only provider now exposes an immutable snapshot of the exact prepared model messages before the execution-start fence permits network I/O. After the first text delta becomes durable, the executor persists that snapshot through one generation-fenced service-only transaction and atomically links it from `chat_turn_runs.prompt_snapshot_id`.

This closes the text-only parity fixture's `prompt_snapshot_count` mismatch. It does not claim that all legacy lifecycle observability rows are present.

## Exact prompt ownership

The provider adapter—not the executor—owns the model-facing message array. Snapshot preparation therefore occurs beside request construction and captures:

- the exact system/history/current-user messages sent by the prepared invocation;
- canonical SHA-256 hashes for the system prompt and complete message array;
- JavaScript/legacy-compatible character counts; and
- the same per-message approximate token calculation used by legacy prompt observability.

The snapshot is a canonical deep copy, so later mutation of either the immutable execution artifact or provider request cannot rewrite captured evidence. Snapshot construction completes before local provider capacity is acquired, avoiding a lease leak if validation ever fails.

## Persistence boundary

The executor waits for the first text operation's durable delivery result before attempting the snapshot. This preserves the legacy intent to create a snapshot only for a turn that actually begins responding while keeping first-token delivery off the snapshot transaction's critical path. Multiple text chunks produce one attempt; a provider that completes without response text produces none.

Snapshot persistence is observability-only. An RPC or receipt failure is reported through the worker error hook but cannot overturn text that is already durable or change authoritative terminal truth.

## Database transaction and replay rules

`persist_agentic_chat_prompt_snapshot(...)`:

1. requires `service_role` and a UUIDv5 snapshot identity derived deterministically from the turn;
2. locks and validates the user/turn/job/processing-token/execution-generation ownership chain;
3. returns stale-generation, cancellation, or terminal truth before validating optional snapshot content;
4. loads the turn's immutable input artifact and reconstructs the exact expected read-only provider messages in SQL;
5. rejects attachment/tool-surface drift, message drift, malformed hashes/counts, and v3 token-estimate drift;
6. inserts one `agentic_chat_worker_prompt_v1` row and links the turn in the same transaction; and
7. returns the immutable existing receipt on a same-content lost-response replay while rejecting a conflicting replay.

System prompt, request payload, context payload, prompt sections, prompt variant, surface/lineage fields, and tool-surface metadata are derived from the locked turn/artifact rather than trusted as duplicate worker inputs. The current read-only lane stores no tool definitions and no rendered dump.

## Why no `prompt_snapshot_created` event was copied

Legacy uses `chat_turn_events` as an internal observability table. The worker also uses that table as its public durable reconciliation log. Adding a worker-only internal row there would expose a client event absent from the legacy stream, advance public sequence numbers, and create reconnect behavior that the existing projection contract does not model.

This slice therefore writes the snapshot/link only. The remaining `prompt_snapshot_created` lifecycle metadata difference stays explicit until internal lifecycle observability has a separately reviewed visibility/store contract.

## Verification

- Focused provider, snapshot-adapter, executor, and assembly suites pass: 4 files / 36 tests.
- The complete worker gate passes: 91 files / 737 tests, with one explicit opt-in file/test skipped; worker typecheck, build, touched-source ESLint, and the HTTP module-size guard pass. Whole-worker lint has no errors and retains only pre-existing warnings outside this slice.
- Shared types pass 24 tests, typecheck, and CJS/ESM/declaration build with the new generated RPC signature.
- The transport-neutral runtime passes 15 tests, typecheck, and CJS/ESM/declaration build.
- Disposable PostgreSQL proves service-only grants, exact message reconstruction, atomic insert/link, stable public sequence/no event-row mutation, same-content replay, conflicting replay rejection, and cancellation/stale-generation no-write outcomes.
- The text-only differential no longer contains `/metadata/prompt_snapshot_count`; the six legacy-only lifecycle rows and two intentional authoritative `done` additions remain visible, alongside the scoped asynchronous timing-field differences.
- A post-apply audit found that the first version of the SQL fixture relied on schema left behind by earlier migration tests. A truly clean database failed before function creation because `chat_turn_input_artifacts` was absent. The fixture now models the minimal hosted worker columns, queue enum value, and immutable artifact table itself; a second empty database completed with `phase4_slice7_prompt_snapshot_ok`.
- The linked migration ledger now reports `{ local: 20260804032000, remote: 20260804032000 }`. A live service-role OpenAPI read returned HTTP 200 and exactly these 12 required properties: `p_turn_run_id`, `p_user_id`, `p_queue_job_id`, `p_processing_token`, `p_execution_generation`, `p_prompt_snapshot_id`, `p_model_messages`, `p_system_prompt_sha256`, `p_messages_sha256`, `p_system_prompt_chars`, `p_message_chars`, and `p_approx_prompt_tokens`.

## Current boundary

The database rollout gate is closed. The remaining operational proof is:

1. deploy the worker and run one internal text-only turn that produces response text;
2. prove one linked snapshot, exact hashes/messages, no `prompt_snapshot_created` public event, unchanged durable stream ordering, and terminal queue convergence; and
3. continue Phase 4 at the Slice 8 partial-cancellation plan, followed by its timeout/provider-error fixture boundary. The remaining internal lifecycle metadata should not be forced into the public event stream without a dedicated observability visibility decision.
