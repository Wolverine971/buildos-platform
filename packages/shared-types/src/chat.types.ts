// packages/shared-types/src/chat.types.ts
/**
 * Chat System Types with Progressive Disclosure Pattern
 *
 * This module defines types for the BuildOS chat system that implements
 * a progressive disclosure pattern to optimize token usage by loading
 * abbreviated data first and detailed data only when needed.
 */

import type { Database } from './database.types';

// =====================================================
// Database Table Types (from Supabase)
// =====================================================

export type ChatSession = Database['public']['Tables']['chat_sessions']['Row'];
export type ChatSessionInsert = Database['public']['Tables']['chat_sessions']['Insert'];
export type ChatSessionUpdate = Database['public']['Tables']['chat_sessions']['Update'];

export type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
export type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert'];
export type ChatMessageUpdate = Database['public']['Tables']['chat_messages']['Update'];

export type ChatToolExecution = Database['public']['Tables']['chat_tool_executions']['Row'];
export type ChatToolExecutionInsert = Database['public']['Tables']['chat_tool_executions']['Insert'];

export type ChatContextCache = Database['public']['Tables']['chat_context_cache']['Row'];
export type ChatContextCacheInsert = Database['public']['Tables']['chat_context_cache']['Insert'];

export type ChatCompression = Database['public']['Tables']['chat_compressions']['Row'];
export type ChatCompressionInsert = Database['public']['Tables']['chat_compressions']['Insert'];

// =====================================================
// Core Types
// =====================================================

export type ChatContextType =
	// Original reactive chat modes
	| 'global'
	| 'project'
	| 'task'
	| 'calendar'
	// Agent proactive modes
	| 'general' // General agent assistant
	| 'project_create' // Creating new project with guided questions
	| 'project_audit' // Critical review of project
	| 'project_forecast' // Scenario forecasting
	| 'task_update' // Quick task updates
	| 'daily_brief_update'; // Daily brief preferences
export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';
export type ChatSessionStatus = 'active' | 'archived' | 'compressed';
export type ToolCategory = 'list' | 'detail' | 'action' | 'calendar';

/**
 * Metadata for system prompt customization
 * Used to inject dynamic values into agent mode prompts
 */
export interface SystemPromptMetadata {
	userName?: string; // User's name for personalization
	projectName?: string; // Project name for project-specific modes
	projectId?: string; // Project ID for context
	dimensionsCovered?: string[]; // Already covered dimensions (project_create)
	auditHarshness?: number; // Audit severity 1-10 (project_audit)
	taskTitle?: string; // Task title for task_update mode
}

// =====================================================
// Abbreviated Data Structures (Progressive Disclosure)
// =====================================================

export interface AbbreviatedTask {
  id: string;
  title: string;
  status: 'backlog' | 'in_progress' | 'done' | 'blocked';
  priority: 'low' | 'medium' | 'high';
  start_date: string | null;
  duration_minutes: number | null;

  // Preview fields (truncated)
  description_preview: string;      // First 100 chars
  details_preview: string | null;   // First 100 chars

  // Metadata hints for drilling down
  has_subtasks: boolean;
  has_dependencies: boolean;
  is_recurring: boolean;
  project_name?: string;

  // Computed fields
  is_overdue?: boolean;
}

export interface AbbreviatedProject {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'paused' | 'completed' | 'archived';

  // Dates
  start_date: string | null;
  end_date: string | null;

  // Full fields (already concise)
  description: string | null;       // Usually <200 chars
  executive_summary: string | null; // Usually <500 chars
  tags: string[] | null;

  // Preview field
  context_preview: string | null;   // First 500 chars of context

  // Statistics
  task_count: number;
  active_task_count: number;
  completed_task_count: number;
  completion_percentage: number;

  // Hints for drilling down
  has_phases: boolean;
  has_notes: boolean;
  has_brain_dumps: boolean;
}

export interface AbbreviatedNote {
  id: string;
  title: string | null;
  category: string | null;
  content_preview: string;          // First 200 chars
  tags: string[] | null;
  created_at: string;
  project_name?: string;
}

export interface AbbreviatedBrainDump {
  id: string;
  title: string | null;
  ai_summary: string | null;        // Full summary (already concise)
  status: string;
  created_at: string;
  project_name?: string;
  operation_count?: number;
}

export interface AbbreviatedCalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  is_all_day: boolean;
  has_description: boolean;
  has_attendees: boolean;
  linked_task_id?: string;
}

// =====================================================
// Tool System Types
// =====================================================

export interface ChatToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string of arguments
  };
}

export interface ChatToolResult {
  tool_call_id: string;
  result: any;
  success: boolean;
  duration_ms?: number;
  error?: string;
  requires_user_action?: boolean;
  stream_events?: any[];
}

export interface ChatToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

// Tool argument types for each tool
export interface ListTasksArgs {
  project_id?: string;
  status?: Array<'backlog' | 'in_progress' | 'done' | 'blocked'>;
  priority?: Array<'low' | 'medium' | 'high'>;
  has_date?: boolean;
  limit?: number;
  sort_by?: 'priority' | 'start_date' | 'created_at';
}

export interface SearchProjectsArgs {
  query?: string;
  status?: 'active' | 'paused' | 'completed' | 'archived';
  has_active_tasks?: boolean;
  limit?: number;
}

export interface SearchNotesArgs {
  query?: string;
  project_id?: string;
  category?: string;
  limit?: number;
}

export interface GetTaskDetailsArgs {
  task_id: string;
  include_subtasks?: boolean;
  include_project_context?: boolean;
}

export interface GetProjectDetailsArgs {
  project_id: string;
  include_tasks?: boolean;
  include_phases?: boolean;
  include_notes?: boolean;
  include_brain_dumps?: boolean;
}

export interface GetNoteDetailsArgs {
  note_id: string;
}

export interface CreateTaskArgs {
  title: string;
  description?: string;
  project_id?: string;
  priority?: 'low' | 'medium' | 'high';
  task_type?: 'one_off' | 'recurring';
  duration_minutes?: number;
  start_date?: string;
  parent_task_id?: string;
}

export interface UpdateTaskArgs {
  task_id: string;
  updates: {
    title?: string;
    description?: string;
    details?: string;
    status?: 'backlog' | 'in_progress' | 'done' | 'blocked';
    priority?: 'low' | 'medium' | 'high';
    start_date?: string;
    duration_minutes?: number;
  };
}

export interface UpdateProjectArgs {
  project_id: string;
  updates: {
    name?: string;
    description?: string;
    executive_summary?: string;
    context?: string;
    status?: 'active' | 'paused' | 'completed' | 'archived';
    start_date?: string;
    end_date?: string;
    tags?: string[];
    // Calendar settings
    calendar_color_id?: string;
    calendar_sync_enabled?: boolean;
    // Core dimensions (9 dimensions framework)
    core_goals_momentum?: string;
    core_harmony_integration?: string;
    core_integrity_ideals?: string;
    core_meaning_identity?: string;
    core_opportunity_freedom?: string;
    core_people_bonds?: string;
    core_power_resources?: string;
    core_reality_understanding?: string;
    core_trust_safeguards?: string;
  };
}

export interface GetCalendarEventsArgs {
  timeMin?: string;
  timeMax?: string;
  limit?: number;
}

export interface FindAvailableSlotsArgs {
  timeMin: string;
  timeMax: string;
  duration_minutes?: number;
  preferred_hours?: number[];
}

export interface ScheduleTaskArgs {
  task_id: string;
  start_time: string;
  duration_minutes?: number;
  recurrence_pattern?: 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly';
}

// Additional types for enhanced task-calendar management
export interface GetTaskCalendarEventsArgs {
  task_id: string;
  include_deleted?: boolean;
}

export interface CheckTaskHasCalendarEventArgs {
  task_id: string;
}

export interface UpdateOrScheduleTaskArgs {
  project_id: string;
  task_id: string;
  start_time: string;
  duration_minutes?: number;
  force_recreate?: boolean;
  recurrence_pattern?: 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly';
  recurrence_ends?: string;
  timeZone?: string;
}

export interface UpdateCalendarEventArgs {
  event_id: string;
  calendar_id?: string;
  start_time?: string;
  end_time?: string;
  summary?: string;
  description?: string;
  timeZone?: string;
}

export interface DeleteCalendarEventArgs {
  event_id: string;
  calendar_id?: string;
}

export interface CreateNoteArgs {
  title?: string;
  content: string;
  project_id?: string;
  category?: string;
  tags?: string[];
}

export interface CreateBrainDumpArgs {
  content: string;
  project_id?: string;
}

export interface SearchBrainDumpsArgs {
  query?: string;
  project_id?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  limit?: number;
}

export interface GetBrainDumpDetailsArgs {
  brain_dump_id: string;
}

// =====================================================
// Context Management Types
// =====================================================

export interface ContextLayer {
  priority: number;        // 1 = highest priority
  type: 'system' | 'user' | 'location' | 'related' | 'history';
  content: string;
  tokens: number;
  truncatable: boolean;    // Can be shortened if needed
  metadata?: any;
}

export interface LocationContext {
  content: string;
  tokens: number;
  metadata: {
    contextType?: ChatContextType;
    projectId?: string;
    projectName?: string;
    projectStatus?: string;
    completionPercentage?: number;
    taskId?: string;
    taskTitle?: string;
    userName?: string;
    abbreviated: boolean;
    taskCount?: number;
    hasPhases?: boolean;
    hasNotes?: boolean;
  };
}

export interface ContextBundle {
  layers: ContextLayer[];
  totalTokens: number;
  truncatedLayers: ContextLayer[];
  utilization: number;  // Percentage of budget used
}

export interface AssembledContext extends ContextBundle {
  systemPrompt: string;
  userContext?: string;
  locationContext: string;
  relatedData?: string;
}

// =====================================================
// Token Management Types
// =====================================================

export interface TokenBudget {
  HARD_LIMIT: number;
  SYSTEM_PROMPT: number;
  USER_PROFILE: number;
  LOCATION_CONTEXT: number;
  RELATED_DATA: number;
  HISTORY: number;
  RESPONSE: number;
  TOOL_RESULTS: number;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens?: number;
  tool_tokens?: number;
}

// =====================================================
// SSE Message Types
// =====================================================

export type ChatSSEMessage =
  | {
      type: 'session';
      session: ChatSession;
    }
  | {
      type: 'text';
      content: string;
    }
  | {
      type: 'tool_call';
      tool_call: ChatToolCall;
    }
  | {
      type: 'tool_result';
      tool_result: ChatToolResult;
    }
  | {
      type: 'error';
      error: string;
    }
  | {
      type: 'done';
      usage?: TokenUsage;
      finished_reason?: string;
    };

// =====================================================
// API Request/Response Types
// =====================================================

export interface ChatStreamRequest {
  message: string;
  session_id?: string;
  context_type?: ChatContextType;
  entity_id?: string;
}

export interface ChatStreamResponse {
  session_id: string;
  message_id: string;
  stream_url: string;
}

export interface CreateChatSessionRequest {
  context_type: ChatContextType;
  entity_id?: string;
  title?: string;
}

export interface CreateChatSessionResponse {
  session: ChatSession;
  initial_context: AssembledContext;
}

// =====================================================
// LLM Service Types
// =====================================================

export interface LLMStreamOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: ChatToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required';
  stream?: boolean;
  response_format?: { type: 'text' | 'json_object' };
}

export interface LLMMessage {
  role: ChatRole;
  content: string;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
}

// =====================================================
// UI Component Types
// =====================================================

export interface ChatModalProps {
  open: boolean;
  context_type?: ChatContextType;
  entity_id?: string;
  initial_message?: string;
  session_id?: string;
}

export interface ChatMessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onRetry?: () => void;
}

export interface ToolVisualizationProps {
  tool_call: ChatToolCall;
  tool_result?: ChatToolResult;
  isExecuting?: boolean;
}

// =====================================================
// Analytics Types
// =====================================================

export interface ChatAnalytics {
  session_id: string;
  total_messages: number;
  total_tokens: number;
  tool_calls: {
    total: number;
    by_category: Record<ToolCategory, number>;
    by_name: Record<string, number>;
  };
  progressive_disclosure_stats: {
    list_calls: number;
    detail_calls: number;
    detail_ratio: number; // detail_calls / (list_calls + detail_calls)
    tokens_saved_estimate: number;
  };
  average_response_time_ms: number;
  session_duration_minutes: number;
}

// =====================================================
// Error Types
// =====================================================

export class ChatError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ChatError';
  }
}

export class TokenLimitError extends ChatError {
  constructor(
    public used: number,
    public limit: number
  ) {
    super(
      `Token limit exceeded: ${used} tokens used, ${limit} limit`,
      'TOKEN_LIMIT_EXCEEDED',
      400
    );
  }
}

export class ToolExecutionError extends ChatError {
  constructor(
    public toolName: string,
    public originalError: Error
  ) {
    super(
      `Tool execution failed: ${toolName}`,
      'TOOL_EXECUTION_FAILED',
      500,
      { toolName, originalError: originalError.message }
    );
  }
}
