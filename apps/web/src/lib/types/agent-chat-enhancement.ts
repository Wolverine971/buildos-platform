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
	LocationContext,
	LastTurnContext,
	ProjectFocus,
	FocusEntitySummary,
	Database
} from '@buildos/shared-types';
import type { EntityLinkedContext } from '$lib/types/linked-entity-context.types';
import type { DocStructure } from '$lib/types/onto-api';

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
	| 'milestone'
	| 'risk'
	| 'requirement';

type OntologyEntityRecordMap = {
	project: Database['public']['Tables']['onto_projects']['Row'];
	task: Database['public']['Tables']['onto_tasks']['Row'];
	goal: Database['public']['Tables']['onto_goals']['Row'];
	plan: Database['public']['Tables']['onto_plans']['Row'];
	document: Database['public']['Tables']['onto_documents']['Row'];
	milestone: Database['public']['Tables']['onto_milestones']['Row'];
	risk: Database['public']['Tables']['onto_risks']['Row'];
	requirement: Database['public']['Tables']['onto_requirements']['Row'];
};

type OntologyEntityCollectionMap = {
	projects: OntologyEntityRecordMap['project'][];
	tasks: OntologyEntityRecordMap['task'][];
	goals: OntologyEntityRecordMap['goal'][];
	plans: OntologyEntityRecordMap['plan'][];
	documents: OntologyEntityRecordMap['document'][];
	milestones: OntologyEntityRecordMap['milestone'][];
	risks: OntologyEntityRecordMap['risk'][];
	requirements: OntologyEntityRecordMap['requirement'][];
};

export type OntologyContextEntities = Partial<
	OntologyEntityRecordMap & OntologyEntityCollectionMap
>;

export interface HighlightSection<T> {
	items: T[];
	more?: number;
}

export interface ProjectHighlightGoal {
	id: string;
	name: string;
	state_key?: string | null;
	type_key?: string | null;
	description?: string | null;
	created_at: string;
	updated_at?: string | null;
	target_date?: string | null;
	completed_at?: string | null;
	progress_percent?: number | null;
	completed_tasks?: number | null;
	total_tasks?: number | null;
	direct_edge?: boolean;
}

export interface ProjectHighlightRisk {
	id: string;
	title: string;
	state_key?: string | null;
	type_key?: string | null;
	impact?: string | null;
	probability?: number | null;
	content?: string | null;
	created_at: string;
	updated_at?: string | null;
	mitigated_at?: string | null;
}

export interface ProjectHighlightRequirement {
	id: string;
	text: string;
	priority?: number | null;
	type_key?: string | null;
	created_at: string;
	updated_at?: string | null;
}

export interface ProjectHighlightDocument {
	id: string;
	title: string;
	state_key?: string | null;
	type_key?: string | null;
	description?: string | null;
	created_at: string;
	updated_at?: string | null;
	direct_edge?: boolean;
}

export interface ProjectHighlightMilestone {
	id: string;
	title: string;
	due_at?: string | null;
	state_key?: string | null;
	type_key?: string | null;
	description?: string | null;
	created_at: string;
	updated_at?: string | null;
	completed_at?: string | null;
}

export interface ProjectHighlightPlan {
	id: string;
	name: string;
	state_key?: string | null;
	type_key?: string | null;
	description?: string | null;
	task_count?: number | null;
	completed_task_count?: number | null;
	created_at: string;
	updated_at?: string | null;
}

export interface ProjectHighlightSignal {
	id: string;
	channel: string;
	ts?: string | null;
	created_at: string;
	payload_summary?: string | null;
}

export interface ProjectHighlightInsight {
	id: string;
	title: string;
	created_at: string;
	derived_from_signal_id?: string | null;
	summary?: string | null;
}

export interface ProjectHighlightTask {
	id: string;
	title: string;
	state_key?: string | null;
	type_key?: string | null;
	priority?: number | null;
	description?: string | null;
	updated_at?: string | null;
	start_at?: string | null;
	due_at?: string | null;
	created_at?: string | null;
	completed_at?: string | null;
	plan_ids?: string[];
	goal_ids?: string[];
	dependency_count?: number | null;
	dependent_count?: number | null;
}

export interface ProjectHighlights {
	goals: HighlightSection<ProjectHighlightGoal>;
	risks: HighlightSection<ProjectHighlightRisk>;
	requirements: HighlightSection<ProjectHighlightRequirement>;
	documents: HighlightSection<ProjectHighlightDocument>;
	milestones: HighlightSection<ProjectHighlightMilestone>;
	plans: HighlightSection<ProjectHighlightPlan>;
	signals: HighlightSection<ProjectHighlightSignal>;
	insights: HighlightSection<ProjectHighlightInsight>;
	tasks: {
		recent: HighlightSection<ProjectHighlightTask>;
		upcoming: HighlightSection<ProjectHighlightTask>;
	};
}

export interface GraphSnapshotNode {
	id: string;
	kind: string;
	name: string;
	state_key?: string | null;
	type_key?: string | null;
	direct_edge?: boolean;
	last_updated?: string | null;
}

export interface GraphSnapshotEdge {
	id: string;
	src_id: string;
	src_kind: string;
	dst_id: string;
	dst_kind: string;
	rel: string;
}

export interface GraphSnapshotCoverageEntry {
	total: number;
	direct: number;
	unlinked: number;
}

export interface GraphSnapshot {
	root_id: string;
	root_kind: string;
	max_depth: number;
	nodes: GraphSnapshotNode[];
	edges: GraphSnapshotEdge[];
	coverage: Record<string, GraphSnapshotCoverageEntry>;
}

export interface DocumentTreeContextNode {
	id: string;
	title: string;
	description?: string | null;
	order?: number | null;
	children?: DocumentTreeContextNode[];
}

export interface DocumentTreeContext {
	version: number;
	root: DocumentTreeContextNode[];
	total_nodes: number;
	truncated?: boolean;
	unlinked_count?: number;
	unlinked?: Array<{ id: string; title: string }>;
}

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
		context_document_title?: string;
		facets?: Record<string, any>; // From props->facets
		hierarchy_level?: number;
		available_entity_types?: string[];
		total_projects?: number;
		recent_project_ids?: string[];
		project_highlights?: ProjectHighlights;
		graph_snapshot?: GraphSnapshot;
		document_tree?: DocumentTreeContext;
		doc_structure?: DocStructure;
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
 * Tool selection summary for planner context
 */
export interface ToolSelectionSummary {
	selected_tools: string[];
	intent?: 'read' | 'write' | 'mixed';
	added_tools?: string[];
	removed_tools?: string[];
	reasoning?: string;
	/** True if this selection was produced by heuristic fallback rather than LLM */
	is_fallback?: boolean;
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
	tool_selection?: ToolSelectionSummary;
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
	ontologyEntityType?:
		| 'task'
		| 'plan'
		| 'goal'
		| 'document'
		| 'milestone'
		| 'risk'
		| 'requirement';
	lastTurnContext?: LastTurnContext;
	projectFocus?: ProjectFocus | null;
	conversation_history?: ChatMessage[];
	voiceNoteGroupId?: string;
	voice_note_group_id?: string;
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
				entity_type:
					| 'project'
					| 'task'
					| 'plan'
					| 'goal'
					| 'document'
					| 'milestone'
					| 'risk'
					| 'requirement';
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

// ============================================
// CONTEXT PREWARM CACHES
// ============================================

export interface LocationContextCache {
	cacheKey: string;
	loadedAt: number;
	content: string;
	metadata?: LocationContext['metadata'];
}

export interface LinkedEntitiesCache {
	cacheKey: string;
	loadedAt: number;
	context: EntityLinkedContext;
}

export interface DocStructureCache {
	cacheKey: string;
	loadedAt: number;
	projectId: string;
	structure: DocStructure;
	documents: Record<
		string,
		{
			id: string;
			title: string;
			description?: string | null;
			type_key?: string | null;
			state_key?: string | null;
			updated_at?: string | null;
			content_length?: number | null;
		}
	>;
	unlinked?: string[];
}

export interface ContextCacheHint {
	location?: LocationContextCache;
	linkedEntities?: LinkedEntitiesCache;
	docStructure?: DocStructureCache;
}

// ============================================
// AGENT STATE (SESSION-SCOPED)
// ============================================

export interface AgentStateItem {
	id: string;
	kind: 'task' | 'doc' | 'note' | 'idea' | 'question';
	title: string;
	details?: string;
	status: 'active' | 'resolved' | 'discarded';
	relatedEntityIds?: string[];
	createdAt: string;
	updatedAt: string;
}

export interface AgentState {
	sessionId: string;
	current_understanding: {
		entities: Array<{ id: string; kind: string; name?: string }>;
		dependencies: Array<{ from: string; to: string; rel?: string }>;
	};
	assumptions: Array<{
		id: string;
		hypothesis: string;
		confidence: number;
		evidence?: string[];
	}>;
	expectations: Array<{
		id?: string;
		action: string;
		expected_outcome: string;
		expected_ids?: string[];
		expected_type?: string;
		expected_count?: number;
		invariant?: string;
		status?: 'pending' | 'confirmed' | 'failed';
		last_checked_at?: string;
	}>;
	tentative_hypotheses: Array<{
		id: string;
		hypothesis: string;
		reason?: string;
	}>;
	items: AgentStateItem[];
	lastSummarizedAt?: string;
}

export type AgentStateItemUpdate =
	| { op: 'add'; item: AgentStateItem }
	| { op: 'update'; id: string; patch: Partial<AgentStateItem> }
	| { op: 'remove'; id: string };

export interface AgentStateUpdate {
	current_understanding?: {
		entities?: Array<{ id: string; kind: string; name?: string }>;
		dependencies?: Array<{ from: string; to: string; rel?: string }>;
	};
	assumptions?: Array<{
		id?: string;
		hypothesis: string;
		confidence?: number;
		evidence?: string[];
	}>;
	expectations?: Array<{
		id?: string;
		action: string;
		expected_outcome: string;
		expected_ids?: string[];
		expected_type?: string;
		expected_count?: number;
		invariant?: string;
		status?: 'pending' | 'confirmed' | 'failed';
		last_checked_at?: string;
	}>;
	tentative_hypotheses?: Array<{
		id?: string;
		hypothesis: string;
		reason?: string;
	}>;
}

export interface AgentStateDelta {
	agent_state_item_updates?: AgentStateItemUpdate[];
	agent_state_updates?: AgentStateUpdate;
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
	contextCache?: ContextCacheHint;
	deferCompression?: boolean;
}
