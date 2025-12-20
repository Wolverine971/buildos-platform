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
	ChatToolDefinition,
	LLMMessage,
	ChatToolCall,
	AgentInsert,
	AgentPlanInsert,
	AgentChatSessionInsert,
	AgentChatMessageInsert,
	ChatSession,
	Json,
	ContextUsageSnapshot
} from '@buildos/shared-types';

import type {
	LastTurnContext,
	OntologyContext,
	ChatStrategy,
	StrategyAnalysis,
	ResearchResult,
	ProjectFocus,
	OntologyContextScope
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
	ontologyContext?: OntologyContext;
	lastTurnContext?: LastTurnContext;
	conversationHistory: ChatMessage[];
	projectFocus?: ProjectFocus | null;
	contextScope?: OntologyContextScope;
}

/**
 * Enhanced service context with additional metadata
 */
export interface EnhancedServiceContext extends ServiceContext {
	plannerContext?: PlannerContext;
	strategyAnalysis?: StrategyAnalysis;
	currentPlan?: AgentPlan;
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
 * Tool execution specific result
 */
export interface ToolExecutionResult extends ExecutionResult {
	toolName: string;
	toolCallId: string;
	entitiesAccessed?: string[];
	tokensUsed?: number;
	streamEvents?: StreamEvent[];
}

/**
 * Executor agent result
 */
export interface ExecutorResult extends ExecutionResult {
	executorId: string;
	taskId: string;
	duration?: number;
	retryCount?: number;
}

// ============================================
// PLANNING & STRATEGY
// ============================================

/**
 * Plan step definition
 */
export interface PlanStep {
	stepNumber: number;
	type: string;
	description: string;
	executorRequired: boolean;
	tools: string[];
	dependsOn?: number[];
	status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
	result?: any;
	error?: string;
	metadata?: Record<string, any>;
}

export type PlanExecutionMode = 'auto_execute' | 'draft_only' | 'agent_review';

/**
 * Agent Plan structure
 */
export interface AgentPlan {
	id: string;
	sessionId: string;
	userId: string;
	plannerAgentId: string;
	userMessage: string;
	strategy: ChatStrategy;
	steps: PlanStep[];
	status:
		| 'pending'
		| 'pending_review'
		| 'executing'
		| 'completed'
		| 'completed_with_errors'
		| 'failed';
	createdAt: Date;
	completedAt?: Date;
	metadata?: {
		estimatedDuration?: number;
		actualDuration?: number;
		totalTokensUsed?: number;
		executionMode?: PlanExecutionMode;
		contextType?: ChatContextType;
		requestedOutputs?: string[];
		priorityEntities?: string[];
		draftSavedAt?: string;
		review_status?: 'pending_review' | 'changes_requested' | 'approved' | 'rejected';
		completion_status?: 'completed_with_errors';
		has_errors?: boolean;
	};
}

/**
 * Parameters used when spawning executor agents for a plan step
 */
export interface ExecutorSpawnParams {
	plan: AgentPlan;
	step: PlanStep;
	plannerContext: PlannerContext;
	previousStepResults: Map<number, any>;
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
	/** Metadata for project creation clarification flow */
	projectClarificationMetadata?: ProjectClarificationMetadata;
	/** Abort signal to cancel streaming work when the client disconnects */
	abortSignal?: AbortSignal;
}

/**
 * Planner context - canonical definition
 * Used by agent-context-service and strategy-analyzer
 *
 * @see agent-context-service.ts - builds this context
 * @see strategy-analyzer.ts - consumes this context
 */
export interface PlannerContext {
	/** Instructions for planning and orchestration */
	systemPrompt: string;
	/** Last N messages (compressed if needed) */
	conversationHistory: LLMMessage[];
	/** Current project/task/calendar context (abbreviated) */
	locationContext: string;
	/** Metadata from location context */
	locationMetadata?: {
		projectId?: string;
		projectName?: string;
		projectDescription?: string;
		projectStatus?: string;
		taskCount?: number;
		goalCount?: number;
		documentCount?: number;
		focusedEntityId?: string;
		focusedEntityType?: string;
		focusedEntityName?: string;
		contextDocumentId?: string;
		[key: string]: unknown;
	};
	/** Ontology context if available */
	ontologyContext?: OntologyContext;
	/** Context from previous turn */
	lastTurnContext?: LastTurnContext;
	/** User preferences and work style */
	userProfile?: string;
	/** All tools the planner can use or delegate */
	availableTools: ChatToolDefinition[];
	metadata: {
		sessionId: string;
		contextType: ChatContextType;
		entityId?: string;
		totalTokens: number;
		hasOntology: boolean;
		plannerAgentId?: string;
		/** Current project focus (project + optional entity) */
		focus?: ProjectFocus | null;
		/** Ontology scope information */
		scope?: OntologyContextScope;
		/** Token usage from compression */
		compressionUsage?: ContextUsageSnapshot;
	};
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
			state: 'thinking' | 'executing_plan' | 'waiting_on_user';
			contextType: ChatContextType;
			details?: string;
	  }
	| {
			type: 'clarifying_questions';
			questions: string[];
			metadata?: ProjectClarificationMetadata;
	  }
	| { type: 'plan_created'; plan: AgentPlan }
	| {
			type: 'plan_ready_for_review';
			plan: AgentPlan;
			summary?: string;
			recommendations?: string[];
	  }
	| { type: 'step_start'; step: PlanStep }
	| { type: 'step_complete'; step: PlanStep }
	| { type: 'executor_spawned'; executorId: string; task: any }
	| { type: 'executor_result'; executorId: string; result: ExecutorResult }
	| {
			type: 'plan_review';
			plan: AgentPlan;
			verdict: 'approved' | 'changes_requested' | 'rejected';
			notes?: string;
			reviewer?: string;
	  }
	| { type: 'text'; content: string }
	| { type: 'tool_call'; toolCall: ChatToolCall }
	| { type: 'tool_result'; result: ToolExecutionResult }
	| { type: 'done'; usage?: { total_tokens: number } }
	| { type: 'error'; error: string }
	| { type: 'debug_context'; debug: DebugContextInfo };

export interface ToolExecutorResponse {
	data: any;
	streamEvents?: StreamEvent[];
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
// PERSISTENCE TYPES
// ============================================

/**
 * Database operation types for persistence service
 */
export interface PersistenceOperations {
	// Agent operations
	// Note: id is optional in insert types - if provided, it will be used; otherwise generated
	createAgent(data: AgentInsert): Promise<string>;
	updateAgent(id: string, data: Partial<AgentInsert>): Promise<void>;
	getAgent(id: string): Promise<AgentInsert | null>;

	// Plan operations
	// Note: id is optional - if provided, it will be used; otherwise generated
	createPlan(data: AgentPlanInsert): Promise<string>;
	updatePlan(id: string, data: Partial<AgentPlanInsert>): Promise<void>;
	getPlan(id: string): Promise<AgentPlanInsert | null>;
	updatePlanStep(
		planId: string,
		stepNumber: number,
		stepUpdate: Record<string, any>
	): Promise<void>;

	// Session operations
	// Note: id is optional - if provided, it will be used; otherwise generated
	createChatSession(data: AgentChatSessionInsert): Promise<string>;
	updateChatSession(id: string, data: Partial<AgentChatSessionInsert>): Promise<void>;
	getChatSession(id: string): Promise<AgentChatSessionInsert | null>;

	// Message operations
	// Note: id is optional - if provided, it will be used; otherwise generated
	saveMessage(data: AgentChatMessageInsert): Promise<string>;
	getMessages(sessionId: string, limit?: number): Promise<AgentChatMessageInsert[]>;
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
	PLAN_EXECUTION_ERROR = 'PLAN_EXECUTION_ERROR',
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

export class PlanExecutionError extends AgenticChatError {
	constructor(
		message: string,
		details?: Record<string, unknown>,
		category: ErrorCategory = ErrorCategory.RETRYABLE
	) {
		super(
			message,
			ErrorCode.PLAN_EXECUTION_ERROR,
			category,
			details,
			'There was an issue executing the plan. Please try again.'
		);
		this.name = 'PlanExecutionError';
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
