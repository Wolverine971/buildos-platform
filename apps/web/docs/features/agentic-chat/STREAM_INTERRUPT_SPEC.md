<!-- apps/web/docs/features/agentic-chat/STREAM_INTERRUPT_SPEC.md -->
# Agentic Chat Stream Interruption Spec

**Created**: 2025-12-20
**Status**: Draft
**Author**: AI-assisted

## Overview

Enable users to interrupt/cancel an in-progress AI agent response mid-stream and immediately send a new message without waiting for the current response to complete.

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

**Current limitations:**
- No explicit "Stop" button in UI during streaming
- Composer is disabled while `isStreaming === true`
- Users must close the modal to abort

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

#### C. Visual Feedback

Add a pulsing border or indicator during streaming to make it clear the response is in progress:

```svelte
<div class={`... ${isStreaming ? 'ring-2 ring-accent/50 animate-pulse' : ''}`}>
```

### 2. State Management Changes

#### A. New State Variables

```typescript
// Track if user manually stopped vs natural completion
let wasManuallyStopped = $state(false);

// Track partial response content for display
let partialResponseContent = $state('');
```

#### B. New Stop Handler

```typescript
function handleStopGeneration() {
    if (!isStreaming || !currentStreamController) return;

    wasManuallyStopped = true;
    currentStreamController.abort();
    currentStreamController = null;

    // Keep the partial response visible
    finalizeThinkingBlock();
    finalizeAssistantMessage();

    // Mark the message as interrupted
    if (currentAssistantMessageId) {
        updateAssistantMessage(currentAssistantMessageId, (msg) => ({
            ...msg,
            content: msg.content + '\n\n*[Response interrupted]*',
            metadata: { ...msg.metadata, interrupted: true }
        }));
    }

    // Reset streaming state immediately
    isStreaming = false;
    currentActivity = '';
    agentState = null;
    agentStateDetails = null;

    // Focus the input for immediate typing
    voiceInputRef?.focus?.();
}
```

#### C. Update sendMessage to Handle Quick Succession

```diff
async function sendMessage(...) {
+   // If currently streaming, abort first
+   if (isStreaming && currentStreamController) {
+       wasManuallyStopped = true;
+       currentStreamController.abort();
+       currentStreamController = null;
+       // Small delay to ensure cleanup
+       await new Promise(resolve => setTimeout(resolve, 50));
+   }

    // ... rest of sendMessage
}
```

### 3. Backend Graceful Shutdown

#### A. Interrupted Message Persistence

When an abort signal is received, persist the partial response with metadata:

```typescript
// stream-handler.ts - in the finally block or abort handler
if (abortSignal?.aborted && state.assistantResponse.trim()) {
    await this.messagePersister.persistAssistantMessage({
        sessionId: session.id,
        userId,
        content: state.assistantResponse,
        metadata: {
            interrupted: true,
            interruptedAt: new Date().toISOString()
        }
    });
}
```

#### B. Tool Execution Cleanup

For long-running tool executions, ensure they can be cancelled:

```typescript
// In tool-execution-service.ts
async executeTool(toolCall, context, tools, options) {
    const abortSignal = options?.abortSignal;

    // Check at start
    if (abortSignal?.aborted) {
        return { success: false, error: 'Operation cancelled' };
    }

    // Pass to individual tool executors
    return await executor.execute(toolCall, { ...options, abortSignal });
}
```

### 4. SSE Events

#### A. New Event Type for Interruption Acknowledgment

```typescript
// In AgentSSEMessage types
interface InterruptedEvent {
    type: 'interrupted';
    reason: 'user_cancelled' | 'timeout' | 'error';
    partialTokens?: number;
}
```

#### B. Handle on Frontend

```typescript
case 'interrupted':
    // Already handled by abort, but acknowledge
    console.debug('[AgentChat] Server acknowledged interruption');
    break;
```

### 5. Keyboard Shortcuts

Add keyboard support for stopping:

```typescript
function handleKeyDown(event: KeyboardEvent) {
    // Escape to stop generation
    if (event.key === 'Escape' && isStreaming) {
        event.preventDefault();
        handleStopGeneration();
        return;
    }

    // Existing Enter handling
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (isStreaming) {
            // Stop and send new message
            handleStopGeneration();
            // Queue the send after a brief delay
            setTimeout(() => sendMessage(), 100);
        } else if (!isSendDisabled) {
            sendMessage();
        }
    }
}
```

## Implementation Phases

### Phase 1: Basic Stop Button (MVP)

1. Add stop button to AgentComposer
2. Wire up `onStop` callback to `handleStopGeneration()`
3. Ensure clean state reset on abort
4. Mark interrupted messages visually

**Files to modify:**
- `AgentComposer.svelte` - Add stop button and prop
- `AgentChatModal.svelte` - Add `handleStopGeneration()` and wire to composer

### Phase 2: Send While Streaming

1. Enable input typing during streaming
2. Allow Enter to stop current + send new
3. Add Escape keyboard shortcut

**Files to modify:**
- `AgentComposer.svelte` - Remove `disabled` from textarea
- `AgentChatModal.svelte` - Update keyboard handlers

### Phase 3: Backend Improvements

1. Persist partial responses on interruption
2. Add `interrupted` event type
3. Ensure tool execution can be cancelled

**Files to modify:**
- `stream-handler.ts` - Interrupted persistence
- `agent-chat-orchestrator.ts` - Tool cancellation
- SSE types files

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
- Don't show partial tool results as "completed"

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

## Testing Checklist

### Unit Tests
- [ ] `handleStopGeneration()` resets all state correctly
- [ ] Abort signal propagates through SSE processor
- [ ] Partial messages are preserved with metadata

### Integration Tests
- [ ] Stop button appears during streaming
- [ ] Clicking stop immediately halts response
- [ ] New message can be sent after stop
- [ ] Escape key triggers stop
- [ ] Enter key stops + queues new message

### E2E Tests
- [ ] Full flow: start chat → stream → stop → new message
- [ ] Verify partial response is visible after stop
- [ ] Backend correctly handles abort signal
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

1. Should we auto-save partial responses as drafts?
2. Should the stop button have a loading state while aborting?
3. Should we show "generation stopped" vs "response interrupted"?
4. Should there be a cooldown between stop and new send?

## References

- `AgentChatModal.svelte:215` - Current abort controller
- `stream-handler.ts:198` - Backend abort handling
- `sse-processor.ts:22` - SSE abort support
- `agent-chat-orchestrator.ts:262` - Orchestrator abort checks
