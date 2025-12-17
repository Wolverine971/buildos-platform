// apps/web/src/lib/services/context/types.ts
/**
 * Agent Context Types
 *
 * Shared types for planner and executor context building.
 */

import type {
	ChatContextType,
	ChatMessage,
	ChatToolDefinition,
	LLMMessage,
	ContextUsageSnapshot
} from '@buildos/shared-types';
import type {
	LastTurnContext,
	OntologyContext,
	ProjectFocus
} from '$lib/types/agent-chat-enhancement';

// Re-export PlannerContext from canonical location
export type { PlannerContext } from '$lib/services/agentic-chat/shared/types';

/**
 * Token budget allocations for different agent types
 */
export const TOKEN_BUDGETS = {
	PLANNER: {
		SYSTEM_PROMPT: 800,
		CONVERSATION: 2500,
		LOCATION_CONTEXT: 1000,
		USER_PROFILE: 300,
		BUFFER: 400
		// Total: ~5000 tokens
	},
	EXECUTOR: {
		SYSTEM_PROMPT: 300,
		TASK_DESCRIPTION: 200,
		TOOLS: 400,
		CONTEXT_DATA: 400,
		BUFFER: 200
		// Total: ~1500 tokens
	}
} as const;

/**
 * Executor Task Definition
 * Specific, focused task for an executor agent to complete
 */
export interface ExecutorTask {
	id: string;
	description: string;
	goal: string;
	constraints?: string[];
	contextData?: any;
}

/**
 * Context for an Executor Agent
 * Minimal, task-focused context with specific tools only
 */
export interface ExecutorContext {
	systemPrompt: string;
	task: ExecutorTask;
	tools: ChatToolDefinition[];
	relevantData?: any;
	metadata: {
		executorId: string;
		sessionId: string;
		planId?: string;
		totalTokens: number;
	};
}

/**
 * Build parameters for planner context
 */
export interface BuildPlannerContextParams {
	sessionId: string;
	userId: string;
	conversationHistory: ChatMessage[];
	userMessage: string;
	contextType: ChatContextType;
	entityId?: string;
}

/**
 * Enhanced build parameters with ontology support
 */
export interface EnhancedBuildPlannerContextParams extends BuildPlannerContextParams {
	ontologyContext?: OntologyContext;
	lastTurnContext?: LastTurnContext;
	projectFocus?: ProjectFocus | null;
}

/**
 * Build parameters for executor context
 */
export interface BuildExecutorContextParams {
	executorId: string;
	sessionId: string;
	userId: string;
	task: ExecutorTask;
	tools: ChatToolDefinition[];
	planId?: string;
	contextType?: ChatContextType;
	entityId?: string;
}

/**
 * Result of conversation history processing
 */
export interface ProcessedHistoryResult {
	messages: LLMMessage[];
	usageSnapshot?: ContextUsageSnapshot;
}

/**
 * Formatted context result
 */
export interface FormattedContextResult {
	content: string;
	metadata: any;
}
