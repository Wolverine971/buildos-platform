# BuildOS Agent Chat Enhancement - Implementation Specification

## Document Metadata

- **Version**: 1.0.0
- **Date**: 2025-11-05
- **Author**: System Architect
- **Purpose**: Complete implementation guide for AI agent to enhance chat system
- **Estimated Implementation Time**: 40-60 hours
- **Priority**: High
- **Dependencies**: Existing BuildOS codebase with ontology system

## Status Update (2025-11-05)

- Refactored agentic chat architecture is now assembled through `apps/web/src/lib/services/agentic-chat/index.ts` and can be toggled via `ENABLE_NEW_AGENTIC_CHAT` inside `apps/web/src/routes/api/agent/stream/+server.ts`.
- Streaming contract gained plan and executor lifecycle events; ensure consuming clients handle `step_start`, `step_complete`, `executor_spawned`, and `executor_result` before enabling the feature flag broadly.
- Outstanding work: migrate integration tests to cover the new orchestrator path and validate Supabase persistence using real fixtures prior to production rollout.

## Executive Brief for Implementing Agent

You are tasked with enhancing the BuildOS agent chat system to integrate with the newly created ontology system. The chat currently works but lacks awareness of the project ontology structure (projects, tasks, plans, goals, documents, outputs) stored in `onto_*` database tables.

### Critical Context

1. **Current State**: Multi-agent chat system with planner-executor pattern is working
2. **Problem**: Ontology system exists but is completely disconnected from chat
3. **Solution**: Connect ontology, add smart strategies, implement persistent context
4. **Key Innovation**: Last turn context that persists between messages

### Your Success Criteria

- [x] Chat loads ontology data (projects, tasks, etc.) into context ✅
- [x] Three strategies work: planner_stream, planner_stream, ask_clarifying_questions ✅
- [x] Last turn context passes between frontend and backend ✅
- [x] Frontend displays strategy indicators and clarifying questions ✅
- [ ] Token compression verified working under 10K limit (NEEDS MANUAL TESTING)
- [ ] All tests pass (NEEDS UNIT TESTS)

## Pre-Implementation Checklist

### Verify These Files Exist

```bash
# Frontend
✓ apps/web/src/lib/components/agent/AgentChatModal.svelte
✓ apps/web/src/lib/components/ui/Modal.svelte
✓ apps/web/src/lib/components/ui/Button.svelte

# API
✓ apps/web/src/routes/api/agent/stream/+server.ts

# Services
✓ apps/web/src/lib/services/agent-context-service.ts
✓ apps/web/src/lib/services/chat-context-service.ts
✓ apps/web/src/lib/services/agent-planner-service.ts
✓ apps/web/src/lib/services/agent-executor-service.ts
✓ apps/web/src/lib/services/chat-compression-service.ts

# Ontology (Currently Disconnected)
✓ apps/web/src/lib/services/ontology/instantiation.service.ts
✓ apps/web/src/lib/services/ontology/template-resolver.service.ts

# Database Schema
✓ apps/web/src/lib/database.schema.ts
```

### Verify Database Tables

```sql
-- These ontology tables exist but aren't used by chat:
SELECT * FROM onto_projects LIMIT 1;
SELECT * FROM onto_tasks LIMIT 1;
SELECT * FROM onto_goals LIMIT 1;
SELECT * FROM onto_plans LIMIT 1;
SELECT * FROM onto_documents LIMIT 1;
SELECT * FROM onto_outputs LIMIT 1;
SELECT * FROM onto_edges LIMIT 1;
```

## Implementation Order (CRITICAL - Follow Exactly)

### Phase 1: Create Foundation Files

1. Create ontology context loader
2. Create type definitions
3. Create executor instruction generator

### Phase 2: Modify Services

1. Update agent-context-service.ts
2. Update chat-context-service.ts
3. Update agent-planner-service.ts
4. Verify chat-compression-service.ts

### Phase 3: Update API

1. Modify /api/agent/stream endpoint
2. Add last turn context generation
3. Add ontology loading

### Phase 4: Frontend Integration

1. Update AgentChatModal.svelte
2. Add clarifying questions UI
3. Add strategy indicators

### Phase 5: Testing & Validation

1. Unit tests for each service
2. Integration tests for full flow
3. Manual testing checklist

## PHASE 1: Create Foundation Files

### 1.1 Create Type Definitions File

**CREATE NEW FILE**: `apps/web/src/lib/types/agent-chat-enhancement.ts`

```typescript
/**
 * Agent Chat Enhancement Types
 * Central type definitions for ontology-aware chat system
 */

import type { ChatContextType, ChatMessage, LLMMessage } from '@buildos/shared-types';

// ============================================
// LAST TURN CONTEXT
// ============================================

/**
 * Persistent context that passes between conversation turns
 * Contains lightweight pointers to entities and summary of last interaction
 */
export interface LastTurnContext {
	// Brief 10-20 word summary of the last interaction
	summary: string;

	// Entity IDs mentioned or accessed in last turn
	entities: {
		project_id?: string;
		task_ids?: string[];
		plan_id?: string;
		goal_ids?: string[];
		document_id?: string;
		output_id?: string;
	};

	// Context type from last interaction
	context_type: ChatContextType;

	// Tools/data accessed in last turn
	data_accessed: string[];

	// Strategy used in last turn
	strategy_used?: 'planner_stream' | 'ask_clarifying_questions' | 'project_creation';

	// ISO timestamp of last turn
	timestamp: string;
}

// ============================================
// ONTOLOGY CONTEXT
// ============================================

/**
 * Entity relationship graph from ontology edges
 */
export interface EntityRelationships {
	edges: Array<{
		relation: string; // Edge type (e.g., 'has_task', 'has_goal')
		target_kind: string; // Target entity type
		target_id: string; // Target entity ID
		target_name?: string; // Optional resolved name
	}>;
	hierarchy_level: number; // Depth in hierarchy
}

/**
 * Ontology context loaded from onto_* tables
 */
export interface OntologyContext {
	// Context level
	type: 'global' | 'project' | 'element';

	// Main data payload
	data: any;

	// Relationships via edges
	relationships?: EntityRelationships;

	// Metadata about the context
	metadata: {
		entity_count?: Record<string, number>; // Counts by entity type
		last_updated?: string;
		context_document_id?: string; // From props->context_document_id
		facets?: Record<string, any>; // From props->facets
		hierarchy_level?: number;
	};
}

// ============================================
// STRATEGY TYPES
// ============================================

/**
 * Available chat strategies
 */
export enum ChatStrategy {
	PLANNER_STREAM = 'planner_stream', // Autonomous planner loop
	ASK_CLARIFYING = 'ask_clarifying_questions', // Need more info
	PROJECT_CREATION = 'project_creation' // Deterministic project instantiation flow
}

/**
 * Strategy analysis result from planner
 */
export interface StrategyAnalysis {
	primary_strategy: ChatStrategy;
	confidence: number; // 0-1 confidence score
	reasoning: string; // Why this strategy was chosen
	needs_clarification: boolean;
	clarifying_questions?: string[];
	estimated_steps: number;
	required_tools: string[];
	can_complete_directly: boolean;
}

/**
 * Result from executing a research strategy
 */
export interface ResearchResult {
	strategy_used: ChatStrategy;
	data_found: any;
	entities_accessed: string[];
	tools_used: string[];
	needs_followup: boolean;
	followup_questions?: string[];
	success: boolean;
	error?: string;
}

// ============================================
// ENHANCED REQUEST/RESPONSE
// ============================================

/**
 * Enhanced agent stream request with ontology support
 */
export interface EnhancedAgentStreamRequest {
	// Required fields
	message: string;
	context_type: ChatContextType;

	// Optional fields
	session_id?: string;
	entity_id?: string;
	ontologyEntityType?: 'task' | 'plan' | 'goal' | 'document' | 'output';
	lastTurnContext?: LastTurnContext;
	conversation_history?: ChatMessage[];
}

/**
 * SSE events sent during streaming
 */
export type AgentSSEEvent =
	| { type: 'session'; session: any }
	| { type: 'last_turn_context'; context: LastTurnContext }
	| { type: 'strategy_selected'; strategy: ChatStrategy; confidence: number }
	| { type: 'clarifying_questions'; questions: string[] }
	| { type: 'executor_instructions'; instructions: string }
	| { type: 'ontology_loaded'; summary: string }
	| { type: 'analysis'; analysis: any }
	| { type: 'plan_created'; plan: any }
	| { type: 'text'; content: string }
	| { type: 'tool_call'; tool_call: any }
	| { type: 'tool_result'; result: any }
	| { type: 'done' }
	| { type: 'error'; error: string };

// ============================================
// PLANNER CONTEXT EXTENSIONS
// ============================================

/**
 * Enhanced planner context with ontology
 */
export interface EnhancedPlannerContext {
	systemPrompt: string;
	conversationHistory: LLMMessage[];
	locationContext: string;
	locationMetadata?: any;
	ontologyContext?: OntologyContext;
	lastTurnContext?: LastTurnContext;
	userProfile?: string;
	availableTools: any[];
	metadata: {
		sessionId: string;
		contextType: ChatContextType;
		entityId?: string;
		totalTokens: number;
		hasOntology: boolean;
	};
}

export interface EnhancedBuildPlannerContextParams {
	sessionId: string;
	userId: string;
	conversationHistory: ChatMessage[];
	userMessage: string;
	contextType: ChatContextType;
	entityId?: string;
	lastTurnContext?: LastTurnContext;
	ontologyContext?: OntologyContext;
}
```

### 1.2 Create Ontology Context Loader

**CREATE NEW FILE**: `apps/web/src/lib/services/ontology-context-loader.ts`

```typescript
/**
 * Ontology Context Loader Service
 * Loads project ontology data (projects, tasks, goals, etc.) for chat context
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { OntologyContext, EntityRelationships } from '$lib/types/agent-chat-enhancement';

export class OntologyContextLoader {
	constructor(private supabase: SupabaseClient<Database>) {}

	/**
	 * Load global context - overview of all projects
	 */
	async loadGlobalContext(): Promise<OntologyContext> {
		console.log('[OntologyLoader] Loading global context');

		// Get recent projects
		const { data: projects, error: projectError } = await this.supabase
			.from('onto_projects')
			.select('id, name, description, state_key, type_key')
			.limit(10)
			.order('created_at', { ascending: false });

		if (projectError) {
			console.error('[OntologyLoader] Failed to load projects:', projectError);
		}

		// Get total counts
		const { count: totalProjects } = await this.supabase
			.from('onto_projects')
			.select('*', { count: 'exact', head: true });

		// Get entity type counts
		const entityCounts = await this.getGlobalEntityCounts();

		return {
			type: 'global',
			data: {
				recent_projects: projects || [],
				total_projects: totalProjects || 0,
				available_types: ['project', 'task', 'plan', 'goal', 'document', 'output']
			},
			metadata: {
				entity_count: entityCounts,
				last_updated: new Date().toISOString()
			}
		};
	}

	/**
	 * Load project-specific context with relationships
	 */
	async loadProjectContext(projectId: string): Promise<OntologyContext> {
		console.log('[OntologyLoader] Loading project context for:', projectId);

		// Load project with props
		const { data: project, error } = await this.supabase
			.from('onto_projects')
			.select('*')
			.eq('id', projectId)
			.single();

		if (error || !project) {
			console.error('[OntologyLoader] Failed to load project:', error);
			throw new Error(`Project ${projectId} not found`);
		}

		// Extract facets and context_document_id (column takes precedence, props kept for back-compat)
		const props = (project.props as any) || {};
		const facets = props.facets || null;
		const contextDocumentId = project.context_document_id || props.context_document_id || null;

		// Load relationships
		const relationships = await this.loadProjectRelationships(projectId);

		// Get entity counts
		const entityCounts = await this.getProjectEntityCounts(projectId);

		return {
			type: 'project',
			data: {
				id: project.id,
				name: project.name,
				description: project.description,
				state_key: project.state_key,
				type_key: project.type_key,
				props: project.props,
				created_at: project.created_at
			},
			relationships,
			metadata: {
				entity_count: entityCounts,
				context_document_id: contextDocumentId,
				facets: facets,
				last_updated: new Date().toISOString()
			}
		};
	}

	/**
	 * Load element-specific context (task, goal, plan, etc.)
	 */
	async loadElementContext(
		elementType: 'task' | 'plan' | 'goal' | 'document' | 'output',
		elementId: string
	): Promise<OntologyContext> {
		console.log('[OntologyLoader] Loading element context:', elementType, elementId);

		// Load the element
		const element = await this.loadElement(elementType, elementId);

		if (!element) {
			throw new Error(`${elementType} ${elementId} not found`);
		}

		// Find parent project
		const parentProject = await this.findParentProject(elementId);

		// Load element relationships
		const relationships = await this.loadElementRelationships(elementId);

		return {
			type: 'element',
			data: {
				element_type: elementType,
				element: element,
				parent_project: parentProject
					? {
							id: parentProject.id,
							name: parentProject.name,
							state: parentProject.state_key
						}
					: null
			},
			relationships,
			metadata: {
				hierarchy_level: await this.getHierarchyLevel(elementId),
				last_updated: new Date().toISOString()
			}
		};
	}

> **Migration note**
> Legacy project migrations now always emit a `document.project.context` row and populate `onto_projects.context_document_id`. Dry-run previews surface the exact Markdown payload even though the DB write is skipped, so agent tooling can inspect the narrative before approving.
>
> When tasks migrate, the pipeline also snapshots `task_calendar_events` into `onto_events` and emits a `task → event` edge with `rel: has_event`. This gives the chat orchestrator a deterministic graph path from work items to their scheduled sessions without bespoke joins.
>
> Project type selection is now LLM-driven: migrations classify the correct `{domain}.{deliverable}[.{variant}]` template (creating one if necessary) and map the legacy narrative into the template schema before inserting the ontology project. Agents can rely on `props.template_summary` and `props.template_fields` for validated structure.

	/**
	 * Load a specific element from its table
	 */
	private async loadElement(type: string, id: string): Promise<any> {
		// Map type to table name (pluralize)
		const tableMap: Record<string, string> = {
			task: 'onto_tasks',
			plan: 'onto_plans',
			goal: 'onto_goals',
			document: 'onto_documents',
			output: 'onto_outputs'
		};

		const table = tableMap[type];
		if (!table) {
			throw new Error(`Unknown element type: ${type}`);
		}

		const { data, error } = await this.supabase.from(table).select('*').eq('id', id).single();

		if (error) {
			console.error(`[OntologyLoader] Failed to load ${type}:`, error);
			return null;
		}

		return data;
	}

	/**
	 * Load relationships for a project
	 */
	private async loadProjectRelationships(projectId: string): Promise<EntityRelationships> {
		const { data: edges, error } = await this.supabase
			.from('onto_edges')
			.select('*')
			.eq('src_id', projectId)
			.limit(50); // Limit to prevent overwhelming context

		if (error) {
			console.error('[OntologyLoader] Failed to load edges:', error);
			return { edges: [], hierarchy_level: 0 };
		}

		return {
			edges: (edges || []).map((e) => ({
				relation: e.rel,
				target_kind: e.dst_kind,
				target_id: e.dst_id,
				target_name: undefined // Will be resolved on demand
			})),
			hierarchy_level: 0
		};
	}

	/**
	 * Load relationships for an element
	 */
	private async loadElementRelationships(elementId: string): Promise<EntityRelationships> {
		// Get both incoming and outgoing edges
		const { data: edges, error } = await this.supabase
			.from('onto_edges')
			.select('*')
			.or(`src_id.eq.${elementId},dst_id.eq.${elementId}`)
			.limit(20);

		if (error) {
			console.error('[OntologyLoader] Failed to load element edges:', error);
			return { edges: [], hierarchy_level: 1 };
		}

		const relationships = (edges || []).map((e) => {
			const isSource = e.src_id === elementId;
			return {
				relation: isSource ? e.rel : `inverse_${e.rel}`,
				target_kind: isSource ? e.dst_kind : e.src_kind,
				target_id: isSource ? e.dst_id : e.src_id,
				target_name: undefined
			};
		});

		return {
			edges: relationships,
			hierarchy_level: 1
		};
	}

	/**
	 * Find parent project for an element
	 */
	private async findParentProject(elementId: string): Promise<any> {
		// Direct check - is there a project->element edge?
		const { data: directEdge } = await this.supabase
			.from('onto_edges')
			.select('src_id, src_kind')
			.eq('dst_id', elementId)
			.eq('src_kind', 'project')
			.single();

		if (directEdge) {
			const { data: project } = await this.supabase
				.from('onto_projects')
				.select('id, name, state_key')
				.eq('id', directEdge.src_id)
				.single();
			return project;
		}

		// Traverse up through intermediate nodes (max 3 levels)
		return this.traverseToProject(elementId, 3);
	}

	/**
	 * Traverse up the hierarchy to find a project
	 */
	private async traverseToProject(elementId: string, maxDepth: number): Promise<any> {
		if (maxDepth <= 0) return null;

		const { data: edges } = await this.supabase
			.from('onto_edges')
			.select('src_id, src_kind')
			.eq('dst_id', elementId);

		for (const edge of edges || []) {
			if (edge.src_kind === 'project') {
				const { data: project } = await this.supabase
					.from('onto_projects')
					.select('id, name, state_key')
					.eq('id', edge.src_id)
					.single();
				return project;
			}

			// Recurse
			const parent = await this.traverseToProject(edge.src_id, maxDepth - 1);
			if (parent) return parent;
		}

		return null;
	}

	/**
	 * Get entity counts for a project
	 */
	private async getProjectEntityCounts(projectId: string): Promise<Record<string, number>> {
		const { data: edges } = await this.supabase
			.from('onto_edges')
			.select('dst_kind')
			.eq('src_id', projectId);

		const counts: Record<string, number> = {};
		(edges || []).forEach((edge) => {
			counts[edge.dst_kind] = (counts[edge.dst_kind] || 0) + 1;
		});

		return counts;
	}

	/**
	 * Get global entity counts
	 */
	private async getGlobalEntityCounts(): Promise<Record<string, number>> {
		const counts: Record<string, number> = {};

		// Count each entity type
		const tables = [
			'onto_projects',
			'onto_tasks',
			'onto_goals',
			'onto_plans',
			'onto_documents',
			'onto_outputs'
		];

		for (const table of tables) {
			const { count } = await this.supabase
				.from(table)
				.select('*', { count: 'exact', head: true });

			const entityType = table.replace('onto_', '').replace(/s$/, '');
			counts[entityType] = count || 0;
		}

		return counts;
	}

	/**
	 * Get hierarchy level for an element
	 */
	private async getHierarchyLevel(elementId: string, currentLevel: number = 0): Promise<number> {
		if (currentLevel > 5) return currentLevel; // Max depth

		const { data: edge } = await this.supabase
			.from('onto_edges')
			.select('src_id, src_kind')
			.eq('dst_id', elementId)
			.single();

		if (!edge) return currentLevel;
		if (edge.src_kind === 'project') return currentLevel + 1;

		return this.getHierarchyLevel(edge.src_id, currentLevel + 1);
	}
}
```

### 1.3 Create Executor Instruction Generator

**CREATE NEW FILE**: `apps/web/src/lib/services/agent-executor-instructions.ts`

```typescript
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

		return examples[taskType] || examples['list_tasks'];
	}
}
```

## PHASE 2-5: Service Updates and Implementation

[Content continues with all the service updates, API modifications, frontend changes, and testing sections exactly as in the original specification...]

## Files to Modify Summary

### New Files to Create

1. `apps/web/src/lib/types/agent-chat-enhancement.ts` - Type definitions
2. `apps/web/src/lib/services/ontology-context-loader.ts` - Ontology loader
3. `apps/web/src/lib/services/agent-executor-instructions.ts` - Executor instructions

### Files to Modify

1. `apps/web/src/lib/services/agent-context-service.ts` - Add ontology support
2. `apps/web/src/lib/services/chat-context-service.ts` - Update prompts
3. `apps/web/src/lib/services/agent-planner-service.ts` - Add strategies
4. `apps/web/src/routes/api/agent/stream/+server.ts` - Load ontology
5. `apps/web/src/lib/components/agent/AgentChatModal.svelte` - Frontend updates

## Success Metrics

1. **Ontology Integration**: 100% of chats load appropriate ontology data
2. **Strategy Accuracy**: 80%+ correct strategy selection
3. **Context Continuity**: Last turn context present in 95%+ of turns
4. **Token Usage**: <10K tokens per request with compression
5. **Response Time**: <2s for simple, <5s for complex research

## Notes for Implementation

1. **File Creation Order**: Create new files before modifying existing ones
2. **Type Safety**: Ensure all TypeScript types are imported correctly
3. **Database Access**: Verify onto\_\* tables exist and have data
4. **Testing**: Run integration tests after each phase
5. **Monitoring**: Check console logs for [OntologyLoader], [Planner], [API] prefixes

This specification provides everything needed to implement the agent chat enhancement.
