// packages/shared-types/src/agent.types.ts
/**
 * Type definitions for the Conversational Project Agent
 */

import type { ChatContextType, ChatSession, ChatToolCall } from './chat.types';
import type { Json } from './database.types';

// ============================================================================
// Last Turn Context
// ============================================================================

/**
 * Persistent context that passes between conversation turns
 * Contains lightweight pointers to entities and summary of last interaction
 */
export interface LastTurnEntityPreview {
	id: string;
	name?: string;
	description?: string;
}

export interface LastTurnEntities {
	projects?: LastTurnEntityPreview[];
	tasks?: LastTurnEntityPreview[];
	plans?: LastTurnEntityPreview[];
	goals?: LastTurnEntityPreview[];
	documents?: LastTurnEntityPreview[];
	milestones?: LastTurnEntityPreview[];
	risks?: LastTurnEntityPreview[];
	requirements?: LastTurnEntityPreview[];

	/** @deprecated Use entities.projects */
	project_id?: string;
	/** @deprecated Use entities.tasks */
	task_ids?: string[];
	/** @deprecated Use entities.plans */
	plan_id?: string;
	/** @deprecated Use entities.goals */
	goal_ids?: string[];
	/** @deprecated Use entities.documents */
	document_id?: string;
}

export interface LastTurnContext {
	// Brief 10-20 word summary of the last interaction
	summary: string;

	// Compact entity previews mentioned or accessed in last turn
	entities: LastTurnEntities;

	// Context type from last interaction
	context_type: ChatContextType;

	// Tools/data accessed in last turn
	data_accessed: string[];

	// Strategy used in last turn
	strategy_used?: 'planner_stream' | 'ask_clarifying_questions' | 'project_creation';

	// ISO timestamp of last turn
	timestamp: string;
}

// ============================================================================
// Base Operation Types
// ============================================================================

export type TableName =
  | 'projects'
  | 'tasks'
  | 'notes'
  | 'phases'
  | 'daily_briefs'
  | 'project_questions'
  | 'draft_tasks'
  | 'project_drafts';

export type OperationType = 'create' | 'update' | 'delete';

export interface ParsedOperation {
  id: string;
  table: TableName;
  operation: OperationType;
  data: {
    // Project references - only ONE should be present
    project_id?: string; // Direct UUID for existing projects
    project_ref?: string; // Reference to project being created in same batch

    // Standard fields
    [key: string]: any;
  };
  ref?: string; // This operation's reference (for new items)
  searchQuery?: string;
  conditions?: Record<string, any>; // For update operations
  enabled: boolean;
  error?: string | null;
  reasoning?: string;
  result?: Record<string, any>;
}

// ============================================================================
// Chat Types
// ============================================================================

export type AgentChatType =
  | 'general'
  | 'project'
  | 'project_create'    // Creating a new project from scratch
  | 'daily_brief_update'; // Daily brief updates

// ============================================================================
// Draft Types
// ============================================================================

export interface ProjectDraft {
  id: string;
  user_id: string;
  chat_session_id: string; // Required link to session

  // All project fields (mirroring projects table)
  name?: string;
  slug?: string;
  description?: string;
  context?: string;
  executive_summary?: string;
  status?: 'active' | 'paused' | 'completed' | 'archived';
  tags?: string[];
  start_date?: string;
  end_date?: string;

  // Core dimensions
  core_integrity_ideals?: string;
  core_people_bonds?: string;
  core_goals_momentum?: string;
  core_meaning_identity?: string;
  core_reality_understanding?: string;
  core_trust_safeguards?: string;
  core_opportunity_freedom?: string;
  core_power_resources?: string;
  core_harmony_integration?: string;

  // Calendar
  calendar_color_id?: string;
  calendar_settings?: Record<string, any>;
  calendar_sync_enabled?: boolean;

  // Metadata
  dimensions_covered?: string[];
  question_count?: number;

  // Lifecycle
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  finalized_project_id?: string;

  // Related draft tasks
  draft_tasks?: DraftTask[];
}

export interface DraftTask {
  id: string;
  draft_project_id: string; // Required connection
  user_id: string;

  // All task fields (mirroring tasks table)
  title: string;
  description?: string;
  details?: string;
  priority?: 'low' | 'medium' | 'high';
  status?: 'backlog' | 'in_progress' | 'done' | 'blocked';
  task_type?: 'one_off' | 'recurring';
  start_date?: string;
  completed_at?: string;
  duration_minutes?: number;
  recurrence_pattern?: 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  recurrence_ends?: string;
  recurrence_end_source?: string;
  parent_task_id?: string;
  dependencies?: string[];
  task_steps?: any;
  source?: string;
  source_calendar_event_id?: string;
  outdated?: boolean;

  created_at: string;
  updated_at: string;
  deleted_at?: string;
  finalized_task_id?: string;
}

// ============================================================================
// Operation Types
// ============================================================================

export interface ChatOperation extends ParsedOperation {
  id: string;
  chat_session_id: string;
  user_id: string;

  // Additional fields beyond ParsedOperation
  status: 'pending' | 'queued' | 'executing' | 'completed' | 'failed' | 'rolled_back' | 'partial';
  executed_at?: string;
  duration_ms?: number;
  created_at: string;

  // For tracking related operations
  batch_id?: string;
  sequence_number?: number;

  // For diffs
  before_data?: any;
  after_data?: any;
}

export interface OperationEventPayload {
  action: 'list' | 'search' | 'read' | 'create' | 'update' | 'delete';
  entity_type:
    | 'document'
    | 'task'
    | 'goal'
    | 'plan'
    | 'project'
    | 'milestone'
    | 'risk'
    | 'requirement';
  entity_name: string;
  status: 'start' | 'success' | 'error';
  entity_id?: string;
}

// ============================================================================
// Agent Metadata
// ============================================================================

export interface AgentMetadata {
  // Dimension tracking
  dimensions_detected?: string[];
  dimensions_covered?: string[];

  // Conversation tracking
  questions_asked?: number;
  user_responses?: Record<string, string>;

  // Operation tracking
  operations_executed?: number;
  operations_queued?: number;

  // Session state
  session_phase?: AgentSessionPhase;
  draft_project_id?: string;

  // Error tracking
  partial_failure?: boolean;
  failed_operations?: string[];
}

export type AgentSessionPhase =
  | 'gathering_info'  // Initial information collection
  | 'clarifying'      // Asking dimension questions
  | 'finalizing'      // Ready to create project
  | 'completed'       // Project created
  | 'partial_failure' // Some operations failed
  | 'abandoned';      // User left without completing

// ============================================================================
// SSE Message Types
// ============================================================================

export interface TemplateCreationRequestDetail {
  request_id: string;
  session_id?: string;
  user_id?: string;
  source_text: string;
  realm_suggestion: string;
  template_hints?: string[];
  missing_information?: string[];
  source_message_id?: string;
  confidence?: number;
  created_at: string;
}

export interface TemplateSchemaSummary {
  required_properties: string[];
  fsm_states: string[];
  facet_defaults?: {
    context?: string;
    scale?: string;
    stage?: string;
  };
  custom_fields?: string[];
}

export interface TemplateRecommendationSet {
  goals?: Array<{ name: string; description?: string }>;
  tasks?: Array<{ title: string; description?: string }>;
  outputs?: Array<{ name: string; description?: string }>;
}

export type TemplateCreationStatus =
  | 'queued'
  | 'generating_schema'
  | 'validating'
  | 'persisting'
  | 'completed'
  | 'failed';

export type TemplateCreationEvent =
  | {
      type: 'template_creation_request';
      request: TemplateCreationRequestDetail;
    }
  | {
      type: 'template_creation_status';
      request_id: string;
      status: TemplateCreationStatus;
      message?: string;
    }
  | {
      type: 'template_created';
      request_id: string;
      template: {
        id: string;
        type_key: string;
        realm: string;
        name: string;
        schema_summary: TemplateSchemaSummary;
        recommended_entities?: TemplateRecommendationSet;
      };
    }
  | {
      type: 'template_creation_failed';
      request_id: string;
      error: string;
      actionable?: boolean;
    };

export interface ProjectFocus {
  focusType:
    | 'project-wide'
    | 'task'
    | 'goal'
    | 'plan'
    | 'document'
    | 'milestone'
    | 'risk'
    | 'requirement';
  focusEntityId: string | null;
  focusEntityName: string | null;
  projectId: string;
  projectName: string;
}

export interface FocusEntitySummary {
  id: string;
  name: string;
  type:
    | 'task'
    | 'goal'
    | 'plan'
    | 'document'
    | 'milestone'
    | 'risk'
    | 'requirement';
  metadata?: {
    state_key?: string | null;
    priority?: number | null;
    due_at?: string | null;
    [key: string]: any;
  };
}

export interface ContextShiftPayload {
  new_context: ChatContextType;
  entity_id: string | null;
  entity_name: string | null;
  entity_type:
    | 'workspace'
    | 'project'
    | 'task'
    | 'plan'
    | 'goal'
    | 'document'
    | 'milestone'
    | 'risk'
    | 'requirement';
  message?: string;
}

// Lightweight context usage snapshot for UI + telemetry
export interface ContextUsageSnapshot {
  estimatedTokens: number;
  tokenBudget: number;
  usagePercent: number;
  tokensRemaining: number;
  status: 'ok' | 'near_limit' | 'over_budget';
  lastCompressedAt?: string | null;
  lastCompression?: {
    id: string;
    compressionRatio?: number | null;
    originalTokens?: number;
    compressedTokens?: number;
  } | null;
}

type LegacyAgentSSEMessage =
  | { type: 'operation'; operation: ChatOperation | OperationEventPayload }
  | { type: 'draft_update'; draft: Partial<ProjectDraft> }
  | { type: 'dimension_update'; dimension: string; content: string }
  | { type: 'phase_update'; phase: AgentSessionPhase; message?: string }
  | { type: 'queue_update'; operations: ChatOperation[] };

export type SkillActivityEvent = {
	type: 'skill_activity';
	action: 'requested' | 'loaded';
	path: string;
	via: 'skill_load';
};

export interface AgentTimingSummary {
  request_started_at: string;
  session_resolved_at?: string | null;
  history_loaded_at?: string | null;
  history_composed_at?: string | null;
  context_ready_at?: string | null;
  first_event_at?: string | null;
  first_response_at?: string | null;
  assistant_persisted_at?: string | null;
  done_emitted_at?: string | null;
  cache_source?:
    | 'not_requested'
    | 'session_cache'
    | 'request_prewarm'
    | 'prepared_prompt'
    | 'fresh_load'
    | 'context_build_failed';
  cache_age_seconds?: number | null;
  bypassed_context_cache?: boolean;
  history_strategy?: string | null;
  history_compressed?: boolean;
  raw_history_count?: number | null;
  history_for_model_count?: number | null;
  finished_reason?: string | null;
  phases: {
    session_resolve_ms?: number;
    history_load_ms?: number;
    history_compose_ms?: number;
    tool_selection_ms?: number;
    context_build_ms?: number;
    request_to_context_ready_ms?: number;
    time_to_first_event_ms?: number;
    time_to_first_response_ms?: number;
    response_generation_ms?: number;
    assistant_persist_ms?: number;
    finalization_ms?: number;
    total_request_ms?: number;
  };
}

export type AgentSSEMessage =
  | { type: 'context_usage'; usage: ContextUsageSnapshot }
  | { type: 'session'; session?: ChatSession; sessionId?: string }
  | { type: 'ontology_loaded'; summary: string }
  | { type: 'last_turn_context'; context: LastTurnContext }
  | { type: 'focus_active'; focus: ProjectFocus }
  | { type: 'focus_changed'; focus: ProjectFocus }
  | {
      type: 'agent_state';
      state: 'thinking' | 'waiting_on_user';
      contextType: ChatContextType;
      details?: string;
    }
  | { type: 'clarifying_questions'; questions: string[] }
  | { type: 'text'; content: string }
  | { type: 'text_delta'; content: string }
  | { type: 'tool_call'; tool_call: ChatToolCall }
  | { type: 'tool_result'; result: Record<string, any> }
  | SkillActivityEvent
  | { type: 'context_shift'; context_shift: ContextShiftPayload }
  | { type: 'timing'; timing: AgentTimingSummary }
  | TemplateCreationEvent
  | { type: 'error'; error: string }
  | {
      type: 'done';
      usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
      finished_reason?: string;
    }
  | LegacyAgentSSEMessage;

// ============================================================================
// Dimension Questions
// ============================================================================

export const DIMENSION_QUESTIONS: Record<string, string[]> = {
  core_integrity_ideals: [
    "What does success look like for this project?",
    "What are your quality standards or non-negotiables?",
    "How will you know when it's done?"
  ],
  core_people_bonds: [
    "Who else is involved in this?",
    "Are there stakeholders or team members I should know about?",
    "Who do you need to keep in the loop?"
  ],
  core_goals_momentum: [
    "What are your key milestones?",
    "What's your timeline looking like?",
    "Any specific deadlines or delivery dates?"
  ],
  core_meaning_identity: [
    "Why does this project matter to you?",
    "What makes this unique or different?",
    "How does this fit into your bigger picture?"
  ],
  core_reality_understanding: [
    "What's the current situation?",
    "What problem are you solving?",
    "What constraints are you working with?"
  ],
  core_trust_safeguards: [
    "What could go wrong?",
    "What risks are you concerned about?",
    "What's your backup plan if things don't go as expected?"
  ],
  core_opportunity_freedom: [
    "What options are you considering?",
    "Any alternative approaches you're thinking about?",
    "What experiments might you want to run?"
  ],
  core_power_resources: [
    "What budget or resources do you have?",
    "What tools or team members are available?",
    "Any constraints on time or money?"
  ],
  core_harmony_integration: [
    "How will you track progress?",
    "What feedback loops are important?",
    "How does this integrate with your other work?"
  ]
};

// ============================================================================
// Agent Configuration
// ============================================================================

export interface AgentConfig {
  enabled: boolean;
  rollout_percentage: number;
  modes_enabled: Record<AgentChatType, boolean>;
  default_auto_accept: boolean;
  max_questions_simple: number;
  max_questions_complex: number;
  audit_harshness: number;
  auto_recovery_enabled: boolean;
  operation_timeout_ms: number;
  default_temperature: number;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  rollout_percentage: 10,
  modes_enabled: {
    general: true,
    project_create: true,
    project: true,
    daily_brief_update: false // Phase 2
  },
  default_auto_accept: false, // User requirement: require approval by default
  max_questions_simple: 5,
  max_questions_complex: 10,
  audit_harshness: 7,
  auto_recovery_enabled: true,
  operation_timeout_ms: 5000,
  default_temperature: 0.8
};

// ============================================================================
// LLM Profiles for Agent
// ============================================================================

export const AGENT_LLM_PROFILES = {
  // Conversational responses - fast and warm
  conversation: {
    profile: 'speed',
    temperature: 0.8,
    maxTokens: 500
  },

  // Dimension analysis - fast and analytical
  analysis: {
    profile: 'fast',
    temperature: 0.2,
    maxTokens: 1000
  },

  // Operation generation - balanced and precise
  operations: {
    profile: 'balanced',
    temperature: 0.3,
    maxTokens: 2000
  },

  // Audit mode - quality and thorough
  audit: {
    profile: 'quality',
    temperature: 0.4,
    maxTokens: 3000
  },

  // Forecast mode - creative and exploratory
  forecast: {
    profile: 'creative',
    temperature: 0.9,
    maxTokens: 2500
  }
};

// ============================================================================
// Helpers
// ============================================================================

export function isAgentChatType(type: string): type is AgentChatType {
  return [
    'general',
    'project_create',
    'project',
    'daily_brief_update'
  ].includes(type);
}

export function isComplexProject(draft: ProjectDraft): boolean {
  const dimensionCount = draft.dimensions_covered?.length || 0;
  const hasMultipleTasks = (draft.draft_tasks?.length || 0) > 5;
  const hasLongTimeline = !!(draft.start_date && draft.end_date &&
    new Date(draft.end_date).getTime() - new Date(draft.start_date).getTime() > 90 * 24 * 60 * 60 * 1000);

  return dimensionCount > 5 || hasMultipleTasks || hasLongTimeline;
}

export function getNextPrioritizedDimension(
  detected: string[],
  covered: string[]
): string | null {
  // Priority order for dimensions
  const priorityOrder = [
    'core_integrity_ideals',     // Always ask about goals first
    'core_reality_understanding', // Then current state
    'core_goals_momentum',        // Then timeline
    'core_people_bonds',          // Then people
    'core_trust_safeguards',      // Then risks
    'core_power_resources',       // Then resources
    'core_opportunity_freedom',   // Then options
    'core_meaning_identity',      // Then meaning
    'core_harmony_integration'    // Finally integration
  ];

  for (const dimension of priorityOrder) {
    if (detected.includes(dimension) && !covered.includes(dimension)) {
      return dimension;
    }
  }

  return null;
}

// The legacy multi-agent (planner + executor) types that previously lived here
// were removed on 2026-04-17. Every reference outside this file pointed at
// dead code paths. See docs/specs/agentic-chat-cruft-removal-2026-04-17.md.
