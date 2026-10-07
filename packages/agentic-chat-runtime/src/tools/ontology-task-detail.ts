// packages/agentic-chat-runtime/src/tools/ontology-task-detail.ts
// Phase 4 Slice 18 S3-T7: task detail, linked entities, and assignee hydration.

import type { TaskAssignee } from '@buildos/shared-agent-ops/ontology/onto';
import {
	type TaskEntityRecord,
	summarizeTaskEntitiesForAgent
} from '@buildos/shared-agent-ops/task-entities';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import { buildDetailNotFoundPayload, stripInternalPayloadFields } from './ontology-reads';
import { loadReadableOntologyDetailRow } from './ontology-detail-reads';
import { isArchivedOrDeletedRecord } from './record-scope';

export interface SharedGetOntoTaskDetailsArgs {
	task_id: string;
}

export interface TaskLinkedEntity {
	id: string;
	name?: string;
	title?: string;
	type_key?: string;
	state_key?: string;
	due_at?: string;
	edge_rel: string;
	edge_direction: 'outgoing' | 'incoming';
}

export interface TaskLinkedEntitiesResult {
	plans: TaskLinkedEntity[];
	goals: TaskLinkedEntity[];
	milestones: TaskLinkedEntity[];
	documents: TaskLinkedEntity[];
	dependentTasks: TaskLinkedEntity[];
}

type EdgeInfo = {
	rel: string;
	direction: 'outgoing' | 'incoming';
};

type LinkedRow = { id: string } & Record<string, any>;

type TaskAssigneeRow = {
	task_id: string;
	created_at: string;
	assignee:
		| {
				id: string;
				user_id: string | null;
				name: string | null;
				email: string | null;
		  }
		| Array<{
				id: string;
				user_id: string | null;
				name: string | null;
				email: string | null;
		  }>
		| null;
};

function emptyTaskLinkedEntities(): TaskLinkedEntitiesResult {
	return {
		plans: [],
		goals: [],
		milestones: [],
		documents: [],
		dependentTasks: []
	};
}

async function fetchLinkedRows(
	client: any,
	input: {
		table: string;
		selection: string;
		ids: string[];
		projectId: string;
		currentOnly?: boolean;
	}
): Promise<LinkedRow[]> {
	if (input.ids.length === 0) return [];
	let query = client
		.from(input.table)
		.select(input.selection)
		.eq('project_id', input.projectId)
		.is('deleted_at', null);
	if (input.currentOnly) query = query.is('archived_at', null);
	const { data, error } = await query.in('id', input.ids);
	if (error || !Array.isArray(data)) return [];
	const rows = data as LinkedRow[];
	// A document archived from the tree keeps archived_at NULL (tasker 113).
	return input.currentOnly && input.table === 'onto_documents'
		? rows.filter((row) => !isArchivedOrDeletedRecord(row, 'document'))
		: rows;
}

/**
 * Resolve task graph neighbors. Every service-role-visible query is explicitly
 * fenced to the already authorized project, including the initial edge fan-out.
 */
export async function resolveTaskLinkedEntities(
	client: AgenticChatSharedReadContextV1['client'],
	input: {
		taskId: string;
		projectId: string;
		/** Chat reads the present: archived links stay out (tasker 113). The web modal keeps them. */
		currentOnly?: boolean;
	}
): Promise<TaskLinkedEntitiesResult> {
	const db = client as any;
	const result = emptyTaskLinkedEntities();
	const { data: edges, error } = await db
		.from('onto_edges')
		.select('*')
		.eq('project_id', input.projectId)
		.or(`src_id.eq.${input.taskId},dst_id.eq.${input.taskId}`);

	if (error || !Array.isArray(edges) || edges.length === 0) return result;

	const ids = {
		plans: [] as string[],
		goals: [] as string[],
		milestones: [] as string[],
		documents: [] as string[],
		tasks: [] as string[]
	};
	const edgeMap = new Map<string, EdgeInfo>();

	for (const edge of edges) {
		const isSource = edge.src_id === input.taskId;
		const linkedId = isSource ? edge.dst_id : edge.src_id;
		const linkedKind = isSource ? edge.dst_kind : edge.src_kind;
		if (typeof linkedId !== 'string' || edgeMap.has(linkedId)) continue;

		edgeMap.set(linkedId, {
			rel: edge.rel,
			direction: isSource ? 'outgoing' : 'incoming'
		});

		switch (linkedKind) {
			case 'plan':
				ids.plans.push(linkedId);
				break;
			case 'goal':
				ids.goals.push(linkedId);
				break;
			case 'milestone':
				ids.milestones.push(linkedId);
				break;
			case 'document':
				ids.documents.push(linkedId);
				break;
			case 'task':
				if (linkedId !== input.taskId) ids.tasks.push(linkedId);
				break;
		}
	}

	const [plans, goals, milestones, documents, tasks] = await Promise.all([
		fetchLinkedRows(db, {
			table: 'onto_plans',
			selection: 'id, name, state_key, type_key',
			ids: ids.plans,
			projectId: input.projectId,
			currentOnly: input.currentOnly
		}),
		fetchLinkedRows(db, {
			table: 'onto_goals',
			selection: 'id, name, state_key, type_key',
			ids: ids.goals,
			projectId: input.projectId,
			currentOnly: input.currentOnly
		}),
		fetchLinkedRows(db, {
			table: 'onto_milestones',
			selection: 'id, title, due_at, state_key',
			ids: ids.milestones,
			projectId: input.projectId,
			currentOnly: input.currentOnly
		}),
		fetchLinkedRows(db, {
			table: 'onto_documents',
			selection: 'id, title, type_key, state_key',
			ids: ids.documents,
			projectId: input.projectId,
			currentOnly: input.currentOnly
		}),
		fetchLinkedRows(db, {
			table: 'onto_tasks',
			selection: 'id, title, state_key, type_key',
			ids: ids.tasks,
			projectId: input.projectId,
			currentOnly: input.currentOnly
		})
	]);

	const decorate = (row: LinkedRow, fallbackRel: string): TaskLinkedEntity => {
		const edge = edgeMap.get(row.id);
		return {
			...row,
			edge_rel: edge?.rel || fallbackRel,
			edge_direction: edge?.direction || 'outgoing'
		};
	};

	result.plans = plans.map((row) => decorate(row, 'has_task'));
	result.goals = goals.map((row) => decorate(row, 'supports_goal'));
	result.milestones = milestones.map((row) => decorate(row, 'targets_milestone'));
	result.documents = documents
		.filter((row) => {
			const typeKey = typeof row.type_key === 'string' ? row.type_key : '';
			return !typeKey.includes('scratch') && !typeKey.includes('workspace');
		})
		.map((row) => decorate(row, 'has_document'));
	result.dependentTasks = tasks.map((row) => decorate(row, 'depends_on'));
	return result;
}

export async function fetchTaskAssigneesMapForProject(
	client: AgenticChatSharedReadContextV1['client'],
	input: { projectId: string; taskIds: string[] }
): Promise<Map<string, TaskAssignee[]>> {
	const map = new Map<string, TaskAssignee[]>();
	if (input.taskIds.length === 0) return map;

	const { data, error } = await (client as any)
		.from('onto_task_assignees')
		.select(
			`task_id, assignee_actor_id, created_at,
			assignee:onto_actors!onto_task_assignees_assignee_actor_id_fkey(
				id, user_id, name, email
			)`
		)
		.eq('project_id', input.projectId)
		.in('task_id', input.taskIds)
		.order('created_at', { ascending: true });
	if (error) throw error;

	for (const row of (data ?? []) as TaskAssigneeRow[]) {
		const actor = Array.isArray(row.assignee) ? (row.assignee[0] ?? null) : row.assignee;
		if (!actor || typeof actor.id !== 'string') continue;
		const assignee: TaskAssignee = {
			actor_id: actor.id,
			user_id: actor.user_id ?? null,
			name: actor.name ?? null,
			email: actor.email ?? null,
			assigned_at: row.created_at
		};
		const existing = map.get(row.task_id) ?? [];
		existing.push(assignee);
		map.set(row.task_id, existing);
	}
	return map;
}

export function attachAssigneesToTask<T extends { id: string }>(
	task: T,
	assigneeMap: Map<string, TaskAssignee[]>
): T & { assignees: TaskAssignee[] } {
	return { ...task, assignees: assigneeMap.get(task.id) ?? [] };
}

export type TaskEntitySummary = ReturnType<typeof summarizeTaskEntitiesForAgent>[number];

/**
 * The people, places, times, phone numbers, emails and links read from a task's text
 * (onto_task_entities): what the task's chips show. Empty when none were read or the read
 * fails; task details never fail on it.
 */
export async function loadTaskEntitySummaries(
	client: unknown,
	params: { taskId: string; projectId: string }
): Promise<TaskEntitySummary[]> {
	try {
		// Not in the generated Database types until `pnpm gen:all` (migration 20261007120000).
		const { data, error } = await (client as any)
			.from('onto_task_entities')
			.select('kind, value, display, role, about, status, in_text, position')
			.eq('project_id', params.projectId)
			.eq('task_id', params.taskId)
			.neq('status', 'dismissed')
			.order('position', { ascending: true })
			.limit(24);
		if (error || !Array.isArray(data)) return [];
		return summarizeTaskEntitiesForAgent(data as TaskEntityRecord[]);
	} catch {
		return [];
	}
}

export async function loadOntoTaskDetail(
	context: AgenticChatSharedReadContextV1,
	taskId: string,
	options: { onAssigneeError?: (error: unknown) => void } = {}
): Promise<{
	task: Record<string, any>;
	linkedEntities: TaskLinkedEntitiesResult;
	entities: TaskEntitySummary[];
} | null> {
	const row = await loadReadableOntologyDetailRow(context, {
		table: 'onto_tasks',
		id: taskId,
		selection: '*, project:onto_projects!inner(id, created_by)'
	});
	if (!row) return null;

	const { project: _project, ...task } = row;
	const [linkedEntities, assigneeMap, entities] = await Promise.all([
		resolveTaskLinkedEntities(context.client, {
			taskId,
			projectId: row.project_id,
			currentOnly: true
		}),
		fetchTaskAssigneesMapForProject(context.client, {
			projectId: row.project_id,
			taskIds: [taskId]
		}).catch((error) => {
			options.onAssigneeError?.(error);
			return new Map<string, TaskAssignee[]>();
		}),
		loadTaskEntitySummaries(context.client, { taskId, projectId: row.project_id })
	]);

	return {
		task: attachAssigneesToTask(task as { id: string } & Record<string, any>, assigneeMap),
		linkedEntities,
		entities
	};
}

export async function getOntoTaskDetails(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetOntoTaskDetailsArgs
): Promise<Record<string, any>> {
	const details = await loadOntoTaskDetail(context, args.task_id);
	if (!details) {
		return buildDetailNotFoundPayload({
			entityType: 'task',
			idKey: 'task_id',
			id: args.task_id,
			listTool: 'list_onto_tasks',
			searchTool: 'search_onto_tasks'
		});
	}
	return {
		...stripInternalPayloadFields(details),
		message: 'Complete ontology task details loaded.'
	};
}
