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
type EntityType = 'project' | 'task' | 'plan' | 'goal' | 'document' | 'milestone' | 'risk';

const ENTITY_LIST_KEYS: Record<EntityType, keyof LastTurnContext['entities']> = {
	project: 'projects',
	task: 'tasks',
	plan: 'plans',
	goal: 'goals',
	document: 'documents',
	milestone: 'milestones',
	risk: 'risks'
};

function truncateEntityText(value: unknown, maxLength: number): string | undefined {
	if (typeof value !== 'string') return undefined;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return undefined;
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function toEntityPreview(
	value: unknown,
	fallbackId?: string
): { id?: string; name?: string; description?: string } {
	if (!value || typeof value !== 'object') {
		return { id: fallbackId };
	}
	const record = value as Record<string, unknown>;
	return {
		id:
			(typeof record.id === 'string' && record.id) ||
			(typeof record.entity_id === 'string' && record.entity_id) ||
			(typeof record.entityId === 'string' && record.entityId) ||
			fallbackId,
		name:
			truncateEntityText(record.name, 80) ??
			truncateEntityText(record.title, 80) ??
			truncateEntityText(record.summary, 80) ??
			truncateEntityText(record.text, 80),
		description:
			truncateEntityText(record.description, 140) ??
			truncateEntityText(record.content, 140) ??
			truncateEntityText(record.summary, 140)
	};
}

function assignEntityByType(
	entities: LastTurnContext['entities'],
	entityType: EntityType,
	entityId: string,
	previewSource?: unknown
): void {
	if (!entityId) return;
	const preview = toEntityPreview(previewSource, entityId);
	const listKey = ENTITY_LIST_KEYS[entityType];
	const list =
		((entities as Record<string, unknown>)[listKey] as
			| Array<{
					id: string;
					name?: string;
					description?: string;
			  }>
			| undefined) ?? [];
	const existing = list.find((item) => item.id === entityId);
	if (existing) {
		if (!existing.name && preview.name) existing.name = preview.name;
		if (!existing.description && preview.description)
			existing.description = preview.description;
	} else {
		list.push({
			id: entityId,
			name: preview.name,
			description: preview.description
		});
	}
	(entities as Record<string, unknown>)[listKey] = list;

	// Back-compat for older readers.
	switch (entityType) {
		case 'project':
			entities.project_id = entities.project_id ?? entityId;
			break;
		case 'task':
			entities.task_ids = Array.from(new Set([...(entities.task_ids ?? []), entityId]));
			break;
		case 'plan':
			entities.plan_id = entities.plan_id ?? entityId;
			break;
		case 'goal':
			entities.goal_ids = Array.from(new Set([...(entities.goal_ids ?? []), entityId]));
			break;
		case 'document':
			entities.document_id = entities.document_id ?? entityId;
			break;
		default:
			break;
	}
}

export function assignEntityByPrefix(
	entities: LastTurnContext['entities'],
	entityId: string
): void {
	if (!entityId) return;

	// Assign to correct slot based on ID prefix
	if (entityId.startsWith('proj_')) {
		assignEntityByType(entities, 'project', entityId);
	} else if (entityId.startsWith('task_')) {
		assignEntityByType(entities, 'task', entityId);
	} else if (entityId.startsWith('plan_')) {
		assignEntityByType(entities, 'plan', entityId);
	} else if (entityId.startsWith('goal_')) {
		assignEntityByType(entities, 'goal', entityId);
	} else if (entityId.startsWith('doc_')) {
		assignEntityByType(entities, 'document', entityId);
	} else if (entityId.startsWith('mil_')) {
		assignEntityByType(entities, 'milestone', entityId);
	} else if (entityId.startsWith('risk_')) {
		assignEntityByType(entities, 'risk', entityId);
	}
}

const ENTITY_CONTAINER_KEYS: Record<string, EntityType> = {
	project: 'project',
	projects: 'project',
	task: 'task',
	tasks: 'task',
	plan: 'plan',
	plans: 'plan',
	goal: 'goal',
	goals: 'goal',
	document: 'document',
	documents: 'document',
	milestone: 'milestone',
	milestones: 'milestone',
	risk: 'risk',
	risks: 'risk'
};

const ENTITY_ID_SUFFIXES: Array<{ suffix: string; entityType: EntityType }> = [
	{ suffix: 'project_id', entityType: 'project' },
	{ suffix: 'task_id', entityType: 'task' },
	{ suffix: 'plan_id', entityType: 'plan' },
	{ suffix: 'goal_id', entityType: 'goal' },
	{ suffix: 'document_id', entityType: 'document' },
	{ suffix: 'milestone_id', entityType: 'milestone' },
	{ suffix: 'risk_id', entityType: 'risk' }
];

const ENTITY_ID_LIST_SUFFIXES: Array<{ suffix: string; entityType: EntityType }> = [
	{ suffix: 'task_ids', entityType: 'task' },
	{ suffix: 'goal_ids', entityType: 'goal' },
	{ suffix: 'plan_ids', entityType: 'plan' },
	{ suffix: 'document_ids', entityType: 'document' }
];

function normalizeKey(key: string): string {
	return key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

function getEntityTypeFromKey(normalizedKey: string): EntityType | undefined {
	for (const { suffix, entityType } of ENTITY_ID_SUFFIXES) {
		if (normalizedKey.endsWith(suffix)) {
			return entityType;
		}
	}
	return undefined;
}

function getEntityTypeFromListKey(normalizedKey: string): EntityType | undefined {
	for (const { suffix, entityType } of ENTITY_ID_LIST_SUFFIXES) {
		if (normalizedKey.endsWith(suffix)) {
			return entityType;
		}
	}
	return undefined;
}

function coerceEntityType(value: unknown): EntityType | undefined {
	if (typeof value !== 'string') return undefined;
	const normalized = value.trim().toLowerCase();
	if (
		normalized === 'project' ||
		normalized === 'task' ||
		normalized === 'plan' ||
		normalized === 'goal' ||
		normalized === 'document' ||
		normalized === 'milestone' ||
		normalized === 'risk'
	) {
		return normalized as EntityType;
	}
	return undefined;
}

function extractEntitiesFromPayload(
	payload: unknown,
	entities: LastTurnContext['entities'],
	entityHint?: EntityType,
	depth = 0,
	allowHintId = false
): void {
	if (!payload || depth > 6) return;

	if (Array.isArray(payload)) {
		for (const item of payload) {
			extractEntitiesFromPayload(item, entities, entityHint, depth + 1, allowHintId);
		}
		return;
	}

	if (typeof payload !== 'object') {
		return;
	}

	const obj = payload as Record<string, any>;
	const entityType = coerceEntityType(obj.entity_type ?? obj.entityType);
	const entityId = obj.entity_id ?? obj.entityId;
	if (entityType && typeof entityId === 'string') {
		assignEntityByType(entities, entityType, entityId, obj);
	}

	if (allowHintId && entityHint && typeof obj.id === 'string') {
		assignEntityByType(entities, entityHint, obj.id, obj);
	}

	for (const [key, value] of Object.entries(obj)) {
		const normalizedKey = normalizeKey(key);

		const containerType = ENTITY_CONTAINER_KEYS[normalizedKey];
		if (containerType) {
			extractEntitiesFromPayload(value, entities, containerType, depth + 1, true);
			continue;
		}

		const keyEntityType = getEntityTypeFromKey(normalizedKey);
		if (keyEntityType) {
			if (typeof value === 'string') {
				assignEntityByType(entities, keyEntityType, value, obj[keyEntityType]);
				continue;
			}
			if (Array.isArray(value)) {
				for (const entry of value) {
					if (typeof entry === 'string') {
						assignEntityByType(entities, keyEntityType, entry);
					}
				}
				continue;
			}
		}

		const listEntityType = getEntityTypeFromListKey(normalizedKey);
		if (listEntityType && Array.isArray(value)) {
			for (const entry of value) {
				if (typeof entry === 'string') {
					assignEntityByType(entities, listEntityType, entry);
				} else if (entry && typeof entry === 'object') {
					const preview = toEntityPreview(entry);
					if (preview.id) {
						assignEntityByType(entities, listEntityType, preview.id, entry);
					}
				}
			}
			continue;
		}

		if (value && typeof value === 'object') {
			extractEntitiesFromPayload(value, entities, entityHint, depth + 1, false);
		}
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
		toolResults?: Array<{
			entities_accessed?: string[];
			entitiesAccessed?: string[];
			result?: unknown;
		}>;
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

		if ('result' in result) {
			extractEntitiesFromPayload(result.result, entities);
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
			if (contextShift.entity_id) {
				assignEntityByType(entities, 'project', contextShift.entity_id, {
					id: contextShift.entity_id,
					name: contextShift.entity_name,
					description: contextShift.message
				});
			}
			break;
		case 'task':
			if (contextShift.entity_id) {
				assignEntityByType(entities, 'task', contextShift.entity_id, {
					id: contextShift.entity_id,
					name: contextShift.entity_name,
					description: contextShift.message
				});
			}
			break;
		case 'plan':
			if (contextShift.entity_id) {
				assignEntityByType(entities, 'plan', contextShift.entity_id, {
					id: contextShift.entity_id,
					name: contextShift.entity_name,
					description: contextShift.message
				});
			}
			break;
		case 'goal':
			if (contextShift.entity_id) {
				assignEntityByType(entities, 'goal', contextShift.entity_id, {
					id: contextShift.entity_id,
					name: contextShift.entity_name,
					description: contextShift.message
				});
			}
			break;
		case 'document':
			if (contextShift.entity_id) {
				assignEntityByType(entities, 'document', contextShift.entity_id, {
					id: contextShift.entity_id,
					name: contextShift.entity_name,
					description: contextShift.message
				});
			}
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
