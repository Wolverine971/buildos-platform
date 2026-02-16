// apps/web/src/routes/api/agent/stream/types.ts
/**
 * Endpoint-specific types for /api/agent/stream
 *
 * IMPORTANT: This file contains ONLY types specific to this endpoint.
 * Shared types are imported from:
 * - @buildos/shared-types
 * - $lib/types/agent-chat-enhancement
 * - $lib/services/agentic-chat/shared/types
 *
 * DO NOT recreate types that already exist elsewhere.
 */

// ============================================
// SHARED TYPE IMPORTS
// ============================================

import type {
	ChatContextType,
	ChatSession,
	ChatMessage,
	ChatToolCall,
	ContextUsageSnapshot,
	ProjectFocus
} from '@buildos/shared-types';

import type {
	OntologyContext,
	LastTurnContext,
	LocationContextCache,
	LinkedEntitiesCache,
	AgentState,
	DocStructureCache
} from '$lib/types/agent-chat-enhancement';

// Import types that already exist - don't recreate them
import type { ProjectClarificationMetadata } from '$lib/services/agentic-chat/shared/types';

// ============================================
// ENDPOINT-SPECIFIC TYPES
// ============================================

/**
 * Session-level ontology cache stored in agent_metadata.
 * This is endpoint-specific because it's only used for the session-level
 * caching in +server.ts, not by the underlying OntologyContextLoader.
 *
 * Two caching layers exist:
 * - OntologyContextLoader internal cache: 60s TTL, in-memory Map
 * - Session agent_metadata.ontologyCache: 5min TTL, stored in database
 *
 * Session-level cache takes precedence; loader cache is secondary optimization.
 */
export interface OntologyCache {
	/** The cached ontology context */
	context: OntologyContext;
	/** Timestamp when context was loaded (for TTL checking) */
	loadedAt: number;
	/** Cache key for invalidation on focus change (projectId:focusType:entityId or contextType:entityId) */
	cacheKey: string;
}

/**
 * Full session metadata stored in chat_sessions.agent_metadata.
 * This aggregates all metadata that needs to be persisted per session.
 */
export interface AgentSessionMetadata {
	/** Current project focus (project + optional entity) */
	focus?: ProjectFocus | null;
	/** Cached ontology context for faster subsequent requests */
	ontologyCache?: OntologyCache;
	/** Cached location context for faster subsequent requests */
	locationContextCache?: LocationContextCache;
	/** Cached linked-entities context for focused entities */
	linkedEntitiesCache?: LinkedEntitiesCache;
	/** Cached document structure + metadata (short TTL) */
	docStructureCache?: DocStructureCache;
	/** Structured agent state (session-scoped) */
	agent_state?: AgentState;
	/** Metadata for project creation clarification rounds */
	projectClarification?: ProjectClarificationMetadata;
	/** Last context usage snapshot */
	lastContextUsage?: ContextUsageSnapshot;
	/** Allow additional metadata fields */
	[key: string]: unknown;
}

/**
 * Parsed and validated stream request from POST body.
 * This is the internal representation after parsing EnhancedAgentStreamRequest.
 */
export interface StreamRequest {
	/** The user's message to process */
	message: string;
	/** Optional existing session ID */
	session_id?: string;
	/** The context type for the conversation */
	context_type: ChatContextType;
	/** Optional entity ID for project/entity context */
	entity_id?: string;
	/** Optional project focus */
	project_focus?: ProjectFocus | null;
	/** Optional conversation history (if not loading from session) */
	history?: ChatMessage[];
	/** Optional voice note group id for attachments */
	voice_note_group_id?: string;
	/** Optional ontology entity type for element-level context */
	ontology_entity_type?: 'task' | 'plan' | 'goal' | 'document' | 'milestone' | 'risk';
	/** Optional last turn context provided by client */
	last_turn_context?: LastTurnContext;
	/** Optional run id for guarding/persistence */
	stream_run_id?: number;
}

/**
 * Authentication result from authenticateRequest.
 * Discriminated union for success/failure states.
 */
export type AuthResult =
	| {
			success: true;
			userId: string;
			actorId: string;
	  }
	| {
			success: false;
			response: Response;
	  };

/**
 * Result type for session resolution.
 * Contains the resolved session and any metadata that was loaded/created.
 */
export interface SessionResolutionResult {
	success: true;
	session: ChatSession;
	metadata: AgentSessionMetadata;
	conversationHistory: ChatMessage[];
	isNewSession: boolean;
}

/**
 * Result type for ontology loading.
 * Contains the loaded context and updated cache metadata.
 */
export interface OntologyLoadResult {
	success: true;
	context: OntologyContext | null;
	cacheUpdated: boolean;
	cacheMetadata?: OntologyCache;
}

/**
 * State tracked during stream processing.
 * Accumulated in memory, not persisted until stream ends.
 */
export interface StreamState {
	/** Accumulated assistant response text */
	assistantResponse: string;
	/** Tool calls made during this turn */
	toolCalls: ChatToolCall[];
	/** Results from tool executions */
	toolResults: ToolResultData[];
	/** Total tokens used in this turn */
	totalTokens: number;
	/** Whether a completion event was already sent */
	completionSent: boolean;
	/** Whether a context shift occurred during this turn */
	contextShiftOccurred: boolean;
	/** The effective context type (may change during context shifts) */
	effectiveContextType: ChatContextType;
	/** Pending metadata updates to persist at stream end */
	pendingMetadataUpdates: Partial<AgentSessionMetadata>;
	/** Flag indicating metadata needs to be persisted */
	hasPendingMetadataUpdate: boolean;
}

/**
 * Normalized tool result data extracted from various result formats.
 */
export interface ToolResultData {
	/** Tool call ID this result corresponds to */
	tool_call_id: string;
	/** The tool name */
	tool_name?: string;
	/** Normalized result data */
	result: unknown;
	/** Whether the tool execution was successful */
	success?: boolean;
	/** Error message if the tool failed */
	error?: string;
	/** Error code for classification */
	error_code?: string;
	/** Entities accessed during tool execution */
	entities_accessed?: string[];
	/** Context shift triggered by this tool result */
	context_shift?: ContextShiftData;
}

/**
 * Context shift data from tool results.
 */
export interface ContextShiftData {
	new_context: ChatContextType | string;
	entity_id?: string;
	entity_name?: string;
	entity_type?: 'project' | 'task' | 'plan' | 'goal' | 'document';
	message?: string;
}

/**
 * Rate limit check result.
 */
export interface RateLimitResult {
	/** Whether the request is allowed */
	allowed: boolean;
	/** Pre-built 429 response if not allowed */
	response?: Response;
	/** Human-readable message */
	message?: string;
	/** Remaining requests in current window */
	remaining?: number;
	/** When the rate limit window resets */
	resetAt?: Date;
}

/**
 * Rate limit state for a user.
 */
export interface RateLimitState {
	requests: number;
	tokens: number;
	resetAt: number;
}

// ============================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================

// Re-export commonly used shared types to reduce import verbosity
export type { ProjectClarificationMetadata };
export type { ChatContextType, ChatSession, ChatMessage, ChatToolCall, ProjectFocus };
export type { OntologyContext, LastTurnContext, DocStructureCache };
