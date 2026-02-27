<!-- apps/web/docs/features/agentic-chat/PAUSE_AND_FOLLOW_ON_PROPOSAL.md -->

# Pause + Follow-On Proposal (Agentic Chat V2)

**Status:** Proposed  
**Date:** 2026-02-27  
**Scope:** `/api/agent/v2/stream` + `AgentChatModal` pause/stop + follow-on message behavior

## 1. Executive Summary

We should **not** try to “resume generation from partial tokens.” That path is brittle and high-complexity.

We should instead implement a simpler, robust contract:

1. Treat pause/stop as a **first-class terminal outcome** (`cancelled`/`interrupted`), not an error.
2. Persist a minimal partial turn record when a stream is interrupted (for auditability + continuity).
3. Treat follow-on as a **new turn** that can reference summarized partial context, not token-level continuation.
4. Add lightweight idempotency/run-correlation so retries and supersedes are deterministic.

## 2. Why This Is the Best-Practice Direction

External guidance points to a state-machine approach, not token-resume:

1. Streaming systems expose terminal lifecycle events and states; done/status should drive logic.
2. For synchronous streaming, cancellation is fundamentally a connection termination event.
3. Stream cancellation can discard queued chunks; partial data cannot be treated as complete truth.
4. Idempotency keys should be used for safe retries and duplicate suppression.
5. Stop reasons should be separated from true request errors.

This aligns with a pragmatic implementation: **stateful turn outcomes + partial persistence + idempotent retries**.

## 3. Current V2 Gaps (From Audit)

1. Abort in v2 is handled like a generic error path in key places.
2. Interrupted partial assistant content is not reliably persisted in v2.
3. `stream_run_id` is sent by client but not used for turn reconciliation.
4. UI interruption badge can race with buffered text flush.
5. Rare session-fork risk exists if user supersedes before initial `session` event arrives.

## 4. Target Behavior Contract

### 4.1 User presses Stop (Pause)

1. UI immediately stops rendering stream and marks turn interrupted.
2. Backend classifies termination as `cancelled` (not `error`).
3. Backend persists:
    1. user message (already persisted),
    2. assistant partial (if any),
    3. interruption metadata (`interrupted=true`, reason, run id, token estimate).
4. Turn becomes terminal and visible in history as interrupted.

### 4.2 User sends follow-on while stream is active

1. Current run is superseded and closed with `interrupted_reason='superseded'`.
2. New run starts as a fresh turn (new `client_turn_id`, new `stream_run_id`).
3. Conversation continuity uses summarized prior partial context, not token offset resume.

### 4.3 Network drop / client disconnect

1. Server treats it as cancellation outcome.
2. Persist what is known so far.
3. Do not log this as system failure severity unless abnormal.

## 5. Proposed Implementation (Concrete)

## 5.1 UI Changes

**File:** `apps/web/src/lib/components/agent/AgentChatModal.svelte`

1. On stop/supersede, flush buffered assistant text before interruption metadata tagging to remove race conditions.
2. Introduce `client_turn_id` per send and include it in request payload.
3. If supersede happens before first `session` event, queue follow-on send until session is known (short timeout window) to avoid accidental session fork.
4. Keep current UX semantics:
    1. stop button = interrupt current run,
    2. follow-on = new user turn.

## 5.2 API Route Changes

**File:** `apps/web/src/routes/api/agent/v2/stream/+server.ts`

1. Parse and propagate `client_turn_id`.
2. Handle abort/cancel in a dedicated branch (not generic error branch).
3. Persist interrupted assistant partial with metadata:
    1. `interrupted: true`
    2. `interrupted_reason: user_cancelled|superseded|disconnect`
    3. `stream_run_id`
    4. `client_turn_id`
    5. `finished_reason: cancelled`
4. Downscope error logging for expected aborts to info/debug.
5. Ensure `last_turn_context` generation is safe when turn is interrupted.

## 5.3 Stream Orchestrator Changes

**File:** `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`

1. Replace `throw new Error('Request aborted')` pathways with a structured cancellation return:
    1. `finishedReason='cancelled'`
    2. partial `assistantText`
    3. executed tool results so far
2. Preserve deterministic terminal semantics across all outcomes: `stop | cancelled | error`.

## 5.4 Persistence and Idempotency

**Primary file:** `apps/web/src/lib/services/agentic-chat-v2/session-service.ts`  
**Optional DB follow-up:** expression index or dedicated column for turn id

1. Add idempotent write guard by `client_turn_id` (at least for user messages).
2. If same turn is retried, return existing result rather than duplicating.
3. Keep metadata-first approach initially to avoid heavy schema churn.
4. If volume grows, add indexed turn-id column for strict guarantees.

## 6. How Behavior Will Differ After Fix

1. Stopping a response will no longer look like a server error condition.
2. Interrupted assistant partials will be consistently represented in persisted history.
3. Follow-on messages during active stream will be deterministic and easier to reason about.
4. Retry/supersede semantics become traceable per turn (`client_turn_id`) and per stream (`stream_run_id`).

## 7. Test Plan

1. Unit: orchestrator returns `cancelled` with partial text/tool results when aborted.
2. API: cancel mid-stream persists interrupted assistant metadata and does not emit error-path logs.
3. UI: stop before first delta still yields consistent interrupted state.
4. UI+API: follow-on supersede creates exactly one new turn, no duplicate session creation.
5. Regression: normal completed streams unchanged.

## 8. Rollout Plan

### Phase 1 (recommended immediately)

1. UI interruption race fix.
2. Dedicated cancel outcome handling in v2 route/orchestrator.
3. Persist interrupted partials in v2.
4. Add basic `client_turn_id` plumbing.

### Phase 2 (optional hardening)

1. Strong idempotency storage/indexing for `client_turn_id`.
2. Resumable event cursor model (only if needed for reconnect UX).

## 9. Decisions Needed

Please confirm these product choices (recommended defaults included):

1. Persist partial assistant text on interruption?
    - **Recommended:** Yes, but only if non-empty.
2. Show interrupted partials in resumed history UI?
    - **Recommended:** Yes, with explicit “Response interrupted” badge.
3. Superseded turn treatment:
    - **Recommended:** Keep both user and interrupted assistant partial as audit trail (do not delete).
4. Pre-session supersede handling:
    - **Recommended:** Queue follow-on briefly until `session.id` is known, then send.

## 10. External References

1. OpenAI Streaming Responses guide (streaming caveats and moderation note):  
   https://platform.openai.com/docs/guides/streaming-responses
2. OpenAI Background mode (cancel semantics, terminal states, resumable cursor pattern):  
   https://platform.openai.com/docs/guides/background
3. OpenAI Realtime conversations (response lifecycle, `response.done`, cancellation/truncation handling):  
   https://platform.openai.com/docs/guides/realtime-conversations
4. MDN `ReadableStreamDefaultReader.cancel()` (queued data loss on cancel):  
   https://developer.mozilla.org/en-US/docs/Web/API/ReadableStreamDefaultReader/cancel
5. MDN Server-Sent Events (event IDs/retry/reconnect semantics):  
   https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
6. MDN `AbortSignal` / `AbortController` (abort behavior and `AbortError`):  
   https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal  
   https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort
7. Stripe idempotency guidance (safe retries and duplicate suppression pattern):  
   https://docs.stripe.com/api/errors#idempotent-requests  
   https://docs.stripe.com/error-low-level
8. Anthropic stop-reason handling in streaming (distinguish stop reasons from failures):  
   https://docs.anthropic.com/en/api/handling-stop-reasons
