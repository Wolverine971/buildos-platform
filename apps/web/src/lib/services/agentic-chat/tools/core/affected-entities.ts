// apps/web/src/lib/services/agentic-chat/tools/core/affected-entities.ts

export interface ToolExecutionEntityRef {
	kind: string;
	id: string;
	title?: string | null;
	projectId?: string | null;
	url?: string | null;
	operation?: string;
}

export interface ToolExecutionAffectedEntityInput {
	id?: string | null;
	tool_name?: string | null;
	gateway_op?: string | null;
	arguments?: unknown;
	result?: unknown;
	success?: boolean | null;
	affected_entities?: unknown;
}

const ENTITY_KIND_ALIASES: Record<string, string> = {
	projects: 'project',
	project: 'project',
	tasks: 'task',
	task: 'task',
	goals: 'goal',
	goal: 'goal',
	plans: 'plan',
	plan: 'plan',
	documents: 'document',
	document: 'document',
	milestones: 'milestone',
	milestone: 'milestone',
	risks: 'risk',
	risk: 'risk',
	events: 'event',
	event: 'event'
};

const CREATE_TOOL_KINDS: Record<string, string> = {
	create_onto_project: 'project',
	create_onto_task: 'task',
	create_onto_goal: 'goal',
	create_onto_plan: 'plan',
	create_onto_document: 'document',
	create_onto_milestone: 'milestone',
	create_onto_risk: 'risk',
	create_calendar_event: 'event'
};

function isRecord(value: unknown): value is Record<string, any> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeAffectedEntityKind(kind: string | null | undefined): string | null {
	if (!kind) return null;
	const normalized = kind
		.trim()
		.toLowerCase()
		.replace(/^onto\./, '');
	return ENTITY_KIND_ALIASES[normalized] ?? normalized;
}

function operationFromTool(toolName?: string | null, gatewayOp?: string | null): string | null {
	const source = gatewayOp || toolName || '';
	if (source.includes('.create') || source.startsWith('create_')) return 'created';
	if (source.includes('.update') || source.startsWith('update_')) return 'updated';
	if (source.includes('.delete') || source.startsWith('delete_')) return 'deleted';
	if (source.includes('.move') || source.startsWith('move_')) return 'moved';
	if (source.includes('.link') || source.includes('link_') || source.includes('_link'))
		return 'linked';
	return null;
}

function normalizeOperation(value: unknown): string | null {
	const operation = stringValue(value);
	if (!operation) return null;
	switch (operation) {
		case 'create':
		case 'created':
			return 'created';
		case 'update':
		case 'updated':
			return 'updated';
		case 'delete':
		case 'deleted':
			return 'deleted';
		case 'move':
		case 'moved':
			return 'moved';
		case 'link':
		case 'linked':
			return 'linked';
		case 'read':
			return 'read';
		default:
			return operation;
	}
}

function kindFromTool(toolName?: string | null, gatewayOp?: string | null): string | null {
	if (toolName && CREATE_TOOL_KINDS[toolName]) return CREATE_TOOL_KINDS[toolName];
	const source = gatewayOp || toolName || '';
	const ontoMatch = source.match(/onto\.([a-z_]+)\.(create|update|delete|move|link)/);
	if (ontoMatch?.[1]) return normalizeAffectedEntityKind(ontoMatch[1]);
	const directMatch = source.match(/(?:create|update|delete|move)_onto_([a-z_]+)/);
	if (directMatch?.[1]) return normalizeAffectedEntityKind(directMatch[1]);
	const calendarMatch = source.match(/calendar_event/);
	if (calendarMatch) return 'event';
	return null;
}

function nestedRecord(value: unknown, key: string): Record<string, any> | null {
	if (!isRecord(value)) return null;
	const candidate = value[key];
	if (isRecord(candidate)) return candidate;
	const result = value.result;
	if (isRecord(result) && isRecord(result[key])) return result[key] as Record<string, any>;
	const data = value.data;
	if (isRecord(data) && isRecord(data[key])) return data[key] as Record<string, any>;
	return null;
}

function unwrapPayload(value: unknown): Record<string, any> | null {
	if (typeof value === 'string') {
		try {
			return unwrapPayload(JSON.parse(value));
		} catch {
			return null;
		}
	}
	if (!isRecord(value)) return null;
	if (isRecord(value.result)) return value.result;
	if (isRecord(value.data)) return value.data;
	if (isRecord(value.tool_result)) return value.tool_result;
	return value;
}

function findStringDeep(value: unknown, keys: string[], maxDepth = 5): string | null {
	if (maxDepth < 0 || value === null || value === undefined) return null;
	if (isRecord(value)) {
		for (const key of keys) {
			const direct = stringValue(value[key]);
			if (direct) return direct;
		}
		for (const nested of Object.values(value)) {
			if (!nested || typeof nested !== 'object') continue;
			const found = findStringDeep(nested, keys, maxDepth - 1);
			if (found) return found;
		}
	}
	if (Array.isArray(value)) {
		for (const nested of value) {
			const found = findStringDeep(nested, keys, maxDepth - 1);
			if (found) return found;
		}
	}
	return null;
}

function titleFromRecord(record: Record<string, any> | null | undefined): string | null {
	if (!record) return null;
	return (
		stringValue(record.title) ||
		stringValue(record.name) ||
		stringValue(record.label) ||
		stringValue(record.summary) ||
		stringValue(record.description)
	);
}

export function buildAffectedEntityUrl(ref: ToolExecutionEntityRef): string | null {
	if (!ref.id) return null;
	if (ref.kind === 'project') return `/projects/${ref.id}`;
	if (!ref.projectId) return null;
	if (ref.kind === 'document') return `/projects/${ref.projectId}?doc=${ref.id}`;
	return `/projects/${ref.projectId}?entity=${encodeURIComponent(ref.kind)}&entity_id=${ref.id}`;
}

function normalizePersistedEntityRef(value: unknown): ToolExecutionEntityRef | null {
	if (!isRecord(value)) return null;
	const kind = normalizeAffectedEntityKind(
		stringValue(value.kind) ?? stringValue(value.entity_type)
	);
	const id =
		stringValue(value.id) ||
		stringValue(value.entity_id) ||
		(kind ? stringValue(value[`${kind}_id`]) : null);
	if (!kind || !id) return null;
	const ref: ToolExecutionEntityRef = {
		kind,
		id,
		title:
			stringValue(value.title) || stringValue(value.name) || stringValue(value.label) || null,
		projectId: stringValue(value.projectId) || stringValue(value.project_id) || null,
		url: stringValue(value.url),
		operation: normalizeOperation(value.operation) ?? undefined
	};
	ref.url = ref.url ?? buildAffectedEntityUrl(ref);
	return ref;
}

function extractPersistedAffectedEntities(value: unknown): ToolExecutionEntityRef[] {
	if (!Array.isArray(value)) return [];
	const refs: ToolExecutionEntityRef[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		const ref = normalizePersistedEntityRef(item);
		if (!ref) continue;
		const key = `${ref.kind}:${ref.id}:${ref.operation ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);
		refs.push(ref);
	}
	return refs;
}

function inferEntityRefFromToolExecution(
	execution: ToolExecutionAffectedEntityInput
): ToolExecutionEntityRef | null {
	const kind = kindFromTool(execution.tool_name, execution.gateway_op);
	const operation = operationFromTool(execution.tool_name, execution.gateway_op);
	if (!kind || !operation) return null;

	const args = unwrapPayload(execution.arguments);
	const result = unwrapPayload(execution.result);
	const resultRecord =
		nestedRecord(result, kind) ||
		nestedRecord(result, `${kind}s`) ||
		(isRecord(result?.entity) ? result.entity : null) ||
		result;
	const argRecord = nestedRecord(args, kind) || args;
	const idKeys = [`${kind}_id`, `${kind}Id`, 'entity_id', 'entityId', 'id'];
	const id =
		findStringDeep(resultRecord, idKeys) ||
		findStringDeep(args, idKeys) ||
		findStringDeep(result, idKeys);
	if (!id) return null;

	const projectId =
		kind === 'project'
			? id
			: findStringDeep(resultRecord, ['project_id', 'projectId']) ||
				findStringDeep(args, ['project_id', 'projectId']) ||
				null;
	const title =
		titleFromRecord(resultRecord) ||
		titleFromRecord(argRecord) ||
		findStringDeep(result, ['title', 'name', 'label']) ||
		findStringDeep(args, ['title', 'name', 'label']) ||
		null;
	const ref: ToolExecutionEntityRef = {
		kind,
		id,
		title,
		projectId,
		operation
	};
	ref.url = buildAffectedEntityUrl(ref);
	return ref;
}

export function extractAffectedEntitiesFromToolExecution(
	execution: ToolExecutionAffectedEntityInput
): ToolExecutionEntityRef[] {
	const persistedRefs = extractPersistedAffectedEntities(execution.affected_entities);
	if (persistedRefs.length > 0) return persistedRefs;
	if (execution.success === false) return [];
	const result = unwrapPayload(execution.result);
	if (result?.requires_user_action === true || result?.status === 'already_moved') return [];
	const inferred = inferEntityRefFromToolExecution(execution);
	return inferred ? [inferred] : [];
}
