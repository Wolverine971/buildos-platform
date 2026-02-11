// apps/web/src/routes/api/agent/stream/utils/event-mapper.ts
/**
 * Event Mapper for /api/agent/stream endpoint.
 *
 * Data-driven mapping from internal StreamEvent types to SSE message format.
 * Replaces the large switch statement with a more maintainable approach.
 */

import type { AgentPlan as SSEAgentPlan, AgentSSEMessage } from '@buildos/shared-types';
import type { StreamEvent } from '$lib/services/agentic-chat/shared/types';
import { normalizeContextType } from './context-utils';

// ============================================
// TYPES
// ============================================

/**
 * Type for event mapper functions.
 * Each mapper takes a StreamEvent and returns an AgentSSEMessage or null.
 *
 * Note: Uses `any` for return type because StreamEvent and AgentSSEMessage
 * have different type definitions for some nested types (like AgentPlan).
 * This matches the original implementation which used (event as any).
 */
type EventMapper = (event: StreamEvent) => AgentSSEMessage | null;

/**
 * Map of event type to mapper function.
 */
type EventMapperRegistry = Partial<Record<StreamEvent['type'], EventMapper>>;

// ============================================
// EVENT MAPPERS
// ============================================

/**
 * Registry of event mappers, keyed by event type.
 * Data-driven approach for easy extension and maintenance.
 *
 * Note: Uses explicit type assertions because StreamEvent is a discriminated union.
 * The type narrowing happens via the event.type key in the registry lookup.
 */
const EVENT_MAPPERS: EventMapperRegistry = {
	session: (event) => ({
		type: 'session',
		session: (event as Extract<StreamEvent, { type: 'session' }>).session
	}),

	last_turn_context: (event) => ({
		type: 'last_turn_context',
		context: (event as Extract<StreamEvent, { type: 'last_turn_context' }>).context
	}),

	context_usage: (event) => ({
		type: 'context_usage',
		usage: (event as Extract<StreamEvent, { type: 'context_usage' }>).usage
	}),

	agent_state: (event) => {
		const e = event as Extract<StreamEvent, { type: 'agent_state' }>;
		return {
			type: 'agent_state',
			state: e.state,
			contextType: normalizeContextType(e.contextType),
			details: e.details
		};
	},

	clarifying_questions: (event) => ({
		type: 'clarifying_questions',
		questions: (event as Extract<StreamEvent, { type: 'clarifying_questions' }>).questions ?? []
	}),

	plan_created: (event) => {
		const e = event as Extract<StreamEvent, { type: 'plan_created' }>;
		return {
			type: 'plan_created',
			plan: normalizePlan(e.plan)
		};
	},

	plan_ready_for_review: (event) => {
		const e = event as Extract<StreamEvent, { type: 'plan_ready_for_review' }>;
		return {
			type: 'plan_ready_for_review',
			plan: normalizePlan(e.plan),
			summary: e.summary,
			recommendations: e.recommendations
		};
	},

	step_start: (event) => ({
		type: 'step_start' as const,
		step: (event as Extract<StreamEvent, { type: 'step_start' }>).step
	}) as AgentSSEMessage,

	step_complete: (event) => ({
		type: 'step_complete' as const,
		step: (event as Extract<StreamEvent, { type: 'step_complete' }>).step
	}) as AgentSSEMessage,

	executor_spawned: (event) => {
		const e = event as Extract<StreamEvent, { type: 'executor_spawned' }>;
		return {
			type: 'executor_spawned',
			executorId: e.executorId,
			task: e.task
		};
	},

	executor_result: (event) => {
		const e = event as Extract<StreamEvent, { type: 'executor_result' }>;
		return {
			type: 'executor_result',
			executorId: e.executorId,
			result: e.result
		};
	},

	plan_review: (event) => {
		const e = event as Extract<StreamEvent, { type: 'plan_review' }>;
		return {
			type: 'plan_review',
			plan: normalizePlan(e.plan),
			verdict: e.verdict,
			notes: e.notes,
			reviewer: e.reviewer
		};
	},

	text: (event) => ({
		type: 'text',
		content: (event as Extract<StreamEvent, { type: 'text' }>).content
	}),

	tool_call: (event) => {
		const e = event as Extract<StreamEvent, { type: 'tool_call' }>;
		return {
			type: 'tool_call',
			tool_call: e.toolCall
		};
	},

	tool_result: (event) => {
		const e = event as Extract<StreamEvent, { type: 'tool_result' }>;
		return {
			type: 'tool_result',
			result: e.result
		};
	},

	operation: (event) => {
		const e = event as Extract<StreamEvent, { type: 'operation' }>;
		return {
			type: 'operation',
			operation: e.operation
		};
	},

	done: (event) => ({
		type: 'done',
		usage: (event as Extract<StreamEvent, { type: 'done' }>).usage
	}),

	error: (event) => ({
		type: 'error',
		error: (event as Extract<StreamEvent, { type: 'error' }>).error ?? 'Unknown error'
	})
};

// ============================================
// MAIN MAPPER FUNCTION
// ============================================

/**
 * Map a planner/orchestrator event to SSE message format.
 *
 * This is the main function called by the stream handler.
 * Uses the data-driven registry for easy extension.
 *
 * @param event - The stream event to map (can be null/undefined)
 * @returns AgentSSEMessage for sending to client, or null to skip
 */
export function mapPlannerEventToSSE(
	event: StreamEvent | AgentSSEMessage | null | undefined
): AgentSSEMessage | null {
	if (!event) {
		return null;
	}

	// Check if this is already an AgentSSEMessage (passthrough)
	// AgentSSEMessage types that don't exist in StreamEvent
	const sseOnlyTypes = ['focus_active', 'focus_changed', 'context_shift'];
	if (sseOnlyTypes.includes(event.type)) {
		return event as AgentSSEMessage;
	}

	// Look up mapper in registry
	const mapper = EVENT_MAPPERS[event.type as StreamEvent['type']];
	if (mapper) {
		return mapper(event as StreamEvent);
	}

	// Unknown event type - don't send to client
	return null;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if an event type is recognized.
 *
 * @param eventType - The event type to check
 * @returns True if the event type has a registered mapper
 */
export function isKnownEventType(eventType: string): boolean {
	return (
		eventType in EVENT_MAPPERS ||
		['focus_active', 'focus_changed', 'context_shift'].includes(eventType)
	);
}

/**
 * Get all registered event types.
 * Useful for documentation or debugging.
 *
 * @returns Array of registered event type strings
 */
export function getRegisteredEventTypes(): string[] {
	return Object.keys(EVENT_MAPPERS);
}

// ============================================
// HELPERS
// ============================================

/**
 * Normalize planner AgentPlan (camelCase) to the shared SSE AgentPlan shape (snake_case).
 * Accepts either shape and fills required timestamps with safe defaults.
 */
function normalizePlan(plan: unknown): SSEAgentPlan {
	if (!plan || typeof plan !== 'object') {
		return plan as SSEAgentPlan;
	}

	const cast = plan as Record<string, any>;
	const coerceDate = (value: any, fallback?: string): string | undefined => {
		if (!value) return fallback;
		if (typeof value === 'string') return value;
		if (value instanceof Date) return value.toISOString();
		return fallback ?? String(value);
	};

	return {
		id: cast.id,
		session_id: cast.session_id ?? cast.sessionId ?? '',
		user_id: cast.user_id ?? cast.userId ?? '',
		planner_agent_id: cast.planner_agent_id ?? cast.plannerAgentId ?? '',
		user_message: cast.user_message ?? cast.userMessage ?? '',
		strategy: cast.strategy ?? 'planner_stream',
		steps: cast.steps ?? [],
		metadata: cast.metadata ?? null,
		status: cast.status ?? 'pending',
		created_at: coerceDate(cast.created_at ?? cast.createdAt, new Date().toISOString())!,
		completed_at: coerceDate(cast.completed_at ?? cast.completedAt),
		updated_at: coerceDate(cast.updated_at ?? cast.updatedAt, new Date().toISOString())!
	};
}
