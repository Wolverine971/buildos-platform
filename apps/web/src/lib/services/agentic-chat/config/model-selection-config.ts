// apps/web/src/lib/services/agentic-chat/config/model-selection-config.ts
/**
 * Model Selection Configuration for Agentic Chat
 *
 * Optimized model selection based on January 2025 OpenRouter analysis
 * Prioritizes:
 * 1. Claude models for tool-calling reliability (~92% success rate)
 * 2. DeepSeek models for cost-effective reasoning
 * 3. Context-aware profile selection for different operations
 */

import type { TextProfile, JSONProfile } from '$lib/services/smart-llm-service';
import type { ChatContextType } from '@buildos/shared-types';

/**
 * Operation types for fine-grained model selection
 */
export type AgentOperationType =
	| 'planner_stream' // Main planner conversation
	| 'plan_generation' // Creating execution plans
	| 'plan_review' // Reviewing plan validity
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
		return 'speed'; // Uses Gemini 2.5 Flash Lite ($0.07/$0.30)
	}

	// Tool-heavy operations need reliable tool calling
	if (operationType === 'tool_heavy' || operationType === 'planner_stream') {
		// Favor the most reliable tool-calling models for planner_stream.
		if (operationType === 'planner_stream') {
			return 'quality';
		}

		// For tool-heavy non-planner operations, vary by context importance
		switch (contextType) {
			case 'project_audit':
			case 'project_forecast':
			case 'project_create':
				return 'quality'; // Claude 3.5 Sonnet for complex planning
			case 'calendar':
			case 'global':
				return 'balanced'; // DeepSeek-Chat + Claude Haiku mix
			default:
				return 'balanced';
		}
	}

	// Reasoning-heavy operations
	if (operationType === 'reasoning_heavy' || operationType === 'plan_generation') {
		return 'quality'; // DeepSeek R1 primary
	}

	// Cost-sensitive operations
	if (operationType === 'cost_sensitive' || operationType === 'simple_response') {
		return 'speed'; // Gemini 2.5 Flash Lite
	}

	// Complex synthesis needs quality
	if (operationType === 'complex_response') {
		switch (contextType) {
			case 'project_audit':
			case 'project_forecast':
				return 'quality';
			default:
				return 'balanced';
		}
	}

	// Default based on context
	switch (contextType) {
		case 'project_audit':
		case 'project_forecast':
		case 'project_create':
		case 'ontology':
			return 'quality';
		case 'calendar':
		case 'brain_dump':
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
		return 'balanced'; // DeepSeek-Chat is best value
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
 * Updated 2025-12-26: Prioritizing x-ai/grok-4.1-fast for tool-calling (93% τ²-Bench)
 */
export const MODEL_RECOMMENDATIONS = {
	// High-volume operations (optimize for cost)
	brainDumps: {
		contextExtraction: ['google/gemini-2.5-flash-lite', 'anthropic/claude-haiku-4.5'],
		taskExtraction: ['deepseek/deepseek-chat', 'anthropic/claude-haiku-4.5'],
		clarification: ['deepseek/deepseek-r1', 'x-ai/grok-4.1-fast']
	},

	// Agent chat (balance speed, reliability, cost)
	// Prioritizing grok-4.1-fast: 93% τ²-Bench, $0.30/$1.00, 2M context
	agentChat: {
		planner: {
			simple: ['x-ai/grok-4.1-fast', 'anthropic/claude-haiku-4.5'],
			complex: ['x-ai/grok-4.1-fast', 'deepseek/deepseek-r1'],
			toolHeavy: ['x-ai/grok-4.1-fast', 'anthropic/claude-haiku-4.5']
		},
		executor: {
			default: ['google/gemini-2.5-flash-lite', 'openai/gpt-4o-mini'],
			toolHeavy: ['x-ai/grok-4.1-fast', 'anthropic/claude-haiku-4.5']
		},
		synthesis: {
			simple: ['google/gemini-2.5-flash-lite', 'deepseek/deepseek-chat'],
			complex: ['deepseek/deepseek-chat', 'x-ai/grok-4.1-fast']
		}
	},

	// Daily briefs (optimize for quality at scale)
	dailyBriefs: {
		generation: ['deepseek/deepseek-chat', 'anthropic/claude-haiku-4.5'],
		summary: ['google/gemini-2.5-flash-lite', 'deepseek/deepseek-chat']
	}
};

/**
 * Temperature recommendations by operation
 */
export const TEMPERATURE_BY_OPERATION: Record<AgentOperationType, number> = {
	planner_stream: 0.4, // Balanced creativity
	plan_generation: 0.35, // More deterministic
	plan_review: 0.2, // Very deterministic
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
	plan_review: 500, // Brief review
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

	// Reasoning-heavy contexts
	if (contextType === 'project_audit' || contextType === 'project_forecast') {
		return 'reasoning_heavy';
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
