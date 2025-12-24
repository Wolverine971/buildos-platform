// apps/web/src/routes/api/agent/stream/constants.ts
/**
 * Configuration constants for /api/agent/stream endpoint.
 *
 * These values control rate limiting, caching, and other behavior.
 * Extracted from +server.ts for maintainability.
 */

// ============================================
// RATE LIMITING
// ============================================

/**
 * Master switch for rate limiting.
 * Set to false because agent chat should not have request limits.
 * Token costs are managed at the LLM provider level.
 */
export const RATE_LIMIT_ENABLED = false;

/**
 * Rate limit configuration.
 * Only applies when RATE_LIMIT_ENABLED is true.
 */
export const RATE_LIMIT = {
	/** Maximum requests per minute per user */
	MAX_REQUESTS_PER_MINUTE: 20,
	/** Maximum tokens per minute per user */
	MAX_TOKENS_PER_MINUTE: 30000,
	/** Rate limit window duration in milliseconds */
	WINDOW_MS: 60000
} as const;

// ============================================
// MESSAGE HANDLING
// ============================================

/**
 * Maximum number of recent messages to load from session history.
 * Prevents loading entire conversation for very long sessions.
 */
export const RECENT_MESSAGE_LIMIT = 50;

/**
 * Token budget for context usage calculations.
 * Roughly matches the planner conversation budget.
 */
export const CONTEXT_USAGE_TOKEN_BUDGET = 2500;

// ============================================
// ONTOLOGY CACHING
// ============================================

/**
 * Session-level ontology cache TTL in milliseconds.
 * Set to 5 minutes to balance freshness with performance.
 *
 * Note: OntologyContextLoader also has an internal 60s cache.
 * Session cache takes precedence; loader cache is secondary optimization.
 */
export const ONTOLOGY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// CONTEXT TYPES
// ============================================

/**
 * Valid context types for chat sessions.
 * Used for validation and normalization.
 */
export const VALID_CONTEXT_TYPES = [
	'global',
	'project',
	'calendar',
	'project_create',
	'project_audit',
	'project_forecast',
	'daily_brief_update',
	'brain_dump',
	'ontology'
] as const;

/**
 * Context types that indicate project-level scope.
 * Used to determine when to load project-level ontology context.
 */
export const PROJECT_CONTEXT_TYPES = ['project', 'project_audit', 'project_forecast'] as const;

/**
 * Valid ontology entity types for element-level context loading.
 */
export const VALID_ONTOLOGY_ENTITY_TYPES = [
	'task',
	'plan',
	'goal',
	'document',
	'output',
	'milestone',
	'risk',
	'decision',
	'requirement'
] as const;

// ============================================
// SESSION HANDLING
// ============================================

/**
 * Default session title for newly created agent chat sessions.
 */
export const DEFAULT_SESSION_TITLE = 'Agent Session';

/**
 * Maximum number of active sessions to return in GET handler.
 */
export const MAX_SESSIONS_LIST = 10;

// ============================================
// ERROR MESSAGES
// ============================================

export const ERROR_MESSAGES = {
	UNAUTHORIZED: 'Unauthorized',
	ACTOR_RESOLUTION_FAILED: 'Failed to resolve actor',
	MESSAGE_REQUIRED: 'Message is required',
	SESSION_NOT_FOUND: 'Session',
	SESSION_RESOLUTION_FAILED: 'Failed to resolve chat session',
	CONTEXT_ACCESS_DENIED: 'You do not have access to this context',
	ONTOLOGY_LOAD_FAILED: 'Failed to load ontology context',
	RATE_LIMITED_REQUESTS:
		'Too many requests. Agent system is more resource-intensive. Please wait before sending another message.',
	RATE_LIMITED_TOKENS: 'Token limit reached. Please wait a moment before continuing.',
	STREAM_ERROR: 'Failed to generate response'
} as const;

// ============================================
// API ERROR CODES
// ============================================

export const ERROR_CODES = {
	RATE_LIMITED: 'RATE_LIMITED',
	ACTOR_RESOLUTION_FAILED: 'ACTOR_RESOLUTION_FAILED'
} as const;
