<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_SLICE_5_CLIENT_ADOPTION_UI_PLAN_2026-08-03.md -->

# Agentic Chat Worker Phase 2D Slice 5 — Authoritative Handle Adoption and UI Projection

**Implemented:** 2026-08-03 EDT  
**State:** Locally complete; production worker routing remains disabled.

## Purpose

Adopt only server-authoritative worker handles into the already-mounted receive runtime and project durable worker truth through the existing Agent Chat UI state machine. This slice does not negotiate a worker lease, submit production Send to `POST /turns`, or enable worker execution.

## Implementation

- `worker-turn-adoption.ts` owns admission/discovery adoption, exact immutable-handle validation, matching-duplicate convergence, bounded active-session discovery, stale-response fencing, and teardown.
- `agent-chat-worker-ui-adapter.ts` applies the current-generation reconciliation snapshot first, then semantic projection/events, without duplicating text already covered by the response watermark. Terminal truth is idempotent and cleans up the adopted handle.
- `agent-chat-stream-controller.svelte.ts` stores worker handles separately from legacy stream state, routes Stop through the handle's immutable owner, prevents legacy double-dispatch, and keeps a worker turn active until durable terminal truth arrives.
- `AgentChatModal.svelte` mounts adoption over the standing authenticated Realtime runtime, performs owned active-session discovery, and feeds the existing message/activity projection. Auth loss, session change, modal teardown, and terminal completion release only the affected handle.
- Reconciliation and live receipts now fail closed on incomplete durable windows, generation metadata mismatches, and malformed terminal identity/message relationships.

## Review corrections

The second pass fixed an initial-auth/discovery race: the asynchronous initial auth lookup may no longer clear a handle discovered by the synchronous auth callback. Handle cleanup now occurs only for a real prior-user-to-different/null-user transition. Reconcile responses are private/no-store on every success and error path.

## Proof

- adoption: 7 tests;
- worker UI adapter: 6 tests;
- worker stream controller: 26 tests;
- inbox: 12 tests;
- complete Agentic Chat service/route/PostgreSQL gate: 105 files / 860 tests;
- focused controller/UI gate: 2 files / 32 tests; and
- `svelte-check`: 0 errors / 0 warnings.

The Svelte autofixer reports no issues in the changed component/module. Its generic existing `$effect`/mutable-built-in suggestions were not broadened into this transport slice.

## Safety boundary

Every new transport decision remains `legacy_sse`. The production browser still does not call worker admission, and live capacity evidence remains absent/closed. Adoption is reachable only from an authoritative admitted or owned-discovery handle. No worker queue consumer or provider is started by this slice.
