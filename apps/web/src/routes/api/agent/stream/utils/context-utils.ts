// apps/web/src/routes/api/agent/stream/utils/context-utils.ts
/**
 * Context Utilities for /api/agent/stream endpoint.
 *
 * Pure functions for context normalization and transformation.
 * Consolidates duplicated logic from:
 * - +server.ts
 * - agent-chat-orchestrator.ts
 * - agent-context-service.ts
 *
 * After refactoring, other files should import from here instead of
 * having their own copies.
 */

import type { ChatContextType, ChatMessage, ProjectFocus } from '@buildos/shared-types';
import type { LastTurnContext } from '$lib/types/agent-chat-enhancement';
import type { ContextShiftData } from '../types';
import { VALID_CONTEXT_TYPES } from '../constants';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('ContextUtils');

// ============================================
// CONTEXT TYPE NORMALIZATION
// ============================================

/**
 * Normalize context type, handling 'general' → 'global' mapping.
 *
 * Currently duplicated in:
 * - +server.ts:141-171
 * - agent-chat-orchestrator.ts:820-825
 * - agent-context-service.ts:1360-1367
 *
 * This is the single source of truth.
 *
 * @param contextType - The context type to normalize (may be undefined or legacy value)
 * @returns A valid ChatContextType, defaulting to 'global'
 */
export function normalizeContextType(contextType?: ChatContextType | string): ChatContextType {
	// Default to 'global' if not provided
	if (!contextType) {
		return 'global';
	}

	// Map 'general' to 'global' for backwards compatibility
	if (contextType === 'general') {
		return 'global';
	}

	// Validate it's a valid ChatContextType
	if ((VALID_CONTEXT_TYPES as readonly string[]).includes(contextType)) {
		return contextType as ChatContextType;
	}

	logger.warn(`Invalid context type '${contextType}', defaulting to 'global'`, { contextType });
	return 'global';
}

// ============================================
// PROJECT FOCUS NORMALIZATION
// ============================================

/**
 * Normalize project focus for comparison and storage.
 * Ensures consistent shape with all fields defined.
 *
 * @param focus - The project focus to normalize (may be undefined or partial)
 * @returns Normalized ProjectFocus or null if invalid
 */
export function normalizeProjectFocus(focus?: ProjectFocus | null): ProjectFocus | null {
	if (!focus) return null;
	if (!focus.projectId) return null;

	return {
		focusType: focus.focusType ?? 'project-wide',
		focusEntityId: focus.focusEntityId ?? null,
		focusEntityName: focus.focusEntityName ?? null,
		projectId: focus.projectId,
		projectName: focus.projectName ?? 'Project'
	};
}

/**
 * Compare two project focuses for equality.
 *
 * @param a - First focus
 * @param b - Second focus
 * @returns True if focuses are equivalent
 */
export function projectFocusEquals(
	a: ProjectFocus | null | undefined,
	b: ProjectFocus | null | undefined
): boolean {
	const normalizedA = normalizeProjectFocus(a);
	const normalizedB = normalizeProjectFocus(b);

	if (normalizedA === null && normalizedB === null) return true;
	if (normalizedA === null || normalizedB === null) return false;

	return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
}

// ============================================
// CACHE KEY GENERATION
// ============================================

/**
 * Generate cache key for ontology context.
 * Used for session-level cache invalidation.
 *
 * @param projectFocus - Current project focus
 * @param contextType - Current context type
 * @param entityId - Optional entity ID
 * @returns Cache key string
 */
export function generateOntologyCacheKey(
	projectFocus: ProjectFocus | null,
	contextType: ChatContextType,
	entityId?: string
): string {
	if (projectFocus?.projectId) {
		const parts = [projectFocus.projectId, projectFocus.focusType];
		if (projectFocus.focusEntityId) {
			parts.push(projectFocus.focusEntityId);
		}
		return parts.join(':');
	}
	return entityId ? `${contextType}:${entityId}` : contextType;
}

// ============================================
// ENTITY ASSIGNMENT
// ============================================

/**
 * Simplified helper: Assign entity by ID prefix.
 * Replaces complex helper functions with one simple function.
 *
 * @param entities - The entities object to mutate
 * @param entityId - The entity ID to assign
 */
export function assignEntityByPrefix(
	entities: LastTurnContext['entities'],
	entityId: string
): void {
	if (!entityId) return;

	// Assign to correct slot based on ID prefix
	if (entityId.startsWith('proj_')) {
		entities.project_id = entityId;
	} else if (entityId.startsWith('task_')) {
		entities.task_ids = entities.task_ids || [];
		if (!entities.task_ids.includes(entityId)) {
			entities.task_ids.push(entityId);
		}
	} else if (entityId.startsWith('plan_')) {
		entities.plan_id = entityId;
	} else if (entityId.startsWith('goal_')) {
		entities.goal_ids = entities.goal_ids || [];
		if (!entities.goal_ids.includes(entityId)) {
			entities.goal_ids.push(entityId);
		}
	} else if (entityId.startsWith('doc_')) {
		entities.document_id = entityId;
	} else if (entityId.startsWith('out_')) {
		entities.output_id = entityId;
	}
}

// ============================================
// LAST TURN CONTEXT GENERATION
// ============================================

/**
 * Generate last turn context from recent messages.
 * Provides conversation continuity between turns.
 *
 * Uses pre-extracted entities from ToolExecutionService
 * instead of redundant recursive payload parsing.
 *
 * @param recentMessages - Recent conversation messages
 * @param contextType - Current context type
 * @param options - Optional tool results for entity extraction
 * @returns LastTurnContext or null if insufficient messages
 */
export function generateLastTurnContext(
	recentMessages: ChatMessage[],
	contextType: ChatContextType,
	options: {
		toolResults?: Array<{ entities_accessed?: string[]; entitiesAccessed?: string[] }>;
	} = {}
): LastTurnContext | null {
	if (!recentMessages || recentMessages.length < 2) {
		return null;
	}

	const lastAssistantMsg = recentMessages.filter((m) => m.role === 'assistant').pop();
	const lastUserMsg = recentMessages.filter((m) => m.role === 'user').pop();

	if (!lastAssistantMsg || !lastUserMsg) {
		return null;
	}

	logger.debug('Generating last turn context', {
		lastUserContent: lastUserMsg.content.substring(0, 50),
		lastAssistantContent: lastAssistantMsg.content.substring(0, 50)
	});

	// Extract tool names from last assistant message
	const toolsUsed: string[] = [];
	if (lastAssistantMsg.tool_calls) {
		try {
			const toolCalls = Array.isArray(lastAssistantMsg.tool_calls)
				? lastAssistantMsg.tool_calls
				: JSON.parse(lastAssistantMsg.tool_calls as unknown as string);

			toolCalls.forEach((tc: { function?: { name?: string }; name?: string }) => {
				const toolName = tc.function?.name || tc.name;
				if (toolName) toolsUsed.push(toolName);
			});
		} catch (e) {
			logger.warn('Failed to extract tool calls', { error: e });
		}
	}

	// Use pre-extracted entities from ToolExecutionService
	const entities: LastTurnContext['entities'] = {};
	const toolResults = options.toolResults ?? [];

	for (const result of toolResults) {
		if (!result) continue;

		// ToolExecutionService already extracted these entities
		const accessed = result.entities_accessed ?? result.entitiesAccessed;
		if (Array.isArray(accessed)) {
			accessed.forEach((entityId: string) => {
				assignEntityByPrefix(entities, entityId);
			});
		}
	}

	// Generate summary
	const summary = lastUserMsg.content.substring(0, 60).trim() + '...';

	return {
		summary,
		entities,
		context_type: contextType,
		data_accessed: toolsUsed,
		strategy_used: undefined,
		timestamp: lastAssistantMsg.created_at || new Date().toISOString()
	};
}

/**
 * Build last turn context from a context shift event.
 *
 * Currently duplicated in:
 * - +server.ts:413-463
 * - agent-chat-orchestrator.ts:827-885
 *
 * This is the single source of truth.
 *
 * @param contextShift - The context shift data from a tool result
 * @param defaultContextType - Default context type if not specified in shift
 * @returns LastTurnContext representing the context shift
 */
export function buildContextShiftLastTurnContext(
	contextShift: ContextShiftData,
	defaultContextType: ChatContextType
): LastTurnContext {
	const normalized = normalizeContextType(
		(contextShift.new_context ?? defaultContextType) as ChatContextType
	);

	const summary =
		contextShift.message ??
		`Context shifted to ${contextShift.entity_name ?? contextShift.entity_type ?? normalized}.`;

	const entities: LastTurnContext['entities'] = {};

	switch (contextShift.entity_type) {
		case 'project':
			if (contextShift.entity_id) entities.project_id = contextShift.entity_id;
			break;
		case 'task':
			if (contextShift.entity_id) entities.task_ids = [contextShift.entity_id];
			break;
		case 'plan':
			if (contextShift.entity_id) entities.plan_id = contextShift.entity_id;
			break;
		case 'goal':
			if (contextShift.entity_id) entities.goal_ids = [contextShift.entity_id];
			break;
		case 'document':
			if (contextShift.entity_id) entities.document_id = contextShift.entity_id;
			break;
		case 'output':
			if (contextShift.entity_id) entities.output_id = contextShift.entity_id;
			break;
		default:
			break;
	}

	return {
		summary,
		entities,
		context_type: normalized,
		data_accessed: ['context_shift'],
		strategy_used: undefined,
		timestamp: new Date().toISOString()
	};
}

// ============================================
// CONTEXT USAGE SNAPSHOT
// ============================================

/**
 * Lightweight usage snapshot calculation that does not hit the database.
 * Used to avoid blocking the stream if compression metadata lookups stall.
 *
 * @param messages - Messages to estimate token usage for
 * @param tokenBudget - The token budget to compare against
 * @returns Quick usage snapshot estimate
 */
export function buildQuickUsageSnapshot(
	messages: Array<{ content: string }>,
	tokenBudget: number
): {
	estimatedTokens: number;
	tokenBudget: number;
	usagePercent: number;
	tokensRemaining: number;
	status: 'ok' | 'near_limit' | 'over_budget';
	lastCompressedAt: null;
	lastCompression: null;
} {
	const estimatedTokens = messages.reduce(
		(sum, msg) => sum + Math.ceil((msg?.content ?? '').length / 4),
		0
	);
	const usagePercent = Math.min(Math.round((estimatedTokens / tokenBudget) * 100), 999);
	const tokensRemaining = Math.max(tokenBudget - estimatedTokens, 0);
	const status =
		estimatedTokens > tokenBudget ? 'over_budget' : usagePercent >= 85 ? 'near_limit' : 'ok';

	return {
		estimatedTokens,
		tokenBudget,
		usagePercent,
		tokensRemaining,
		status,
		lastCompressedAt: null,
		lastCompression: null
	};
}
