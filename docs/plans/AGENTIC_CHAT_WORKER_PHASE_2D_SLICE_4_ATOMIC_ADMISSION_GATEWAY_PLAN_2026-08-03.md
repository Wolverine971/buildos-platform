<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_SLICE_4_ATOMIC_ADMISSION_GATEWAY_PLAN_2026-08-03.md -->

# Agentic Chat Worker Phase 2D Slice 4 — Lease-Verified Atomic Admission Gateway Plan

**Date:** 2026-08-03

**Status:** Local implementation and review complete. Worker routing remains disabled and new lease negotiation remains legacy-only.

**Next-agent handoff:** `docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_NEXT_AGENT_HANDOFF_2026-08-03.md`

## Objective

Add the authenticated worker admission HTTP boundary over the already-hosted `create_agentic_chat_turn_with_job` transaction. The route must accept only a server-signed worker lease, build every trusted execution input on the server, and return the immutable stored handle without making the route reachable from the production Send path.

## Locked scope

- Add a runtime-validating service adapter for all duplicate-first atomic admission outcomes: newly admitted, matching duplicate, active-turn conflict, idempotency conflict, and capacity rejection.
- Require exact receipt identities and relationships. A newly admitted receipt must return the pre-generated turn/message/artifact/correlation and request client/stream identities, worker mode, queued status, one queue job, and a valid resolved-or-created session.
- Preserve the valid legacy edge in an active-turn conflict: an older active legacy turn may have no client-turn id, so the conflict contract must not manufacture one.
- Extract or build one server-owned worker preparation boundary for normalized attachments, canonical request hash v2, frozen model-facing history, trusted prepared-prompt copy/lineage, prompt/tool surface, artifact hash/byte counts, session metadata, and pressure decision. The browser may not submit a prepared artifact, request hash, capacity verdict, user id, queue identity, or execution mode.
- Add authenticated `POST /api/agent/v2/turns`. Validate the signed lease against authenticated user/client/stream/context and current kill epoch before creating a service client or making durable writes; accept only `worker_realtime` / `agentic_chat_worker_v1`.
- Generate turn, message, artifact, and correlation UUIDs on the server. Pass one exact normalized input into the hosted RPC and map its typed outcomes without exposing database details.
- A lost admission response must resolve through the same client-turn id and request hash. Matching duplicates return their stored immutable mode/handle and never authorize browser-side execution.
- Map active/idempotency conflict to HTTP 409 and capacity to a bounded retryable response with server-owned `Retry-After`. All responses are private/no-store.
- Add no migration, browser lease prefetch, Send-path dispatch, worker-handle registration, event-to-UI adapter, queue consumer, provider/model invocation, rollout flag, or enabled worker route in this slice.

## Required proof

- A missing, malformed, expired, cross-bound, legacy-mode, contract-mismatched, or stale-kill-epoch lease fails before durable work.
- Client JSON cannot select execution mode, forge user/source/capacity/request hash, or inject prepared artifact content.
- Newly admitted and duplicate receipts are identity-checked; corrupt/ambiguous receipts fail closed.
- Same-command retry creates one turn/message/artifact/job and returns the stored handle; hash/session drift returns conflict.
- Inline session creation and existing-session ownership/scope are preserved by the hosted transaction.
- Capacity rejection writes nothing and returns a bounded retry hint.
- The production browser continues to call only legacy SSE, and the mounted Realtime runtime still registers no worker handle.

## Implementation order

1. Add and prove the strict RPC adapter/result parser.
2. Extract the server-owned preparation inputs currently assembled inside the legacy stream route, without changing legacy behavior.
3. Add lease-first route validation and the authenticated admission route.
4. Run focused duplicate/conflict/capacity/lease proofs, the complete Agentic Chat suite, unchanged legacy-controller tests, shared typecheck/build, and web check.

## Routing gate

Completing this slice creates an inert worker admission endpoint, not a production route. New transport negotiation remains legacy-only until the following handle-adoption/UI adapter slice and the inert consumer/fake-provider Phase 2 exit matrix are complete and explicitly approved.

## Local implementation result

Completed locally on 2026-08-03:

- `worker-turn-admission.server.ts` calls the exact hosted RPC signature and runtime-validates newly admitted, matching duplicate, active-turn conflict, idempotency conflict, and bounded capacity outcomes;
- new admission receipts must match every server-generated identity, the requested stream/client identity, worker mode, queued status, and a non-null queue relationship;
- matching duplicates never authorize execution and must preserve the request stream/client binding; worker duplicates must retain their message/artifact/job relationships;
- active conflicts preserve the legitimate legacy edge where an older active turn has no client-turn id;
- idempotency and capacity receipts are bounded and malformed/contradictory responses fail closed; and
- database errors are reduced to a typed private boundary;
- `worker-turn-preparation.server.ts` now owns normalized messages/attachments, access and session intent, stable non-consuming prepared-prompt lineage, selected surface/tools/session metadata, exact model-facing history with source lineage, trusted prompt/context/tool copies, canonical request/artifact hashes, exact UTF-8 byte counts, request payload/message metadata, and all generated UUIDs;
- `inspectPreparedPromptForWorkerAdmission(...)` validates a prepared copy without claiming it; only the hosted admission RPC locks and consumes the row, so a read/admission race rejects and rolls back atomically;
- prepared-prompt consumption or expiry after successful admission does not change lost-response retry hash lineage;
- inline-created sessions always submit `admission_window`, empty history, no source ids, and null prepared lineage while retaining freshly built server-owned prompt inputs;
- `worker-turn-capacity.server.ts` defines a fresh queue/provider/publisher evidence contract and defaults closed while no live evidence collector exists; the database still resolves duplicates first and enforces hard running/queued caps;
- authenticated `POST /api/agent/v2/turns` now parses only strict user command fields, verifies an exact worker lease before admin-client creation, prepares one trusted RPC value, invokes the atomic adapter once, returns only an immutable worker handle, hides conflicts/details, and emits bounded capacity responses with exact `Retry-After`; and
- transport negotiation still normalizes context but remains hardcoded to `legacy_sse` / `legacy_internal_v1` for every genuinely new decision.

Validation is green at 5 focused Slice 4 files / 30 tests, 104 complete Agentic Chat service/route/PostgreSQL files / 852 tests, 24/24 unchanged legacy stream-controller tests, 24/24 shared-types tests plus typecheck and CJS/ESM/declaration build, zero web-check errors/warnings, and a clean `git diff --check`. The first complete run in the restricted sandbox produced only the documented `listen EPERM: operation not permitted 127.0.0.1` PostgreSQL harness failures; the permission-correct rerun passed all 104 files / 852 tests.

No migration or hosted mutation was added. No browser call site exists, live capacity evidence is not wired, no worker handle is registered, and worker routing remains disabled. The next slice owns server-admitted/discovered handle adoption and the worker event-to-UI adapter before any routing enablement.
