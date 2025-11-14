# Agentic Chat Service - Issues Summary

## Quick Reference

**Total Issues Found:** 13
- **Critical:** 3 issues (immediate action required)
- **High:** 5 issues (next sprint priority)
- **Medium:** 5 issues (planned work)

## Critical Issues at a Glance

### Issue #1: Memory Leak in ExecutorCoordinator
- **Location:** `execution/executor-coordinator.ts:60-140`
- **Problem:** activeExecutors Map not cleaned when executor promises fail
- **Risk:** Memory leak in long-running sessions, stale promise references
- **Quick Fix:** Add `.catch()` error handler before storing promise in Map

### Issue #3: Batch Tool Execution Incomplete Cleanup
- **Location:** `execution/tool-execution-service.ts:556-589`
- **Problem:** Promise.then() without .catch(), executes not removed on error
- **Risk:** Unhandled promise rejections, runtime crashes on non-null assertion
- **Quick Fix:** Add .catch() handler that removes promise from set and returns error result

### Issue #6: Telemetry Hook Errors Swallowed
- **Location:** `execution/tool-execution-service.ts:104-111`
- **Problem:** `void` operator discards promise, hiding errors
- **Risk:** Silent telemetry failures, lost metrics
- **Quick Fix:** Use `Promise.resolve().catch()` instead of `void`

## Files Most Affected

1. **tool-execution-service.ts** - 4 issues (batch execution, timeout, telemetry, type safety)
2. **agent-chat-orchestrator.ts** - 3 issues (context validation, fire-and-forget callbacks)
3. **executor-coordinator.ts** - 2 issues (memory leak, status update handling)
4. **chat-session-service.ts** - 2 issues (race condition metrics, silent message load failures)
5. **response-synthesizer.ts** - 1 issue (incomplete fallback response)

## Testing Recommendations

**Priority 1 - Add these tests immediately:**
- Concurrent batch tool execution with errors
- Executor cleanup on promise rejection
- Telemetry hook error handling

**Priority 2 - Add these tests next:**
- Race condition in session metric updates
- Message loading error scenarios
- Context shift validation with malformed data

**Priority 3 - Ongoing:**
- Timeout cancellation verification
- Status update error propagation
- Type safety validation for tool call unions

## Code Patterns to Watch For

### Dangerous Patterns Found:
1. `Promise.then()` without `.catch()` - Missing error handling
2. `void this.asyncFn()` - Fire-and-forget without error handling
3. `.catch(error) { console.log(); return []; }` - Silent failures returning empty
4. `as any` casts - Type safety bypassed
5. `array.find()!` - Non-null assertion without validation
6. Read-modify-write without transactions - Race conditions in metrics

### Safe Patterns to Implement:
1. Always pair `.then()` with `.catch()` or use `async/await` with try-catch
2. Use `Promise.resolve().catch()` for fire-and-forget with error logging
3. Throw errors from service methods to let callers handle them
4. Remove `as any` casts, use proper type guards
5. Validate results before using non-null assertions
6. Use atomic database operations (RPC functions) for multi-step updates

## Performance Impact

**Memory Issues:**
- Issue #1, #11: Memory leaks from uncleaned timeouts and promise references
- Issue #3: Incomplete cleanup in concurrent operations

**Concurrency Issues:**
- Issue #5: Race condition causes lost metric updates over time
- Issues #1, #3: Potential for cascading failures in long-running sessions

**User Impact:**
- Issue #7: Users see empty chat history instead of actual messages
- Issue #4: Context shifts fail silently, wrong entity context

## Estimated Effort to Fix

| Issue | Effort | Risk | Notes |
|-------|--------|------|-------|
| #1 | 30 min | High | Memory leak, should fix first |
| #3 | 45 min | High | Impacts batch operations |
| #6 | 15 min | Medium | Telemetry fix |
| #4 | 1 hour | Medium | Validation needed |
| #5 | 2 hours | High | Requires DB schema changes |
| #7 | 30 min | High | Error propagation change |
| #11 | 30 min | Low | Cleanup improvement |
| #2, #8, #9, #10, #12, #13 | 2 hours | Low-Medium | Minor fixes |

**Total Estimated Time: 6-7 hours for all fixes**

## Documentation Reference

Full detailed analysis with code samples and fixes available in:
- `/apps/web/docs/features/agentic-chat/BUG_ANALYSIS_2025-11-14.md`
