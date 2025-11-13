// apps/web/src/lib/types/agent-chat-enhancement.ts
/**
 * Agent Chat Enhancement Types
 * Central type definitions for ontology-aware chat system
 */

import type {
	ChatContextType,
	ChatMessage,
	LLMMessage,
	ChatToolDefinition,
	TemplateCreationEvent,
	TemplateCreationRequestDetail,
	TemplateCreationStatus,
	TemplateRecommendationSet,
	TemplateSchemaSummary,
	LastTurnContext
} from '@buildos/shared-types';

export type {
	TemplateCreationEvent,
	TemplateCreationRequestDetail,
	TemplateCreationStatus,
	TemplateRecommendationSet,
	TemplateSchemaSummary,
	LastTurnContext
} from '@buildos/shared-types';

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
	PLANNER_STREAM = 'planner_stream', // Autonomous planner loop (tools + plan meta tool)
	ASK_CLARIFYING = 'ask_clarifying_questions', // Need more info before proceeding
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
 * Template creation workflow events shared between backend + UI
 */
/**
 * SSE events sent during streaming
 */
export type AgentSSEEvent =
	| { type: 'session'; session: any }
	| { type: 'last_turn_context'; context: LastTurnContext }
	| {
			type: 'agent_state';
			state: 'thinking' | 'executing_plan' | 'waiting_on_user';
			contextType: ChatContextType;
			details?: string;
	  }
	| { type: 'clarifying_questions'; questions: string[] }
	| { type: 'executor_instructions'; instructions: string }
	| { type: 'ontology_loaded'; summary: string }
	| { type: 'plan_created'; plan: any }
	| { type: 'plan_ready_for_review'; plan: any; summary?: string; recommendations?: string[] }
	| {
			type: 'plan_review';
			plan: any;
			verdict: 'approved' | 'changes_requested' | 'rejected';
			notes?: string;
			reviewer?: string;
	  }
	| { type: 'text'; content: string }
	| { type: 'tool_call'; tool_call: any }
	| { type: 'tool_result'; result: any }
	| {
			type: 'context_shift';
			context_shift: {
				new_context: ChatContextType;
				entity_id: string;
				entity_name: string;
				entity_type: 'project' | 'task' | 'plan' | 'goal';
				message: string;
			};
	  }
	| TemplateCreationEvent
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
