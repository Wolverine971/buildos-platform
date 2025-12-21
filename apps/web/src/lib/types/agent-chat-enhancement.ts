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
	LastTurnContext,
	ProjectFocus,
	FocusEntitySummary,
	Database
} from '@buildos/shared-types';

export type {
	TemplateCreationEvent,
	TemplateCreationRequestDetail,
	TemplateCreationStatus,
	TemplateRecommendationSet,
	TemplateSchemaSummary,
	LastTurnContext,
	ProjectFocus,
	FocusEntitySummary
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

export type OntologyEntityType =
	| 'project'
	| 'task'
	| 'goal'
	| 'plan'
	| 'document'
	| 'output'
	| 'milestone'
	| 'risk';

type OntologyEntityRecordMap = {
	project: Database['public']['Tables']['onto_projects']['Row'];
	task: Database['public']['Tables']['onto_tasks']['Row'];
	goal: Database['public']['Tables']['onto_goals']['Row'];
	plan: Database['public']['Tables']['onto_plans']['Row'];
	document: Database['public']['Tables']['onto_documents']['Row'];
	output: Database['public']['Tables']['onto_outputs']['Row'];
	milestone: Database['public']['Tables']['onto_milestones']['Row'];
	risk: Database['public']['Tables']['onto_risks']['Row'];
};

type OntologyEntityCollectionMap = {
	projects: OntologyEntityRecordMap['project'][];
	tasks: OntologyEntityRecordMap['task'][];
	goals: OntologyEntityRecordMap['goal'][];
	plans: OntologyEntityRecordMap['plan'][];
	documents: OntologyEntityRecordMap['document'][];
	outputs: OntologyEntityRecordMap['output'][];
	milestones: OntologyEntityRecordMap['milestone'][];
	risks: OntologyEntityRecordMap['risk'][];
};

export type OntologyContextEntities = Partial<
	OntologyEntityRecordMap & OntologyEntityCollectionMap
>;

export interface OntologyContextScope {
	projectId?: string;
	projectName?: string;
	focus?: {
		type: Exclude<OntologyEntityType, 'project'>;
		id: string;
		name?: string;
	};
}

/**
 * Ontology context loaded from onto_* tables
 */
export interface OntologyContext {
	// Context level
	type: 'global' | 'project' | 'element' | 'combined';

	// Entity payloads grouped by concrete ontology tables
	entities: OntologyContextEntities;

	// Relationships via edges
	relationships?: EntityRelationships;

	// Metadata about the context
	metadata: {
		entity_count?: Record<string, number>; // Counts by entity type
		last_updated?: string;
		context_document_id?: string; // From has_context_document edge relationship
		facets?: Record<string, any>; // From props->facets
		hierarchy_level?: number;
		available_entity_types?: string[];
		total_projects?: number;
		recent_project_ids?: string[];
	};

	// Current scope/focus for this context (project + optional focused entity)
	scope?: OntologyContextScope;
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
 * Result of project creation intent analysis (imported for type safety)
 * Full definition in: services/agentic-chat/analysis/project-creation-analyzer.ts
 */
export interface ProjectCreationIntentAnalysis {
	hasSufficientContext: boolean;
	confidence: number;
	presentInfo: {
		hasProjectType: boolean;
		hasDomain: boolean;
		hasDeliverable: boolean;
		hasGoals: boolean;
		hasTimeline: boolean;
		hasScale: boolean;
	};
	missingInfo: string[];
	clarifyingQuestions?: string[];
	reasoning: string;
	inferredProjectType?: string;
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
	/** Present when strategy is PROJECT_CREATION and intent analysis was performed */
	project_creation_analysis?: ProjectCreationIntentAnalysis;
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
	projectFocus?: ProjectFocus | null;
	conversation_history?: ChatMessage[];
	stream_run_id?: number;
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
	| { type: 'focus_active'; focus: ProjectFocus }
	| { type: 'focus_changed'; focus: ProjectFocus }
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
		focus?: ProjectFocus | null;
		scope?: OntologyContextScope;
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
	projectFocus?: ProjectFocus | null;
}
