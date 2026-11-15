// packages/shared-agent-ops/src/gateway/op-execution-gateway.task-assignment.ts
import { isValidUUID } from '@buildos/shared-types';
import {
	type IndexedProjectMember,
	type ProjectMemberActor,
	formatMemberLabel,
	indexProjectMemberRows,
	matchProjectMemberHandle,
	normalizeHandleToken
} from '../ontology/project-member-handles';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';

const MAX_TASK_ASSIGNEES = 10;

/** Never carries an email: task results reach external agents (people layer). */
export type GatewayTaskAssignee = {
	actor_id: string;
	user_id: string | null;
	name: string | null;
	assigned_at: string;
};

function hasOwn(record: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(record, key);
}

function resolveHandle(handle: string, members: IndexedProjectMember[]): IndexedProjectMember {
	const match = matchProjectMemberHandle(handle, members);
	if (match.status === 'match') return match.member;
	if (match.status === 'ambiguous') {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`Ambiguous assignee handle "@${handle}". Matches: ${match.members.map(formatMemberLabel).join(', ')}. Use explicit IDs to disambiguate.`
		);
	}
	throw new ExternalToolGatewayError(
		'VALIDATION_ERROR',
		`No active project member matches assignee handle "@${handle}"`
	);
}

function normalizeActorIds(value: unknown): string[] {
	if (!Array.isArray(value)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'assignee_actor_ids must be an array of actor IDs'
		);
	}

	const ids: string[] = [];
	for (const entry of value) {
		if (typeof entry !== 'string' || !isValidUUID(entry.trim())) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				'assignee_actor_ids must contain only non-empty UUID strings'
			);
		}
		ids.push(entry.trim());
	}
	return Array.from(new Set(ids));
}

function normalizeHandles(value: unknown): string[] {
	if (!Array.isArray(value)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'assignee_handles must be an array of handle strings'
		);
	}

	return value.map((entry) => {
		const handle = normalizeHandleToken(entry);
		if (!handle) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`Invalid assignee handle: ${String(entry)}`
			);
		}
		return handle;
	});
}

export async function resolveGatewayTaskAssignees(params: {
	admin: any;
	projectId: string;
	projectOwnerActorId?: string | null;
	args: Record<string, unknown>;
}): Promise<{ hasInput: boolean; assigneeActorIds: string[] }> {
	const hasActorIds = hasOwn(params.args, 'assignee_actor_ids');
	const hasHandles = hasOwn(params.args, 'assignee_handles');
	if (!hasActorIds && !hasHandles) {
		return { hasInput: false, assigneeActorIds: [] };
	}

	const explicitActorIds = hasActorIds ? normalizeActorIds(params.args.assignee_actor_ids) : [];
	const handles = hasHandles ? normalizeHandles(params.args.assignee_handles) : [];
	let members: IndexedProjectMember[] = [];

	if (explicitActorIds.length > 0 || handles.length > 0) {
		const { data, error } = await params.admin
			.from('onto_project_members')
			.select(
				// No email: this may run on a signed-in client, which can't read it (Tasker 158).
				'actor_id, actor:onto_actors!onto_project_members_actor_id_fkey(id, user_id, name)'
			)
			.eq('project_id', params.projectId)
			.is('removed_at', null);
		if (error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error.message || 'Failed to validate task assignees'
			);
		}

		members = indexProjectMemberRows(
			(data ?? []) as Array<{ actor_id?: string; actor?: unknown }>
		);
	}

	if (explicitActorIds.length > 0) {
		const eligible = new Set(members.map((member) => member.actorId));
		if (params.projectOwnerActorId) eligible.add(params.projectOwnerActorId);
		const invalid = explicitActorIds.filter((actorId) => !eligible.has(actorId));
		if (invalid.length > 0) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`Assignees must be active project members: ${invalid.join(', ')}`
			);
		}
	}

	const resolvedHandles = handles.map((handle) => resolveHandle(handle, members).actorId);
	const assigneeActorIds = Array.from(new Set([...explicitActorIds, ...resolvedHandles]));
	if (assigneeActorIds.length > MAX_TASK_ASSIGNEES) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`A task can have at most ${MAX_TASK_ASSIGNEES} assignees`
		);
	}

	return { hasInput: true, assigneeActorIds };
}

export async function fetchGatewayTaskAssignees(params: {
	admin: any;
	projectId: string;
	taskId: string;
}): Promise<GatewayTaskAssignee[]> {
	const { data, error } = await params.admin
		.from('onto_task_assignees')
		.select(
			'task_id, created_at, assignee:onto_actors!onto_task_assignees_assignee_actor_id_fkey(id, user_id, name)'
		)
		.eq('project_id', params.projectId)
		.eq('task_id', params.taskId)
		.order('created_at', { ascending: true });
	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to fetch task assignees'
		);
	}

	const assignees: GatewayTaskAssignee[] = [];
	for (const row of (data ?? []) as Array<{ created_at?: string; assignee?: unknown }>) {
		const rawActor = Array.isArray(row.assignee) ? (row.assignee[0] ?? null) : row.assignee;
		if (!rawActor || typeof rawActor !== 'object') continue;
		const actor = rawActor as ProjectMemberActor;
		if (typeof actor.id !== 'string' || typeof row.created_at !== 'string') continue;
		const name = actor.name?.trim() || null;
		assignees.push({
			actor_id: actor.id,
			user_id: actor.user_id ?? null,
			// An actor created without a name was named after its email. The email column isn't
			// readable here, so treat any name containing "@" as that case: a structural check on
			// an address shape, and a misfire only hides a display name.
			name: name && !name.includes('@') ? name : null,
			assigned_at: row.created_at
		});
	}
	return assignees;
}
