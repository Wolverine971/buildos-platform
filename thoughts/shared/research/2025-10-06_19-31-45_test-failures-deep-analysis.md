---
date: 2025-10-06T19:31:45-07:00
researcher: Claude (claude-sonnet-4-5)
git_commit: 65b0c8047572e2b905909a2590a344b077484c5a
branch: main
repository: buildos-platform
topic: 'Test Failures Deep Analysis and Remediation Strategy'
tags: [research, testing, bug-fix, dashboardData, brain-dump-processor, prompt-audit]
status: complete
last_updated: 2025-10-06
last_updated_by: Claude
path: thoughts/shared/research/2025-10-06_19-31-45_test-failures-deep-analysis.md
---

# Research: Test Failures Deep Analysis and Remediation Strategy

**Date**: 2025-10-06T19:31:45-07:00
**Researcher**: Claude (claude-sonnet-4-5)
**Git Commit**: 65b0c8047572e2b905909a2590a344b077484c5a
**Branch**: main
**Repository**: buildos-platform

## Research Question

The BuildOS web app has 3 test files with failures totaling 25 failed tests:

- `dashboardData.service.test.ts`: 7 failed tests (10 total)
- `brain-dump-processor.test.ts`: 8 failed tests (8 total)
- `prompt-audit.test.ts`: 10 failed tests (13 total)

**Goal**: Deeply understand the flows being tested, identify why tests are failing, and rewrite tests to properly validate the actual implementation.

## Summary

After comprehensive analysis of all three test suites and their corresponding implementations, I've identified the root causes and remediation strategies:

### **dashboardData.service.test.ts** (7/10 failed)

**Root Cause**: Tests mock `dashboardStore` methods incorrectly - the real implementation uses different method signatures and timing than mocked.

**Key Issues**:

- `rollbackOptimisticUpdate` method exists but tests don't set it up properly
- Mocked `updateTask` doesn't return the optimistic update ID correctly
- Race condition tests don't account for the actual async flow

### **brain-dump-processor.test.ts** (8/8 failed)

**Root Cause**: Tests mock `LLMPool.makeRequest()` but actual implementation uses `SmartLLMService.getJSONResponse()`.

**Key Issues**:

- Architecture changed from `LLMPool` (worker service) to `SmartLLMService` (web app)
- Method signature changed: `makeRequest()` → `getJSONResponse()`
- Return type changed: Wrapper object → Direct JSON result
- Tests need to mock the `llmService` property, not `llmPool`

### **prompt-audit.test.ts** (10/13 failed)

**Root Cause**: Scenario type naming system was refactored from length-based to processing-type-based.

**Key Issues**:

- Old: `dual-processing-questions`, `new-project-short`
- New: `existing-project-dual-tasks-with-questions`, `new-project-singular`
- Tests use invalid `processingType: 'questions'` (should be `processingType: 'tasks', hasQuestions: true`)
- Length no longer differentiates new projects - all use `new-project-singular`

---

## Detailed Findings

### 1. Dashboard Optimistic Updates Flow

#### Architecture Overview

The dashboard implements a **sophisticated optimistic update system** with race condition prevention through metadata capture BEFORE state mutations.

**Location**: `/apps/web/src/lib/services/dashboardData.service.ts` (422 lines)

#### Complete Flow

```typescript
// 1. CAPTURE STATE (Line 190)
const currentState = dashboardStore.getState();

// 2. FIND TASK (Line 191)
const task = this.findTaskInAllLists(currentState, taskId);

// 3. EXTRACT PROJECT_ID (Line 194)
const taskProjectId = projectId || task?.project_id;

// 4. VALIDATE (Lines 196-205)
if (!taskProjectId) {
	return {
		success: false,
		message: 'Task project information not available...'
	};
}

// 5. APPLY OPTIMISTIC UPDATE (Line 208)
const optimisticUpdateId = dashboardStore.updateTask(taskId, updates);

// 6. MAKE API CALL (Lines 210-213)
const result = await this.patch<Task>(`/projects/${taskProjectId}/tasks/${taskId}`, updates);

// 7. CONFIRM OR ROLLBACK (Lines 215-224)
if (result.success && result.data) {
	dashboardStore.confirmOptimisticUpdate(optimisticUpdateId);
	dashboardStore.updateTask(taskId, result.data?.task || result.data);
} else {
	dashboardStore.rollbackOptimisticUpdate(optimisticUpdateId);
}
```

#### Race Condition Prevention

**The Problem:**
When a task's `start_date` changes, it moves between date-based lists (`todaysTasks` → `tomorrowsTasks`). If the optimistic update happens first, the task is in a different list and `project_id` can't be found for the API call.

**The Solution:**
Capture `project_id` BEFORE applying the optimistic update (dashboardData.service.ts:190-194).

#### Store Methods (dashboard.store.ts)

```typescript
// Public API
updateTask(taskId: string, updates: Partial<Task>): string
  // Returns optimistic update ID
  // Stores rollback data (lines 442-459)

deleteTask(taskId: string): string | null
  // Returns optimistic update ID or null
  // Stores full task for restoration (lines 483-499)

addTask(task: TaskWithCalendarEvents): string
  // Returns optimistic update ID
  // Adds to appropriate date-based lists (lines 502-512)

confirmOptimisticUpdate(updateId: string): void
  // Removes from tracking Map (lines 392-398)

rollbackOptimisticUpdate(updateId: string): void
  // Applies inverse operations (lines 365-390)

getState(): DashboardState
  // Returns current state snapshot (lines 437-439)

// Internal methods
applyOptimisticUpdate(update: OptimisticUpdate): void
  // Routes to specific apply methods (lines 138-160)

applyTaskUpdate(state, taskUpdate): void
  // Handles status changes and date moves (lines 162-285)

applyTaskCreate(state, task): void
  // Adds to date lists, updates stats (lines 287-329)

applyTaskDelete(state, taskId): void
  // Removes from all lists (lines 331-363)
```

#### Why Tests Are Failing

**Test 1: "should find task BEFORE applying optimistic update"**

```typescript
// Test expects orderOfOperations[0] === 'updateTask'
// But should be 'getState' (line 86)
expect(orderOfOperations[0]).toBe('getState'); // ✅ CORRECT
expect(orderOfOperations[1]).toBe('updateTask'); // ✅ CORRECT
```

**Tests 2-7: updateTask/revertUpdate not called**

- Mock setup doesn't properly simulate the store's methods
- Tests spy on `dashboardStore.updateTask` but the service calls it internally
- Need to properly mock the entire store with realistic responses

#### Test Rewrite Strategy

1. **Properly mock `DashboardStore`**:

    ```typescript
    mockDashboardStore = {
    	getState: vi.fn(() => mockState),
    	updateTask: vi.fn(() => 'optimistic-id-123'),
    	deleteTask: vi.fn(() => 'optimistic-id-456'),
    	addTask: vi.fn(() => 'optimistic-id-789'),
    	confirmOptimisticUpdate: vi.fn(),
    	rollbackOptimisticUpdate: vi.fn()
    };
    ```

2. **Mock Supabase responses**:

    ```typescript
    mockSupabase.single.mockResolvedValue({
    	data: { ...task, ...updates },
    	error: null
    });
    ```

3. **Verify the complete flow**:
    - getState() called
    - Task found in state
    - updateTask() called with correct params
    - API called with project_id
    - confirmOptimisticUpdate() called on success
    - rollbackOptimisticUpdate() called on failure

---

### 2. Brain Dump Processor Architecture

#### Architecture Change: LLMPool → SmartLLMService

**OLD (LLMPool)** - Worker service only:

```typescript
// Location: /apps/worker/src/lib/services/llm-pool.ts
// Method: makeRequest<T>(request: LLMRequest): Promise<LLMResponse<T>>
// Returns: Wrapper object with metadata

const response = await llmPool.makeRequest({
	systemPrompt: '...',
	userPrompt: '...',
	userId: '...'
});
const result = response.result; // Nested in wrapper
```

**NEW (SmartLLMService)** - Web app:

```typescript
// Location: /apps/web/src/lib/services/smart-llm-service.ts
// Method: getJSONResponse<T>(options: JSONRequestOptions<T>): Promise<T>
// Returns: Direct parsed JSON object

const result = await llmService.getJSONResponse({
	systemPrompt: '...',
	userPrompt: '...',
	userId: '...',
	profile: 'balanced', // fast | balanced | powerful | maximum
	operationType: 'brain_dump'
});
// Result is direct JSON, no wrapper
```

#### Processing Flow (braindump-processor.ts)

```typescript
// Main orchestration (Line 319)
async processBrainDump({
  brainDump,
  userId,
  selectedProjectId,
  displayedQuestions,
  options,
  brainDumpId,
  processingDateTime
}): Promise<BrainDumpParseResult>

// Steps:
// 1. Get existing project data (Line 341-346)
// 2. Run preparatory analysis (Lines 351-371) - OPTIMIZATION
//    - Uses profile: 'fast'
//    - Filters relevant tasks
//    - Can skip context/tasks extraction
// 3. Dual processing (Line 403-413)
//    - extractProjectContext() - profile: 'balanced'
//    - extractTasks() - profile: 'balanced'
//    - Runs in parallel with Promise.allSettled
// 4. Validate project questions (Lines 416-420)
// 5. Auto-execute operations (Lines 423-482)
// 6. Log completion (Lines 485-523)
```

#### Key Dependencies

```typescript
constructor(supabase: SupabaseClient<Database>) {
  this.llmService = new SmartLLMService({ /* ... */ }); // Line 71-75
  this.activityLogger = new ActivityLogger(supabase);
  this.errorLogger = ErrorLoggerService.getInstance(supabase);
  this.promptTemplateService = new PromptTemplateService(supabase);
  this.operationsExecutor = new OperationsExecutor(supabase);
  this.taskTimeSlotFinder = new TaskTimeSlotFinder(supabase);
  this.statusService = new BrainDumpStatusService(supabase);
  this.projectDataFetcher = new ProjectDataFetcher(supabase);
}
```

#### Why Tests Are Failing

**All 8 tests fail with**: `Cannot read properties of undefined (reading 'makeRequest')`

**Root Cause**:

```typescript
// Test mocks (Line 10-14):
vi.mock('$lib/services/llm-pool', () => ({ // ❌ WRONG PATH
  LLMPool: vi.fn().mockImplementation(() => ({
    makeRequest: vi.fn(), // ❌ WRONG METHOD
  }))
}));

// Actual implementation uses:
this.llmService = new SmartLLMService({ ... }); // Different class
await this.llmService.getJSONResponse({ ... }); // Different method
```

#### Test Rewrite Strategy

1. **Mock SmartLLMService**:

    ```typescript
    // Don't mock the module - replace the instance
    beforeEach(() => {
    	processor = new BrainDumpProcessor(mockSupabase);

    	// Replace the llmService instance
    	const mockLLMService = {
    		getJSONResponse: vi.fn()
    	};
    	(processor as any).llmService = mockLLMService;
    });
    ```

2. **Mock responses correctly**:

    ```typescript
    // Old format (wrapper):
    mockLLMPool.makeRequest.mockResolvedValue({
      result: { operations: [...] } // ❌ Nested
    });

    // New format (direct):
    mockLLMService.getJSONResponse.mockResolvedValue({
      operations: [...] // ✅ Direct
    });
    ```

3. **Mock dual processing calls**:

    ```typescript
    // Preparatory analysis
    mockLLMService.getJSONResponse.mockResolvedValueOnce({
      braindump_classification: 'task-focused',
      needs_context_update: false,
      relevant_task_ids: ['task-1']
    });

    // Context extraction
    mockLLMService.getJSONResponse.mockResolvedValueOnce({
      operations: [{ table: 'projects', operation: 'update', data: {...} }]
    });

    // Task extraction
    mockLLMService.getJSONResponse.mockResolvedValueOnce({
      operations: [{ table: 'tasks', operation: 'create', data: {...} }]
    });
    ```

---

### 3. Prompt Audit System Refactoring

#### Scenario Type System Change

**OLD SYSTEM** (Length-based):

- Scenario types determined primarily by `brainDumpLength < 500` threshold
- Generic names: `dual-processing-tasks`, `new-project-short`
- Less explicit about project type

**NEW SYSTEM** (Processing-type-based):

- Determined by: `isNewProject`, `isDualProcessing`, `processingType`, `isShortBrainDump`, `hasQuestions`
- Explicit names: `existing-project-dual-tasks-with-questions`, `new-project-singular`
- Length only used in fallback logic

#### Complete Scenario Type Mapping

From `/apps/web/src/lib/utils/prompt-audit.ts` (lines 28-75):

```typescript
// NEW SCENARIO TYPES
'new-project-singular'                           // All non-dual new projects
'new-project-dual-context'                       // New project context phase
'new-project-dual-tasks'                         // New project task phase
'existing-project-dual-context'                  // Existing project context update
'existing-project-dual-tasks'                    // Existing project tasks (no questions)
'existing-project-dual-tasks-with-questions'     // Existing project tasks (with questions)
'short-braindump-task-extraction'                // Quick task capture
'short-braindump-task-extraction-with-questions' // Quick task capture (with questions)
'short-braindump-context-update'                 // Context update for short braindumps

// LEGACY MAPPINGS (backwards compatibility)
'dual-processing-context' → 'existing-project-dual-context'
'dual-processing-tasks' → 'existing-project-dual-tasks'
'dual-processing-tasks-with-questions' → 'existing-project-dual-tasks-with-questions'
'new-project-short' → 'new-project-singular'
'new-project-long' → 'new-project-singular'
'existing-project-short' → 'short-braindump-task-extraction'
'existing-project-long' → 'existing-project-dual-context'
```

#### determineScenarioType() Logic

From `/apps/web/src/lib/utils/prompt-audit.ts` (lines 135-194):

```typescript
export function determineScenarioType({
	isNewProject,
	brainDumpLength,
	isDualProcessing,
	processingType, // 'context' | 'tasks' | 'context-update'
	isShortBrainDump,
	hasQuestions
}): string {
	// Priority 1: Short braindump (existing projects only)
	if (isShortBrainDump && !isNewProject) {
		if (processingType === 'context-update') return 'short-braindump-context-update';
		if (processingType === 'tasks') {
			return hasQuestions
				? 'short-braindump-task-extraction-with-questions'
				: 'short-braindump-task-extraction';
		}
	}

	// Priority 2: Dual processing
	if (isDualProcessing) {
		if (isNewProject) {
			if (processingType === 'context') return 'new-project-dual-context';
			if (processingType === 'tasks') return 'new-project-dual-tasks';
		} else {
			if (processingType === 'context') return 'existing-project-dual-context';
			if (processingType === 'tasks') {
				return hasQuestions
					? 'existing-project-dual-tasks-with-questions'
					: 'existing-project-dual-tasks';
			}
		}
	}

	// Priority 3: Singular (new project without dual)
	if (isNewProject && !isDualProcessing) return 'new-project-singular';

	// Priority 4: Fallback
	const isShort = brainDumpLength < 500;
	return isNewProject
		? 'new-project-singular'
		: isShort
			? 'short-braindump-task-extraction'
			: 'existing-project-dual-context';
}
```

#### Why Tests Are Failing

| Test Case                      | Test Input                    | Expected (OLD)                | Actual (NEW)                        | Issue                                                     |
| ------------------------------ | ----------------------------- | ----------------------------- | ----------------------------------- | --------------------------------------------------------- |
| Dual processing with questions | `processingType: 'questions'` | `'dual-processing-questions'` | `'existing-project-dual-context'`   | ❌ Invalid input - 'questions' not a valid processingType |
| Dual processing context        | `processingType: 'context'`   | `'dual-processing-context'`   | `'existing-project-dual-context'`   | ✅ Name changed                                           |
| Dual processing tasks          | `processingType: 'tasks'`     | `'dual-processing-tasks'`     | `'existing-project-dual-tasks'`     | ✅ Name changed                                           |
| New project short              | `brainDumpLength: 400`        | `'new-project-short'`         | `'new-project-singular'`            | ✅ Length no longer matters                               |
| New project long               | `brainDumpLength: 600`        | `'new-project-long'`          | `'new-project-singular'`            | ✅ Length no longer matters                               |
| Existing project short         | `brainDumpLength: 400`        | `'existing-project-short'`    | `'short-braindump-task-extraction'` | ⚠️ Need to add `isShortBrainDump: true`                   |
| Existing project long          | `brainDumpLength: 600`        | `'existing-project-long'`     | `'existing-project-dual-context'`   | ✅ Fallback logic                                         |

#### Test Rewrite Strategy

1. **Fix invalid input**:

    ```typescript
    // OLD (invalid):
    determineScenarioType({
    	processingType: 'questions' // ❌ Not a valid value
    });

    // NEW (correct):
    determineScenarioType({
    	processingType: 'tasks',
    	hasQuestions: true // ✅ Separate parameter
    });
    ```

2. **Update expected values**:

    ```typescript
    // Instead of 'dual-processing-tasks'
    expect(result).toBe('existing-project-dual-tasks');

    // Instead of 'new-project-short' or 'new-project-long'
    expect(result).toBe('new-project-singular');
    ```

3. **Add missing parameters**:
    ```typescript
    // For short braindumps:
    determineScenarioType({
    	isNewProject: false,
    	brainDumpLength: 400,
    	isDualProcessing: false,
    	isShortBrainDump: true, // ✅ Add this
    	processingType: 'tasks'
    });
    ```

---

## Code References

### Dashboard Service

- `dashboardData.service.ts:184-228` - updateTask() with race condition prevention
- `dashboardData.service.ts:233-268` - deleteTask() flow
- `dashboardData.service.ts:285-315` - createTask() with temp ID
- `dashboardData.service.ts:389-410` - findTaskInAllLists() helper
- `dashboard.store.ts:138-160` - applyOptimisticUpdate() orchestrator
- `dashboard.store.ts:442-459` - updateTask() public API
- `dashboard.store.ts:365-390` - rollbackOptimisticUpdate()

### Brain Dump Processor

- `braindump-processor.ts:51-82` - Constructor with SmartLLMService
- `braindump-processor.ts:319-556` - Main processBrainDump() orchestration
- `braindump-processor.ts:848-960` - processBrainDumpDual() method
- `braindump-processor.ts:962-1075` - extractProjectContext()
- `braindump-processor.ts:1077-1212` - extractTasks()
- `smart-llm-service.ts` - SmartLLMService implementation

### Prompt Audit

- `prompt-audit.ts:10-130` - savePromptForAudit() function
- `prompt-audit.ts:28-75` - Complete scenarioMap
- `prompt-audit.ts:135-194` - determineScenarioType() logic

---

## Testing Strategy

### Priority Order

1. **Fix prompt-audit.test.ts** (10 failures) - Easiest, just update expectations
2. **Fix brain-dump-processor.test.ts** (8 failures) - Change mocking approach
3. **Fix dashboardData.service.test.ts** (7 failures) - Most complex, requires realistic mocks

### Validation Approach

1. Fix each test file
2. Run tests individually: `pnpm test path/to/test.test.ts`
3. Verify all pass
4. Run full test suite: `pnpm test`
5. Ensure no regressions

---

## Related Research

- `/thoughts/shared/research/2025-10-06_optimistic-update-flow-analysis.md` - Dashboard optimistic updates (created by agent)
- `/thoughts/shared/research/2025-10-06_brain-dump-processor-architecture.md` - Brain dump processor architecture (created by agent)
- `/docs/testing/WEB_APP_COVERAGE.md` - Overall test coverage analysis

---

## Open Questions

None - research is complete. Ready to proceed with test rewrites.

---

## Conclusion

All three test suites are failing due to implementation changes that tests don't reflect:

1. **Dashboard**: Tests mock the store incorrectly - need realistic method signatures and return values
2. **Brain Dump**: Architecture changed from LLMPool to SmartLLMService - need to mock the new service
3. **Prompt Audit**: Scenario naming system refactored - need to update test expectations

The implementations are **sound and working correctly**. The tests just need to be updated to match the current implementation patterns. No bugs found in the actual code - only test maintenance needed.
