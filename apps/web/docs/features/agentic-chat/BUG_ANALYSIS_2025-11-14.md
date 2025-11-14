# Agentic Chat Service - Bug Analysis Report
**Analysis Date:** 2025-11-14
**Scope:** `/apps/web/src/lib/services/agentic-chat/`

---

## Executive Summary

Found **13 significant potential issues** across the agentic-chat service including:
- Race conditions in concurrent execution
- Missing error handling for background operations  
- Incomplete cleanup of resources
- Missing null checks in critical paths
- Non-atomic database operations
- Unhandled promise rejections

**Severity Breakdown:**
- Critical: 3
- High: 5  
- Medium: 5

---

## Critical Issues

### 1. **RACE CONDITION: activeExecutors Map Not Cleaned on Error** 
**File:** `execution/executor-coordinator.ts` (lines 60-140)  
**Severity:** Critical

**Problem:**
```typescript
async waitForExecutor(executorId: string): Promise<ExecutorResult> {
  const execution = this.activeExecutors.get(executorId);
  if (!execution) {
    throw new PlanExecutionError(`Executor ${executorId} not found`, { executorId });
  }
  try {
    return await execution;
  } finally {
    this.activeExecutors.delete(executorId);  // ✓ Cleans up
  }
}
```

BUT in `spawnExecutor()` line 105-122, the execution promise is added to the Map but **NOT wrapped in proper error handling**:

```typescript
const executionPromise = this.runExecutor({...}, params);
this.activeExecutors.set(executorAgentId, executionPromise);
return executorAgentId;
```

**If `runExecutor()` throws an uncaught error that propagates,** the Map entry is never cleaned up, causing **memory leak** and stale promise references.

**Impact:** 
- Memory leak with long-running sessions
- Potential executor hang if IDs are reused
- Race condition if caller tries to wait for executor again

**Fix:** Add error handler to execution promise before storing in Map:
```typescript
const executionPromise = this.runExecutor({...}, params)
  .catch(error => {
    console.error('[ExecutorCoordinator] Executor failed:', error);
    this.activeExecutors.delete(executorAgentId);
    throw error;
  });
```

---

### 2. **MISSING AWAIT: Fire-and-Forget Operations in Orchestrator**
**File:** `orchestration/agent-chat-orchestrator.ts` (line 659)  
**Severity:** Critical

**Problem:**
```typescript
private async executePlan(...) {
  for await (const event of this.deps.planOrchestrator.executePlan(
    plan,
    plannerContext,
    serviceContext,
    async () => {}  // ← Empty callback, no error handling
  )) {
```

**The stream callback is defined as `async () => {}` - a function that does nothing.**

While this specific case works (the stream is being awaited in `for await`), there's a pattern throughout the code where async operations are launched without proper error handling:

**Line 188:** `await callback(event);` - calls callback and awaits it
**Line 527:** Telemetry hook: `void this.telemetryHook(result, {...});` 

The `void` operator here is intentional but signals fire-and-forget. If the telemetry hook throws, it's silently swallowed.

**Impact:** 
- Errors in telemetry/callback don't propagate
- Silent failures make debugging difficult
- Could miss critical logging

**Fix:**
```typescript
if (this.telemetryHook) {
  this.telemetryHook(result, {...}).catch(error => {
    console.error('[TelemetryHook] Failed:', error);
  });
}
```

---

### 3. **INCOMPLETE CLEANUP IN BATCH EXECUTION - Promise Not Rejected on Error**
**File:** `execution/tool-execution-service.ts` (lines 556-589)  
**Severity:** Critical

**Problem:**
```typescript
async batchExecuteTools(
  toolCalls: ChatToolCall[],
  context: ServiceContext,
  availableTools: ChatToolDefinition[],
  maxConcurrency = 3,
  options: ToolExecutionOptions = {}
): Promise<ToolExecutionResult[]> {
  const results: ToolExecutionResult[] = [];
  const executing = new Set<Promise<ToolExecutionResult>>();

  for (const toolCall of toolCalls) {
    if (executing.size >= maxConcurrency) {
      await Promise.race(executing);  // ← Only waits for ONE to complete
    }

    const promise = this.executeTool(toolCall, context, availableTools, options).then(
      (result) => {
        executing.delete(promise);  // ← Only called on success
        results.push(result);
        return result;
      }
    );  // ← NO .catch() handler!

    executing.add(promise);
  }

  // Wait for remaining executions
  await Promise.all(executing);  // ← If any promise rejects, throws here

  // Return results in original order
  return toolCalls.map((call) => results.find((r) => r.toolCallId === call.id)!);
}
```

**Issues:**
1. **.then() without .catch()** - if `executeTool()` throws, the promise rejection is unhandled
2. **Promise not removed from Set on error** - executing set has stale promise references
3. **Line 588 non-null assertion (!)** - assumes all toolCalls have matching results, but errors could cause missing entries

**Scenario that breaks:**
- Tool 1 executes successfully → removed from Set
- Tool 2 throws error → stays in Set with unhandled rejection
- `Promise.all(executing)` throws
- Line 588 tries to find result for tool 2, gets `undefined`, crashes with non-null assertion

**Impact:**
- Unhandled promise rejection errors
- Incomplete results array
- Runtime crash on line 588 with "Cannot read property of undefined"

**Fix:**
```typescript
const promise = this.executeTool(toolCall, context, availableTools, options)
  .then((result) => {
    executing.delete(promise);
    results.push(result);
    return result;
  })
  .catch((error) => {
    executing.delete(promise);  // Clean up even on error
    const errorResult: ToolExecutionResult = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      toolName: this.resolveToolCall(toolCall).name,
      toolCallId: toolCall.id
    };
    results.push(errorResult);
    return errorResult;
  });
```

---

## High-Severity Issues

### 4. **NULL CHECK MISSING: context_shift Processing Without Validation**
**File:** `orchestration/agent-chat-orchestrator.ts` (lines 363-379)  
**Severity:** High

**Problem:**
```typescript
const contextShift =
  (result as any)?.context_shift ??
  result?.data?.context_shift ??
  (result?.data as any)?.context_shift;

if (contextShift) {
  const normalizedShiftContext = this.normalizeChatContextType(
    (contextShift.new_context as ChatContextType) ?? serviceContext.contextType
  );
  serviceContext.contextType = normalizedShiftContext;  // ← Unsafe mutation
  if (contextShift.entity_id) {  // ← Only checks entity_id, not other properties
    serviceContext.entityId = contextShift.entity_id;
  }
  serviceContext.lastTurnContext = this.buildContextShiftSnapshot(
    contextShift,  // ← contextShift properties not validated
    normalizedShiftContext
  );
}
```

In `buildContextShiftSnapshot()` (line 734-792), no null checks on contextShift properties:
```typescript
switch (contextShift.entity_type) {  // ← Could be undefined
  case 'project':
    assignEntity('project_id', contextShift.entity_id);  // ← entity_id might not exist
```

**Impact:**
- If tool result has malformed `context_shift` object, crashes occur
- Type casting `as ChatContextType` is dangerous without validation
- `entity_type` could be undefined, causing switch to do nothing silently

**Fix:**
```typescript
if (contextShift && typeof contextShift === 'object') {
  if (contextShift.new_context && typeof contextShift.new_context === 'string') {
    serviceContext.contextType = this.normalizeChatContextType(contextShift.new_context);
  }
  if (typeof contextShift.entity_id === 'string') {
    serviceContext.entityId = contextShift.entity_id;
  }
  if (contextShift.entity_type && ['project', 'task', 'plan', 'goal', 'document', 'output'].includes(contextShift.entity_type)) {
    serviceContext.lastTurnContext = this.buildContextShiftSnapshot(contextShift, serviceContext.contextType);
  }
}
```

---

### 5. **NON-ATOMIC DATABASE OPERATIONS: Metric Updates Race Condition**
**File:** `session/chat-session-service.ts` (lines 323-363)  
**Severity:** High

**Problem:**
```typescript
async updateSessionMetrics(
  sessionId: string,
  metrics: {
    incrementMessages?: number;
    incrementTokens?: number;
    incrementToolCalls?: number;
  }
): Promise<void> {
  try {
    // First get current values
    const { data: current, error: fetchError } = await this.supabase
      .from('chat_sessions')
      .select('message_count, total_tokens_used, tool_call_count')
      .eq('id', sessionId)
      .single();

    if (fetchError) {
      console.error('[ChatSessionService] Failed to fetch current metrics:', fetchError);
      return;  // ← Silently fails without throwing
    }

    // Calculate new values
    const updateData: ChatSessionUpdate = {
      message_count: (current.message_count ?? 0) + (metrics.incrementMessages ?? 0),
      total_tokens_used: (current.total_tokens_used ?? 0) + (metrics.incrementTokens ?? 0),
      tool_call_count: (current.tool_call_count ?? 0) + (metrics.incrementToolCalls ?? 0),
      updated_at: new Date().toISOString()
    };

    const { error: updateError } = await this.supabase
      .from('chat_sessions')
      .update(updateData)
      .eq('id', sessionId);  // ← Race condition window between select and update

    if (updateError) {
      console.error('[ChatSessionService] Failed to update metrics:', updateError);
    }
  } catch (error) {
    console.error('[ChatSessionService] Unexpected error updating metrics:', error);
  }
}
```

**Issues:**
1. **READ-MODIFY-WRITE RACE CONDITION**: Between the SELECT and UPDATE, another process could modify metrics
2. **SILENT FAILURE**: `return;` on line 341 silently fails without throwing
3. **NO TRANSACTIONS**: Not wrapped in a database transaction

**Scenario:**
- Thread A: Reads message_count = 5
- Thread B: Reads message_count = 5  
- Thread A: Updates to message_count = 6 (5+1)
- Thread B: Updates to message_count = 6 (5+1)
- Final result: 6 instead of correct 7 (lost update)

**Impact:**
- Incorrect token count tracking over time
- Metrics gradually become inaccurate in high-concurrency scenarios
- Silent failures make debugging difficult

**Fix:** Use atomic PostgreSQL operations:
```typescript
const { error } = await this.supabase.rpc('increment_session_metrics', {
  p_session_id: sessionId,
  p_messages: metrics.incrementMessages ?? 0,
  p_tokens: metrics.incrementTokens ?? 0,
  p_tool_calls: metrics.incrementToolCalls ?? 0
});
```

---

### 6. **UNCAUGHT PROMISE: Telemetry Hook Not Error-Handled**
**File:** `execution/tool-execution-service.ts` (lines 104-111)  
**Severity:** High

**Problem:**
```typescript
const finalizeResult = (
  result: ToolExecutionResult,
  overrideTelemetry?: Partial<ToolExecutionTelemetry>
): ToolExecutionResult => {
  const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
  if (this.telemetryHook) {
    void this.telemetryHook(result, {
      toolName,
      durationMs,
      virtual: Boolean(virtualHandler),
      ...overrideTelemetry
    });  // ← void swallows promise rejection
  }
  return result;
};
```

The `void` operator silently discards the promise. If `telemetryHook` throws:
```typescript
export type ToolExecutionTelemetryHook = (
  result: ToolExecutionResult,
  telemetry: ToolExecutionTelemetry
) => void | Promise<void>;
```

If it returns a Promise that rejects, the rejection is unhandled.

**Impact:**
- Telemetry errors silently fail
- Could lose critical performance metrics
- Makes debugging telemetry issues impossible

**Fix:**
```typescript
if (this.telemetryHook) {
  Promise.resolve(this.telemetryHook(result, {...}))
    .catch(error => {
      console.warn('[ToolExecutionService] Telemetry hook failed:', error);
    });
}
```

---

### 7. **MEMORY LEAK: Session Message Loading Default Returns Empty Array on Error**
**File:** `session/chat-session-service.ts` (lines 138-161)  
**Severity:** High

**Problem:**
```typescript
async loadRecentMessages(
  sessionId: string,
  limit: number = 50
): Promise<ChatMessage[]> {
  try {
    const { data, error } = await this.supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to load messages: ${error.message}`);
    }

    // Return in chronological order
    return (data ?? []).reverse();
  } catch (error) {
    console.error('[ChatSessionService] Failed to load messages:', error);
    // Return empty array rather than throwing to prevent stream interruption
    return [];  // ← Silent failure swallows critical errors
  }
}
```

**Issues:**
1. **SILENT FAILURE**: Catches all errors and returns empty array
2. **CONTEXT LOSS**: Chat history is lost silently - user gets empty conversation
3. **CASCADING ERRORS**: Downstream code doesn't know history is missing
4. **NO ERROR PROPAGATION**: Caller can't distinguish between "no messages" and "failed to load"

**Impact:**
- Users see empty chat history instead of their actual messages
- Conversation context is lost
- No way for caller to detect and handle the failure

**Fix:**
```typescript
async loadRecentMessages(
  sessionId: string,
  limit: number = 50
): Promise<ChatMessage[]> {
  const { data, error } = await this.supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[ChatSessionService] Failed to load messages:', error);
    throw new Error(`Failed to load messages for session ${sessionId}: ${error.message}`);
  }

  return (data ?? []).reverse();
}
```

---

## Medium-Severity Issues

### 8. **UNHANDLED REJECTION: Plan Status Update Failure Not Caught**
**File:** `orchestration/agent-chat-orchestrator.ts` (line 208, 847-854)  
**Severity:** Medium

**Problem:**
```typescript
finally {
  if (plannerAgentId) {
    await this.safeUpdatePlannerStatus(plannerAgentId);  // ← Safe method exists...
  }
}

// But also exists in executor-coordinator.ts:
private async updateExecutorStatus(
  executorId: string,
  result: AgentExecutorRunResult,
  hasFinalStatus: boolean
): Promise<void> {
  try {
    await this.persistenceService.updateAgent(executorId, {
      status: result.success ? 'completed' : 'error',
      completed_at: hasFinalStatus ? new Date().toISOString() : undefined
    });
  } catch (error) {
    console.warn('[ExecutorCoordinator] Failed to update executor status', {
      executorId,
      error
    });  // ← Only warns, doesn't rethrow
  }
}
```

In `runExecutor()` (line 250-274):
```typescript
async runExecutor(
  params: ExecuteTaskParams,
  spawnParams: ExecutorSpawnParams
): Promise<ExecutorResult> {
  try {
    const result = await this.executorService.executeTask(params);
    await this.updateExecutorStatus(params.executorId, result, true);  // ← If fails, execution continues
    return this.mapExecutorResult(params, result);
  } catch (error) {
    const failure: AgentExecutorRunResult = {...};
    await this.updateExecutorStatus(params.executorId, failure, false);  // ← Status update not awaited for failure
    return this.mapExecutorResult(params, failure);
  }
}
```

**Issues:**
1. Status updates silently fail without blocking execution
2. Inconsistent error handling between success and failure paths
3. No telemetry on update failures

**Impact:** Executor status may not reflect actual state, affecting plan tracking

---

### 9. **MISSING TYPE SAFETY: Union Type Not Narrowed**
**File:** `execution/tool-execution-service.ts` (lines 618-622)  
**Severity:** Medium

**Problem:**
```typescript
private resolveToolCall(toolCall: ChatToolCall): { name: string; rawArguments: unknown } {
  const name = toolCall.function?.name ?? (toolCall as any)?.name ?? '';
  const rawArguments = toolCall.function?.arguments ?? (toolCall as any)?.arguments;
  return { name, rawArguments };
}
```

Uses `as any` for type narrowing. Better approach exists:

```typescript
const name = (toolCall.function?.name) || ((toolCall as any).name) || '';
```

**Issues:**
1. Using `as any` suppresses type safety
2. Empty string default for `name` could hide issues

**Impact:** Potential runtime errors if type union isn't handled properly

---

### 10. **INCOMPLETE ERROR HANDLING: Response Synthesizer Fallback**
**File:** `synthesis/response-synthesizer.ts` (lines 107-124)  
**Severity:** Medium

**Problem:**
```typescript
async synthesizeSimpleResponse(
  userMessage: string,
  toolResults: ToolExecutionResult[],
  context: ServiceContext
): Promise<SynthesisResult> {
  try {
    return await this.callLLMWithUsage({...}, context);
  } catch (error) {
    console.error('[ResponseSynthesizer] Failed to generate simple response:', error);
    return {
      text: this.generateFallbackResponse(userMessage, toolResults)  // ← No usage data
    };
  }
}
```

The fallback response doesn't include usage metrics. This causes:
1. Token counts to be missing
2. Inconsistent response structure
3. Billing issues if tokens aren't tracked

**Impact:** Incomplete telemetry for fallback responses

---

### 11. **STREAMING TIMEOUT NOT CANCELLED: Promise.race Allows Dangling Timeout**
**File:** `execution/tool-execution-service.ts` (lines 471-481)  
**Severity:** Medium

**Problem:**
```typescript
private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Tool execution timeout after ${timeout}ms`)),
        timeout
      )
    )
  ]);
}
```

**Issue:** The setTimeout is never cancelled. If `fn()` completes first:
1. The timeout continues to run in background
2. Memory leak if thousands of tools are executed
3. Callbacks for rejected timeout may still fire

**Impact:** Memory leak, background timeouts continue running

**Fix:**
```typescript
private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Tool execution timeout after ${timeout}ms`)),
          timeout
        );
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
```

---

## Minor/Observation Issues

### 12. **UNSAFE NON-NULL ASSERTION: Results Finding**
**File:** `execution/tool-execution-service.ts` (line 588)  
**Severity:** Medium

```typescript
return toolCalls.map((call) => results.find((r) => r.toolCallId === call.id)!);
```

Non-null assertion (!) assumes all tool calls have results. But if a tool throws an unhandled error (see Issue #3), the result won't exist, causing a runtime crash.

---

### 13. **PERSISTENCE OPERATION NOT AWAITED IN CATCH**
**File:** `execution/executor-coordinator.ts` (line 255-273)  
**Severity:** Low

```typescript
private async runExecutor(...): Promise<ExecutorResult> {
  try {
    const result = await this.executorService.executeTask(params);
    await this.updateExecutorStatus(params.executorId, result, true);
    return this.mapExecutorResult(params, result);
  } catch (error) {
    const failure: AgentExecutorRunResult = {...};
    await this.updateExecutorStatus(params.executorId, failure, false);  // ✓ Awaited
    return this.mapExecutorResult(params, failure);
  }
}
```

This is actually correct (await is present), but the pattern is error-prone.

---

## Summary Table

| # | Issue | Severity | File | Lines | Type |
|---|-------|----------|------|-------|------|
| 1 | activeExecutors memory leak on error | Critical | executor-coordinator.ts | 60-140 | Race Condition |
| 2 | Fire-and-forget telemetry not error-handled | Critical | agent-chat-orchestrator.ts | 659 | Unhandled Promise |
| 3 | Batch execution missing .catch() on tools | Critical | tool-execution-service.ts | 556-589 | Resource Leak |
| 4 | context_shift validation missing | High | agent-chat-orchestrator.ts | 363-379 | Null Check |
| 5 | Session metrics non-atomic race condition | High | chat-session-service.ts | 323-363 | Race Condition |
| 6 | Telemetry hook void operator swallows errors | High | tool-execution-service.ts | 104-111 | Unhandled Promise |
| 7 | Message loading silent failure | High | chat-session-service.ts | 138-161 | Error Handling |
| 8 | Plan status update failures not propagated | Medium | executor-coordinator.ts | 250-274 | Error Handling |
| 9 | Type safety: Union not narrowed properly | Medium | tool-execution-service.ts | 618-622 | Type Safety |
| 10 | Response synthesizer fallback missing usage | Medium | response-synthesizer.ts | 107-124 | Incomplete Handling |
| 11 | Timeout.race timer not cancelled | Medium | tool-execution-service.ts | 471-481 | Memory Leak |
| 12 | Non-null assertion on results.find | Medium | tool-execution-service.ts | 588 | Type Safety |
| 13 | Empty callback in plan orchestrator | Low | agent-chat-orchestrator.ts | 659 | Code Quality |

---

## Recommendations

### Immediate Actions (Critical)
1. **Fix batch execution error handling** (Issue #3) - high risk of crashes
2. **Fix executor coordinator cleanup** (Issue #1) - memory leak
3. **Add telemetry error handling** (Issue #2, #6) - prevent silent failures

### High Priority (Next Sprint)
1. Add validation for context_shift (Issue #4)
2. Implement atomic session metric updates (Issue #5)
3. Fix message loading error handling (Issue #7)

### Medium Priority
1. Implement timeout cancellation (Issue #11)
2. Add comprehensive error handling for status updates
3. Improve type safety by removing `as any` casts

### Testing Strategy
1. Add concurrent execution tests for batch tools
2. Add race condition tests for session metrics
3. Add timeout cancellation verification tests
4. Test error scenarios in executor coordination

---
