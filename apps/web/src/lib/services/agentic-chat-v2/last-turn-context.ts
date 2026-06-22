// apps/web/src/lib/services/agentic-chat-v2/last-turn-context.ts
//
// Builds the lightweight previous-turn continuity packet that the stream route
// emits to the client and accepts back on the next turn.

import type {
	ChatContextType,
	ChatToolCall,
	ChatToolResult,
	ContextShiftPayload,
	LastTurnContext
} from '@buildos/shared-types';
import { extractExplicitEntityMentionsFromText } from './entity-resolution';
import {
	normalizeExactEntityId,
	shouldCollectExactEntityReferencesFromToolName
} from './exact-entity-id';
import { normalizeFastContextType, isProjectScopedContext } from './scope';

type LastTurnEntityType = 'project' | 'task' | 'goal' | 'plan' | 'document' | 'milestone' | 'risk';

const LAST_TURN_ENTITY_LIST_KEY: Record<LastTurnEntityType, keyof LastTurnContext['entities']> = {
	project: 'projects',
	task: 'tasks',
	goal: 'goals',
	plan: 'plans',
	document: 'documents',
	milestone: 'milestones',
	risk: 'risks'
};

function normalizeTextValue(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function summarizeLastTurnText(text: string, maxLength = 180): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return '';
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function truncateEntityText(value: unknown, maxLength: number): string | undefined {
	if (typeof value !== 'string') return undefined;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return undefined;
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function extractEntityPreview(
	value: unknown,
	fallbackId?: string
): {
	id?: string;
	name?: string;
	description?: string;
} {
	if (!value || typeof value !== 'object') {
		return { id: normalizeExactEntityId(fallbackId) };
	}
	const record = value as Record<string, unknown>;
	const id = normalizeExactEntityId(
		record.id ?? record.entity_id ?? record.entityId ?? fallbackId
	);
	const name =
		truncateEntityText(record.name, 80) ??
		truncateEntityText(record.title, 80) ??
		truncateEntityText(record.summary, 80) ??
		truncateEntityText(record.text, 80);
	const description =
		truncateEntityText(record.description, 140) ??
		truncateEntityText(record.content, 140) ??
		truncateEntityText(record.summary, 140);
	return { id, name, description };
}

function upsertLastTurnEntity(
	entities: LastTurnContext['entities'],
	entityType: LastTurnEntityType,
	preview: { id?: string; name?: string; description?: string }
): void {
	const id = normalizeExactEntityId(preview.id);
	if (!id) return;

	const listKey = LAST_TURN_ENTITY_LIST_KEY[entityType];
	const list =
		((entities as Record<string, unknown>)[listKey] as
			| Array<{
					id: string;
					name?: string;
					description?: string;
			  }>
			| undefined) ?? [];
	const existing = list.find((item) => item.id === id);
	if (existing) {
		if (!existing.name && preview.name) existing.name = preview.name;
		if (!existing.description && preview.description)
			existing.description = preview.description;
	} else {
		list.push({
			id,
			name: preview.name,
			description: preview.description
		});
	}
	(entities as Record<string, unknown>)[listKey] = list;

	// Back-compat for existing readers while rollout completes.
	switch (entityType) {
		case 'project':
			entities.project_id = entities.project_id ?? id;
			break;
		case 'task':
			entities.task_ids = Array.from(new Set([...(entities.task_ids ?? []), id]));
			break;
		case 'goal':
			entities.goal_ids = Array.from(new Set([...(entities.goal_ids ?? []), id]));
			break;
		case 'plan':
			entities.plan_id = entities.plan_id ?? id;
			break;
		case 'document':
			entities.document_id = entities.document_id ?? id;
			break;
		default:
			break;
	}
}

function assignLastTurnEntity(
	entities: LastTurnContext['entities'],
	entityType: string | undefined,
	entityId: string | undefined,
	record?: unknown
): void {
	if (!entityType) return;
	const normalizedType = entityType.toLowerCase() as LastTurnEntityType;
	if (!LAST_TURN_ENTITY_LIST_KEY[normalizedType]) return;
	const preview = extractEntityPreview(record, entityId);
	upsertLastTurnEntity(entities, normalizedType, preview);
}

function assignLastTurnEntityByPrefix(
	entities: LastTurnContext['entities'],
	entityId: string
): void {
	const normalized = entityId.toLowerCase();
	if (normalized.startsWith('proj_')) {
		assignLastTurnEntity(entities, 'project', entityId);
	} else if (normalized.startsWith('task_')) {
		assignLastTurnEntity(entities, 'task', entityId);
	} else if (normalized.startsWith('goal_')) {
		assignLastTurnEntity(entities, 'goal', entityId);
	} else if (normalized.startsWith('plan_')) {
		assignLastTurnEntity(entities, 'plan', entityId);
	} else if (normalized.startsWith('doc_')) {
		assignLastTurnEntity(entities, 'document', entityId);
	} else if (normalized.startsWith('mil_')) {
		assignLastTurnEntity(entities, 'milestone', entityId);
	} else if (normalized.startsWith('risk_')) {
		assignLastTurnEntity(entities, 'risk', entityId);
	}
}

function extractEntityIdFromRecord(value: unknown): string | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const record = value as Record<string, unknown>;
	return normalizeExactEntityId(record.id ?? record.entity_id ?? record.entityId);
}

function collectLastTurnEntitiesFromValue(
	value: unknown,
	entities: LastTurnContext['entities'],
	depth = 0
): void {
	if (!value || depth > 6) return;

	if (Array.isArray(value)) {
		for (const item of value.slice(0, 25)) {
			collectLastTurnEntitiesFromValue(item, entities, depth + 1);
		}
		return;
	}

	if (typeof value !== 'object') return;

	const record = value as Record<string, unknown>;
	assignLastTurnEntity(
		entities,
		normalizeTextValue(record.entity_type ?? record.entityType),
		normalizeTextValue(record.entity_id ?? record.entityId),
		record
	);
	assignLastTurnEntity(
		entities,
		'project',
		normalizeTextValue(record.project_id),
		record.project
	);
	assignLastTurnEntity(entities, 'task', normalizeTextValue(record.task_id), record.task);
	assignLastTurnEntity(entities, 'goal', normalizeTextValue(record.goal_id), record.goal);
	assignLastTurnEntity(entities, 'plan', normalizeTextValue(record.plan_id), record.plan);
	assignLastTurnEntity(
		entities,
		'document',
		normalizeTextValue(record.document_id),
		record.document
	);
	assignLastTurnEntity(
		entities,
		'milestone',
		normalizeTextValue(record.milestone_id),
		record.milestone
	);
	assignLastTurnEntity(entities, 'risk', normalizeTextValue(record.risk_id), record.risk);

	const taskIds = Array.isArray(record.task_ids) ? record.task_ids : [];
	for (const taskId of taskIds) {
		assignLastTurnEntity(entities, 'task', normalizeTextValue(taskId));
	}
	const goalIds = Array.isArray(record.goal_ids) ? record.goal_ids : [];
	for (const goalId of goalIds) {
		assignLastTurnEntity(entities, 'goal', normalizeTextValue(goalId));
	}
	const planIds = Array.isArray(record.plan_ids) ? record.plan_ids : [];
	for (const planId of planIds) {
		assignLastTurnEntity(entities, 'plan', normalizeTextValue(planId));
	}
	const documentIds = Array.isArray(record.document_ids) ? record.document_ids : [];
	for (const documentId of documentIds) {
		assignLastTurnEntity(entities, 'document', normalizeTextValue(documentId));
	}

	const entitiesAccessed = Array.isArray(record._entities_accessed)
		? record._entities_accessed
		: Array.isArray(record.entities_accessed)
			? record.entities_accessed
			: [];
	for (const entityId of entitiesAccessed) {
		const normalized = normalizeTextValue(entityId);
		if (!normalized) continue;
		assignLastTurnEntityByPrefix(entities, normalized);
	}

	const singularKeys: Array<'project' | 'task' | 'goal' | 'plan' | 'document'> = [
		'project',
		'task',
		'goal',
		'plan',
		'document'
	];
	for (const key of singularKeys) {
		assignLastTurnEntity(entities, key, extractEntityIdFromRecord(record[key]), record[key]);
	}

	const pluralKeys: Array<{ key: string; entityType: LastTurnEntityType }> = [
		{ key: 'projects', entityType: 'project' },
		{ key: 'tasks', entityType: 'task' },
		{ key: 'goals', entityType: 'goal' },
		{ key: 'plans', entityType: 'plan' },
		{ key: 'documents', entityType: 'document' },
		{ key: 'milestones', entityType: 'milestone' },
		{ key: 'risks', entityType: 'risk' }
	];
	for (const { key, entityType } of pluralKeys) {
		if (!Array.isArray(record[key])) continue;
		for (const item of record[key] as unknown[]) {
			assignLastTurnEntity(entities, entityType, extractEntityIdFromRecord(item), item);
		}
	}

	for (const nested of Object.values(record)) {
		if (nested && typeof nested === 'object') {
			collectLastTurnEntitiesFromValue(nested, entities, depth + 1);
		}
	}
}

function formatLastTurnEntityReferences(entities: LastTurnContext['entities']): string[] {
	const refs: string[] = [];
	const formatItems = (items: Array<{ id: string; name?: string }>): string =>
		items
			.map((item) => ({
				...item,
				id: normalizeExactEntityId(item.id)
			}))
			.filter((item): item is { id: string; name?: string } => Boolean(item.id))
			.slice(0, 4)
			.map((item) => (item.name ? `${item.name} (${item.id})` : item.id))
			.join(',');
	if (entities.projects?.length) refs.push(`projects:${formatItems(entities.projects)}`);
	if (entities.tasks?.length) refs.push(`tasks:${formatItems(entities.tasks)}`);
	if (entities.plans?.length) refs.push(`plans:${formatItems(entities.plans)}`);
	if (entities.goals?.length) refs.push(`goals:${formatItems(entities.goals)}`);
	if (entities.documents?.length) refs.push(`documents:${formatItems(entities.documents)}`);

	// Backward-compat with stored legacy contexts.
	if (refs.length === 0) {
		const projectId = normalizeExactEntityId(entities.project_id);
		const planId = normalizeExactEntityId(entities.plan_id);
		const documentId = normalizeExactEntityId(entities.document_id);
		const taskIds = (entities.task_ids ?? [])
			.map((id) => normalizeExactEntityId(id))
			.filter((id): id is string => Boolean(id))
			.slice(0, 4);
		const goalIds = (entities.goal_ids ?? [])
			.map((id) => normalizeExactEntityId(id))
			.filter((id): id is string => Boolean(id))
			.slice(0, 4);

		if (projectId) refs.push(`project:${projectId}`);
		if (planId) refs.push(`plan:${planId}`);
		if (documentId) refs.push(`document:${documentId}`);
		if (taskIds.length > 0) refs.push(`tasks:${taskIds.join(',')}`);
		if (goalIds.length > 0) refs.push(`goals:${goalIds.join(',')}`);
	}
	return refs;
}

export function buildLastTurnContinuityHint(
	lastTurnContext?: LastTurnContext | null
): string | null {
	if (!lastTurnContext) return null;

	const lines: string[] = [];
	const summary = summarizeLastTurnText(lastTurnContext.summary ?? '', 140);
	if (summary) {
		lines.push(`Last turn summary: ${summary}`);
	}

	const refs = formatLastTurnEntityReferences(lastTurnContext.entities ?? {});
	if (refs.length > 0) {
		lines.push(`Entities referenced: ${refs.join('; ')}`);
	}

	const dataAccessed = Array.isArray(lastTurnContext.data_accessed)
		? lastTurnContext.data_accessed
				.map((item) => normalizeTextValue(item))
				.filter((item): item is string => Boolean(item))
		: [];
	if (dataAccessed.length > 0) {
		lines.push(`Tools used: ${dataAccessed.slice(0, 6).join(', ')}`);
	}

	const priorContext =
		typeof lastTurnContext.context_type === 'string'
			? normalizeFastContextType(lastTurnContext.context_type as ChatContextType)
			: 'global';
	lines.push(`Prior context: ${priorContext}`);

	if (lines.length === 0) return null;

	return [
		'Conversation continuity hint (lightweight):',
		...lines,
		'Use this only as context; prioritize the latest user message.'
	].join('\n');
}

export function buildLastTurnContext(params: {
	assistantText: string;
	userMessage: string;
	contextType: ChatContextType;
	entityId?: string | null;
	contextShift?: ContextShiftPayload | null;
	toolExecutions: Array<{ toolCall: ChatToolCall; result: ChatToolResult }>;
	timestamp: string;
}): LastTurnContext {
	const entities: LastTurnContext['entities'] = {};
	const toolsUsed = new Set<string>();

	for (const mention of extractExplicitEntityMentionsFromText(params.assistantText)) {
		assignLastTurnEntity(
			entities,
			mention.entityType,
			mention.id,
			mention.name ? { id: mention.id, name: mention.name } : { id: mention.id }
		);
	}

	for (const mention of extractExplicitEntityMentionsFromText(params.userMessage)) {
		assignLastTurnEntity(
			entities,
			mention.entityType,
			mention.id,
			mention.name ? { id: mention.id, name: mention.name } : { id: mention.id }
		);
	}

	for (const execution of params.toolExecutions) {
		const toolName = normalizeTextValue(execution.toolCall.function?.name);
		if (toolName) {
			toolsUsed.add(toolName);
		}
		if (!shouldCollectExactEntityReferencesFromToolName(toolName)) {
			continue;
		}
		const entitySource =
			execution.result && typeof execution.result === 'object' && 'result' in execution.result
				? (execution.result as unknown as Record<string, unknown>).result
				: execution.result;
		collectLastTurnEntitiesFromValue(entitySource, entities);
	}

	if (
		params.contextShift &&
		params.contextShift.entity_type !== 'workspace' &&
		params.contextShift.entity_id
	) {
		assignLastTurnEntity(
			entities,
			params.contextShift.entity_type,
			normalizeTextValue(params.contextShift.entity_id),
			{
				id: params.contextShift.entity_id,
				name: params.contextShift.entity_name,
				description: params.contextShift.message
			}
		);
	}

	const effectiveContextType = params.contextShift?.new_context ?? params.contextType;
	if (
		isProjectScopedContext(effectiveContextType) &&
		params.entityId &&
		!entities.projects?.length
	) {
		assignLastTurnEntity(entities, 'project', params.entityId);
	}

	const summary =
		summarizeLastTurnText(params.assistantText, 180) ||
		(params.contextShift?.message
			? summarizeLastTurnText(params.contextShift.message, 180)
			: '') ||
		summarizeLastTurnText(params.userMessage, 120) ||
		'Completed the latest turn.';

	const dataAccessed = Array.from(toolsUsed);
	if (params.contextShift && !dataAccessed.includes('context_shift')) {
		dataAccessed.push('context_shift');
	}

	return {
		summary,
		entities,
		context_type: effectiveContextType,
		data_accessed: dataAccessed,
		timestamp: params.timestamp
	};
}
