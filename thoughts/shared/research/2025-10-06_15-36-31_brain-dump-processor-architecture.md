---
title: 'Brain Dump Processor Architecture & Test Migration'
date: 2025-10-06
author: Claude Code
tags: [architecture, testing, brain-dump, llm-service, migration]
status: active
context: Research for fixing broken BrainDumpProcessor tests after LLMPool → SmartLLMService migration
path: thoughts/shared/research/2025-10-06_15-36-31_brain-dump-processor-architecture.md
---

# Brain Dump Processor Architecture & Test Migration Guide

## Executive Summary

The BrainDumpProcessor has been migrated from using `LLMPool` to `SmartLLMService`, but tests still mock the old service. This document provides complete architecture understanding and test migration guidance.

## 1. Architecture Changes: LLMPool → SmartLLMService

### What Changed?

**OLD (LLMPool - Worker Service Only)**

- Location: `/apps/worker/src/lib/services/llm-pool.ts`
- Purpose: Multi-provider LLM routing with fallback (Ollama, OpenAI, etc.)
- Primary Method: `makeRequest<T>(request: LLMRequest): Promise<LLMResponse<T>>`
- Use Case: Worker-specific, multiple local/cloud providers
- Features: Health checks, provider priority, automatic fallback

**NEW (SmartLLMService - Web App)**

- Location: `/apps/web/src/lib/services/smart-llm-service.ts`
- Purpose: Intelligent model selection via OpenRouter with cost optimization
- Primary Method: `getJSONResponse<T>(options: JSONRequestOptions<T>): Promise<T>`
- Use Case: Web app LLM calls with model profiles (fast/balanced/powerful/maximum)
- Features: Model routing, automatic retries, cost tracking, database logging

### Why the Change?

1. **Unified LLM Strategy**: Web app needs smart model selection, not just failover
2. **Cost Optimization**: OpenRouter provides better model selection and pricing
3. **Better Fit**: Profiles (fast/balanced/powerful) match brain dump complexity
4. **Modern API**: Direct JSON responses, automatic validation, retry logic

### Key Differences for Testing

| Aspect            | LLMPool                          | SmartLLMService                                           |
| ----------------- | -------------------------------- | --------------------------------------------------------- |
| **Constructor**   | `new LLMPool(providers, logger)` | `new SmartLLMService({ supabase, httpReferer, appName })` |
| **Method**        | `makeRequest(LLMRequest)`        | `getJSONResponse(JSONRequestOptions)`                     |
| **Return Type**   | `LLMResponse<T>` with metadata   | Direct `T` (parsed JSON)                                  |
| **Configuration** | Provider array with priorities   | Profile-based model selection                             |
| **Retry Logic**   | Provider fallback                | Automatic retry with powerful models                      |
| **Logging**       | Activity logger only             | Supabase database + activity logger                       |

## 2. SmartLLMService Interface

### Constructor Options

```typescript
interface SmartLLMServiceConfig {
	httpReferer?: string; // For OpenRouter tracking (default: 'https://yourdomain.com')
	appName?: string; // App identifier (default: 'SmartLLMService')
	supabase?: SupabaseClient; // For usage logging to llm_usage_logs table
}
```

### Primary Method: getJSONResponse

```typescript
interface JSONRequestOptions<T> {
	// Required
	systemPrompt: string;
	userPrompt: string;
	userId: string;

	// Optional configuration
	profile?: JSONProfile; // 'fast' | 'balanced' | 'powerful' | 'maximum' | 'custom'
	temperature?: number; // Default: 0.2

	// Validation & retry
	validation?: {
		retryOnParseError?: boolean; // Retry with powerful model if JSON parse fails
		validateSchema?: boolean;
		maxRetries?: number; // Default: 2
	};

	// Requirements (for custom profile)
	requirements?: {
		maxLatency?: number;
		minAccuracy?: number;
		maxCost?: number;
	};

	// Context for usage tracking (stored in llm_usage_logs)
	operationType?: string; // e.g., 'brain_dump', 'brain_dump_context', 'brain_dump_tasks'
	projectId?: string;
	brainDumpId?: string;
	taskId?: string;
	briefId?: string;
}
```

### Return Value

```typescript
async getJSONResponse<T>(options: JSONRequestOptions<T>): Promise<T>
```

**Direct return** of parsed JSON object (no wrapper). Automatic:

- JSON cleaning (removes markdown code blocks)
- Retry on parse errors (if `validation.retryOnParseError = true`)
- Cost tracking and database logging
- Model fallback routing via OpenRouter

### Model Profiles

**Fast Profile** (1-2s response):

- Primary: `x-ai/grok-4-fast:free` (FREE)
- Fallback: `google/gemini-2.5-flash-lite`, `openai/gpt-4o-mini`
- Use: Simple/moderate complexity, speed priority

**Balanced Profile** (2-4s response) - **DEFAULT**:

- Primary: `openai/gpt-4o-mini`
- Fallback: `deepseek/deepseek-chat`, `x-ai/grok-code-fast-1`
- Use: General brain dump processing, good accuracy/cost balance

**Powerful Profile** (4-5s response):

- Primary: `anthropic/claude-3.5-sonnet`
- Fallback: `x-ai/grok-code-fast-1`, `openai/gpt-4o`
- Use: Complex reasoning, critical accuracy

**Maximum Profile** (5-7s response):

- Primary: `anthropic/claude-3-opus`
- Fallback: `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`
- Use: Critical tasks requiring highest quality

### Database Logging

Automatically logs to `llm_usage_logs` table:

```typescript
{
  user_id: string;
  operation_type: string;           // 'brain_dump', 'brain_dump_context', etc.
  model_requested: string;          // 'openai/gpt-4o-mini'
  model_used: string;               // Actual model (may differ due to routing)
  provider: string;                 // 'openai', 'anthropic', etc.
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  input_cost_usd: number;           // Calculated from usage
  output_cost_usd: number;
  total_cost_usd: number;
  response_time_ms: number;
  request_started_at: timestamp;
  request_completed_at: timestamp;
  status: 'success' | 'failure' | 'timeout' | 'rate_limited';
  error_message?: string;
  temperature?: number;
  profile?: string;
  streaming?: boolean;
  project_id?: string;
  brain_dump_id?: string;
  openrouter_request_id?: string;
  openrouter_cache_status?: string; // 'hit' | 'miss'
  rate_limit_remaining?: number;
  metadata?: any;                   // complexity, retryCount, cachedTokens, etc.
}
```

## 3. BrainDumpProcessor Complete Flow

### File Location

`/apps/web/src/lib/utils/braindump-processor.ts` (1584 lines)

### Constructor (Lines 65-82)

```typescript
constructor(supabase: SupabaseClient<Database>) {
  this.supabase = supabase;
  this.activityLogger = new ActivityLogger(supabase);
  this.errorLogger = ErrorLoggerService.getInstance(supabase);

  // NEW: SmartLLMService replaces LLMPool
  this.llmService = new SmartLLMService({
    httpReferer: 'https://buildos.dev',
    appName: 'BuildOS',
    supabase
  });

  this.promptTemplateService = new PromptTemplateService(supabase);
  this.operationsExecutor = new OperationsExecutor(supabase);
  this.operationValidator = new OperationValidator();
  this.taskTimeSlotFinder = new TaskTimeSlotFinder(supabase);
  this.statusService = new BrainDumpStatusService(supabase);
  this.projectDataFetcher = new ProjectDataFetcher(supabase);
}
```

### Main Processing Flow (Lines 319-556)

```typescript
async processBrainDump({
  brainDump,
  userId,
  selectedProjectId,
  displayedQuestions,
  options = {},
  brainDumpId,
  processingDateTime
}): Promise<BrainDumpParseResult>
```

**Step 1: Get Existing Project Data** (Lines 338-347)

```typescript
let existingProject: ProjectWithRelations | null = null;
if (selectedProjectId) {
	const fullProjectData = await this.projectDataFetcher.getFullProjectData({
		userId,
		projectId: selectedProjectId,
		options: { includeTasks: true, includePhases: true }
	});
	existingProject = fullProjectData.fullProjectWithRelations;
}
```

**Step 2: Run Preparatory Analysis** (Lines 349-371) - **OPTIMIZATION**

```typescript
let prepAnalysisResult: PreparatoryAnalysisResult | null = null;
if (existingProject && selectedProjectId) {
	console.log('[BrainDumpProcessor] Running preparatory analysis for existing project');
	prepAnalysisResult = await this.runPreparatoryAnalysis(brainDump, existingProject, userId);
	// Analysis determines:
	// - braindump_classification (strategic, task-focused, mixed, etc.)
	// - needs_context_update (boolean)
	// - relevant_task_ids (array) - token optimization
	// - new_tasks_detected (boolean)
	// - processing_recommendation.skip_context (boolean)
	// - processing_recommendation.skip_tasks (boolean)
}
```

**Step 3: Log Processing Start** (Lines 376-396)

**Step 4: Dual Processing** (Lines 398-413)

```typescript
synthesisResult = await this.processBrainDumpDual({
	brainDump,
	brainDumpId,
	userId,
	selectedProjectId,
	existingProject,
	displayedQuestions,
	options: { ...options, streamResults: true },
	prepAnalysisResult, // Pass for optimization
	processingDateTime
});
```

**Step 5: Validate Project Questions** (Lines 415-420)

**Step 6: Auto-Execute Operations** (Lines 422-482)

```typescript
if (options.autoExecute && synthesisResult.operations && synthesisResult.operations.length > 0) {
	const executionResult = await this.operationsExecutor.executeOperations({
		operations: synthesisResult.operations,
		userId,
		brainDumpId,
		projectQuestions: synthesisResult.projectQuestions
	});

	// Update status service
	await this.statusService.updateToSaved(
		brainDumpId,
		userId,
		executionResult,
		synthesisResult.operations,
		projectInfo,
		metadata,
		duration,
		'dual'
	);

	synthesisResult.executionResult = executionResult;
}
```

**Step 7: Log Completion** (Lines 484-523)

### Preparatory Analysis (Lines 179-314) - **KEY OPTIMIZATION**

```typescript
private async runPreparatoryAnalysis(
  brainDump: string,
  project: ProjectWithRelations,
  userId: string
): Promise<PreparatoryAnalysisResult | null>
```

**Purpose**: Lightweight LLM call to determine what needs updating
**Model Used**: `profile: 'fast'` (free/cheap models)
**Token Optimization**:

- Light task data (only id, title, status, start_date, 100 chars of description)
- Light project data (excludes full context field)
- Result used to filter tasks in extractTasks (lines 1096-1108)

**SmartLLMService Call** (Lines 220-227):

```typescript
const response = await this.llmService.getJSONResponse({
	systemPrompt,
	userPrompt,
	userId,
	profile: 'fast', // Use fast model for lightweight analysis
	operationType: 'brain_dump_context',
	projectId: project.id
});
```

**Return Type**: `PreparatoryAnalysisResult`

```typescript
interface PreparatoryAnalysisResult {
	analysis_summary: string;
	braindump_classification: string; // 'strategic', 'task-focused', 'mixed', etc.
	needs_context_update: boolean;
	context_indicators: string[];
	relevant_task_ids: string[]; // IMPORTANT: Used to filter tasks
	task_indicators: Record<string, string>;
	new_tasks_detected: boolean;
	confidence_level: 'low' | 'medium' | 'high';
	processing_recommendation: {
		skip_context: boolean; // If true, skip context extraction
		skip_tasks: boolean; // If true, skip task extraction
		reason: string;
	};
}
```

### Dual Processing Pipeline (Lines 848-960)

```typescript
private async processBrainDumpDual({
  brainDump, brainDumpId, userId, selectedProjectId,
  existingProject, displayedQuestions, options,
  prepAnalysisResult, processingDateTime
}): Promise<BrainDumpParseResult>
```

**Parallel Execution** (Lines 881-899):

```typescript
const [contextResult, tasksResult] = await Promise.allSettled([
	this.extractProjectContext({
		brainDump,
		existingProject,
		userId,
		selectedProjectId,
		prepAnalysisResult, // Can skip if recommendation says so
		processingDateTime
	}),
	this.extractTasks({
		brainDump,
		selectedProjectId,
		userId,
		existingTasks,
		displayedQuestions,
		prepAnalysisResult, // Filters tasks to relevant ones only
		processingDateTime
	})
]);
```

**Routing to Merge Functions** (Lines 902-923):

```typescript
if (selectedProjectId) {
	// Existing project - use standard merge
	return await this.mergeDualProcessingResultsForExistingProject(
		contextResult,
		tasksResult,
		attempt,
		selectedProjectId,
		userId,
		brainDumpId,
		options
	);
} else {
	// New project - use enhanced merge with project ID assignment
	return await this.mergeDualProcessingResultsForNewProject(
		contextResult,
		tasksResult,
		attempt,
		userId,
		brainDumpId,
		options
	);
}
```

### Extract Project Context (Lines 962-1075)

**Check Skip Recommendation** (Lines 980-1002):

```typescript
if (prepAnalysisResult?.processing_recommendation?.skip_context) {
	console.log('[extractProjectContext] Skipping context processing based on analysis');
	return {
		title: 'Context Processing Skipped',
		summary: `Analysis determined context update not needed: ${prepAnalysisResult.processing_recommendation.reason}`,
		operations: [] // No operations = no context update
		// ... minimal result
	};
}
```

**SmartLLMService Call** (Lines 1058-1065):

```typescript
const response = await this.llmService.getJSONResponse({
	systemPrompt,
	userPrompt,
	userId,
	profile: 'balanced', // Default profile for context extraction
	operationType: 'brain_dump_context',
	projectId: selectedProjectId
});
```

**Important**: Context extraction NEVER generates questions (lines 1004-1005, 1070-1072)

### Extract Tasks (Lines 1077-1212)

**Token Optimization via Analysis** (Lines 1096-1108):

```typescript
let tasksToPass = existingTasks;
if (prepAnalysisResult && prepAnalysisResult.relevant_task_ids.length > 0 && existingTasks) {
	const relevantIds = new Set(prepAnalysisResult.relevant_task_ids);
	tasksToPass = existingTasks.filter((task) => relevantIds.has(task.id));
	console.log(
		`[extractTasks] Filtering tasks based on analysis: ${tasksToPass.length}/${existingTasks.length} tasks`
	);
}
```

**SmartLLMService Call** (Lines 1167-1174):

```typescript
const response = await this.llmService.getJSONResponse({
	systemPrompt,
	userPrompt,
	userId,
	profile: 'balanced', // Default profile
	operationType: 'brain_dump_tasks',
	projectId: selectedProjectId
});
```

**Task Scheduling** (Lines 1179-1204):

```typescript
if (result.operations && result.operations.length > 0) {
	const taskOps = result.operations.filter(
		(op) => op.table === 'tasks' && op.operation === 'create'
	);
	if (taskOps.length > 0 && userId && selectedProjectId) {
		const tasksToSchedule = taskOps.map((op) => op.data);
		const scheduledTasks = await this.adjustTaskScheduledDateTime(
			tasksToSchedule,
			userId,
			selectedProjectId
		);
		// Update operations with scheduled data
		// ...
	}
}
```

**Question Handling** (Lines 1207-1210):

```typescript
// Include question analysis and project questions if present
result.questionAnalysis = response.result?.questionAnalysis;
result.projectQuestions = response.result?.projectQuestions;
```

### Merge Results for Existing Project (Lines 1214-1422)

**Validation** (Lines 1223-1273):

```typescript
// VALIDATION: Check if both promises failed
if (contextResult.status === 'rejected' && tasksResult.status === 'rejected') {
  const error = new Error(`Both context and task extraction failed...`);
  // Log to error service
  await this.errorLogger.logBrainDumpError(error, brainDumpId, ...);

  // Return minimal result with error
  return {
    operations: [],
    title: 'Brain dump processing failed',
    summary: 'Both context and task extraction failed. Please try again...',
    metadata: { partialFailure: true, failureDetails: [...] }
  };
}
```

**Merge Logic** (Lines 1275-1358):

```typescript
const operations: ParsedOperation[] = [];
const errors: string[] = [];

// Process context first
if (contextResult.status === 'fulfilled') {
	operations.push(...contextResult.value.operations);
	// Extract project reference for tasks
}

// Process tasks with correct reference
if (tasksResult.status === 'fulfilled') {
	// Capture questions from tasks result
	questionAnalysis = tasksValue.questionAnalysis;
	projectQuestions = tasksValue.projectQuestions;

	// Fix project references in task operations
	const taskOps = tasksValue.operations.map((op) => {
		if (op.table === 'tasks' && op.operation === 'create' && !selectedProjectId) {
			return { ...op, data: { ...op.data, project_ref: projectRef } };
		}
		return op;
	});
	operations.push(...taskOps);
}
```

### Merge Results for New Project (Lines 1424-1582)

**Similar to existing project merge, but**:

- Ensures tasks reference newly created project via `project_ref`
- Validates project creation operation exists
- Handles standalone tasks if no project creation

## 4. Key Dependencies

### SmartLLMService (Constructor Line 71-75)

```typescript
this.llmService = new SmartLLMService({
	httpReferer: 'https://buildos.dev',
	appName: 'BuildOS',
	supabase
});
```

**Used in**:

- `runPreparatoryAnalysis` (line 220) - profile: 'fast'
- `extractProjectContext` (line 1058) - profile: 'balanced'
- `extractTasks` (line 1167) - profile: 'balanced'

### ActivityLogger (Constructor Line 67)

```typescript
this.activityLogger = new ActivityLogger(supabase);
```

**Used in**:

- `processBrainDump` (lines 379, 492) - Log processing start/complete
- `runPreparatoryAnalysis` (line 280) - Log analysis completion

### ErrorLoggerService (Constructor Line 68)

```typescript
this.errorLogger = ErrorLoggerService.getInstance(supabase);
```

**Used in**:

- `runPreparatoryAnalysis` (line 296) - Log analysis errors
- `processBrainDump` (line 537) - Log processing errors
- `processBrainDumpDual` (line 928) - Log retry errors
- `mergeDualProcessingResultsForExistingProject` (line 1232) - Log complete failures

### PromptTemplateService (Constructor Line 76)

```typescript
this.promptTemplateService = new PromptTemplateService(supabase);
```

**Used in**:

- `runPreparatoryAnalysis` (line 209) - Get preparatory analysis prompt
- `extractProjectContext` (line 1008) - Get context system prompt
- `extractTasks` (line 1110) - Get task extraction prompt

### OperationsExecutor (Constructor Line 77)

```typescript
this.operationsExecutor = new OperationsExecutor(supabase);
```

**Used in**:

- `processBrainDump` (line 429) - Auto-execute operations if enabled

### TaskTimeSlotFinder (Constructor Line 79)

```typescript
this.taskTimeSlotFinder = new TaskTimeSlotFinder(supabase);
```

**Used in**:

- `extractTasks` (line 1187) - Schedule tasks with start_date
- `adjustTaskScheduledDateTime` (line 806) - Find available time slots

### ProjectDataFetcher (Constructor Line 81)

```typescript
this.projectDataFetcher = new ProjectDataFetcher(supabase);
```

**Used in**:

- `processBrainDump` (line 341) - Get full project data with relations
- Helper for fetching project, tasks, phases, notes

### BrainDumpStatusService (Constructor Line 80)

```typescript
this.statusService = new BrainDumpStatusService(supabase);
```

**Used in**:

- `processBrainDump` (line 459) - Update to 'saved' status after execution

## 5. Test Migration Guide

### Current Test State

- Location: `/apps/web/src/lib/utils/braindump-processor.test.ts`
- Current tests: Promise.allSettled validation logic (lines 4-537)
- Status: **Tests are NOT using BrainDumpProcessor class** - they test validation helpers

### What Tests Need

**Current tests are CORRECT** - they test the Promise.allSettled merge logic in isolation, which is a good testing practice. The tests don't actually need BrainDumpProcessor mocking because they test the validation patterns, not the full processor.

**However, if you want to test the full BrainDumpProcessor**:

#### Mock Setup Pattern

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrainDumpProcessor } from './braindump-processor';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('BrainDumpProcessor', () => {
	let processor: BrainDumpProcessor;
	let mockSupabase: any;
	let mockSmartLLMService: any;

	beforeEach(() => {
		// Mock Supabase
		mockSupabase = {
			from: vi.fn().mockReturnValue({
				insert: vi.fn().mockResolvedValue({ data: null, error: null }),
				update: vi.fn().mockReturnValue({
					eq: vi.fn().mockResolvedValue({ data: null, error: null })
				})
			})
		};

		// Create processor
		processor = new BrainDumpProcessor(mockSupabase);

		// Mock SmartLLMService's getJSONResponse
		mockSmartLLMService = {
			getJSONResponse: vi.fn()
		};

		// Replace the llmService instance
		(processor as any).llmService = mockSmartLLMService;
	});

	// ... tests
});
```

#### Mock SmartLLMService.getJSONResponse

```typescript
// For preparatory analysis (profile: 'fast', operationType: 'brain_dump_context')
mockSmartLLMService.getJSONResponse.mockResolvedValueOnce({
	analysis_summary: 'Test analysis',
	braindump_classification: 'task-focused',
	needs_context_update: false,
	context_indicators: [],
	relevant_task_ids: ['task-1', 'task-2'],
	task_indicators: {},
	new_tasks_detected: true,
	confidence_level: 'high',
	processing_recommendation: {
		skip_context: true, // Test optimization
		skip_tasks: false,
		reason: 'Only task updates needed'
	}
});

// For context extraction (profile: 'balanced', operationType: 'brain_dump_context')
mockSmartLLMService.getJSONResponse.mockResolvedValueOnce({
	title: 'Test Project',
	summary: 'Project summary',
	insights: 'Key insights',
	tags: ['test'],
	operations: [
		{
			table: 'projects',
			operation: 'create',
			data: { name: 'Test' },
			ref: 'new-project-1'
		}
	],
	metadata: {}
});

// For task extraction (profile: 'balanced', operationType: 'brain_dump_tasks')
mockSmartLLMService.getJSONResponse.mockResolvedValueOnce({
	title: 'Tasks',
	summary: 'Task summary',
	insights: '',
	tags: [],
	operations: [
		{
			table: 'tasks',
			operation: 'create',
			data: { title: 'Task 1', project_ref: 'new-project-1' }
		},
		{
			table: 'tasks',
			operation: 'create',
			data: { title: 'Task 2', project_ref: 'new-project-1' }
		}
	],
	questionAnalysis: { q1: { wasAnswered: true } },
	projectQuestions: [{ question: 'What is the deadline?' }]
});
```

### Test Scenarios to Cover

#### 1. New Project Creation

```typescript
it('should create new project with tasks via dual processing', async () => {
	// Mock all three LLM calls
	// 1. No preparatory analysis (new project)
	// 2. Context extraction → creates project
	// 3. Task extraction → creates tasks with project_ref

	const result = await processor.processBrainDump({
		brainDump: 'Build a todo app with tasks',
		userId: 'user-1',
		brainDumpId: 'dump-1',
		options: {}
	});

	expect(result.operations).toHaveLength(3); // 1 project + 2 tasks
	expect(result.operations[0].table).toBe('projects');
	expect(result.operations[1].data.project_ref).toBe('new-project-1');
});
```

#### 2. Existing Project Updates

```typescript
it('should run preparatory analysis and optimize task filtering', async () => {
	// Mock ProjectDataFetcher
	vi.spyOn(processor['projectDataFetcher'], 'getFullProjectData').mockResolvedValue({
		fullProjectWithRelations: {
			id: 'project-1',
			name: 'Existing Project',
			tasks: [
				{ id: 'task-1', title: 'Old Task 1' },
				{ id: 'task-2', title: 'Old Task 2' },
				{ id: 'task-3', title: 'Old Task 3' }
			]
		}
	});

	// Mock preparatory analysis returning only relevant tasks
	mockSmartLLMService.getJSONResponse.mockResolvedValueOnce({
		relevant_task_ids: ['task-1', 'task-2'] // Only 2 of 3 tasks
		// ...
	});

	// Mock context extraction (skipped due to recommendation)
	// Mock task extraction (receives only 2 tasks)

	const result = await processor.processBrainDump({
		brainDump: 'Update tasks',
		userId: 'user-1',
		selectedProjectId: 'project-1',
		brainDumpId: 'dump-1'
	});

	// Verify task extraction was called with filtered tasks
	expect(mockSmartLLMService.getJSONResponse).toHaveBeenCalledWith(
		expect.objectContaining({
			operationType: 'brain_dump_tasks'
			// userPrompt should contain only 2 tasks, not 3
		})
	);
});
```

#### 3. Dual Processing with Failures

```typescript
it('should handle context success + task failure gracefully', async () => {
  // Mock prep analysis
  mockSmartLLMService.getJSONResponse.mockResolvedValueOnce({...});

  // Mock context success
  mockSmartLLMService.getJSONResponse.mockResolvedValueOnce({
    operations: [{ table: 'projects', operation: 'update', data: { id: 'p1' } }]
  });

  // Mock task failure
  mockSmartLLMService.getJSONResponse.mockRejectedValueOnce(
    new Error('Task extraction timeout')
  );

  const result = await processor.processBrainDump({
    brainDump: 'Test',
    userId: 'user-1',
    selectedProjectId: 'p1',
    brainDumpId: 'dump-1'
  });

  // Should have partial success
  expect(result.operations.length).toBeGreaterThan(0);
  expect(result.metadata.partialFailure).toBe(true);
  expect(result.metadata.failureDetails).toContain('Task extraction failed');
});
```

#### 4. Auto-Execution

```typescript
it('should auto-execute operations when enabled', async () => {
	const mockExecutionResult = {
		successful: [{ id: 'op1' }],
		failed: []
	};

	vi.spyOn(processor['operationsExecutor'], 'executeOperations').mockResolvedValue(
		mockExecutionResult
	);

	const result = await processor.processBrainDump({
		brainDump: 'Create project',
		userId: 'user-1',
		brainDumpId: 'dump-1',
		options: { autoExecute: true }
	});

	expect(result.executionResult).toBeDefined();
	expect(result.executionResult.successful).toHaveLength(1);
});
```

#### 5. Question Handling

```typescript
it('should analyze displayed questions and update status', async () => {
	const displayedQuestions = [
		{ id: 'q1', question: 'What is the deadline?' },
		{ id: 'q2', question: 'Who is the client?' }
	];

	// Mock task extraction with question analysis
	mockSmartLLMService.getJSONResponse.mockResolvedValueOnce({
		operations: [],
		questionAnalysis: {
			q1: { wasAnswered: true },
			q2: { wasAnswered: false }
		}
	});

	await processor.processBrainDump({
		brainDump: 'Deadline is next Friday',
		userId: 'user-1',
		displayedQuestions,
		brainDumpId: 'dump-1'
	});

	// Verify question status update
	expect(mockSupabase.from).toHaveBeenCalledWith('project_questions');
});
```

#### 6. Error Handling and Retries

```typescript
it('should retry with powerful model on JSON parse error', async () => {
  // First call returns invalid JSON
  mockSmartLLMService.getJSONResponse.mockRejectedValueOnce(
    new Error('Failed to parse JSON')
  );

  // Retry succeeds (SmartLLMService handles this internally)
  mockSmartLLMService.getJSONResponse.mockResolvedValueOnce({
    operations: [...]
  });

  const result = await processor.processBrainDump({...});

  expect(result.operations.length).toBeGreaterThan(0);
});
```

### Mock All Dependencies

```typescript
beforeEach(() => {
	// Mock all services
	vi.spyOn(processor['activityLogger'], 'logActivity').mockResolvedValue();
	vi.spyOn(processor['errorLogger'], 'logBrainDumpError').mockResolvedValue();
	vi.spyOn(processor['operationsExecutor'], 'executeOperations').mockResolvedValue({
		successful: [],
		failed: []
	});
	vi.spyOn(processor['taskTimeSlotFinder'], 'scheduleTasks').mockResolvedValue([]);
	vi.spyOn(processor['statusService'], 'updateToSaved').mockResolvedValue();
	vi.spyOn(processor['projectDataFetcher'], 'getFullProjectData').mockResolvedValue({
		fullProjectWithRelations: null
	});
});
```

## 6. Key Differences Summary

### LLMPool (Old)

- Worker service only
- Multi-provider failover
- Returns `LLMResponse<T>` with metadata
- Manual JSON parsing required
- Provider-level retry (next provider)

### SmartLLMService (New)

- Web app service
- Profile-based model selection
- Returns direct `T` (parsed)
- Automatic JSON cleaning and retry
- Model-level retry (more powerful model)
- Cost tracking and database logging
- OpenRouter routing and fallback

## 7. Testing Recommendations

1. **Keep current tests** - They test validation logic correctly
2. **Add integration tests** - Full processBrainDump flow with mocks
3. **Test profiles** - Verify correct profile selection for each scenario
4. **Test optimization** - Verify preparatory analysis reduces token usage
5. **Test error handling** - Promise.allSettled, retry logic, partial failures
6. **Test auto-execution** - Verify operations executor integration
7. **Test questions** - Question analysis and status updates

## 8. Related Files

- SmartLLMService: `/apps/web/src/lib/services/smart-llm-service.ts`
- BrainDumpProcessor: `/apps/web/src/lib/utils/braindump-processor.ts`
- Tests: `/apps/web/src/lib/utils/braindump-processor.test.ts`
- Operations Executor: `/apps/web/src/lib/utils/operations-executor.ts`
- Activity Logger: `/apps/web/src/lib/utils/activityLogger.ts`
- Error Logger: `/apps/web/src/lib/services/errorLogger.service.ts`
- Task Time Slot Finder: `/apps/web/src/lib/services/task-time-slot-finder.ts`
- Project Data Fetcher: `/apps/web/src/lib/services/prompts/core/project-data-fetcher.ts`
- Validation: `/apps/web/src/lib/services/prompts/core/validations.ts`
- Prompt Template Service: `/apps/web/src/lib/services/promptTemplate.service.ts`

## 9. Next Steps

1. Review current tests - they're actually testing the right things (validation logic)
2. Decide if you need full integration tests or just keep validation tests
3. If integration tests needed:
    - Create mock factories for SmartLLMService responses
    - Test new project flow
    - Test existing project flow with optimization
    - Test error scenarios and partial failures
    - Test auto-execution
    - Test question handling
4. Consider E2E tests for critical paths (new project creation, existing project updates)
