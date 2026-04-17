// apps/web/src/lib/services/agentic-chat/config/model-selection-config.ts
/**
 * Model Selection Configuration for Agentic Chat
 *
 * Optimized model selection based on April 2026 OpenRouter analysis
 * Prioritizes:
 * 1. Qwen 3.6 Plus for repo-scale coding, front-end work, and structured reasoning
 * 2. MiniMax M2.7 for autonomous agentic workflows and tool-heavy execution
 * 3. Proven fallbacks for cost, speed, and production reliability
 */

import type { TextProfile, JSONProfile } from '$lib/services/smart-llm-service';
import type { ChatContextType } from '@buildos/shared-types';
import { AGENTIC_MODEL_RECOMMENDATIONS } from '@buildos/smart-llm';

/**
 * Operation types for fine-grained model selection
 */
export type AgentOperationType =
	| 'planner_stream' // Main planner conversation
	| 'plan_generation' // Creating execution plans
	| 'executor_task' // Executor agent tasks
	| 'simple_response' // Simple synthesis
	| 'complex_response' // Complex multi-step synthesis
	| 'tool_heavy' // Many tool calls expected
	| 'reasoning_heavy' // Deep reasoning required
	| 'cost_sensitive' // Optimize for cost
	| 'speed_critical'; // Optimize for speed

/**
 * Get the optimal text profile for a given context and operation
 */
export function getOptimalTextProfile(
	contextType: ChatContextType,
	operationType: AgentOperationType
): TextProfile {
	// Speed-critical operations
	if (operationType === 'speed_critical' || operationType === 'executor_task') {
		return 'speed';
	}

	// Tool-heavy operations need reliable tool calling
	if (operationType === 'tool_heavy' || operationType === 'planner_stream') {
		// Favor the most reliable tool-calling models for planner_stream.
		if (operationType === 'planner_stream') {
			return 'quality';
		}

		// For tool-heavy non-planner operations, vary by context importance
		switch (contextType) {
			case 'project_create':
				return 'quality';
			case 'calendar':
			case 'global':
				return 'balanced';
			default:
				return 'balanced';
		}
	}

	// Reasoning-heavy operations
	if (operationType === 'reasoning_heavy' || operationType === 'plan_generation') {
		return 'quality';
	}

	// Cost-sensitive operations
	if (operationType === 'cost_sensitive' || operationType === 'simple_response') {
		return 'speed';
	}

	// Complex synthesis needs quality
	if (operationType === 'complex_response') {
		switch (contextType) {
			default:
				return 'balanced';
		}
	}

	// Default based on context
	switch (contextType) {
		case 'project_create':
		case 'ontology':
			return 'quality';
		case 'calendar':
			return 'balanced';
		case 'global':
		case 'general':
		default:
			return 'balanced';
	}
}

/**
 * Get the optimal JSON profile for a given operation
 */
export function getOptimalJSONProfile(
	operationType: AgentOperationType,
	complexity: 'simple' | 'moderate' | 'complex' = 'moderate'
): JSONProfile {
	// Plan generation needs reliability
	if (operationType === 'plan_generation') {
		return complexity === 'complex' ? 'powerful' : 'balanced';
	}

	// Tool-heavy operations need reliable parsing
	if (operationType === 'tool_heavy') {
		return 'balanced';
	}

	// Cost-sensitive operations
	if (operationType === 'cost_sensitive') {
		return 'fast'; // Gemini 2.5 Flash Lite
	}

	// Default by complexity
	switch (complexity) {
		case 'simple':
			return 'fast';
		case 'complex':
			return 'powerful';
		default:
			return 'balanced';
	}
}

/**
 * Model selection recommendations for specific use cases
 * Centralized in @buildos/smart-llm so model IDs live with the shared model catalog.
 */
export const MODEL_RECOMMENDATIONS = AGENTIC_MODEL_RECOMMENDATIONS;

/**
 * Temperature recommendations by operation
 */
export const TEMPERATURE_BY_OPERATION: Record<AgentOperationType, number> = {
	planner_stream: 0.4, // Balanced creativity
	plan_generation: 0.35, // More deterministic
	executor_task: 0.3, // Focused execution
	simple_response: 0.7, // More creative
	complex_response: 0.6, // Moderately creative
	tool_heavy: 0.3, // Precise tool calling
	reasoning_heavy: 0.4, // Balanced reasoning
	cost_sensitive: 0.5, // Default balanced
	speed_critical: 0.5 // Default balanced
};

/**
 * Max token recommendations by operation
 */
export const MAX_TOKENS_BY_OPERATION: Record<AgentOperationType, number> = {
	planner_stream: 1800, // Medium conversation
	plan_generation: 1200, // Structured plan
	executor_task: 1500, // Task execution
	simple_response: 1000, // Simple synthesis
	complex_response: 2000, // Detailed synthesis
	tool_heavy: 2000, // Multiple tool calls
	reasoning_heavy: 2500, // Extended reasoning
	cost_sensitive: 800, // Minimize tokens
	speed_critical: 1000 // Balance speed/completeness
};

/**
 * Helper to determine if we should prioritize tool-calling models
 */
export function shouldPrioritizeToolCalling(
	toolCount: number,
	contextType: ChatContextType
): boolean {
	// High tool count always prioritizes tool-calling
	if (toolCount > 5) return true;

	// Project contexts often need tools
	if (contextType.startsWith('project')) return true;

	// Ontology contexts need precise tool execution
	if (contextType === 'ontology') return true;

	return false;
}

/**
 * Helper to determine operation type from context
 */
export function inferOperationType(
	contextType: ChatContextType,
	hasTools: boolean,
	messageLength: number
): AgentOperationType {
	// Tool-heavy contexts
	if (hasTools && (contextType.startsWith('project') || contextType === 'ontology')) {
		return 'tool_heavy';
	}

	// Speed-critical contexts
	if (contextType === 'calendar') {
		return 'speed_critical';
	}

	// Cost-sensitive for simple queries
	if (messageLength < 100 && !hasTools) {
		return 'cost_sensitive';
	}

	// Default to planner stream
	return 'planner_stream';
}
