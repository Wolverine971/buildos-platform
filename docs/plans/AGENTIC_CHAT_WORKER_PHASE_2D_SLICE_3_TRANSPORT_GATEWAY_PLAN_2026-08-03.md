<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_SLICE_3_TRANSPORT_GATEWAY_PLAN_2026-08-03.md -->

# Agentic Chat Worker Phase 2D Slice 3 — Transport Lease and Owned Turn Gateway Plan

**Date:** 2026-08-03

**Status:** Local implementation and review complete. Worker routing remains disabled; all genuinely new transport decisions are still forced to legacy SSE.

## Objective

Add the authenticated server gateway that can issue and verify short-lived, server-authoritative transport leases and can safely discover or cancel an already-admitted worker turn. Keep production negotiation locked to legacy mode until atomic worker admission, handle adoption, UI projection, and the fake-provider exit matrix are complete.

## Locked scope

- Add a versioned HMAC-SHA-256 lease codec bound to authenticated user, client-turn id, stream id, normalized context target, decision id, selected mode/contract, expiry, and worker kill epoch.
- Reject weak/missing secrets, malformed or noncanonical tokens, signature mismatch, future-issued/expired leases, binding drift, mode/contract mismatch, and stale worker kill epochs.
- Add authenticated `POST /api/agent/v2/transport`. The client supplies capabilities, never an authoritative mode. This slice may issue only `legacy_sse` / `legacy_internal_v1` for a genuinely new decision.
- Before evaluating the new-turn policy, resolve an existing owned turn by prior decision id and then by `(user_id, client_turn_id)`. Reissue only its immutable stored mode/contract/decision and fail closed on stream, session, context, decision, or stored-contract mismatch.
- Add owned worker-turn descriptor reads at `GET /api/agent/v2/turns/<id>` and `GET /api/agent/v2/turns?session_id=<id>` for reload/second-tab adoption. Foreign, absent, and non-worker rows share the same not-found boundary.
- Add authenticated `POST /api/agent/v2/turns/<id>/cancel`, deriving user and source from the session/server and invoking the hosted service-only cancellation RPC. Browser reasons are limited to `user_cancelled | superseded`.
- Every response is private/no-store; database details and ownership distinctions stay private.
- No worker `POST /turns` admission route, lease prefetch client, Send-path selection, handle registration, event-to-UI adapter, queue consumer, provider invocation, flag change, or enabled worker route in this slice.

## Required proof

- Lease token tampering, cross-user/client/stream/context replay, expiry, future issuance, and stale worker kill epoch fail closed.
- Same inputs can reissue the same existing decision, while a new decision remains server-generated and legacy-only.
- A client claiming only worker support cannot force a worker lease while routing is disabled.
- Existing-turn lookup is ownership scoped and detects ambiguous/corrupt rows rather than choosing a winner.
- Descriptor routes return only exact worker handles and active session lookup is bounded.
- Cancellation maps queued, running, and already-terminal receipts into the shared `CancelTurnResultV1` contract and hides missing/foreign identities.
- No migration is introduced and the production browser continues using legacy SSE without calling these routes.

## Routing gate

This gateway is necessary but not sufficient for worker routing. The following slice must validate a worker lease and assemble the atomic admission inputs/RPC call, then return/register the immutable worker handle. Routing remains disabled until the UI adapter, inert consumer, and full fake-provider Phase 2 exit matrix pass.

## Local implementation result

Completed locally on 2026-08-03:

- added a canonical `actl1` HMAC-SHA-256 lease with a 60-second default TTL, five-minute hard maximum, 8 KiB token bound, constant-time signature comparison, exact claim envelope, authenticated user/client/stream/context binding, mode/contract coupling, decision identity, and worker kill epoch;
- added authenticated `POST /api/agent/v2/transport`, with strict capability input, private/no-store responses, existing-turn decision recovery, and a hardcoded `legacy_sse` / `legacy_internal_v1` policy for every genuinely new decision;
- made a client-supplied prior decision id lookup-only: it is preserved only when an owned persisted turn proves it, while an unproven/missing prior always receives a fresh server-generated id;
- added ownership-scoped existing-decision lookup by prior decision and then `(user_id, client_turn_id)`, rejecting ambiguous rows and stream/session/context/mode/contract drift;
- added exact owned worker descriptor lookup and a bounded eight-turn active-session listing for reload/second-tab discovery;
- added strict browser cancellation through the existing service-only RPC, limited to `user_cancelled | superseded`, with queued/running/already-terminal receipt validation and one private not-found boundary for absent, foreign, and non-worker turns;
- hardened terminal receipt parsing to require a positive durable terminal sequence and hardened running cancellation receipts to require a canonical signal UUID and valid timestamp; and
- documented the required private signing secret and monotonic worker kill epoch in `apps/web/.env.example`.

Implementation and proof:

- `packages/shared-types/src/agentic-chat-worker-contract.ts`
- `apps/web/src/lib/services/agentic-chat-v2/transport-lease.server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/transport-decision.server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-gateway.server.ts`
- `apps/web/src/routes/api/agent/v2/transport/+server.ts`
- `apps/web/src/routes/api/agent/v2/turns/+server.ts`
- `apps/web/src/routes/api/agent/v2/turns/[id]/+server.ts`
- `apps/web/src/routes/api/agent/v2/turns/[id]/cancel/+server.ts`

Validation:

- focused Realtime plus transport/gateway edge suite: 11 files / 77 tests;
- new transport/gateway-only suite: 7 files / 43 tests;
- complete Agentic Chat service/route/PostgreSQL suite: 101 files / 830 tests;
- unchanged legacy stream controller: 1 file / 24 tests;
- shared types: 2 files / 24 tests plus typecheck and CJS/ESM/declaration build;
- web `svelte-check`: 0 errors / 0 warnings; and
- repository diff whitespace check: clean.

No migration or hosted mutation belongs to this slice. The browser does not call the new transport or turn gateway yet, no worker handle is registered, and the existing production Send/Stop path remains legacy SSE.
