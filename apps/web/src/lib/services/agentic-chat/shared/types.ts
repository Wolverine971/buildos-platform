// apps/web/src/lib/services/agentic-chat/shared/types.ts
/**
 * Shared Types for Agentic Chat System
 *
 * This file contains all shared type definitions used across the refactored
 * agentic chat services. These types ensure consistency and type safety
 * throughout the domain-separated service architecture.
 *
 * @see {@link /apps/web/docs/features/agentic-chat/REFACTORING_SPEC.md} - Full refactoring specification
 * @see {@link /apps/web/docs/features/ontology/AGENT_CHAT_ONTOLOGY_INTEGRATION_SPEC.md} - Original integration spec
 *
 * @module agentic-chat/shared
 */

import type {
	ChatContextType,
	ChatMessage,
	ChatToolCall,
	ChatSession,
	ContextUsageSnapshot
} from '@buildos/shared-types';

import type {
	LastTurnContext,
	OntologyContext,
	ProjectFocus,
	OntologyContextScope,
	ContextCacheHint
} from '$lib/types/agent-chat-enhancement';

// ============================================
// SERVICE CONTEXT
// ============================================

/**
 * Shared context passed between services
 * Contains all contextual information needed for processing
 */
export interface ServiceContext {
	sessionId: string;
	userId: string;
	contextType: ChatContextType;
	entityId?: string;
	plannerAgentId?: string;
	/** Optional timing metrics record for latency tracking */
	timingMetricsId?: string;
	ontologyContext?: OntologyContext;
	lastTurnContext?: LastTurnContext;
	conversationHistory: ChatMessage[];
	projectFocus?: ProjectFocus | null;
	contextScope?: OntologyContextScope;
}

// ============================================
// EXECUTION RESULTS
// ============================================

/**
 * Generic execution result for service operations
 */
export interface ExecutionResult<T = any> {
	success: boolean;
	data?: T;
	error?: Error | string;
	metadata?: Record<string, any>;
}

/**
 * Error types for tool execution
 */
export type ToolExecutionErrorType =
	| 'tool_not_loaded'
	| 'validation_error'
	| 'execution_error'
	| 'timeout'
	| 'cancelled';

/**
 * Tool execution specific result
 */
export interface ToolExecutionResult extends ExecutionResult {
	toolName: string;
	toolCallId: string;
	entitiesAccessed?: string[];
	tokensUsed?: number;
	streamEvents?: StreamEvent[];
	/** Categorizes the error type for handling by the orchestrator */
	errorType?: ToolExecutionErrorType;
}

/**
 * Metadata for tracking project creation clarification rounds
 */
export interface ProjectClarificationMetadata {
	/** Current round number (0 = initial, 1 = first clarification, 2 = max) */
	roundNumber: number;
	/** Accumulated context from all user messages */
	accumulatedContext: string;
	/** Questions asked in previous rounds */
	previousQuestions: string[];
	/** User responses to previous questions */
	previousResponses: string[];
}

export interface ContactClarificationMetadata {
	candidateIds: string[];
	awaitingResponse: boolean;
	askedAt: string;
	cooldownUntil?: string | null;
	ignoredCount?: number;
	lastResolvedCandidateId?: string;
	lastResolvedAction?: 'confirmed_merge' | 'rejected' | 'snoozed';
	lastResolvedAt?: string;
}

/**
 * Request payload for the AgentChatOrchestrator
 */
export interface AgentChatRequest {
	userId: string;
	sessionId: string;
	userMessage: string;
	contextType: ChatContextType;
	entityId?: string;
	conversationHistory: ChatMessage[];
	chatSession?: ChatSession;
	ontologyContext?: OntologyContext;
	lastTurnContext?: LastTurnContext;
	projectFocus?: ProjectFocus | null;
	contextCache?: ContextCacheHint;
	/** Metadata for project creation clarification flow */
	projectClarificationMetadata?: ProjectClarificationMetadata;
	/** Metadata for contact identity clarification flow */
	contactClarificationMetadata?: ContactClarificationMetadata;
	/** Optional timing metrics record for latency tracking */
	timingMetricsId?: string;
	/** Abort signal to cancel streaming work when the client disconnects */
	abortSignal?: AbortSignal;
}

// ============================================
// STREAMING EVENTS
// ============================================

/**
 * Debug context info for observability
 * Allows viewing prompts, context, and tools for any chat session
 */
export interface DebugContextInfo {
	/** Request identifier */
	requestId: string;
	/** Timestamp when context was built */
	timestamp: string;
	/** Current context type */
	contextType: string;
	/** System prompt (full) */
	systemPrompt: string;
	/** Token count for system prompt */
	systemPromptTokens: number;
	/** Location context string */
	locationContext: string;
	/** Token count for location context */
	locationContextTokens: number;
	/** Available tools list */
	availableTools: Array<{
		name: string;
		category?: string;
	}>;
	/** Token count for tools */
	toolsTokens: number;
	/** Ontology snapshot summary */
	ontologySnapshot?: {
		type: string;
		entityCounts: Record<string, number>;
		focusEntity?: {
			type: string;
			id: string;
			name: string;
		};
	};
	/** Conversation history token count */
	conversationTokens: number;
	/** Total estimated tokens */
	totalTokens: number;
	/** Project focus if any */
	projectFocus?: {
		projectId: string;
		projectName?: string;
		focusType?: string;
		entityId?: string;
	} | null;
}

/**
 * Events emitted during processing for SSE streaming
 */
export type StreamEvent =
	| { type: 'session'; session: ChatSession }
	| { type: 'ontology_loaded'; summary: string }
	| { type: 'last_turn_context'; context: LastTurnContext }
	| { type: 'context_usage'; usage: ContextUsageSnapshot }
	| {
			type: 'agent_state';
			state: 'thinking' | 'waiting_on_user';
			contextType: ChatContextType;
			details?: string;
	  }
	| {
			type: 'operation';
			operation: {
				action: 'list' | 'search' | 'read' | 'create' | 'update' | 'delete';
				entity_type:
					| 'document'
					| 'task'
					| 'goal'
					| 'plan'
					| 'project'
					| 'milestone'
					| 'risk';
				entity_name: string;
				status: 'start' | 'success' | 'error';
				entity_id?: string;
			};
	  }
	| {
			type: 'clarifying_questions';
			questions: string[];
			metadata?: ProjectClarificationMetadata;
			contactMetadata?: Pick<ContactClarificationMetadata, 'candidateIds'>;
	  }
	| { type: 'text'; content: string }
	| { type: 'tool_call'; toolCall: ChatToolCall }
	| { type: 'tool_result'; result: ToolExecutionResult }
	| { type: 'done'; usage?: { total_tokens: number } }
	| { type: 'error'; error: string }
	| { type: 'debug_context'; debug: DebugContextInfo }
	| {
			type: 'telemetry';
			event: 'tool_selection' | 'tool_selection_miss' | 'tool_execution';
			data: Record<string, unknown>;
	  };

export interface ToolExecutorResponse {
	data: any;
	streamEvents?: StreamEvent[];
	metadata?: Record<string, any>;
}

export type ToolExecutorFunction = (
	toolName: string,
	args: Record<string, any>,
	context: ServiceContext
) => Promise<ToolExecutorResponse>;

/**
 * Stream callback function type
 */
export type StreamCallback = (event: StreamEvent) => void | Promise<void>;

// ============================================
// SERVICE INTERFACES
// ============================================

/**
 * Base service interface that all services should implement
 */
export interface BaseService {
	/**
	 * Initialize the service
	 */
	initialize?(): Promise<void>;

	/**
	 * Clean up resources
	 */
	cleanup?(): Promise<void>;
}

/**
 * Service that can emit stream events
 */
export interface StreamingService extends BaseService {
	/**
	 * Process with streaming support
	 */
	processWithStream?(
		input: any,
		callback: StreamCallback
	): AsyncGenerator<StreamEvent, void, unknown>;
}

// ============================================
// RESULT TYPES (Functional Error Handling)
// ============================================

/**
 * Discriminated union for operation results
 * Use this for operations that can fail in expected ways
 */
export type Result<T, E = AgenticChatError> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Helper to create success result
 */
export function ok<T>(value: T): Result<T, never> {
	return { ok: true, value };
}

/**
 * Helper to create error result
 */
export function err<E>(error: E): Result<never, E> {
	return { ok: false, error };
}

/**
 * Type guard to check if result is success
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
	return result.ok === true;
}

/**
 * Type guard to check if result is error
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
	return result.ok === false;
}

// ============================================
// ERROR TYPES
// ============================================

/**
 * Error categories for classification and handling
 */
export enum ErrorCategory {
	/** Error is temporary and operation can be retried */
	RETRYABLE = 'retryable',
	/** Error is permanent and operation should not be retried */
	FATAL = 'fatal',
	/** Error should be shown to user with friendly message */
	USER_FACING = 'user_facing',
	/** Internal error that should be logged but not shown to user */
	INTERNAL = 'internal'
}

/**
 * Error codes for specific error types
 */
export enum ErrorCode {
	STRATEGY_ERROR = 'STRATEGY_ERROR',
	TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
	PERSISTENCE_ERROR = 'PERSISTENCE_ERROR',
	VALIDATION_ERROR = 'VALIDATION_ERROR',
	TIMEOUT_ERROR = 'TIMEOUT_ERROR',
	RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
	NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
	PERMISSION_ERROR = 'PERMISSION_ERROR',
	LLM_ERROR = 'LLM_ERROR'
}

/**
 * Base error class with categorization support
 */
export class AgenticChatError extends Error {
	constructor(
		message: string,
		public code: ErrorCode | string,
		public category: ErrorCategory = ErrorCategory.INTERNAL,
		public details?: Record<string, unknown>,
		public userMessage?: string
	) {
		super(message);
		this.name = 'AgenticChatError';
	}

	/**
	 * Check if this error is retryable
	 */
	isRetryable(): boolean {
		return this.category === ErrorCategory.RETRYABLE;
	}

	/**
	 * Get user-friendly message
	 */
	getUserMessage(): string {
		return this.userMessage ?? 'An unexpected error occurred. Please try again.';
	}

	/**
	 * Convert to Result type
	 */
	toResult<T>(): Result<T, AgenticChatError> {
		return err(this);
	}
}

export class StrategyError extends AgenticChatError {
	constructor(message: string, details?: Record<string, unknown>) {
		super(
			message,
			ErrorCode.STRATEGY_ERROR,
			ErrorCategory.INTERNAL,
			details,
			'Unable to determine the best approach for your request.'
		);
		this.name = 'StrategyError';
	}
}

export class ToolExecutionError extends AgenticChatError {
	constructor(
		message: string,
		toolName: string,
		details?: Record<string, unknown>,
		category: ErrorCategory = ErrorCategory.RETRYABLE
	) {
		super(
			message,
			ErrorCode.TOOL_EXECUTION_ERROR,
			category,
			{ toolName, ...details },
			`There was an issue with the ${toolName} operation.`
		);
		this.name = 'ToolExecutionError';
	}
}

export class PersistenceError extends AgenticChatError {
	constructor(
		message: string,
		operation: string,
		details?: Record<string, unknown>,
		category: ErrorCategory = ErrorCategory.RETRYABLE
	) {
		super(
			message,
			ErrorCode.PERSISTENCE_ERROR,
			category,
			{ operation, ...details },
			'There was an issue saving your data. Please try again.'
		);
		this.name = 'PersistenceError';
	}
}

export class ValidationError extends AgenticChatError {
	constructor(message: string, field?: string, details?: Record<string, unknown>) {
		super(
			message,
			ErrorCode.VALIDATION_ERROR,
			ErrorCategory.USER_FACING,
			{ field, ...details },
			message // Validation errors are usually user-friendly
		);
		this.name = 'ValidationError';
	}
}

export class TimeoutError extends AgenticChatError {
	constructor(operation: string, timeoutMs: number, details?: Record<string, unknown>) {
		super(
			`Operation '${operation}' timed out after ${timeoutMs}ms`,
			ErrorCode.TIMEOUT_ERROR,
			ErrorCategory.RETRYABLE,
			{ operation, timeoutMs, ...details },
			'The operation took too long. Please try again.'
		);
		this.name = 'TimeoutError';
	}
}

export class LLMError extends AgenticChatError {
	constructor(
		message: string,
		details?: Record<string, unknown>,
		category: ErrorCategory = ErrorCategory.RETRYABLE
	) {
		super(
			message,
			ErrorCode.LLM_ERROR,
			category,
			details,
			'There was an issue processing your request. Please try again.'
		);
		this.name = 'LLMError';
	}
}

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Type guard to check if value is an error
 */
export function isError(value: any): value is Error {
	return value instanceof Error;
}

/**
 * Type guard for execution result
 */
export function isExecutionResult(value: any): value is ExecutionResult {
	return (
		typeof value === 'object' &&
		value !== null &&
		'success' in value &&
		typeof value.success === 'boolean'
	);
}

/**
 * Type guard for stream event
 */
export function isStreamEvent(value: any): value is StreamEvent {
	return typeof value === 'object' && value !== null && 'type' in value;
}

// ============================================
// CONSTANTS
// ============================================

export const SERVICE_NAMES = {
	ORCHESTRATOR: 'AgentChatOrchestrator',
	STRATEGY_ANALYZER: 'StrategyAnalyzer',
	PLAN_ORCHESTRATOR: 'PlanOrchestrator',
	TOOL_EXECUTOR: 'ToolExecutionService',
	EXECUTOR_COORDINATOR: 'ExecutorCoordinator',
	RESPONSE_SYNTHESIZER: 'ResponseSynthesizer',
	PERSISTENCE: 'AgentPersistenceService'
} as const;

export const MAX_RETRIES = 3;
export const RETRY_BACKOFF_MS = 1000;
export const DEFAULT_TIMEOUT_MS = 30000;
export const MAX_TOKENS_PER_TURN = 10000;
