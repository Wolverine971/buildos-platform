<!-- docs/specs/AGENTIC_CHAT_DETACHED_TURN_EXECUTION_PLAN.md -->

# Agentic Chat Detached Turn Execution Plan

Date: 2026-04-30

## Problem

Agentic chat currently treats the visible SSE connection as the owner of the turn. When a user navigates away while a response is waiting on tool calls or later model passes, the chat modal unmounts, aborts the client fetch, and the server sees `request.signal.aborted`. The backend then records the turn as cancelled/interrupted and may persist only partial assistant text.

Desired behavior:

- If the user navigates away, the already-started turn should finish.
- When the user returns, the modal should restore the completed assistant response and tool activity from persisted state.
- Explicit Stop should still cancel the running turn.
- Background turns must not become runaway agents.

## Current Relevant Flow

- `AgentChatModal.svelte` owns the `fetch('/api/agent/v2/stream')` request and its `AbortController`.
- `onDestroy` calls `handleStopGeneration('user_cancelled')` when streaming.
- `/api/agent/v2/stream` passes `request.signal` into `streamFastChat`.
- `streamFastChat` checks the signal before model/tool work and returns a cancelled result on abort.
- Completed assistant messages and tool executions are already persisted to `chat_messages` and `chat_tool_executions`.
- `loadAgentChatSessionSnapshot` already restores persisted messages and reconstructed tool activity.

## Design

Treat SSE as a live view of a durable turn, not the owner of the work.

### Turn Ownership

- A user message starts exactly one turn identified by `client_turn_id` and `stream_run_id`.
- The server persists a `chat_turn_runs` row with `status = 'running'`.
- The turn continues if the client disconnects or the modal unmounts.
- The turn only cancels when the user explicitly presses Stop or a guardrail limit is hit.

### Streaming Attachment

- The SSE writer is best-effort.
- If writing to the stream fails after navigation, mark the stream as detached and keep executing the turn.
- Final persistence must not depend on the client still being connected.
- If the user later reopens the session, the modal reloads `chat_messages`, `chat_tool_executions`, and `chat_turn_runs`.

### Runaway Protections

- One active run per session: starting a new turn must not create duplicate unbounded work.
- A partial unique index on `chat_turn_runs(session_id)` where `status = 'running'` should enforce that guard even if two requests race.
- Hard wall-clock cap per turn.
- Existing tool round and tool call caps stay enforced.
- Explicit cancel remains supported through `/api/agent/v2/stream/cancel`.
- The running turn checks cancellation state before expensive stages.
- Stale active runs can be identified by `chat_turn_runs.status = 'running'` and `started_at`/future lease fields.

## Immediate Implementation

This phase fixes navigation detach without introducing a separate worker queue.

1. Stop treating modal destruction as user cancellation.
    - On unmount, detach the UI and abort only the local reader.
    - Do not call `/stream/cancel` from `onDestroy`.
    - Preserve explicit Stop behavior.

2. Decouple server cancellation from `request.signal`.
    - Do not pass `request.signal` directly into `streamFastChat`.
    - Use a server-owned `AbortController`.
    - Abort that controller for explicit cancel or wall-clock timeout.

3. Make SSE writes best-effort.
    - Track whether the stream is detached.
    - For user-visible stream events, failed writes should detach the stream instead of throwing out of the turn.
    - Final persistence should still run.

4. Poll for explicit cancel.
    - Reuse the existing cancel hint in `chat_sessions.agent_metadata`.
    - A lightweight watcher checks the hint while the turn runs.
    - When found, abort the server-owned turn signal and persist an interrupted message.

5. Expose active turn state on session restore.
    - Include recent `chat_turn_runs` rows in `GET /api/chat/sessions/[id]`.
    - The modal can show a running/restoring state if the latest turn is still `running`.
    - When reopened after completion, existing snapshot restoration shows the completed response.

## Follow-Up Worker Version

The immediate version still runs inside the request lifecycle. The more durable version should move execution into the worker queue:

- `POST /api/agent/v2/turns` creates a durable run and enqueues a worker job.
- `GET /api/agent/v2/turns/[id]/events` attaches SSE to stored/realtime events.
- Worker owns model/tool execution, heartbeat, lease, and final persistence.
- A cleanup job cancels expired leases.

## Acceptance Criteria

- Navigating away during a tool-call pause does not persist `interrupted_reason = disconnect`.
- Reopening the same session after completion shows the full final assistant message.
- Pressing Stop still cancels the turn.
- A running turn cannot exceed the configured wall-clock cap.
- Tests cover session restore including recent turn runs and cancel/detach helpers where practical.
