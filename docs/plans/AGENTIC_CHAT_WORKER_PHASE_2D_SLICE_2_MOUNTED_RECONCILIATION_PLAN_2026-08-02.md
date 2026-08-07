<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_2D_SLICE_2_MOUNTED_RECONCILIATION_PLAN_2026-08-02.md -->

# Agentic Chat Worker Phase 2D Slice 2 — Mounted Channel and Reconciliation Coordinator Plan

**Date:** 2026-08-02

**Status:** Local implementation and post-implementation audit complete. The private receive path is mounted but deliberately holds no worker turn handles; worker admission, handle adoption, queue-consumer registration, provider execution, and worker routing remain intentionally deferred. Slice 3 has since added an inert transport/owned-turn gateway without registering a handle.

## Objective

Mount the hosted private per-user Broadcast channel at the live Agent Chat surface and add one bounded client coordinator that turns inbox reconciliation requests into authenticated calls to the hosted generation-consistent endpoint.

## Locked scope

- One coordinator around `AgenticChatWorkerRealtimeInbox` with at most one reconciliation request in flight per registered turn.
- Immediate reconciliation on registration, sequence/generation gaps, Realtime hints, channel loss/rejoin, buffer overflow, protocol/application failure, and tab/network wake.
- One low-frequency active-turn watchdog: approximately two seconds with jitter while durable truth changes, backing off to five seconds when unchanged.
- Same-origin authenticated `GET /api/agent/v2/turns/<id>/reconcile` calls carrying the exact generation and durable cursor owned by the inbox.
- Failed requests release the inbox request latch, remain in buffer/reconcile mode, and retry only through one bounded timer; they never apply live events ahead of durable truth or rerun a turn.
- Terminal reconciliation stops that turn's watchdog. Unregistration, surface teardown, and auth loss abort in-flight requests, clear timers, and ignore late responses.
- One surface runtime owns the Supabase auth lifecycle, exact user-channel lifecycle, `online` wake, and visible-tab wake. Auth user changes replace the exact channel; sign-out closes it.
- Mount the runtime in `AgentChatModal` while the surface is active, preserving hidden keep-alive behavior.
- No worker-handle discovery/adoption, transport lease, worker admission/cancel route, Send-path selection, event-to-UI adapter, queue consumer, model/provider call, feature-flag change, or enabled worker route in this slice.

## Required proof

- Registration sends the exact authenticated reconciliation URL and applies its private API envelope through the proven inbox.
- Concurrent reasons coalesce behind one in-flight request and cannot reorder cursor application.
- Network/HTTP/protocol failure preserves buffering and retries without a tight loop.
- The watchdog uses the locked two-second jitter window and five-second unchanged backoff, and stops at terminal truth.
- Unregister/stop aborts outstanding work, clears every timer, and ignores late fetch completion.
- Authenticated mount opens exactly one `chat-user:<auth.uid()>` channel; token refresh is idempotent, user replacement changes topics, and sign-out closes the channel.
- `online` and visible-tab wake request durable convergence for registered turns.
- The production chat surface imports and starts the runtime, while the existing legacy SSE Send/cancel/reconcile behavior remains unchanged.

## Routing gate

This slice closed only the mounted delivery/reconciliation prerequisite. Slice 3 has since added the still-unused transport/discovery/cancel gateway; worker routing remains disabled until lease-verified worker admission, handle adoption and the worker event-to-UI adapter, inert consumer assembly, and the complete fake-provider Phase 2 exit matrix are implemented and proven.

## Local implementation result

Completed locally on 2026-08-02:

- added `AgenticChatWorkerRealtimeCoordinator` around the proven inbox, with one in-flight authenticated reconciliation request per registered turn, request coalescing, exact generation/durable cursors, and late-response fencing;
- added a two-second jittered changed-state watchdog, five-second unchanged backoff, one five-second failure retry timer, terminal stop, and abort/cleanup on pause or unregistration;
- added an explicit inbox latch release that preserves buffering after a failed request, so live acceleration never advances ahead of durable truth;
- fixed a review-discovered failure mode where an invalid `200` reconciliation receipt could synchronously request another reconciliation and spin; invalid receipt/application results now consume that internal requeue and use the same bounded five-second retry gate as HTTP/network failures;
- added `AgenticChatWorkerRealtimeRuntime`, which owns authentication, exact per-user channel lifecycle, visible-tab/network wake convergence, and stale-auth-result fencing;
- kept the coordinator paused until an authenticated user is established, made same-user token refresh idempotent, replaced the exact channel on identity change, and closed/aborted the transport on sign-out;
- mounted the runtime while `AgentChatModal` is active, preserving the hidden keep-alive lifecycle and stopping it through the existing hard-close/destroy teardown path; and
- left worker-handle registration unused in production, so the current Send, Stop, detach, session reconciliation, and legacy SSE selection paths are unchanged.

Post-implementation audit completed on 2026-08-03:

- terminally closed channels now fence the old callback epoch, explicitly remove the exact Supabase channel, and create only one replacement;
- channel construction/removal failure now enters observable `unavailable` state, releases partial state, and requests durable convergence;
- only a channel that had actually subscribed can report a later subscription as a reconnection;
- coordinator stop clears its in-flight latch even when a fetch implementation ignores abort, while request epochs reject late completion;
- surface/auth teardown and authenticated-user replacement unregister every tracked turn and observer rather than retaining cross-user handles;
- malformed authenticated UUIDs fail closed before channel construction, and synchronous auth-subscription setup failures fully unwind listeners and partial mount state; and
- auth transitions are revision-fenced and serialized, including the edge case where the auth SDK emits synchronously while the initial user lookup is being installed.

Implementation and proof:

- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-coordinator.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-coordinator.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-runtime.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-runtime.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-inbox.ts`
- `apps/web/src/lib/services/agentic-chat-v2/worker-realtime-inbox.test.ts`
- `apps/web/src/lib/components/agent/AgentChatModal.svelte`

Validation:

- focused channel/inbox/coordinator/runtime suite: 4 files / 34 tests;
- cumulative Agentic Chat suite after Slice 3: 101 files / 830 tests;
- unchanged legacy stream controller: 1 file / 24 tests;
- Svelte analyzer for `AgentChatModal`: no issues;
- web `svelte-check`: 0 errors / 0 warnings; and
- repository diff whitespace check: clean for this slice.

No migration or hosted mutation belongs to this slice. An authenticated active chat surface now establishes the standing private receive channel, but no turn is registered and therefore no reconciliation HTTP call or worker UI application occurs until the next server-authoritative API/lease slice supplies an admitted or discovered worker handle.
