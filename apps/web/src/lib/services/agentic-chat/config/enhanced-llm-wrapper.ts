// apps/web/src/lib/services/agentic-chat/config/enhanced-llm-wrapper.ts
/**
 * Enhanced LLM Wrapper for Agentic Chat
 *
 * Provides intelligent model selection based on context and operation type
 * Wraps SmartLLMService with additional optimization logic
 */

import { SmartLLMService } from '$lib/services/smart-llm-service';
import type { TextProfile } from '$lib/services/smart-llm-service';
import type { ChatContextType } from '@buildos/shared-types';
import {
	getOptimalTextProfile,
	getOptimalJSONProfile,
	inferOperationType,
	TEMPERATURE_BY_OPERATION,
	MAX_TOKENS_BY_OPERATION,
	type AgentOperationType
} from './model-selection-config';

/**
 * Enhanced parameters for text generation
 */
export interface EnhancedTextParams {
	systemPrompt: string;
	prompt: string;
	userId?: string;
	contextType?: ChatContextType;
	operationType?: AgentOperationType | string;
	temperature?: number;
	maxTokens?: number;
	profile?: TextProfile; // Can be overridden
	forceProfile?: boolean; // If true, use provided profile without optimization
	chatSessionId?: string;
	agentSessionId?: string;
	agentPlanId?: string;
	agentExecutionId?: string;
}

/**
 * Enhanced LLM wrapper with intelligent model selection
 */
export class EnhancedLLMWrapper {
	constructor(private smartLLM: SmartLLMService) {}

	/**
	 * Generate text with optimized model selection
	 */
	async generateText(params: EnhancedTextParams): Promise<string> {
		const profile = this.selectProfile(params);
		const temperature = this.selectTemperature(params);
		const maxTokens = this.selectMaxTokens(params);

		console.log('[EnhancedLLMWrapper] Model selection:', {
			contextType: params.contextType,
			operationType: params.operationType,
			selectedProfile: profile,
			temperature,
			maxTokens
		});

		// Call underlying SmartLLMService with optimized parameters
		return this.smartLLM.generateText({
			systemPrompt: params.systemPrompt,
			prompt: params.prompt,
			userId: params.userId,
			operationType: params.operationType as string,
			chatSessionId: params.chatSessionId,
			agentSessionId: params.agentSessionId,
			agentPlanId: params.agentPlanId,
			agentExecutionId: params.agentExecutionId,
			temperature,
			maxTokens,
			profile
		});
	}

	/**
	 * Stream text with optimized model selection
	 * Matches SmartLLMService's streamText signature
	 */
	async *streamText(options: {
		messages: Array<{
			role: string;
			content: string;
			tool_calls?: any[];
			tool_call_id?: string;
		}>;
		tools?: any[];
		tool_choice?: 'auto' | 'none' | 'required';
		userId: string;
		profile?: TextProfile;
		temperature?: number;
		maxTokens?: number;
		sessionId?: string;
		messageId?: string;
		chatSessionId?: string;
		agentSessionId?: string;
		agentPlanId?: string;
		agentExecutionId?: string;
		signal?: AbortSignal;
		// Enhanced parameters for optimization
		contextType?: ChatContextType;
		operationType?: string;
		// Additional context for usage tracking
		entityId?: string;
		projectId?: string;
	}): AsyncGenerator<{
		type: 'text' | 'tool_call' | 'done' | 'error';
		content?: string;
		tool_call?: any;
		usage?: any;
		error?: string;
		finished_reason?: string;
	}> {
		// Extract context info for optimization
		const contextType = options.contextType || 'global';
		const hasTools = (options.tools?.length ?? 0) > 0;
		const messageLength = options.messages.reduce((sum, m) => sum + m.content.length, 0);

		const operationType =
			(options.operationType as AgentOperationType) ||
			inferOperationType(contextType, hasTools, messageLength);

		// Select optimal parameters if not provided
		const profile = options.profile || getOptimalTextProfile(contextType, operationType);
		const temperature = options.temperature ?? TEMPERATURE_BY_OPERATION[operationType] ?? 0.5;
		const maxTokens = options.maxTokens ?? MAX_TOKENS_BY_OPERATION[operationType] ?? 1500;

		console.log('[EnhancedLLMWrapper] Stream optimization:', {
			contextType,
			operationType,
			selectedProfile: profile,
			hasTools,
			temperature,
			maxTokens,
			originalProfile: options.profile
		});

		// Call underlying SmartLLMService with optimized parameters
		// Pass contextType for usage logging (builds chat_stream_${contextType} operation type)
		yield* this.smartLLM.streamText({
			...options,
			profile,
			temperature,
			maxTokens,
			chatSessionId: options.chatSessionId || options.sessionId,
			agentSessionId: options.agentSessionId,
			agentPlanId: options.agentPlanId,
			agentExecutionId: options.agentExecutionId,
			// Ensure contextType is passed for usage logging
			contextType: contextType as string,
			entityId: options.entityId,
			projectId: options.projectId
		});
	}

	/**
	 * Select optimal profile based on context
	 */
	private selectProfile(params: EnhancedTextParams): TextProfile {
		// If force profile is set, use the provided profile
		if (params.forceProfile && params.profile) {
			return params.profile;
		}

		// If profile is provided without force, use it as a hint
		if (params.profile) {
			return params.profile;
		}

		// Determine operation type if not provided
		const operationType =
			(params.operationType as AgentOperationType) ||
			inferOperationType(
				params.contextType || 'global',
				false, // hasTools - not available here
				params.prompt.length
			);

		// Get optimal profile
		return getOptimalTextProfile(params.contextType || 'global', operationType);
	}

	/**
	 * Select optimal temperature
	 */
	private selectTemperature(params: EnhancedTextParams): number {
		// Use provided temperature if specified
		if (params.temperature !== undefined) {
			return params.temperature;
		}

		// Use operation-specific temperature
		const operationType = params.operationType as AgentOperationType;
		if (operationType && TEMPERATURE_BY_OPERATION[operationType] !== undefined) {
			return TEMPERATURE_BY_OPERATION[operationType];
		}

		// Default temperature
		return 0.5;
	}

	/**
	 * Select optimal max tokens
	 */
	private selectMaxTokens(params: EnhancedTextParams): number {
		// Use provided max tokens if specified
		if (params.maxTokens !== undefined) {
			return params.maxTokens;
		}

		// Use operation-specific max tokens
		const operationType = params.operationType as AgentOperationType;
		if (operationType && MAX_TOKENS_BY_OPERATION[operationType] !== undefined) {
			return MAX_TOKENS_BY_OPERATION[operationType];
		}

		// Default max tokens
		return 1500;
	}
}

/**
 * Factory function to create enhanced wrapper
 */
export function createEnhancedLLMWrapper(smartLLM: SmartLLMService): EnhancedLLMWrapper {
	return new EnhancedLLMWrapper(smartLLM);
}
