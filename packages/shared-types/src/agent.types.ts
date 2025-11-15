// packages/shared-types/src/agent.types.ts
/**
 * Type definitions for the Conversational Project Agent
 */

import type { ChatContextType, ChatSession, ChatToolCall } from './chat.types';

// ============================================================================
// Last Turn Context
// ============================================================================

/**
 * Persistent context that passes between conversation turns
 * Contains lightweight pointers to entities and summary of last interaction
 */
export interface LastTurnContext {
	// Brief 10-20 word summary of the last interaction
	summary: string;

	// Entity IDs mentioned or accessed in last turn
	entities: {
		project_id?: string;
		task_ids?: string[];
		plan_id?: string;
		goal_ids?: string[];
		document_id?: string;
		output_id?: string;
	};

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
// Base Operation Types (shared with brain-dump system)
// ============================================================================

export type TableName =
  | 'projects'
  | 'tasks'
  | 'notes'
  | 'phases'
  | 'project_context'
  | 'project_notes'
  | 'brain_dumps'
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
  error?: string;
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
  | 'project_audit'     // Critical review of project
  | 'project_forecast'  // Scenario forecasting
  | 'task_update'       // Updating tasks
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
  completed_at?: string;
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
  | 'gathering_info'  // Initial brain dump collection
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
  braindump: string;
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
  focusType: 'project-wide' | 'task' | 'goal' | 'plan' | 'document' | 'output' | 'milestone';
  focusEntityId: string | null;
  focusEntityName: string | null;
  projectId: string;
  projectName: string;
}

export interface FocusEntitySummary {
  id: string;
  name: string;
  type: 'task' | 'goal' | 'plan' | 'document' | 'output' | 'milestone';
  metadata?: {
    state_key?: string | null;
    priority?: number | null;
    due_at?: string | null;
    [key: string]: any;
  };
}

export interface ContextShiftPayload {
  new_context: ChatContextType;
  entity_id: string;
  entity_name: string;
  entity_type: 'project' | 'task' | 'plan' | 'goal';
  message: string;
}

type LegacyAgentSSEMessage =
  | { type: 'operation'; operation: ChatOperation }
  | { type: 'draft_update'; draft: Partial<ProjectDraft> }
  | { type: 'dimension_update'; dimension: string; content: string }
  | { type: 'phase_update'; phase: AgentSessionPhase; message?: string }
  | { type: 'queue_update'; operations: ChatOperation[] }
  | { type: 'executor_instructions'; instructions: string };

export type AgentSSEMessage =
  | { type: 'session'; session?: ChatSession; sessionId?: string }
  | { type: 'ontology_loaded'; summary: string }
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
  | { type: 'plan_created'; plan: AgentPlan }
  | {
      type: 'plan_ready_for_review';
      plan: AgentPlan;
      summary?: string;
      recommendations?: string[];
    }
  | { type: 'step_start'; step: AgentPlanStep }
  | { type: 'step_complete'; step: AgentPlanStep }
  | { type: 'executor_spawned'; executorId: string; task: Record<string, any> }
  | { type: 'executor_result'; executorId: string; result: Record<string, any> }
  | {
      type: 'plan_review';
      plan: AgentPlan;
      verdict: 'approved' | 'changes_requested' | 'rejected';
      notes?: string;
      reviewer?: string;
    }
  | { type: 'text'; content: string }
  | { type: 'tool_call'; tool_call: ChatToolCall }
  | { type: 'tool_result'; result: Record<string, any> }
  | { type: 'context_shift'; context_shift: ContextShiftPayload }
  | TemplateCreationEvent
  | { type: 'error'; error: string }
  | { type: 'done'; usage?: { total_tokens: number } }
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
  show_old_braindump: boolean;
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
    project_audit: false,  // Phase 2
    project_forecast: false, // Phase 2
    task_update: false,     // Phase 2
    daily_brief_update: false // Phase 2
  },
  show_old_braindump: true,
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
    'project_audit',
    'project_forecast',
    'task_update',
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

// ============================================================================
// Multi-Agent System Types (Planner + Executor Architecture)
// ============================================================================

/**
 * Agent Type - Planner (orchestrator) or Executor (task runner)
 */
export type AgentType = 'planner' | 'executor';

/**
 * Agent Permission Level
 */
export type AgentPermission = 'read_only' | 'read_write';

/**
 * Agent Instance
 * Represents a single agent (planner or executor) with its own identity
 */
export interface Agent {
  id: string;

  // Identity
  type: AgentType;
  name: string;

  // Capabilities
  model_preference: string; // e.g., 'deepseek-chat' (planner), 'deepseek-coder' (executor)
  available_tools: string[]; // Tool names this agent can use
  permissions: AgentPermission; // 'read_only' (executor) or 'read_write' (planner)

  // Context
  system_prompt: string;
  created_for_session: string; // FK to chat_sessions
  created_for_plan?: string; // FK to agent_plans (optional)

  // Status
  status: 'active' | 'completed' | 'failed';

  // Timestamps
  created_at: string;
  completed_at?: string;

  // Ownership
  user_id: string;
}

/**
 * Planning Strategy
 * Mirrors the ChatStrategy enum returned by the planner LLM so we can
 * persist the full intent (planner stream, clarifying questions, or project creation).
 */
export type PlanningStrategy =
  | 'planner_stream'
  | 'ask_clarifying_questions'
  | 'project_creation';

/**
 * Structured metadata captured for each plan
 */
export interface AgentPlanMetadata {
  estimatedDuration?: number;
  actualDuration?: number;
  totalTokensUsed?: number;
  requiredTools?: string[];
  executorCount?: number;
  notes?: string;
  [key: string]: any;
}

/**
 * Agent Plan - Multi-step execution plan created by planner
 */
export interface AgentPlan {
  id: string;

  // Session context
  session_id: string; // FK to chat_sessions (user's session)
  user_id: string;
  planner_agent_id: string; // FK to agents

  // Plan content
  user_message: string; // Original user message
  strategy: PlanningStrategy;
  steps: AgentPlanStep[];
  metadata?: AgentPlanMetadata | null;

  // Status
  status: 'pending' | 'executing' | 'completed' | 'failed';

  // Timestamps
  created_at: string;
  completed_at?: string;
  updated_at: string;
}

/**
 * Agent Plan Step
 */
export interface AgentPlanStep {
  stepNumber: number;
  type: string; // 'search_project', 'schedule_tasks', etc.
  description: string;
  executorRequired: boolean;
  tools: string[]; // Tool names
  dependsOn?: number[]; // Step dependencies
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

/**
 * Agent Chat Session - LLM-to-LLM conversation
 */
export interface AgentChatSession {
  id: string;

  // Session context
  parent_session_id: string; // FK to chat_sessions (user's session)
  plan_id?: string; // FK to agent_plans
  step_number?: number; // Which plan step this is for

  // Participants
  planner_agent_id: string; // FK to agents
  executor_agent_id?: string; // FK to agents (NULL if planner-only)

  // Session type
  session_type: 'planner_thinking' | 'planner_executor';

  // Context
  initial_context: any; // Initial prompt, tools, constraints
  context_type?: string; // project, task, calendar, global
  entity_id?: string; // Project/task ID

  // Status
  status: 'active' | 'completed' | 'failed';
  message_count: number;

  // Timestamps
  created_at: string;
  completed_at?: string;

  // Ownership
  user_id: string;
}

/**
 * Agent Chat Message - Message in LLM-to-LLM conversation
 */
export interface AgentChatMessage {
  id: string;

  // Session
  agent_session_id: string; // FK to agent_chat_sessions

  // Sender
  sender_type: 'planner' | 'executor' | 'system';
  sender_agent_id?: string; // FK to agents (NULL for system messages)

  // Message content
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: any; // Tool calls made in this message
  tool_call_id?: string; // For tool response messages

  // Metadata
  tokens_used: number;
  model_used?: string; // Which LLM model was used

  // Timestamps
  created_at: string;

  // Tracing
  parent_user_session_id: string; // FK to chat_sessions (for tracing)
  user_id: string;
}

/**
 * Agent Execution - Track executor run for a plan step
 */
export interface AgentExecution {
  id: string;

  // Plan context
  plan_id: string; // FK to agent_plans
  step_number: number;

  // Executor
  executor_agent_id: string; // FK to agents
  agent_session_id: string; // FK to agent_chat_sessions

  // Task
  task: ExecutorTaskDefinition;
  tools_available: string[]; // Tool names

  // Results
  result?: any;
  success: boolean;
  error?: string;

  // Metrics
  tokens_used: number;
  duration_ms: number;
  tool_calls_made: number;
  message_count: number; // Messages in the agent session

  // Status
  status: 'pending' | 'executing' | 'completed' | 'failed';

  // Timestamps
  created_at: string;
  completed_at?: string;

  // Ownership
  user_id: string;
}

/**
 * Executor Task Definition
 */
export interface ExecutorTaskDefinition {
  id: string;
  description: string; // "Find the marketing project and get its details"
  goal: string; // "Return project_id, name, and task count"
  constraints?: string[]; // ["Only active tasks", "Limit to 10 results"]
  contextData?: any; // Minimal relevant data (e.g., project_id if known)
}

/**
 * Model Preferences by Agent Type
 */
export const AGENT_MODEL_PREFERENCES = {
  planner: {
    primary: 'deepseek/deepseek-chat', // Smart, expensive
    fallback: 'openai/gpt-4o',
    temperature: 0.7,
    maxTokens: 2000
  },
  executor: {
    primary: 'deepseek/deepseek-coder', // Fast, cheap
    fallback: 'openai/gpt-3.5-turbo',
    temperature: 0.3,
    maxTokens: 1500
  }
} as const;

/**
 * Tool Permission Categories
 */
export const TOOL_PERMISSIONS = {
  // READ-ONLY tools (executor can use)
  read_only: [
    'list_tasks',
    'search_projects',
    'search_notes',
    'search_brain_dumps',
    'get_task_details',
    'get_project_details',
    'get_note_details',
    'get_brain_dump_details',
    'get_calendar_events',
    'find_available_slots',
    'get_task_calendar_events',
    'check_task_has_calendar_event'
  ],

  // READ-WRITE tools (planner only)
  read_write: [
    'create_task',
    'update_task',
    'update_project',
    'create_note',
    'create_brain_dump',
    'schedule_task',
    'update_calendar_event',
    'delete_calendar_event',
    'update_or_schedule_task'
  ]
} as const;

/**
 * Check if a tool requires write permissions
 */
export function isWriteTool(toolName: string): boolean {
  return (TOOL_PERMISSIONS.read_write as readonly string[]).includes(toolName);
}

/**
 * Get tools for agent based on permission level
 */
export function getToolsForAgent(allTools: any[], permission: AgentPermission): any[] {
  if (permission === 'read_write') {
    return allTools; // Planner gets all tools
  }

  // Executor gets only read-only tools
  return allTools.filter(tool =>
    TOOL_PERMISSIONS.read_only.includes(tool.function?.name || tool.name)
  );
}

/**
 * Streaming events from multi-agent system to user
 */
export type MultiAgentStreamEvent =
  // Planner events
  | { type: 'planner_thinking'; content: string }
  | { type: 'planner_analysis'; analysis: { strategy: string; reasoning: string } }
  | { type: 'plan_created'; plan: AgentPlan }
  | { type: 'planner_tool_call'; toolCall: any }
  | { type: 'planner_tool_result'; result: any }

  // Executor events
  | { type: 'executor_spawned'; agent: Agent; task: ExecutorTaskDefinition }
  | { type: 'executor_thinking'; executorId: string; content: string }
  | { type: 'executor_tool_call'; executorId: string; toolCall: any }
  | { type: 'executor_tool_result'; executorId: string; result: any }
  | { type: 'executor_complete'; executorId: string; result: any }
  | { type: 'executor_failed'; executorId: string; error: string }

  // Agent-to-agent communication
  | { type: 'agent_message'; sessionId: string; from: AgentType; to: AgentType; content: string }

  // Synthesis
  | { type: 'planner_synthesis'; content: string }
  | { type: 'final_response'; content: string }

  // General
  | { type: 'error'; error: string }
  | { type: 'done' };

/**
 * Database insert types
 */
export interface AgentInsert extends Omit<Agent, 'id' | 'created_at' | 'completed_at'> {
  id?: string;
  created_at?: string;
  completed_at?: string;
}

export interface AgentPlanInsert extends Omit<AgentPlan, 'id' | 'created_at' | 'completed_at' | 'updated_at'> {
  id?: string;
  created_at?: string;
  completed_at?: string;
  updated_at?: string;
}

export interface AgentChatSessionInsert extends Omit<AgentChatSession, 'id' | 'created_at' | 'completed_at' | 'message_count'> {
  id?: string;
  created_at?: string;
  completed_at?: string;
  message_count?: number;
}

export interface AgentChatMessageInsert extends Omit<AgentChatMessage, 'id' | 'created_at'> {
  id?: string;
  created_at?: string;
}

export interface AgentExecutionInsert extends Omit<AgentExecution, 'id' | 'created_at' | 'completed_at'> {
  id?: string;
  created_at?: string;
  completed_at?: string;
}
