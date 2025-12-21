<!-- apps/web/docs/features/agentic-chat/STREAM_INTERRUPT_SPEC.md -->

# Agentic Chat Stream Interruption Spec

**Created**: 2025-12-20
**Status**: Draft (v2)
**Author**: AI-assisted

## Overview

Enable users to interrupt/cancel an in-progress AI agent response mid-stream and immediately send a new message without waiting for the current response to complete.

**This revision adds:**

- Explicit `interrupted/cancelled` statuses for thinking blocks and assistant messages.
- A stale-stream guard to drop late SSE chunks after aborts.
- Persistence rules for partial assistant output and partial tool results (with metadata for context safety).

## Current Architecture Analysis

### Frontend (AgentChatModal.svelte)

The component already has foundational abort infrastructure:

```typescript
// Line 215: Abort controller for current stream
let currentStreamController: AbortController | null = null;

// Line 1719: Created in sendMessage()
streamController = new AbortController();
currentStreamController = streamController;

// Line 1737: Passed to fetch()
signal: streamController.signal,

// Line 1788: Passed to SSEProcessor
signal: streamController.signal
```

**Current abort triggers:**

- `handleClose()` (line 1608): Aborts when modal is closed
- `onDestroy()` (line 2482): Cleanup on component destruction
- New `sendMessage()` call (line 1716): Aborts previous stream before starting new one

**Previous limitations (addressed in this spec/implementation):**

- No explicit "Stop" button in UI during streaming
- Composer was disabled while `isStreaming === true`
- Users had to close the modal to abort

### Backend (stream-handler.ts)

The backend properly handles abort signals:

```typescript
// Line 198: Receives abort signal in params
requestAbortSignal?: AbortSignal;

// Line 228: Uses signal in orchestration
const abortSignal = requestAbortSignal;

// Line 282-284: Checks abort in stream loop
if (abortSignal?.aborted) {
    break;
}

// Line 287-289: Early return on abort
if (abortSignal?.aborted) {
    return;
}

// Line 351, 363, 387: Additional abort checks
```

### Orchestrator (agent-chat-orchestrator.ts)

The orchestrator also respects abort signals throughout:

```typescript
// Line 262-265: Checks abort in loop
if (request.abortSignal?.aborted) {
	doneEmitted = true;
	return;
}

// Lines 497, 549, 573, 608: Multiple abort checkpoints
```

### SSE Processor (sse-processor.ts)

Supports abort signal in options:

```typescript
// Line 22-23: Signal option
signal?: AbortSignal;

// Lines 69-81: Abort handler registration
if (signal) {
    if (signal.aborted) {
        abortHandler();
        return;
    }
    signal.addEventListener('abort', abortHandler);
}
```

## Proposed Implementation

### 1. UI Changes

#### A. Stop Button in AgentComposer

Replace the send button with a stop button while streaming:

```svelte
<!-- AgentComposer.svelte -->
{#if isStreaming}
	<button
		type="button"
		class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white shadow-ink transition-all duration-100 pressable hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-10 sm:w-10"
		aria-label="Stop response"
		onclick={onStop}
	>
		<Square class="h-4 w-4" />
	</button>
{:else}
	<!-- existing send button -->
{/if}
```

Add new prop to AgentComposer:

```typescript
interface Props {
	// ... existing props
	onStop?: () => void;
}
```

#### B. Allow Input During Streaming

Change the composer to allow typing while streaming (but not sending until stopped):

```diff
- disabled={isStreaming}
+ disabled={false}
```

The send button remains disabled during streaming, but the stop button is available.

Decouple button disabled states:

- Stop button should remain enabled while streaming (unless an abort is already in flight).
- `isSendDisabled` can stay true during streaming because the send button is hidden; introduce `isStopDisabled` if we need to block repeated clicks during abort cleanup.

#### C. Visual Feedback

Add a pulsing border or indicator during streaming to make it clear the response is in progress:

```svelte
<div class={`... ${isStreaming ? 'ring-2 ring-accent/50 animate-pulse' : ''}`}>
```

### 2. State Management & Lifecycle

#### A. Status model (frontend)

- Thinking blocks: `status` now supports `active | completed | interrupted | cancelled | error`. Aborted user stops should set `interrupted`; navigations/context-changes that supersede a turn should set `cancelled`.
- Assistant messages: add metadata `{ interrupted: boolean, interrupted_reason?: 'user_cancelled' | 'superseded' | 'error', stream_run_id?: number, partial_tokens?: number }` and an inline UI badge (“Response interrupted”) instead of appending plain text to content; hydrate metadata on session restore.
- Conversation history passed to the server must **exclude** interrupted assistant messages so partial text does not poison future prompts.

#### B. State fields

```typescript
let wasManuallyStopped = $state(false);
let activeStreamRunId = $state(0); // monotonic run token for stream guards
let interruptedReason = $state<'user_cancelled' | 'superseded' | 'error'>('user_cancelled');
```

#### C. Stop handler (ordering fixed to avoid dropping metadata)

```typescript
function finalizeThinkingBlock(
	status: 'completed' | 'interrupted' | 'cancelled' | 'error' = 'completed',
	note?: string
) {
	if (!currentThinkingBlockId) return;
	updateThinkingBlock(currentThinkingBlockId, (block) => ({
		...block,
		status,
		content:
			note ??
			(status === 'interrupted'
				? 'Stopped'
				: status === 'cancelled'
					? 'Cancelled'
					: status === 'error'
						? 'Error'
						: 'Complete')
	}));
	currentThinkingBlockId = null;
}

function handleStopGeneration(
	reason: 'user_cancelled' | 'superseded' | 'error' = 'user_cancelled'
) {
	if (!isStreaming || !currentStreamController) return;

	wasManuallyStopped = true;
	interruptedReason = reason;
	const runId = activeStreamRunId;
	// Invalidate the current run so late SSE chunks are dropped
	activeStreamRunId = activeStreamRunId + 1;

	currentStreamController.abort();

	if (currentAssistantMessageId) {
		updateAssistantMessage(currentAssistantMessageId, (msg) => ({
			...msg,
			metadata: {
				...msg.metadata,
				interrupted: true,
				interrupted_reason: reason,
				stream_run_id: runId
			}
		}));
	}

	finalizeThinkingBlock(
		reason === 'superseded' ? 'cancelled' : 'interrupted',
		reason === 'user_cancelled' ? 'Stopped by you' : 'Stopped'
	);
	finalizeAssistantMessage(); // Only after metadata is written

	isStreaming = false;
	currentActivity = '';
	agentState = null;
	agentStateDetails = null;
	voiceInputRef?.focus?.();
}
```

#### D. Send flow with stale-stream guard

```typescript
async function sendMessage(...) {
    // Abort any in-flight stream before starting a new one
    if (isStreaming && currentStreamController) {
        handleStopGeneration('superseded');
    }

    const runId = ++activeStreamRunId;
    let streamController: AbortController | null = new AbortController();
    currentStreamController = streamController;

    // Build conversation history without interrupted assistant messages
    const conversationHistory = messages
        .filter(
            (msg) =>
                (msg.role === 'user' || msg.role === 'assistant') &&
                !msg.metadata?.interrupted
        )
        .map(...);

    // Include runId in the request payload so the backend can tag partial persistence
    const response = await fetch('/api/agent/stream', {
        method: 'POST',
        signal: streamController.signal,
        body: JSON.stringify({
            message: trimmed,
            session_id: currentSession?.id,
            context_type: selectedContextType,
            entity_id: selectedEntityId,
            conversation_history: conversationHistory,
            stream_run_id: runId
        })
    });

    const callbacks: StreamCallbacks = {
        onProgress: (data: any) => {
            if (runId !== activeStreamRunId) return; // drop late chunks
            handleSSEMessage(data as AgentSSEMessage);
        },
        onError: (err) => {
            if (runId !== activeStreamRunId) return;
            // existing error handling...
        },
        onComplete: () => {
            if (runId !== activeStreamRunId) return;
            isStreaming = false;
            currentActivity = '';
            currentStreamController = null;
            agentState = null;
            agentStateDetails = null;
            if (!receivedStreamEvent && !error) {
                error = 'BuildOS did not return a response. Please try again.';
            }
            finalizeThinkingBlock('completed');
            finalizeAssistantMessage();
            lastFinishedRunId = runId;
        }
    };

    await SSEProcessor.processStream(response, callbacks, {
        timeout: 240000,
        parseJSON: true,
        signal: streamController.signal
    });
}
```

### 3. Backend Graceful Shutdown

#### A. Abort path persists flagged partials

- Accept `stream_run_id` in `/api/agent/stream` payload and thread it through `StreamRequest` → orchestrator → persistence so backend metadata matches the frontend guard.

```typescript
// stream-handler.ts - in finally/abort branch
if (abortSignal?.aborted) {
	const interruptReason =
		(abortSignal as any).reason === 'superseded' ? 'superseded' : 'user_cancelled';
	const metadata = {
		interrupted: true,
		interrupted_reason: interruptReason,
		stream_run_id: request.streamRunId,
		interrupted_at: new Date().toISOString()
	};

	if (state.assistantResponse.trim()) {
		await this.messagePersister.persistAssistantMessage({
			sessionId: session.id,
			userId,
			content: state.assistantResponse,
			messageType: 'assistant_interrupted',
			metadata: {
				...metadata,
				partial_tokens: state.assistantResponse.length // replace with token count if available
			}
		});
	}

	// Persist only completed tool results; skip pending tool calls without results
	if (state.toolResults.length > 0) {
		await this.messagePersister.persistToolResults({
			sessionId: session.id,
			userId,
			toolCalls: state.toolCalls,
			toolResults: state.toolResults,
			messageType: 'tool_partial',
			metadata: { ...metadata, partial: true }
		});
	}

	return; // Do not generate lastTurnContext on aborted runs
}
```

#### B. Tool execution cancellation

- `ToolExecutionService.executeTool` accepts an `abortSignal` option; short-circuits if already aborted, races execution against the signal, and returns “Operation cancelled” on abort. `executeMultipleTools` exits early on abort.
- `AgentChatOrchestrator` forwards `request.abortSignal` into tool execution so long-running tools are cancelled when the stream aborts.

#### C. Persistence format (Supabase `chat_messages`)

- Use existing columns: `message_type` and `metadata`.
- Assistant partial: `message_type: 'assistant_interrupted'`, `metadata: { interrupted: true, interrupted_reason, stream_run_id, partial_tokens }`.
- Tool partial: `message_type: 'tool_partial'`, `metadata: { partial: true, interrupted: true, interrupted_reason, stream_run_id }`, `tool_name` populated, `tool_result` holds the structured JSON result (avoid double-stringifying), `tool_call_id` set.
- Update `message-persister` helpers to accept `messageType` and `metadata` parameters.

### 4. SSE Events

- Existing event types remain (`text`, `tool_call`, `tool_result`, `done`, `error`, `context_shift`, etc.). A server-side `interrupted` ack is optional; if emitted, include `stream_run_id` and `reason`, and the frontend must drop it when `run_id !== activeStreamRunId`.
- Frontend handlers must apply the runId guard from §2D before mutating UI state. `SSEProcessor` cancels on abort, but buffered chunks prior to cancel can still surface; the guard prevents stale updates.

### 5. Keyboard Shortcuts

Add keyboard support for stopping:

```typescript
function handleKeyDown(event: KeyboardEvent) {
	if (event.key === 'Escape' && isStreaming) {
		event.preventDefault();
		handleStopGeneration('user_cancelled');
		return;
	}

	if (event.key === 'Enter' && !event.shiftKey) {
		event.preventDefault();
		// sendMessage will stop an in-flight stream first
		if (!isSendDisabled || isStreaming) {
			sendMessage();
		}
	}
}
```

## Implementation Phases

### Phase 1: Basic Stop Button (MVP)

1. Add stop button to AgentComposer
2. Wire up `onStop` callback to `handleStopGeneration()` and ensure it sets thinking block status to `interrupted/cancelled` (not `completed`)
3. Ensure clean state reset on abort and message metadata is written before finalizing
4. Mark interrupted messages visually (badge) without mutating content text

**Files to modify:**

- `AgentComposer.svelte` - Add stop button and prop
- `AgentChatModal.svelte` - Add `handleStopGeneration()` and wire to composer

### Phase 2: Send While Streaming

1. Enable input typing during streaming
2. Allow Enter to stop current + send new
3. Add Escape keyboard shortcut
4. Add runId/stale-stream guard around SSE callbacks and conversation_history filtering of interrupted messages

**Files to modify:**

- `AgentComposer.svelte` - Remove `disabled` from textarea
- `AgentChatModal.svelte` - Update keyboard handlers and stream guard

### Phase 3: Backend Improvements

1. Persist partial responses on interruption with `message_type/metadata`
2. Persist partial tool results (completed ones only) with `message_type/metadata`
3. Ensure tool execution can be cancelled and abort is forwarded
4. (Optional) Add `interrupted` SSE ack that includes `stream_run_id`

**Files to modify:**

- `stream-handler.ts` - Interrupted persistence
- `agent-chat-orchestrator.ts` - Tool cancellation
- `message-persister.ts` - Support `messageType` + `metadata`
- SSE types files (if ack is added)

### Phase 4: Polish

1. Visual feedback improvements
2. Accessibility enhancements (ARIA live regions)
3. Mobile touch handling
4. Animation refinements

## Edge Cases to Handle

### 1. Rapid Stop/Send

User stops and immediately sends a new message:

- Ensure previous abort completes before new request
- Use small delay or promise-based sequencing

### 2. Stop During Tool Execution

Long-running tool (e.g., web search) is interrupted:

- Mark tool as cancelled in thinking block
- If a partial result exists, render it with a "Partial (stopped)" badge; never mark as "completed"

### 3. Stop During Plan Execution

Multi-step plan is interrupted mid-execution:

- Mark remaining steps as "skipped"
- Show which steps completed before interruption

### 4. Network Issues During Stop

Abort happens but server already completed:

- Handle race condition gracefully
- Show the full response if it arrives

### 5. Rapid Multiple Messages

User stops multiple times quickly:

- Debounce stop button
- Ensure only one abort signal is processed

### 6. Stale SSE after abort

Late SSE chunks arriving after abort:

- Drop any chunk whose `run_id` (or closure token) does not match `activeStreamRunId`
- onComplete/onError handlers must also guard, so they cannot clear state for a superseding run

## Testing Checklist

### Unit Tests

- [ ] `handleStopGeneration()` writes interrupted metadata before finalizing and resets all state
- [ ] Thinking block status moves to `interrupted`/`cancelled` (not `completed`) on abort
- [ ] Abort signal propagates through SSE processor
- [ ] Stale-stream guard drops callbacks when `runId` changes
- [ ] Partial assistant messages are preserved with metadata
- [ ] `message-persister` accepts `messageType` + `metadata` and stores tool partials in `tool_result`
- [ ] ToolExecutionService respects `abortSignal` (single and multiple tools)

### Integration Tests

- [ ] Stop button appears during streaming
- [ ] Clicking stop immediately halts response
- [ ] New message can be sent after stop
- [ ] Escape key triggers stop
- [ ] Enter key stops + queues new message
- [ ] Thinking block shows `Interrupted` status and assistant message shows badge
- [ ] Late SSE chunks after abort do not modify UI

### E2E Tests

- [ ] Full flow: start chat → stream → stop → new message
- [ ] Verify partial response is visible after stop
- [ ] Backend correctly handles abort signal
- [ ] Superseded request (stop + immediately send new) does not mix content between runs
- [ ] No dangling streams or memory leaks

## Accessibility

### ARIA Requirements

- Stop button: `aria-label="Stop generating response"`
- Live region announcement when generation stops
- Focus management after stop (return to input)

### Keyboard Navigation

- Escape: Stop generation
- Tab: Should still navigate normally during streaming
- Enter: Context-aware (send or stop+send)

## Performance Considerations

### Memory

- Clean up all event listeners on abort
- Release reader lock in SSE processor
- Clear thinking block activities if too large

### Network

- Abort controller properly cancels fetch
- No orphaned connections after stop
- Server-side cleanup of stream resources

## Security Considerations

- Abort signal cannot be spoofed by client
- Server validates session before persisting partial
- Rate limiting still applies to stopped requests

## Metrics to Track

1. **Stop button usage rate** - How often users interrupt
2. **Time to stop** - Latency between click and stream halt
3. **Follow-up message rate** - How often users send after stopping
4. **Partial response length** - How much content was generated before stop

## Open Questions

1. Should partial tool results be rendered in the UI, and if so with what affordance (“Partial tool output”)?
2. Should the stop button show a brief loading/disabled state while aborting to prevent double-clicks?
3. Should we announce “generation stopped” via ARIA live region or rely on visual badge only?
4. Should there be a cooldown/backoff after repeated stop→send thrashes?

## References

- `AgentChatModal.svelte:215` - Current abort controller
- `stream-handler.ts:198` - Backend abort handling
- `sse-processor.ts:22` - SSE abort support
- `agent-chat-orchestrator.ts:262` - Orchestrator abort checks
