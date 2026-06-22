<!-- docs/plans/AGENTIC_CHAT_SEND_STREAM_CONTROLLER_TASKER_2026-06-22.md -->

# Agentic Chat Send/Stream Controller Tasker

Status: implemented
Created: 2026-06-22
Owner: BuildOS agentic chat
Workstream: frontend decomposition / stream lifecycle correctness

## Purpose

Give one agent enough context to extract the client-side send/receive/cancel stream orchestration out of `AgentChatModal.svelte`.

This should run after `AGENTIC_CHAT_IMAGE_OCR_ATTACHMENT_PIPELINE_TASKER_2026-06-22.md`, because the send path currently reaches deeply into image attachment internals. Attachment extraction gives this controller a cleaner dependency surface.

## Goal

Create a stream controller that owns the client-side lifecycle for sending a user or agent-peer message to `/api/agent/v2/stream`, processing SSE callbacks, and handling stop/supersede/error cleanup.

Recommended new file:

```text
apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts
```

Recommended test file:

```text
apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts
```

## Required Reading

Read these before editing:

1. `apps/web/src/lib/components/agent/AgentChatModal.svelte`
    - `handleSendMessage()`, send-after-transcription effect, `sendMessage()`, `reportStreamCancellationReason()`, `detachActiveStream()`, and `handleStopGeneration()`.
2. `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts`
    - The stream controller should call the extracted SSE handler, not absorb its switch statement.
3. `apps/web/src/lib/components/agent/agent-chat-prewarm.svelte.ts`
    - The stream controller must consume matching prewarm/prepared prompt data.
4. `apps/web/src/lib/components/agent/agent-chat-voice.svelte.ts`
    - The send button has special behavior while voice recording is active.
5. `apps/web/src/lib/components/agent/agent-chat-session.ts`
    - Session bootstrap helpers and session hydration.
6. `apps/web/src/lib/utils/sse-processor.ts`
7. `apps/web/docs/features/agentic-chat/PROPOSAL_2026-04-18_GOD-COMPONENT-DECOMPOSITION.md`
    - See "Slice A - Session/stream controller". Treat it as background because some other slices are already shipped.

## Current State

`AgentChatModal.svelte` still owns a large send lifecycle:

- send while recording stops voice capture and auto-sends after transcription
- validates text/attachment readiness
- blocks sends during session load/restored turn/start
- supersedes an active stream before a new send
- ensures a chat session exists
- creates optimistic user or agent-peer message
- schedules message attachment OCR polling
- clears input, attachments, and voice note group
- creates `client_turn_id` and `stream_run_id`
- increments `activeStreamRunId` stale-stream guard
- initializes client stream timing
- starts thinking block
- posts to `/api/agent/v2/stream`
- passes prewarmed context and prepared prompt key
- processes SSE events through `SSEProcessor`
- delegates parsed events to `createSSEHandler`
- handles transport errors, completion, aborts, and rollback
- sends cancellation hints to `/api/agent/v2/stream/cancel`

This is the highest-risk frontend cleanup because it touches the primary chat path and the race protection around stale streams.

## Recommended Design

Create a controller with explicit dependencies instead of importing modal state directly.

Suggested shape:

```ts
export interface StreamControllerDeps {
  getInputValue(): string;
  setInputValue(value: string): void;
  getSelectedContextType(): ChatContextType | null;
  getSelectedEntityId(): string | undefined;
  getResolvedProjectFocus(): ProjectFocus | null;
  getCurrentSession(): ChatSession | null;
  ensureSessionReady(target: SessionBootstrapTarget): Promise<ChatSession | null>;
  getLastTurnContext(): LastTurnContext | null;
  attachments: {
    buildReadyRefs(includePreviewUrl?: boolean): ChatAttachmentRef[];
    getDraftSnapshot(): AgentChatImageAttachment[];
    clearDraft(): void;
    restoreDraft(snapshot: AgentChatImageAttachment[]): void;
    scheduleMessageOcrPoll(messageId: string, assetId: string, status: unknown): void;
  };
  voice: VoiceAdapterLike;
  prewarm: PrewarmControllerLike;
  sse: (event: AgentSSEMessage) => void;
  messages: message-list mutation surface;
  thinking: thinking-block mutation surface;
  fetchImpl?: typeof fetch;
}
```

The controller should expose reactive state that the modal currently renders:

- `isStreaming`
- `isStartingStream`
- `currentActivity`
- `activeStreamRunId`
- `activeTransportStreamRunId`
- `activeClientTurnId`
- `error`

If moving all state at once is too disruptive, start with methods plus minimal state ownership. The end state should still make the modal a thin view/controller shell.

## Implementation Tasks

1. Extract client stream timing helpers into the controller or a small helper module:
    - `buildClientStreamTimingState`
    - `recordClientStreamEvent`
    - `attachServerTiming`
    - `summarizeClientStreamTiming`
    - `finalizeClientStreamTiming`
2. Extract cancellation functions:
    - `reportStreamCancellationReason`
    - `detachActiveStream`
    - `handleStopGeneration`
3. Extract send entry points:
    - `handleSendMessage`
    - send-after-transcription trigger
    - `sendMessage(contentOverride, options)`
4. Preserve stale-stream guard semantics:
    - every new stream increments the run id
    - abort/supersede invalidates the old run id
    - late SSE events can hydrate a session only when safe, then otherwise no-op
5. Keep `createSSEHandler` as the event reducer.
6. Keep the modal responsible for rendering and passing controller state to child components.
7. Add tests using fake `fetch`, fake `SSEProcessor`, fake prewarm, fake session bootstrap, fake attachment controller, and fake voice adapter.
8. Update this doc after implementation with what stayed in the modal and why.

## Non-Goals

Do not do these in this task:

- Do not change the `/api/agent/v2/stream` request body.
- Do not change the SSE event schema.
- Do not merge the SSE handler back into the controller.
- Do not rewrite thinking-block presentation.
- Do not change A2A behavior except through the same `senderType: 'agent_peer'` path.
- Do not refactor backend stream code.

## Risk Areas

- Supersede flow: current code waits briefly for cancel hint when sending while a stream is active. Preserve this.
- Abort handling: an abort from supersede must not show as a user-visible error.
- Optimistic rollback: failed sends remove the optimistic user message and restore input/attachments.
- Voice send: "send while recording" must still stop recording and send after transcription completes.
- Prewarm consumption: prepared prompt key is cleared after selection; do not accidentally reuse it after a turn.
- Thinking block finalization: all exit paths must complete, interrupt, cancel, or error the active block.

## Acceptance Criteria

- `AgentChatModal.svelte` no longer contains the main `sendMessage()` implementation or cancellation implementation.
- Streaming, stopping, superseding, and retrying still behave as before.
- Agent-peer sends still use the same path.
- Attachment and voice behavior from their controllers is preserved.
- Controller tests cover success, HTTP error, transport error, abort, supersede, send while recording, and stale event guard.
- Existing SSE handler tests still pass.

## Implementation Notes

Implemented on 2026-06-22 in:

- `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts`
- `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts`
- `apps/web/src/lib/components/agent/AgentChatModal.svelte`

Moved into the stream controller:

- stream run state (`isStreaming`, `isStartingStream`, activity label, active run/client/transport IDs, stream error, timing state, sent-message flag)
- client stream timing helpers
- send entry points, including send-while-recording and send-after-transcription handling
- `/api/agent/v2/stream` fetch orchestration and `SSEProcessor` callbacks
- stale stream guard behavior, including safe late session hydration
- stop, supersede, detach/dispose, and `/stream/cancel` reporting
- prewarm/prepared prompt consumption and prepared prompt clearing

Stayed in `AgentChatModal.svelte`:

- session bootstrap and session hydration helpers, because they are still shared with session loading, prewarm adoption, header/context state, and restored-turn refresh behavior outside the send path
- concrete message-list, assistant text buffer, and thinking-block mutations, because they are tightly coupled to modal rendering state and existing SSE handler dependencies; the controller receives them as explicit dependency surfaces
- attachment, voice, and prewarm controllers, because they are already extracted owners and the stream controller only coordinates their send-time APIs
- agent-to-agent wizard UI and loop state, with its agent-peer turn now calling `stream.sendMessage(..., { senderType: 'agent_peer' })`
- close/finalize summary logic, with sent-message state read from the stream controller

## Suggested Verification

Run focused tests:

```bash
pnpm --filter @buildos/web test -- \
  src/lib/components/agent/agent-chat-stream-controller.svelte.test.ts \
  src/lib/components/agent/agent-chat-sse-handler.test.ts \
  src/lib/components/agent/agent-chat-prewarm.svelte.test.ts \
  src/lib/components/agent/agent-chat-voice.svelte.test.ts
```

Then run the route tests:

```bash
pnpm --filter @buildos/web test -- src/routes/api/agent/v2/stream/server.test.ts
```

Manual smoke checklist:

- send normal text
- stop generation
- send a second message while first is streaming
- send while recording voice
- send with attachments
- send agent-peer/A2A message if that path is available in the UI
