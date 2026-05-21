// apps/web/src/lib/server/agent-call/agent-call-project-activity.service.ts
import type { ProjectLogAction, ProjectLogEntityType } from '@buildos/shared-types';

type JsonRecord = Record<string, unknown>;

type ActivityConfig = {
	action: ProjectLogAction;
	entityType: ProjectLogEntityType | 'calendar';
};

const WRITE_OP_ACTIVITY: Record<string, ActivityConfig> = {
	'onto.task.create': { action: 'created', entityType: 'task' },
	'onto.task.update': { action: 'updated', entityType: 'task' },
	'onto.task.docs.create_or_attach': { action: 'created', entityType: 'document' },
	'onto.document.create': { action: 'created', entityType: 'document' },
	'onto.document.update': { action: 'updated', entityType: 'document' },
	'onto.document.tree.move': { action: 'updated', entityType: 'document' },
	'onto.project.create': { action: 'created', entityType: 'project' },
	'onto.project.update': { action: 'updated', entityType: 'project' },
	'onto.goal.create': { action: 'created', entityType: 'goal' },
	'onto.goal.update': { action: 'updated', entityType: 'goal' },
	'onto.plan.create': { action: 'created', entityType: 'plan' },
	'onto.plan.update': { action: 'updated', entityType: 'plan' },
	'onto.milestone.create': { action: 'created', entityType: 'milestone' },
	'onto.milestone.update': { action: 'updated', entityType: 'milestone' },
	'onto.risk.create': { action: 'created', entityType: 'risk' },
	'onto.risk.update': { action: 'updated', entityType: 'risk' },
	'onto.edge.link': { action: 'created', entityType: 'edge' },
	'onto.edge.unlink': { action: 'updated', entityType: 'edge' },
	'cal.event.create': { action: 'created', entityType: 'event' },
	'cal.event.update': { action: 'updated', entityType: 'event' },
	'cal.event.delete': { action: 'deleted', entityType: 'event' },
	'cal.project.set': { action: 'updated', entityType: 'project' }
};

const TABLE_BY_KIND: Record<string, { table: string; select: string }> = {
	task: { table: 'onto_tasks', select: 'id, project_id' },
	document: { table: 'onto_documents', select: 'id, project_id' },
	goal: { table: 'onto_goals', select: 'id, project_id' },
	plan: { table: 'onto_plans', select: 'id, project_id' },
	milestone: { table: 'onto_milestones', select: 'id, project_id' },
	risk: { table: 'onto_risks', select: 'id, project_id' },
	event: { table: 'onto_events', select: 'id, project_id' },
	edge: { table: 'onto_edges', select: 'id, project_id' }
};

function asRecord(value: unknown): JsonRecord | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as JsonRecord)
		: null;
}

function stringValue(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function resultRecord(responsePayload: JsonRecord): JsonRecord {
	return asRecord(responsePayload.result) ?? {};
}

function compactSnapshot(value: unknown, fallback: JsonRecord): JsonRecord {
	const record = asRecord(value);
	if (!record) return fallback;

	const out: JsonRecord = {};
	for (const key of [
		'id',
		'project_id',
		'project_name',
		'title',
		'name',
		'type_key',
		'state_key',
		'priority',
		'due_at',
		'start_at',
		'completed_at',
		'rel',
		'src_kind',
		'src_id',
		'dst_kind',
		'dst_id'
	]) {
		if (record[key] !== undefined) out[key] = record[key];
	}

	return Object.keys(out).length > 0 ? out : fallback;
}

function responseEntity(params: {
	responsePayload: JsonRecord;
	entityType: string;
	entityKind?: string | null;
}): JsonRecord | null {
	const result = resultRecord(params.responsePayload);
	const kind = params.entityKind ?? params.entityType;

	return (
		asRecord(result[kind]) ??
		asRecord(result[params.entityType]) ??
		asRecord(result.project_calendar) ??
		asRecord(result.calendar) ??
		(params.entityType === 'project' ? asRecord(result.project) : null)
	);
}

function projectIdFromPayload(params: {
	responsePayload: JsonRecord;
	entityType: string;
	entityKind?: string | null;
	entityId?: string | null;
	args: JsonRecord;
}): string | null {
	const result = resultRecord(params.responsePayload);
	const entity = responseEntity(params);
	const resultProject = asRecord(result.project);

	return (
		stringValue(entity?.project_id) ??
		(params.entityType === 'project' ? stringValue(entity?.id) : null) ??
		stringValue(result.project_id) ??
		stringValue(resultProject?.id) ??
		stringValue(params.args.project_id) ??
		(params.entityType === 'project' ? stringValue(params.entityId) : null)
	);
}

function entityIdForActivity(params: {
	op: string;
	entityType: string;
	entityId?: string | null;
	projectId: string;
	responsePayload: JsonRecord;
	entityKind?: string | null;
}): string | null {
	if (params.op === 'cal.project.set') return params.projectId;

	const entity = responseEntity({
		responsePayload: params.responsePayload,
		entityType: params.entityType,
		entityKind: params.entityKind
	});

	return stringValue(params.entityId) ?? stringValue(entity?.id);
}

async function resolveProjectId(params: {
	admin: any;
	entityType: string;
	entityKind?: string | null;
	entityId?: string | null;
	responsePayload: JsonRecord;
	args: JsonRecord;
}): Promise<string | null> {
	const fromPayload = projectIdFromPayload(params);
	if (fromPayload) return fromPayload;

	const kind = params.entityKind ?? params.entityType;
	const entityId = stringValue(params.entityId);
	const mapping = kind ? TABLE_BY_KIND[kind] : undefined;
	if (!mapping || !entityId) return null;

	const { data, error } = await params.admin
		.from(mapping.table)
		.select(mapping.select)
		.eq('id', entityId)
		.maybeSingle();

	if (error) {
		console.warn('[AgentCallProjectActivity] Failed to resolve project id:', error);
		return null;
	}

	return stringValue(asRecord(data)?.project_id);
}

async function hasExistingActivityLog(params: {
	admin: any;
	projectId: string;
	entityType: ProjectLogEntityType;
	entityId: string;
	action: ProjectLogAction;
	callSessionId: string;
	startedAt?: string;
}): Promise<boolean> {
	let query = params.admin
		.from('onto_project_logs')
		.select('id')
		.eq('project_id', params.projectId)
		.eq('entity_type', params.entityType)
		.eq('entity_id', params.entityId)
		.eq('action', params.action)
		.eq('agent_call_session_id', params.callSessionId)
		.in('change_source', ['agent_call', 'api'])
		.limit(1);

	if (params.startedAt) {
		query = query.gte('created_at', params.startedAt);
	}

	const { data, error } = await query;
	if (error) {
		console.warn('[AgentCallProjectActivity] Failed to check existing activity:', error);
		return false;
	}

	return Array.isArray(data) && data.length > 0;
}

async function insertActivityLogWithSourceFallback(params: {
	admin: any;
	row: JsonRecord;
}): Promise<void> {
	const { error } = await params.admin.from('onto_project_logs').insert(params.row);
	if (!error) return;

	const isAgentCallSourceConstraint =
		error.code === '23514' &&
		typeof error.message === 'string' &&
		error.message.includes('check_change_source_values') &&
		params.row.change_source === 'agent_call';

	if (!isAgentCallSourceConstraint) {
		console.warn('[AgentCallProjectActivity] Failed to insert activity:', error);
		return;
	}

	const retryRow = {
		...params.row,
		change_source: 'api',
		after_data:
			params.row.after_data && typeof params.row.after_data === 'object'
				? {
						...(params.row.after_data as JsonRecord),
						intended_change_source: 'agent_call'
					}
				: params.row.after_data
	};
	const retry = await params.admin.from('onto_project_logs').insert(retryRow);
	if (retry.error) {
		console.warn('[AgentCallProjectActivity] Failed to insert fallback activity:', retry.error);
	}
}

export async function maybeLogAgentCallProjectActivity(params: {
	admin: any;
	executionId?: string | null;
	callSessionId: string;
	callerId: string;
	userId: string;
	op: string;
	args: JsonRecord;
	responsePayload: JsonRecord;
	entityKind?: string | null;
	entityId?: string | null;
	startedAt?: string;
	completedAt?: string;
}): Promise<void> {
	const config = WRITE_OP_ACTIVITY[params.op];
	if (!config || config.entityType === 'calendar') return;

	try {
		const projectId = await resolveProjectId({
			admin: params.admin,
			entityType: config.entityType,
			entityKind: params.entityKind,
			entityId: params.entityId,
			responsePayload: params.responsePayload,
			args: params.args
		});
		if (!projectId) return;

		const entityId = entityIdForActivity({
			op: params.op,
			entityType: config.entityType,
			entityKind: params.entityKind,
			entityId: params.entityId,
			projectId,
			responsePayload: params.responsePayload
		});
		if (!entityId) return;

		const existing = await hasExistingActivityLog({
			admin: params.admin,
			projectId,
			entityType: config.entityType,
			entityId,
			action: config.action,
			callSessionId: params.callSessionId,
			startedAt: params.startedAt
		});
		if (existing) return;

		const entity = responseEntity({
			responsePayload: params.responsePayload,
			entityType: config.entityType,
			entityKind: params.entityKind
		});
		const snapshot = {
			...compactSnapshot(entity, {
				id: entityId,
				project_id: projectId,
				op: params.op
			}),
			...(params.executionId ? { agent_call_tool_execution_id: params.executionId } : {})
		};

		await insertActivityLogWithSourceFallback({
			admin: params.admin,
			row: {
				project_id: projectId,
				entity_type: config.entityType,
				entity_id: entityId,
				action: config.action,
				before_data: config.action === 'created' ? null : { op: params.op },
				after_data: config.action === 'deleted' ? null : snapshot,
				changed_by: params.userId,
				change_source: 'agent_call',
				external_agent_caller_id: params.callerId,
				agent_call_session_id: params.callSessionId,
				created_at: params.completedAt ?? new Date().toISOString()
			}
		});
	} catch (error) {
		console.warn('[AgentCallProjectActivity] Failed to log Bridge activity:', error);
	}
}
