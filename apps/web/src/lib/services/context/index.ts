// apps/web/src/lib/services/context/index.ts
/**
 * Agent Context Module
 *
 * Provides utilities for building planner and executor contexts.
 * Main entry point: AgentContextService (in parent directory)
 *
 * @see ./types.ts - Shared types
 * @see ./context-formatters.ts - Ontology context formatting
 * @see ./executor-context-builder.ts - Executor context building
 */

// Types
export type {
	ExecutorTask,
	ExecutorContext,
	BuildPlannerContextParams,
	EnhancedBuildPlannerContextParams,
	BuildExecutorContextParams,
	ProcessedHistoryResult,
	FormattedContextResult,
	PlannerContext
} from './types';

export { TOKEN_BUDGETS } from './types';

// Context formatters
export {
	formatOntologyContext,
	formatCombinedContext,
	detectElementType,
	getScopedEntity,
	getEntityName
} from './context-formatters';

// Executor context builder
export {
	buildExecutorContext,
	getExecutorSystemPrompt,
	extractRelevantDataForExecutor
} from './executor-context-builder';
