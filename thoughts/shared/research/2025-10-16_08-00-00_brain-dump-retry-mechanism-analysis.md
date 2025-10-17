---
date: 2025-10-16T08:00:00-04:00
researcher: Claude (via Anna Wayne)
git_commit: 7f656fbcf6fea7de9adf752040d4677117b0eec0
branch: main
repository: buildos-platform
topic: "Brain Dump Retry Mechanism - Why Retry Status Isn't Reaching Frontend"
tags:
  [research, codebase, brain-dump, retry-mechanism, sse-streaming, bug-analysis]
status: complete
last_updated: 2025-10-16
last_updated_by: Claude
---

# Research: Brain Dump Retry Mechanism - Why Retry Status Isn't Reaching Frontend

**Date**: 2025-10-16T08:00:00-04:00
**Researcher**: Claude (via Anna Wayne)
**Git Commit**: 7f656fbcf6fea7de9adf752040d4677117b0eec0
**Branch**: main
**Repository**: buildos-platform

## Research Question

User reported that when brain dump processing fails and retries, users are not seeing retry status messages on the frontend, even though the system logs show retries are happening (e.g., "attempt": 2 of 3). The question is: **Is the retry mechanism working properly, and why aren't retry messages being displayed to users?**

## Summary

**Key Finding**: Retries ARE working (backend logs confirm this), but retry status messages are NOT reaching the frontend because of an architectural mismatch.

**Root Cause**: The SSE retry message emission logic in `stream/+server.ts` (lines 342-394) attempts to wrap the `processBrainDumpDual` method to track retry attempts, but the actual retry loop lives inside `processBrainDumpDual` (braindump-processor.ts:877-960). The wrapper only executes once and never sees the internal retries, so SSE retry messages are never sent.

**Impact**: Users experience processing failures without understanding that the system is automatically retrying, leading to confusion and perceived unreliability.

## Detailed Findings

### 1. Retry Mechanism Architecture

#### Where Retries Actually Happen

**File**: `apps/web/src/lib/utils/braindump-processor.ts:848-960`

The `processBrainDumpDual` method contains the actual retry loop:

```typescript
private async processBrainDumpDual({...}): Promise<BrainDumpParseResult> {
  const maxRetries = options.retryAttempts || 3;  // Default: 3 attempts
  const startTime = Date.now();
  let lastError: Error | null = null;

  // THE ACTUAL RETRY LOOP
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Run context and task extraction in parallel
      const [contextResult, tasksResult] = await Promise.allSettled([
        this.extractProjectContext({...}),
        this.extractTasks({...})
      ]);

      // Merge results based on project type
      if (selectedProjectId) {
        return await this.mergeDualProcessingResultsForExistingProject(...);
      } else {
        return await this.mergeDualProcessingResultsForNewProject(...);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      // Log error to error service
      await this.errorLogger.logBrainDumpError(
        error,
        brainDumpId,
        { responseTimeMs: Date.now() - startTime },
        {
          userId,
          projectId: selectedProjectId,
          metadata: {
            attempt,
            maxRetries,
            brainDumpLength: brainDump.length,
            errorContext: 'dual_processing_retry'
          }
        }
      );

      // Exponential backoff: 2^attempt seconds (2s, 4s, 8s)
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  // All retries exhausted
  throw new Error(`Dual processing failed after ${maxRetries} attempts: ${lastError?.message}`);
}
```

**Key behaviors**:

- Retries up to 3 times (configurable via `options.retryAttempts`)
- Exponential backoff: 2s, 4s, 8s between attempts
- Logs each retry to the error logger with attempt metadata
- Throws after all retries exhausted

#### Where SSE Retry Messages Are Supposed to Be Sent

**File**: `apps/web/src/routes/api/braindumps/stream/+server.ts:342-394`

The streaming endpoint tries to wrap `processBrainDumpDual` to emit retry messages:

```typescript
// Also track retries
const originalProcessBrainDumpDual =
  processor["processBrainDumpDual"].bind(processor);
let currentAttempt = 0;

processor["processBrainDumpDual"] = async function (args: any) {
  const maxRetries = args.options?.retryAttempts || 3;

  // Wrap the original method to track attempts
  const wrappedMethod = async () => {
    currentAttempt++;

    // Emit SSE retry message on subsequent attempts
    if (currentAttempt > 1) {
      const retryMessage: SSERetry = {
        type: "retry",
        message: `Retrying dual processing...`,
        attempt: currentAttempt,
        maxAttempts: maxRetries,
        processName: "dual-processing",
      };
      await sendSSEMessage(writer, encoder, retryMessage);
    }

    try {
      return await originalProcessBrainDumpDual.call(processor, args);
    } catch (error) {
      if (currentAttempt < maxRetries) {
        // Will retry
        throw error;
      } else {
        // Final failure
        const finalErrorMessage: SSEError = {
          type: "error",
          message: "Dual processing failed after all retries",
          error: error.message,
          context: "general",
          recoverable: false,
        };
        await sendSSEMessage(writer, encoder, finalErrorMessage);
        throw error;
      }
    }
  };

  // Replace the internal method temporarily
  const originalMethod = processor["processBrainDumpDual"];
  processor["processBrainDumpDual"] = originalProcessBrainDumpDual;

  try {
    return await wrappedMethod(); // ❌ ONLY CALLED ONCE
  } finally {
    processor["processBrainDumpDual"] = originalMethod;
  }
};
```

**The Problem**: This wrapper is fundamentally broken because:

1. `wrappedMethod()` is called only ONCE
2. The internal retry loop in `processBrainDumpDual` has no access to `writer` or `encoder`
3. `currentAttempt` only increments once, never reaching > 1
4. SSE retry messages are never sent

### 2. Frontend SSE Message Handling

#### Message Types Defined

**File**: `apps/web/src/lib/types/sse-messages.ts:75-82`

The `SSERetry` interface is properly defined:

```typescript
export interface SSERetry {
  type: "retry";
  message: string;
  attempt: number;
  maxAttempts: number;
  processName: string;
}
```

#### Frontend Component Ready to Display Retries

**File**: `apps/web/src/lib/components/brain-dump/DualProcessingResults.svelte:192-200, 505-518`

The UI component handles retry messages:

```typescript
case 'retry':
  if ('attempt' in status && 'maxAttempts' in status && 'processName' in status) {
    retryStatus = {
      attempt: status.attempt,
      maxAttempts: status.maxAttempts,
      processName: status.processName
    };
  }
  break;
```

Display component (lines 505-518):

```html
<!-- Retry status indicator -->
{#if retryStatus}
  <div class="mt-4" transition:fade={{ duration: 200 }}>
    <div class="retry-indicator">
      <LoaderCircle class="w-4 h-4 animate-spin text-amber-500" />
      <p>
        Retrying {retryStatus.processName}
        <span class="retry-attempt"
          >Attempt {retryStatus.attempt}/{retryStatus.maxAttempts}</span
        >
      </p>
    </div>
  </div>
{/if}
```

**Status**: Frontend is READY to display retry messages, but never receives them.

### 3. Evidence from User Logs

User provided these logs showing retries ARE happening:

```
Error: Dual processing failed completely: Task extraction failed: Error: Failed to generate valid JSON: The operation was aborted due to timeout
    at le.mergeDualProcessingResultsForExistingProject

Additional Metadata:
{
  "attempt": 2,
  "timestamp": "2025-10-16T08:03:50.625Z",
  "maxRetries": 3,
  "errorSource": "brain_dump_processing",
  "errorContext": "dual_processing_retry",
  "originalError": {},
  "brainDumpLength": 6646
}
```

**Interpretation**:

- Retry loop IS executing (attempt 2 of 3)
- Error metadata is being logged correctly
- But frontend never saw retry status

## Architecture Insights

### SSE Streaming Flow

1. **Request arrives** → `POST /api/braindumps/stream` (stream/+server.ts)
2. **SSE stream created** → `SSEResponse.createStream()` returns `{ writer, encoder, response }`
3. **Processing starts** → `processBrainDumpWithStreaming()` runs in background
4. **Method overrides** → Stream endpoint overrides processor methods to emit SSE events:
   - `runPreparatoryAnalysis` → Emits `SSEAnalysis` messages
   - `extractProjectContext` → Emits `SSEContextProgress` messages
   - `extractTasks` → Emits `SSETasksProgress` messages
   - `processBrainDumpDual` → ❌ BROKEN: Attempts to emit `SSERetry` messages but fails
5. **Frontend receives** → `SSEProcessor.processStream()` routes messages to `DualProcessingResults.handleStreamUpdate()`

### Why the Current Approach Doesn't Work

**Method Overriding Pattern**: The streaming endpoint successfully overrides `extractProjectContext` and `extractTasks` because those methods:

- Execute once per attempt
- Don't have internal retry loops
- Can be wrapped with SSE emission logic

**But `processBrainDumpDual` is different**:

- Has an internal `for` loop for retries
- The wrapper only executes the method once
- Internal retries have no access to SSE writer/encoder
- Result: Retry messages are never sent

## Code References

| Component            | File                           | Lines     | Purpose                                            |
| -------------------- | ------------------------------ | --------- | -------------------------------------------------- |
| **Retry Loop**       | `braindump-processor.ts`       | 877-960   | Actual retry logic with exponential backoff        |
| **Broken Wrapper**   | `stream/+server.ts`            | 342-394   | Attempts to emit SSE retry messages (doesn't work) |
| **SSE Message Type** | `sse-messages.ts`              | 75-82     | `SSERetry` interface definition                    |
| **Frontend Handler** | `DualProcessingResults.svelte` | 192-200   | Handles `retry` message type                       |
| **Frontend Display** | `DualProcessingResults.svelte` | 505-518   | Retry status banner UI                             |
| **Error Logging**    | `braindump-processor.ts`       | 928-944   | Logs retry attempts with metadata                  |
| **Merge Functions**  | `braindump-processor.ts`       | 1367-1575 | Handle partial failures in dual processing         |

## Recommended Solutions

### Option 1: Pass SSE Writer into Retry Loop (Recommended)

**Pros**: Clean, maintainable, proper separation of concerns
**Cons**: Requires refactoring method signatures

**Implementation**:

1. Add optional `onRetry` callback to `BrainDumpOptions`
2. Pass callback from `stream/+server.ts` to `processBrainDumpDual`
3. Emit SSE message from within retry loop

```typescript
// In BrainDumpOptions interface
export interface BrainDumpOptions {
  autoExecute?: boolean;
  streamResults?: boolean;
  useDualProcessing?: boolean;
  retryAttempts?: number;
  onRetry?: (attempt: number, maxAttempts: number) => Promise<void>;  // NEW
}

// In processBrainDumpDual retry loop (line 949)
if (attempt < maxRetries) {
  // Call retry callback if provided
  if (options.onRetry) {
    await options.onRetry(attempt + 1, maxRetries);
  }

  await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
}

// In stream/+server.ts
const result = await processor.processBrainDump({
  ...
  options: {
    ...options,
    streamResults: true,
    useDualProcessing: true,
    onRetry: async (attempt, maxAttempts) => {
      const retryMessage: SSERetry = {
        type: 'retry',
        message: `Retrying dual processing...`,
        attempt,
        maxAttempts,
        processName: 'dual-processing'
      };
      await sendSSEMessage(writer, encoder, retryMessage);
    }
  },
  ...
});
```

### Option 2: EventEmitter Pattern

**Pros**: More flexible for multiple event types
**Cons**: Adds dependency, more complex

Add an EventEmitter to `BrainDumpProcessor` that emits retry events, and listen in `stream/+server.ts`.

### Option 3: Extract Retry Logic to Wrapper

**Pros**: Keeps retry logic in one place
**Cons**: Significant refactoring, changes processor architecture

Move the retry loop out of `processBrainDumpDual` into the wrapper so it can emit SSE messages properly.

## Testing Recommendations

### Manual Testing

1. **Trigger a timeout**:
   - Create a very long brain dump (>6000 chars)
   - Set short timeout in smart-llm-service.ts (e.g., 5 seconds)
   - Watch frontend for retry banner

2. **Monitor SSE stream**:
   - Open browser DevTools → Network tab
   - Filter for `/api/braindumps/stream`
   - Watch EventStream messages
   - Look for `type: 'retry'` messages

### Automated Testing

```typescript
// Test for retry message emission
describe("Brain Dump Retry Messaging", () => {
  it("should emit SSE retry messages on failure", async () => {
    const messages: StreamingMessage[] = [];

    const mockWriter = {
      write: vi.fn((chunk) => {
        const decoded = new TextDecoder().decode(chunk);
        const parsed = JSON.parse(decoded.replace("data: ", ""));
        messages.push(parsed);
      }),
    };

    // Simulate failure that triggers retry
    // ...

    const retryMessages = messages.filter((m) => m.type === "retry");
    expect(retryMessages).toHaveLength(2); // 2 retries before success
    expect(retryMessages[0].attempt).toBe(2);
    expect(retryMessages[1].attempt).toBe(3);
  });
});
```

## User Experience Impact

### Current (Broken) Behavior

1. User submits brain dump
2. Processing starts (spinner shows)
3. Timeout occurs → No feedback to user
4. System retries internally → User sees nothing
5. Second attempt fails → User still sees spinner
6. Third attempt succeeds → Success message appears

**Problem**: User sees nothing for 6+ seconds (2s + 4s delays) and assumes the app is frozen.

### Desired Behavior with Fix

1. User submits brain dump
2. Processing starts (spinner shows)
3. Timeout occurs → Retry banner appears: "Retrying dual processing... Attempt 2/3"
4. System waits 2s → Retry banner updates timer
5. Second attempt fails → Retry banner updates: "Attempt 3/3"
6. Third attempt succeeds → Success message, retry banner dismissed

**Benefit**: User understands the system is actively working and hasn't frozen.

## Related Issues

### Timeout Handling

**File**: `apps/web/src/lib/services/smart-llm-service.ts:520-735`

The `getJSONResponse` method has a 120-second timeout:

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 120000); // 120s

const response = await fetch(API_URL, {
  signal: controller.signal,
  // ...
});
```

**Issue**: Very long brain dumps can timeout, especially with slower models. The retry mechanism helps, but users need to see it working.

### Partial Failure Handling

**File**: `braindump-processor.ts:1367-1575`

The merge functions (`mergeDualProcessingResultsForExistingProject` and `mergeDualProcessingResultsForNewProject`) handle partial failures where one extraction succeeds and the other fails.

**Good**: System is resilient to partial failures
**Gap**: Users don't see clear messaging about what succeeded vs failed

## Open Questions

1. **Should we retry individual extractions?** Currently, if context extraction fails, we retry the ENTIRE dual processing. Should we retry just the failed extraction?

2. **What's the optimal retry count?** Default is 3, but timeouts take 120s each. 3 retries = 6 minutes potential wait time. Should we reduce retries but increase timeout?

3. **Should we show different messages for different failure types?**
   - Timeout vs JSON parse error vs network error?
   - Context failure vs task failure?

4. **Should retry count persist across page refreshes?** If user refreshes during retry, should we resume from where we left off?

## Next Steps

1. **Immediate fix**: Implement Option 1 (callback pattern) to emit retry messages
2. **UX enhancement**: Add estimated time remaining to retry banner
3. **Monitoring**: Add analytics to track retry rates and success/failure patterns
4. **Documentation**: Update error handling documentation with retry behavior

---

## Conclusion

The brain dump retry mechanism is working correctly at the backend level (logs confirm retries happen with exponential backoff), but the frontend never receives retry status because of a broken wrapper implementation. The fix is straightforward: pass an `onRetry` callback through the options that can emit SSE messages from within the actual retry loop. The frontend UI is already fully implemented and ready to display retry status once messages start flowing.
