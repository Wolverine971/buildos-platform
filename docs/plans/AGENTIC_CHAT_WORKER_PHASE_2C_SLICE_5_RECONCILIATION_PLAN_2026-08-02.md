<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2C_SLICE_5_RECONCILIATION_PLAN_2026-08-02.md -->

# Agentic Chat Worker Phase 2C Slice 5 — Generation-Consistent Reconciliation Plan

**Date:** 2026-08-02

**Status:** Implemented, review-hardened, and hosted through exact receipt `20260802037000`; browser channel application, queue-consumer registration, provider execution, and worker routing remain intentionally deferred.

## Objective

Add one bounded, ownership-scoped database snapshot and one authenticated web endpoint that can reconstruct the complete current worker generation after a missed, reordered, or unavailable Realtime Broadcast without independently reading mutable tables.

## Locked scope

- One service-only `reconcile_agentic_chat_turn(uuid, uuid, integer, integer)` RPC.
- Turn-row lock first, followed by stream/event/message reads while the lock prevents every supported writer, claim, and finalizer from changing generations or cursors.
- Return the complete current-generation assistant text and UI projection, snapshot/durable/projection cursors, retained durable events newer than both the projection cursor and the caller cursor, the response watermark, terminal truth, and the final assistant message when one exists.
- Ignore a stale generation's cursor and return the complete current generation with `generation_changed=true`.
- Allow an admitted but unclaimed queued worker turn to reconcile to an empty generation-zero snapshot.
- Bound the post-projection durable-event window at 64 rows. Exceeding it is treated as invariant corruption rather than returning an unbounded response.
- Return the same `not_found` outcome for an absent turn and a turn owned by another user.
- One authenticated `GET /api/agent/v2/turns/<id>/reconcile` endpoint. It validates UUID/cursor inputs, derives `user_id` only from the authenticated session, invokes the service-only RPC through a narrow server adapter, returns private no-store responses, and never exposes database error details.
- No client channel, live-event buffer, polling scheduler, admission/cancel route, queue consumer, provider/model call, feature-flag change, or worker route in this slice.

## Generation-consistency argument

Every supported claim, stream writer, and terminal finalizer locks `chat_turn_runs` before changing generation-owned state. The reconciliation RPC acquires `FOR SHARE` on the exact owned turn first. If a writer is already active, reconciliation waits; after the lock is acquired, subsequent statements receive a fresh committed snapshot while the shared lock prevents the next writer. Stream state, retained events, and final message therefore describe one committed turn generation rather than a mix of pre- and post-claim rows.

## Required proof

- Missing and foreign-owned identifiers are indistinguishable.
- Legacy-mode turns cannot enter the worker reconciliation contract.
- A queued generation-zero worker turn returns an empty snapshot without requiring a stream row.
- A current request returns the complete text/projection, authoritative cursors/watermark, only events beyond both durable cursors, and no prior-generation events.
- A stale requested generation ignores its stale cursor and returns the complete current generation with `generation_changed=true`.
- A same-generation cursor ahead of durable truth fails closed.
- Stream scope/generation/cursor corruption and an over-bound event window fail closed.
- Terminal reconciliation returns the final assistant message and immutable terminal identifiers.
- A genuine two-connection claim/reset race cannot return a new turn generation with the old stream snapshot.
- Anonymous, authenticated, and signed-definer authenticated database calls are denied; only `service_role` can execute the RPC.
- Migration reapplication is idempotent and package-only rollback removes the RPC.
- The web route proves authentication, validation, ownership-safe `not_found`, private no-store success, and fail-closed database errors.

## Local implementation result

Completed locally on 2026-08-02:

- added `reconcile_agentic_chat_turn(uuid, uuid, integer, integer)` as a service-only, ownership-scoped read transaction;
- locked the owned turn before reading stream, event, terminal, and message state, then proved a real two-connection generation-reset race cannot mix generations;
- returned a complete current-generation projection plus only retained durable events newer than both the projection and accepted caller cursors;
- ignored stale-generation cursors, bounded the post-projection event window at 64, and failed closed on cursor, stream, message, terminal, or generation corruption;
- added a runtime-validating server adapter that rejects malformed database receipts rather than casting partial state into the client contract;
- added authenticated `GET /api/agent/v2/turns/<id>/reconcile`, deriving ownership only from the session and returning private no-store responses without database error details;
- added shared reconciliation result/message types and the shared maximum durable-event bound; and
- added no browser event application, polling loop, queue consumer, provider/model invocation, feature-flag change, or worker routing.

Implementation and proof:

- `supabase/migrations/20260802037000_agentic_chat_worker_reconciliation.sql`
- `supabase/tests/20260802037000_agentic_chat_worker_reconciliation.test.sql`
- `apps/web/src/lib/services/agentic-chat-v2/phase2c-reconciliation.postgres.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/reconciliation.server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/reconciliation.test.ts`
- `apps/web/src/routes/api/agent/v2/turns/[id]/reconcile/+server.ts`
- `apps/web/src/routes/api/agent/v2/turns/[id]/reconcile/server.test.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.ts`
- `packages/shared-types/src/agentic-chat-worker-contract.test.ts`

Migration SHA-256:

- `20260802037000`: `8e9d377a58e58357f864cffc7d2ac69a46a1eb4eefd45e8afdb0dd1d916d0840`

Validation:

- focused reconciliation PostgreSQL runner: 1/1;
- focused adapter/route boundary: 2 files / 12 tests;
- cumulative Agentic Chat PostgreSQL gate: 16 files / 20 tests;
- complete `agentic-chat-v2` suite: 91 files / 762 tests;
- shared-types suite: 2 files / 24 tests, plus typecheck and build;
- worker typecheck: passed;
- web `svelte-check`: 0 errors / 0 warnings.

Hosted application completed on 2026-08-02 together with the preceding private-Realtime receipt. The source and receipt-isolated staged SQL both matched SHA-256 `8e9d377a58e58357f864cffc7d2ac69a46a1eb4eefd45e8afdb0dd1d916d0840`. The isolated workdir contained the 47 exact pre-existing hosted receipts plus only `20260802036000` and `20260802037000`; the dry run named exactly those files in order, application succeeded, the post-apply dry run was empty, and the linked ledger now shows exact local/remote parity for both receipts.

Live PostgREST verification exposes `reconcile_agentic_chat_turn` to `service_role`, hides it from anonymous OpenAPI, returns `200` with the ownership-safe `not_found` receipt for an unknown identity, and denies anonymous execution with `401` / SQLSTATE `42501`. Hosted type/schema regeneration now aligns at 241 tables / 13 views and 223 RPC names; RPC drift is clean, and the OpenAPI type-generator proof passes 3/3. The focused PostgreSQL proof passes 1/1, focused adapter/route coverage passes 12/12, the complete `agentic-chat-v2` suite passes 91 files / 762 tests, shared types pass 24/24 plus typecheck/build, worker typecheck passes, and web `svelte-check` reports zero errors and zero warnings.

## Worker routing gate

Worker routing remains disabled. Phase 2D Slice 1 has added the still-unmounted private channel and bounded reconciliation inbox; next is the mount-time channel/reconcile coordinator, followed by worker admission/discovery/cancel APIs, transport lease selection, inert consumer assembly, and the complete fake-provider exit matrix. Phase 3 is the first gate allowed to execute a real model asynchronously.
