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
	TemplateCreationEvent
} from '@buildos/shared-types';

import type {
	LastTurnContext,
	OntologyContext,
	ChatStrategy,
	StrategyAnalysis,
	ResearchResult
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
	status: 'pending' | 'executing' | 'completed' | 'failed';
	result?: any;
	error?: string;
	metadata?: Record<string, any>;
}

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
	status: 'pending' | 'executing' | 'completed' | 'failed';
	createdAt: Date;
	completedAt?: Date;
	metadata?: {
		estimatedDuration?: number;
		actualDuration?: number;
		totalTokensUsed?: number;
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
}

/**
 * Planner context (from agent-context-service)
 */
export interface PlannerContext {
	systemPrompt: string;
	conversationHistory: LLMMessage[];
	locationContext: string;
	locationMetadata?: any;
	ontologyContext?: OntologyContext;
	lastTurnContext?: LastTurnContext;
	userProfile?: string;
	availableTools: ChatToolDefinition[];
	metadata: {
		sessionId: string;
		contextType: ChatContextType;
		entityId?: string;
		totalTokens: number;
		hasOntology: boolean;
		plannerAgentId?: string;
	};
}

// ============================================
// STREAMING EVENTS
// ============================================

/**
 * Events emitted during processing for SSE streaming
 */
export type StreamEvent =
	| { type: 'session'; session: ChatSession }
	| { type: 'ontology_loaded'; summary: string }
	| { type: 'last_turn_context'; context: LastTurnContext }
	| { type: 'strategy_selected'; strategy: ChatStrategy; confidence: number }
	| { type: 'clarifying_questions'; questions: string[] }
	| { type: 'analysis'; analysis: StrategyAnalysis }
	| { type: 'plan_created'; plan: AgentPlan }
	| { type: 'step_start'; step: PlanStep }
	| { type: 'step_complete'; step: PlanStep }
	| { type: 'executor_spawned'; executorId: string; task: any }
	| { type: 'executor_result'; executorId: string; result: ExecutorResult }
	| { type: 'text'; content: string }
	| { type: 'tool_call'; toolCall: ChatToolCall }
	| { type: 'tool_result'; result: ToolExecutionResult }
	| { type: 'done'; usage?: { total_tokens: number } }
	| { type: 'error'; error: string }
	| TemplateCreationEvent;

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
	createAgent(data: Omit<AgentInsert, 'id'>): Promise<string>;
	updateAgent(id: string, data: Partial<AgentInsert>): Promise<void>;
	getAgent(id: string): Promise<AgentInsert | null>;

	// Plan operations
	createPlan(data: Omit<AgentPlanInsert, 'id'>): Promise<string>;
	updatePlan(id: string, data: Partial<AgentPlanInsert>): Promise<void>;
	getPlan(id: string): Promise<AgentPlanInsert | null>;

	// Session operations
	createChatSession(data: Omit<AgentChatSessionInsert, 'id'>): Promise<string>;
	updateChatSession(id: string, data: Partial<AgentChatSessionInsert>): Promise<void>;
	getChatSession(id: string): Promise<AgentChatSessionInsert | null>;

	// Message operations
	saveMessage(data: Omit<AgentChatMessageInsert, 'id'>): Promise<string>;
	getMessages(sessionId: string, limit?: number): Promise<AgentChatMessageInsert[]>;
}

// ============================================
// ERROR TYPES
// ============================================

/**
 * Custom error types for better error handling
 */
export class AgenticChatError extends Error {
	constructor(
		message: string,
		public code: string,
		public details?: any
	) {
		super(message);
		this.name = 'AgenticChatError';
	}
}

export class StrategyError extends AgenticChatError {
	constructor(message: string, details?: any) {
		super(message, 'STRATEGY_ERROR', details);
		this.name = 'StrategyError';
	}
}

export class PlanExecutionError extends AgenticChatError {
	constructor(message: string, details?: any) {
		super(message, 'PLAN_EXECUTION_ERROR', details);
		this.name = 'PlanExecutionError';
	}
}

export class ToolExecutionError extends AgenticChatError {
	constructor(message: string, toolName: string, details?: any) {
		super(message, 'TOOL_EXECUTION_ERROR', { toolName, ...details });
		this.name = 'ToolExecutionError';
	}
}

export class PersistenceError extends AgenticChatError {
	constructor(message: string, operation: string, details?: any) {
		super(message, 'PERSISTENCE_ERROR', { operation, ...details });
		this.name = 'PersistenceError';
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
