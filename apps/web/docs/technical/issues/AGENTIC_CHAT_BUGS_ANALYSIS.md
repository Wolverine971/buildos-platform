<!-- apps/web/docs/technical/issues/AGENTIC_CHAT_BUGS_ANALYSIS.md -->

# Agentic Chat System - Comprehensive Bug Analysis

> **Created**: 2025-12-19
> **Status**: In Progress
> **Author**: Code Review Analysis
> **Related**: [AGENTIC_CHAT_TYPE_ISSUES.md](./AGENTIC_CHAT_TYPE_ISSUES.md)

## Executive Summary

A thorough analysis of the agentic chat flow from frontend (`AgentChatModal.svelte`) through the streaming API and all backend services revealed **13 distinct issues** across the system. This document catalogs each issue with root cause analysis, severity assessment, and recommended fixes.

---

## System Architecture Overview

```
AgentChatModal.svelte (Frontend)
    ↓ SSE Stream Request
/api/agent/stream/+server.ts (API Endpoint)
    ↓
stream-handler.ts (Stream Orchestration)
    ↓
AgentChatOrchestrator (Main Orchestration Layer)
    ├── PlanOrchestrator (Plan Creation/Execution)
    ├── ToolExecutionService (Tool Execution)
    ├── ResponseSynthesizer (Response Generation)
    └── AgentPersistenceService (Database Operations)
```

---

## Priority Classification

| Priority          | Criteria                                  | Issues                |
| ----------------- | ----------------------------------------- | --------------------- |
| **P0 - Critical** | Data integrity, core functionality broken | #13, #2               |
| **P1 - High**     | Build failures, important features broken | Type issues, #9       |
| **P2 - Medium**   | Edge cases, potential issues under load   | #8, #5, #3, #4        |
| **P3 - Low**      | Minor improvements, cosmetic              | #10, #6, #11, #12, #7 |

---

## P0 - Critical Issues

### Issue #13: Duplicate Plan ID Assignment

**Severity**: Critical
**Impact**: Data integrity - in-memory plan ID doesn't match persisted plan ID
**Location**:

- `plan-orchestrator.ts:192-231` (creates UUID)
- `agent-persistence-service.ts:178-184` (creates different UUID)

#### Problem Description

The `PlanOrchestrator` generates a UUID for the plan:

```typescript
// plan-orchestrator.ts:192
const plan: AgentPlan = {
	id: uuidv4(), // ID generated here
	sessionId: intent.sessionId
	// ...
};

// plan-orchestrator.ts:220
await this.persistenceService.createPlan({
	id: plan.id // Same ID passed to persistence
	// ...
});
```

But `AgentPersistenceService.createPlan()` ignores the passed ID:

```typescript
// agent-persistence-service.ts:178
async createPlan(data: Omit<AgentPlanInsert, 'id'>): Promise<string> {
    const planData: AgentPlanInsert = {
        id: uuidv4(),  // NEW ID generated, ignoring passed data.id!
        ...data,
    };
```

#### Consequences

1. The in-memory `plan.id` differs from the database record ID
2. All subsequent references to `plan.id` point to a non-existent record
3. Plan status updates fail silently (updating wrong ID)
4. Plan step updates reference orphaned plans
5. Frontend receives wrong plan ID for status polling

#### Root Cause

The `createPlan` method signature uses `Omit<AgentPlanInsert, 'id'>` which strips the `id` field, but the caller passes it anyway. The method then generates a new ID internally.

#### Recommended Fix

Change persistence method to accept optional ID:

```typescript
async createPlan(data: AgentPlanInsert): Promise<string> {
    const planData: AgentPlanInsert = {
        ...data,
        id: data.id || uuidv4(),  // Use passed ID or generate new
        created_at: data.created_at || new Date().toISOString()
    };
```

---

### Issue #2: Plan Step Skipping Bug

**Severity**: Critical
**Impact**: Steps with dependencies are silently skipped, plans don't fully execute
**Location**: `plan-orchestrator.ts:314-323`

#### Problem Description

```typescript
// plan-orchestrator.ts:314-323
for (const step of plan.steps) {
	// Check dependencies
	if (!this.canExecuteStep(step, completedSteps)) {
		console.log('[PlanOrchestrator] Skipping step due to unmet dependencies', {
			step: step.stepNumber,
			dependencies: step.dependsOn
		});
		continue; // BUG: Step is PERMANENTLY skipped
	}
	// ... execute step
}
```

#### Consequences

1. If step 3 depends on step 2, and step 2 fails, step 3 is skipped
2. If steps are out of order, valid steps may be skipped
3. No mechanism to revisit skipped steps after dependencies complete
4. `getParallelExecutionGroups()` exists but is never used during execution

#### Root Cause

Sequential iteration without dependency-aware scheduling. The code has `getParallelExecutionGroups()` for optimization but doesn't use it for execution.

#### Recommended Fix

Implement proper topological execution:

```typescript
async *executePlan(...) {
    const groups = this.getParallelExecutionGroups(plan);

    for (const group of groups) {
        // Execute all steps in this group (they have no inter-dependencies)
        const groupSteps = group.map(stepNum =>
            plan.steps.find(s => s.stepNumber === stepNum)!
        );

        // Execute group steps (can be parallelized)
        for (const step of groupSteps) {
            // ... execute step
        }
    }
}
```

---

## P1 - High Priority Issues

### Issue: Type System Mismatches

**Severity**: High
**Impact**: TypeScript strict mode failures, potential runtime errors
**Location**: Multiple files (see [AGENTIC_CHAT_TYPE_ISSUES.md](./AGENTIC_CHAT_TYPE_ISSUES.md))

#### Sub-issues

1. **BaseService Empty Interface** (`implements BaseService` with no common properties)
    - Files: `tool-execution-service.ts:72`, `plan-orchestrator.ts:111`, `response-synthesizer.ts:88`
    - Fix: Add `initialize()` and `cleanup()` method implementations

2. **Null vs Undefined Mismatch**
    - Database returns `null`, manual types use `undefined`
    - Files: `agent-persistence-service.ts`, `agent.types.ts`
    - Fix: Align types to use `| null` for nullable database fields

3. **Steps Array vs Json**
    - `AgentPlanStep[]` not assignable to `Json`
    - Fix: Add index signature or cast during persistence

---

### Issue #9: Context Shift Not Persisted

**Severity**: High
**Impact**: Session recovery fails, context lost on crash
**Location**: `agent-chat-orchestrator.ts:496-509`

#### Problem Description

```typescript
// agent-chat-orchestrator.ts:496-509
const contextShift = extractContextShift(result);
if (contextShift) {
    serviceContext.contextType = normalizedShiftContext;
    serviceContext.entityId = contextShift.entity_id;
    serviceContext.lastTurnContext = this.buildContextShiftSnapshot(...);
    // Context is only updated in memory!
    // Not persisted to database
}
```

#### Consequences

1. If session crashes, context shift is lost
2. Resuming a session returns to original context
3. `lastTurnContext` is built but never saved
4. Multi-device sessions have inconsistent context

#### Recommended Fix

Persist context shift to session record:

```typescript
if (contextShift) {
	// ... existing updates ...

	// Persist to database
	await this.deps.persistenceService.updateChatSession(serviceContext.sessionId, {
		context_type: normalizedShiftContext,
		entity_id: contextShift.entity_id,
		metadata: {
			...existingMetadata,
			lastTurnContext: serviceContext.lastTurnContext
		}
	});
}
```

---

## P2 - Medium Priority Issues

### Issue #8: Virtual Tool ID Collision Risk

**Location**: `agent-chat-orchestrator.ts:616-617`, `691-692`, etc.

```typescript
toolCallId: 'virtual-' + Date.now(); // Timestamp-based, not unique
```

**Problem**: Multiple rapid virtual tool calls within same millisecond share ID.

**Fix**: Use UUID for virtual tool call IDs:

```typescript
toolCallId: `virtual-${uuidv4()}`;
```

---

### Issue #5: SSE/Session Timeout Mismatch

**Location**:

- `sse-processor.ts:30` - `DEFAULT_TIMEOUT = 60000` (60s)
- `agent-chat-orchestrator.ts:79` - `MAX_SESSION_DURATION_MS = 90_000` (90s)

**Problem**: SSE inactivity timeout (60s) is shorter than allowed session duration (90s). Long plan executions can timeout at SSE layer before session limit.

**Fix**: Align timeouts or make SSE timeout configurable based on session type.

---

### Issue #3: Race Condition in Plan Persistence

**Location**: `plan-orchestrator.ts:363`

```typescript
await this.persistenceService.updatePlanStep(plan.id, step.stepNumber, step);
// Continues immediately without confirming success
```

**Fix**: Add error handling and confirmation.

---

### Issue #4: Batch Tool Execution Order

**Location**: `tool-execution-service.ts:592`

```typescript
return toolCalls.map((call) => results.find((r) => r.toolCallId === call.id)!);
```

**Problem**: `find()` could return `undefined`, masked by `!` assertion.

**Fix**: Add defensive check or use Map for O(1) lookup.

---

## P3 - Low Priority Issues

### Issue #10: Token Estimation

**Location**: `response-synthesizer.ts:277-280`

```typescript
usage: {
	total_tokens: totalContent.length;
} // Character count != token count
```

**Fix**: Use proper tokenizer or accept this as estimation.

---

### Issue #6: Error Type Inconsistency

**Location**: Multiple files

**Problem**: Inconsistent error message extraction patterns.

**Fix**: Create centralized `normalizeError()` utility.

---

### Issue #11: Partial Update Overwrites

**Location**: `agent-persistence-service.ts:297-300`

**Problem**: Spread operator can overwrite with undefined.

**Fix**: Filter undefined values before merge.

---

### Issue #12: Missing Input Validation

**Location**: `plan-orchestrator.ts:143-154`

**Problem**: No validation on userMessage, strategy.

**Fix**: Add input validation layer.

---

### Issue #7: Missing Cleanup on Abort

**Location**: `agent-chat-orchestrator.ts:328`

**Problem**: Planner marked "completed" even on error.

**Fix**: Track error state and set appropriate status.

---

## Implementation Checklist

### Phase 1: P0 Fixes (Immediate) ✅ COMPLETED

- [x] Fix Plan ID duplication in persistence layer
    - Changed `PersistenceOperations` interface to accept full insert types with optional `id`
    - Updated `createAgent`, `createPlan`, `createChatSession`, `saveMessage` to use `data.id || uuidv4()`
- [x] Implement proper step execution with dependency resolution
    - Refactored `executePlan` to use `getParallelExecutionGroups()` for topological ordering
    - Added `'skipped'` status for steps blocked by failed dependencies
    - Added `'completed_with_errors'` plan status for partial failures
- [ ] Add tests for both fixes (pending)

### Phase 2: P1 Fixes (This Sprint) ✅ COMPLETED

- [x] Add `initialize()`/`cleanup()` to BaseService implementations
    - Verified: Already implemented in all three service files
- [x] Align nullable types with database schema
    - Updated interface signatures to accept full insert types
- [x] Persist context shifts to database
    - Added persistence call in `AgentChatOrchestrator` after context shift extraction
    - Includes error handling to avoid blocking operations
- [x] Run full type check
    - Changes compile without new errors

### Phase 3: P2 Fixes (Next Sprint) ✅ COMPLETED

- [x] Switch virtual tool IDs to UUID (#8)
    - Changed all `'virtual-' + Date.now()` to `` `virtual-${uuidv4()}` `` in agent-chat-orchestrator.ts
- [x] Align SSE and session timeouts (#5)
    - Increased SSE default timeout from 60s to 120s (aligned with 90s session limit + buffer)
    - Updated documentation in SSEProcessorOptions
- [x] Add race condition protection (#3)
    - Added retry mechanism with exponential backoff to `updatePlanStep`
    - Filters out undefined values to prevent overwriting (also fixes #11)
    - Added `updated_at` timestamp for conflict detection
- [x] Fix batch execution ordering (#4)
    - Changed from array + `find()` to `Map` for O(1) lookup
    - Added graceful error handling for missing results

### Phase 4: P3 Fixes (Backlog)

- [ ] Improve token estimation (#10)
- [ ] Standardize error handling (#6)
- [ ] Add input validation (#12)
- [ ] Clean up abort handling (#7)
- [x] Fix partial update overwrites (#11) - Fixed as part of #3

---

## Related Documentation

- [AGENTIC_CHAT_TYPE_ISSUES.md](./AGENTIC_CHAT_TYPE_ISSUES.md) - Detailed type system analysis
- [/apps/web/docs/features/agentic-chat/](../features/agentic-chat/) - Feature documentation
- [/docs/architecture/diagrams/](../../../../docs/architecture/diagrams/) - System architecture

---

## Changelog

| Date       | Author   | Changes                                                                               |
| ---------- | -------- | ------------------------------------------------------------------------------------- |
| 2025-12-20 | Claude   | P2 fixes implemented - Virtual tool IDs, SSE timeout, race conditions, batch ordering |
| 2025-12-20 | Claude   | P0 & P1 fixes implemented - Plan ID, step execution, context shift persistence        |
| 2025-12-19 | Analysis | Initial comprehensive bug report                                                      |
