<!-- TODO: priority 1 -->

## BuildOS Braindump Processing Enhancement: Preparatory Analysis

### Overview

Adding a preparatory LLM analysis step to optimize the existing dual-processing braindump flow for updating existing projects. This analysis determines what data needs updating before running the main processing calls.

### Current State

- User braindumps information about existing projects
- System runs two parallel LLM calls: one for project context updates, one for task extraction
- Both calls receive full project and task data regardless of relevance

### Proposed Enhancement

Add a lightweight preparatory analysis that:

1. Receives braindump text + light project data (no full context) + light task data (id, title, status, start_date, first 100 chars of description)
2. Classifies braindump type: `strategic | tactical | mixed | status_update | unrelated`
3. Identifies which existing tasks are referenced
4. Determines if project context needs updating

### Implementation Changes

#### 1. New Analysis Function

```typescript
runPreparatoryAnalysis(brainDump, lightProject, lightTasks) → PreparatoryAnalysisResult
```

#### 2. Modified Flow (for existing projects only)

```
1. Run preparatory analysis
2. If needs_context_update → Run context extraction with full project
3. If relevant_task_ids.length > 0 → Run task extraction with only relevant tasks
4. Merge results as before
```

#### 3. New SSE Events

- `analysis` event type for streaming progress
- Updated status messages to show analysis phase

#### 4. Benefits

- Reduced tokens by only passing relevant tasks to task extraction
- Skip context processing when braindump is purely tactical
- Better user feedback about what's being processed
- More efficient processing for large projects with many tasks

### Key Files to Modify

- `braindump-processor.ts`: Add `runPreparatoryAnalysis()` and modify `processWithStrategy()`
- `promptTemplateService.ts`: Add `getPreparatoryAnalysisPrompt()`
- `sse-messages.ts`: Add `SSEAnalysis` type
- `stream/+server.ts`: Update streaming logic for analysis phase

### Response Structure

Returns `PreparatoryAnalysisResult` with:

- Classification of content type
- Boolean for context update needed
- Array of relevant task IDs
- Processing recommendations

This enhancement optimizes token usage and processing time while providing better visibility into what's being processed.

Here is notes on the preparatory analysis prompt and flow:

## 1. Preparatory Analysis Prompt

```typescript
export function getPreparatoryAnalysisPrompt(
	project: Partial<Database['public']['Tables']['projects']['Row']>,
	tasks: Array<{
		id: string;
		title: string;
		status: string;
		start_date: string | null;
		description_preview: string;
	}>
): string {
	return `You are a BuildOS braindump analyzer. Your job is to analyze a braindump and determine what existing data needs to be updated.

## Your Task:
Analyze the braindump to identify:
1. Whether the project context needs strategic updates
2. Which existing tasks are referenced or need updating
3. The nature of the braindump content

## Current Project Overview:
Project: "${project.name}"
Description: ${project.description || 'No description'}
Status: ${project.status}
Tags: ${project.tags?.join(', ') || 'None'}
Start Date: ${project.start_date || 'Not set'}
End Date: ${project.end_date || 'Not set'}
Has Context: ${project.context ? 'Yes (existing strategic document)' : 'No'}
Executive Summary: ${project.executive_summary || 'None'}

## Existing Tasks (${tasks.length} total):
${tasks
	.map(
		(t) => `- [${t.status}] ${t.title} (ID: ${t.id})${t.start_date ? ` - ${t.start_date}` : ''}
  Preview: ${t.description_preview}`
	)
	.join('\n')}

## Analysis Criteria:

### Context Update Indicators (Strategic):
- Vision, mission, or goal changes
- Strategic pivots or new directions
- Scope expansions or reductions
- New insights about approach or methodology
- Market/competitive intelligence
- Stakeholder changes
- Risk identification
- Long-term planning updates
- Resource or budget discussions
- Architectural decisions

### Task-Related Indicators (Tactical):
- Specific task mentions by name or description
- Status updates on existing work
- Bug reports or fixes
- Implementation details
- Short-term action items
- Progress reports
- Technical specifications
- Daily/weekly activities
- Task dependencies or blockers

## Classification Rules:
- **strategic**: Primarily about project vision, direction, approach, or long-term planning
- **tactical**: Primarily about specific tasks, implementation, or short-term execution
- **mixed**: Contains both strategic and tactical elements
- **status_update**: Simple progress reports or status updates
- **unrelated**: Content doesn't relate to this project

## Task Matching:
Identify tasks that are likely referenced by looking for:
- Direct title matches or very similar titles
- Date references matching task dates
- Description keywords that align with task content
- Status changes mentioned for specific work
- Dependencies or relationships between tasks

## Output JSON Structure:
\`\`\`json
{
  "analysis_summary": "Brief 1-2 sentence summary of the braindump content",
  "braindump_classification": "strategic|tactical|mixed|status_update|unrelated",
  "needs_context_update": boolean,
  "context_indicators": [
    "List of strategic elements found that suggest context update needed"
  ],
  "relevant_task_ids": [
    "task-id-1",
    "task-id-2"
  ],
  "task_indicators": {
    "task-id-1": "Why this task is relevant (e.g., 'mentioned API integration task')",
    "task-id-2": "Why this task is relevant"
  },
  "new_tasks_detected": boolean,
  "confidence_level": "high|medium|low",
  "processing_recommendation": {
    "skip_context": boolean,
    "skip_tasks": boolean,
    "reason": "Explanation for any skip recommendations"
  }
}
\`\`\`

Analyze the braindump and determine what needs to be processed.`;
}
```

## 2. JSON Response Structure

```typescript
export interface PreparatoryAnalysisResult {
	analysis_summary: string;
	braindump_classification: 'strategic' | 'tactical' | 'mixed' | 'status_update' | 'unrelated';
	needs_context_update: boolean;
	context_indicators: string[];
	relevant_task_ids: string[];
	task_indicators: Record<string, string>;
	new_tasks_detected: boolean;
	confidence_level: 'high' | 'medium' | 'low';
	processing_recommendation: {
		skip_context: boolean;
		skip_tasks: boolean;
		reason: string;
	};
}
```

## 3. New SSE Message Types

Add these to your sse-messages.ts:

```typescript
// Preparatory analysis message
export interface SSEAnalysis extends BaseSSEMessage {
	type: 'analysis';
	message: string;
	data: {
		status: 'pending' | 'processing' | 'completed' | 'failed';
		result?: PreparatoryAnalysisResult;
		error?: string;
	};
}

// Update the StreamingMessage union
export type StreamingMessage =
	| SSEAnalysis // Add this
	| SSEContextProgress
	| SSETasksProgress
	| SSEStatus
	| SSEContextUpdateRequired
	| SSERetry
	| SSEComplete
	| SSEError;

// Add type guard
export function isAnalysis(msg: StreamingMessage): msg is SSEAnalysis {
	return msg.type === 'analysis';
}
```

## 4. Updated SSE Streaming Flow

```typescript
// Streaming flow for existing project updates with preparatory analysis

async function processExistingProjectWithAnalysis() {
	// 1. Initial status - Analysis phase
	await sendSSEMessage({
		type: 'status',
		message: 'Starting braindump analysis...',
		data: {
			processes: ['analysis'],
			contentLength: brainDump.length,
			isDualProcessing: false,
			source: 'preparatory-analysis'
		}
	});

	// 2. Analysis in progress
	await sendSSEMessage({
		type: 'analysis',
		message: 'Analyzing braindump content and identifying relevant data...',
		data: {
			status: 'processing'
		}
	});

	// 3. Analysis complete
	const analysisResult = await runPreparatoryAnalysis();
	await sendSSEMessage({
		type: 'analysis',
		message: `Analysis complete: ${analysisResult.braindump_classification} content detected`,
		data: {
			status: 'completed',
			result: analysisResult
		}
	});

	// 4. Determine what to process based on analysis
	const processes = [];
	if (
		analysisResult.needs_context_update &&
		!analysisResult.processing_recommendation.skip_context
	) {
		processes.push('context');
	}
	if (
		(analysisResult.relevant_task_ids.length > 0 || analysisResult.new_tasks_detected) &&
		!analysisResult.processing_recommendation.skip_tasks
	) {
		processes.push('tasks');
	}

	// 5. Update status for main processing
	await sendSSEMessage({
		type: 'status',
		message: `Processing ${processes.join(' and ')}...`,
		data: {
			processes,
			contentLength: brainDump.length,
			isDualProcessing: processes.length === 2,
			source: 'main-processing'
		}
	});

	// 6. Context processing (if needed)
	if (processes.includes('context')) {
		await sendSSEMessage({
			type: 'contextProgress',
			message: 'Updating project context...',
			data: { status: 'processing' }
		});

		// Process context with full project data
		const contextResult = await processContext();

		await sendSSEMessage({
			type: 'contextProgress',
			message: 'Project context updated',
			data: {
				status: 'completed',
				preview: contextResult
			}
		});
	}

	// 7. Task processing (if needed)
	if (processes.includes('tasks')) {
		await sendSSEMessage({
			type: 'tasksProgress',
			message: `Processing ${analysisResult.relevant_task_ids.length} relevant tasks...`,
			data: { status: 'processing' }
		});

		// Process tasks with only relevant tasks
		const tasksResult = await processTasks(analysisResult.relevant_task_ids);

		await sendSSEMessage({
			type: 'tasksProgress',
			message: 'Tasks processed',
			data: {
				status: 'completed',
				preview: tasksResult
			}
		});
	}

	// 8. Final completion
	await sendSSEMessage({
		type: 'complete',
		message: 'Braindump processing complete',
		result: finalResult
	});
}
```

## 5. Integration Points in BrainDumpProcessor

```typescript
// Add to BrainDumpProcessor class

private async runPreparatoryAnalysis(
  brainDump: string,
  project: ProjectWithRelations,
  userId: string
): Promise<PreparatoryAnalysisResult> {
  // Prepare light task data
  const lightTasks = (project.tasks || []).map(task => ({
    id: task.id,
    title: task.title,
    status: task.status,
    start_date: task.start_date,
    description_preview: task.description?.substring(0, 100) || ''
  }));

  // Prepare light project data (exclude full context)
  const lightProject = {
    ...project,
    context: project.context ? 'Yes (existing strategic document)' : 'No'
  };

  const systemPrompt = getPreparatoryAnalysisPrompt(lightProject, lightTasks);
  const userPrompt = `Analyze this braindump:\n\n${brainDump}`;

  const response = await this.llmService.getJSONResponse({
    systemPrompt,
    userPrompt,
    userId,
    profile: 'fast', // Use faster model for analysis
    operationType: 'brain_dump_analysis'
  });

  return response.result as PreparatoryAnalysisResult;
}

// Modified processWithStrategy to use analysis results
private async processWithStrategyWithAnalysis({
  brainDump,
  userId,
  selectedProjectId,
  displayedQuestions,
  options,
  brainDumpId,
  analysisResult
}: {
  // ... existing params
  analysisResult: PreparatoryAnalysisResult
}): Promise<BrainDumpParseResult> {
  // Only fetch relevant tasks based on analysis
  const relevantTasks = analysisResult.relevant_task_ids.length > 0
    ? await this.fetchTasksByIds(analysisResult.relevant_task_ids, userId)
    : [];

  // Skip context processing if not needed
  if (analysisResult.processing_recommendation.skip_context) {
    // Process only tasks
  }

  // Continue with optimized processing...
}
```

This approach will:

1. First analyze the braindump to understand its content
2. Identify which tasks are relevant (avoiding loading all tasks)
3. Determine if context update is needed
4. Stream progress updates at each stage
5. Only process what's necessary based on the analysis

The benefit is reduced token usage in subsequent calls and more targeted processing based on the braindump content.
