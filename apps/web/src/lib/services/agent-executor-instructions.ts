// apps/web/src/lib/services/agent-executor-instructions.ts
/**
 * Agent Executor Instruction Generator
 * Provides just-in-time instructions for spawning executor agents
 */

import type { EnhancedPlannerContext } from '$lib/types/agent-chat-enhancement';

export interface ExecutorTask {
	id: string;
	description: string;
	goal: string;
	constraints?: string[];
	contextData?: any;
	requiredTools: string[];
	maxTokens: number;
}

export interface ExecutorPlan {
	steps: Array<{
		stepNumber: number;
		description: string;
		requiresExecutor: boolean;
		requiredTools: string[];
		successCriteria: string;
		requiresProjectContext?: boolean;
		requiresHistoricalData?: boolean;
	}>;
	requiresParallelExecution: boolean;
}

export class ExecutorInstructionGenerator {
	/**
	 * Generate instructions for spawning executor agents
	 */
	generateInstructions(plan: ExecutorPlan, context: EnhancedPlannerContext): string {
		const executorSteps = plan.steps.filter((s) => s.requiresExecutor);

		if (executorSteps.length === 0) {
			return ''; // No executors needed
		}

		return `## Executor Agent Configuration

You need to spawn ${executorSteps.length} executor agent(s) for this task.

### Spawning Pattern
${plan.requiresParallelExecution ? 'PARALLEL: Spawn all executors simultaneously' : 'SEQUENTIAL: Spawn executors one at a time'}

### Token Budget
- Each executor has a maximum of 1,500 tokens
- System prompt: ~300 tokens
- Task context: ~400 tokens
- Response buffer: ~800 tokens

### Executor Spawn Template
\`\`\`typescript
const executorConfig = {
  task: {
    id: crypto.randomUUID(),
    description: "Specific, actionable task description",
    goal: "Clear success criteria in one sentence",
    constraints: [
      "Must complete within 30 seconds",
      "Only use provided tools",
      "Return structured data"
    ],
    contextData: {
      // Minimal required data only
      entityId: "${context.metadata.entityId || 'null'}",
      contextType: "${context.metadata.contextType}"
    }
  },
  tools: ["tool1", "tool2"], // Minimum required tools only
  maxTokens: 1500,
  timeout: 30000,
  model: "deepseek-coder" // Optimized for task execution
};
\`\`\`

### Specific Executors Required:

${executorSteps.map((step, i) => this.generateExecutorSpec(step, i + 1, context)).join('\n\n')}

### Coordination Strategy
${this.generateCoordinationStrategy(plan)}

### Error Handling
1. If executor fails, retry ONCE with refined instructions
2. If second attempt fails, log error and continue with partial results
3. Always return some response, even if incomplete

### Success Validation
- Each executor must return a result object with:
  - \`success\`: boolean
  - \`data\`: any (the actual results)
  - \`entities_accessed\`: string[] (IDs of entities touched)
  - \`error\`: string (if failed)

### Example Executor Response
\`\`\`json
{
  "success": true,
  "data": {
    "tasks": [/* task objects */],
    "total": 15
  },
  "entities_accessed": ["task-123", "task-456"],
  "error": null
}
\`\`\``;
	}

	/**
	 * Generate specification for a single executor
	 */
	private generateExecutorSpec(
		step: any,
		index: number,
		context: EnhancedPlannerContext
	): string {
		return `#### Executor ${index}: ${step.description}

**Task Configuration:**
\`\`\`typescript
{
  description: "${step.description}",
  goal: "${step.successCriteria}",
  constraints: ${JSON.stringify(step.constraints || ['Complete within 30s'])},
  requiredTools: ${JSON.stringify(step.requiredTools)},
  contextData: ${this.generateMinimalContext(step, context)}
}
\`\`\`

**Expected Output:**
- ${step.successCriteria}
- Return structured data that can be used by subsequent steps
- Include all entity IDs accessed`;
	}

	/**
	 * Generate minimal context for an executor
	 */
	private generateMinimalContext(step: any, context: EnhancedPlannerContext): string {
		const minimal: any = {
			contextType: context.metadata.contextType
		};

		if (step.requiresProjectContext && context.metadata.entityId) {
			minimal.projectId = context.metadata.entityId;

			// Add facets if available
			if (context.ontologyContext?.metadata?.facets) {
				minimal.facets = context.ontologyContext.metadata.facets;
			}
		}

		if (step.requiresHistoricalData) {
			minimal.recentMessageCount = 2;
			minimal.lastTurnSummary = context.lastTurnContext?.summary || null;
		}

		// Add entity IDs from last turn if relevant
		if (context.lastTurnContext?.entities) {
			const relevantEntities = Object.entries(context.lastTurnContext.entities)
				.filter(([_, value]) => value !== undefined)
				.reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

			if (Object.keys(relevantEntities).length > 0) {
				minimal.previousEntities = relevantEntities;
			}
		}

		return JSON.stringify(minimal, null, 2);
	}

	/**
	 * Generate coordination strategy for multiple executors
	 */
	private generateCoordinationStrategy(plan: ExecutorPlan): string {
		if (plan.requiresParallelExecution) {
			return `### Parallel Execution Strategy
1. Spawn all executors simultaneously using Promise.all()
2. Set a collective timeout of 45 seconds
3. Collect all results, even if some fail
4. Merge results intelligently:
   - Combine entity lists
   - Aggregate data by type
   - Preserve error states
5. Return unified response to user`;
		}

		return `### Sequential Execution Strategy
1. Execute each step in order
2. Pass results from step N to step N+1
3. If a critical step fails, stop execution
4. Build cumulative result object
5. Return complete chain of results`;
	}

	/**
	 * Generate example task for current context
	 */
	generateExampleTask(taskType: string, context: EnhancedPlannerContext): ExecutorTask {
		const examples: Record<string, ExecutorTask> = {
			list_tasks: {
				id: crypto.randomUUID(),
				description: 'List all active tasks for the current project',
				goal: 'Return array of task objects with id, name, status',
				constraints: ['Only active tasks', 'Max 50 results'],
				contextData: {
					projectId: context.metadata.entityId,
					status_filter: 'active'
				},
				requiredTools: ['list_tasks', 'get_task_details'],
				maxTokens: 1000
			},
			analyze_project: {
				id: crypto.randomUUID(),
				description: 'Analyze project health and completion status',
				goal: 'Return metrics on task completion, blockers, and timeline',
				constraints: ['Include all entity types', 'Generate summary stats'],
				contextData: {
					projectId: context.metadata.entityId,
					facets: context.ontologyContext?.metadata?.facets
				},
				requiredTools: ['get_project_details', 'list_tasks', 'list_goals'],
				maxTokens: 1500
			},
			search_documents: {
				id: crypto.randomUUID(),
				description: 'Search for relevant documents matching query',
				goal: 'Return document IDs and summaries matching search terms',
				constraints: ['Search titles and content', 'Relevance ranked'],
				contextData: {
					projectId: context.metadata.entityId,
					searchTerms: ['requirements', 'specification']
				},
				requiredTools: ['search_documents', 'get_document_details'],
				maxTokens: 1200
			}
		};

		const fallback = examples['list_tasks'];
		if (!fallback) {
			throw new Error('Executor examples missing default task');
		}

		return examples[taskType] ?? fallback;
	}
}
