// packages/shared-agent-ops/src/gateway/op-execution-gateway.guest-lane.ts
//
// The guest-agent lane (docs/specs/PEOPLE_LAYER_ARCHITECTURE_2026-10-23.md, "DJ direction").
//
// In a project someone else owns, a connected agent writes only when the owner set that
// member's agents to "write" and the member gave the connector write access. Even then it
// may only:
//   - add tasks and documents, and
//   - change tasks the person created or is assigned to, and documents the person created.
// It never edits the owner's items, goals, plans, milestones, risks, tables, the project,
// edges, assets, or calendars, and never deletes (archives) or invites.
//
// The lane runs once per external write, before the handler. It does not need to know how
// each op names its project: it rebuilds the call's write_project_ids without any shared
// project, then adds back only the one shared project this exact call proved it may touch.
// Every handler already refuses projects missing from write_project_ids
// (assertProjectWriteAccess), so an op the lane doesn't know about fails closed.
//
// Internal BuildOS chat does not pass through here: a member using BuildOS chat acts as
// themselves.
import type { AgentCallScope } from '@buildos/shared-types';
import {
	ensureActorId,
	fetchProjectSummaries,
	type OntologyProjectSummary
} from '../ontology/ontology-projects.service';
import { loadMemberAgentAccess } from './op-execution-gateway.member-agent-access';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';

/** Changes one connector may make in one project someone else owns, per rolling 24 hours. */
export const GUEST_AGENT_DAILY_WRITE_LIMIT = 50;

export const GUEST_LANE_REASON = {
	agentWriteOff: 'guest_agent_write_off',
	outsideLane: 'outside_guest_lane',
	dailyLimit: 'guest_agent_daily_limit'
} as const;

type LaneTarget =
	| { kind: 'create'; projectId: string }
	| {
			kind: 'task' | 'document';
			projectId: string;
			entityId: string;
			createdBy: string | null;
			/** Set when the call also attaches an existing document to the task. */
			attachDocument?: { id: string; projectId: string; createdBy: string | null } | null;
	  };

const CREATE_OPS = new Set(['onto.task.create', 'onto.document.create']);
const LANE_OPS = new Set([
	...CREATE_OPS,
	'onto.task.update',
	'onto.task.docs.create_or_attach',
	'onto.document.update'
]);

/** Whether an agent may ever make this write in a project someone else owns. */
export function isGuestLaneOp(op: string): boolean {
	return LANE_OPS.has(op);
}

function asId(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function loadEntity(
	admin: any,
	table: 'onto_tasks' | 'onto_documents',
	id: string
): Promise<{ id: string; project_id: string; created_by: string | null } | null> {
	const { data, error } = await admin
		.from(table)
		.select('id, project_id, created_by')
		.eq('id', id)
		.maybeSingle();
	if (error || !data || typeof data.project_id !== 'string') return null;
	return {
		id: String(data.id),
		project_id: data.project_id,
		created_by: typeof data.created_by === 'string' ? data.created_by : null
	};
}

/** Which project and item a lane-eligible write targets; null for every other op. */
async function resolveLaneTarget(
	admin: any,
	op: string,
	args: Record<string, unknown>
): Promise<LaneTarget | null> {
	if (CREATE_OPS.has(op)) {
		const projectId = asId(args.project_id);
		return projectId ? { kind: 'create', projectId } : null;
	}
	if (op === 'onto.task.update' || op === 'onto.task.docs.create_or_attach') {
		const taskId = asId(args.task_id);
		if (!taskId) return null;
		const task = await loadEntity(admin, 'onto_tasks', taskId);
		if (!task) return null;
		let attachDocument: { id: string; projectId: string; createdBy: string | null } | null =
			null;
		const documentId = op === 'onto.task.docs.create_or_attach' ? asId(args.document_id) : null;
		if (documentId) {
			const doc = await loadEntity(admin, 'onto_documents', documentId);
			attachDocument = doc
				? { id: doc.id, projectId: doc.project_id, createdBy: doc.created_by }
				: { id: documentId, projectId: task.project_id, createdBy: null };
		}
		return {
			kind: 'task',
			projectId: task.project_id,
			entityId: task.id,
			createdBy: task.created_by,
			attachDocument
		};
	}
	if (op === 'onto.document.update') {
		const documentId = asId(args.document_id);
		if (!documentId) return null;
		const doc = await loadEntity(admin, 'onto_documents', documentId);
		if (!doc) return null;
		return {
			kind: 'document',
			projectId: doc.project_id,
			entityId: doc.id,
			createdBy: doc.created_by
		};
	}
	return null;
}

async function isAssignedToTask(admin: any, taskId: string, actorId: string): Promise<boolean> {
	const { data, error } = await admin
		.from('onto_task_assignees')
		.select('task_id')
		.eq('task_id', taskId)
		.eq('assignee_actor_id', actorId)
		.limit(1);
	return !error && Array.isArray(data) && data.length > 0;
}

/** The member's agent setting with the owner's standing approval applied; null on failure. */
async function loadEffectiveAgentAccess(
	admin: any,
	projectId: string,
	actorId: string
): Promise<string | null> {
	try {
		return (
			(await loadMemberAgentAccess(admin, actorId, [projectId])).get(projectId)?.effective ??
			null
		);
	} catch {
		return null;
	}
}

async function countRecentConnectorChanges(
	admin: any,
	projectId: string,
	callerId: string
): Promise<number> {
	const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	const { count, error } = await admin
		.from('onto_project_logs')
		.select('id', { count: 'exact', head: true })
		.eq('project_id', projectId)
		.eq('external_agent_caller_id', callerId)
		.gte('created_at', since);
	if (error) {
		// Can't prove the agent is under its limit: refuse rather than guess.
		throw new ExternalToolGatewayError(
			'INTERNAL',
			"Could not check this connection's recent changes. Try again shortly."
		);
	}
	return typeof count === 'number' ? count : 0;
}

/** Tells the owner once per day that a member's agent hit its limit. Never throws. */
async function notifyOwnerOfDailyLimit(params: {
	admin: any;
	project: OntologyProjectSummary;
	memberUserId: string;
}): Promise<void> {
	try {
		const { data: ownerActor } = await params.admin
			.from('onto_actors')
			.select('user_id')
			.eq('id', params.project.owner_actor_id)
			.maybeSingle();
		const ownerUserId = typeof ownerActor?.user_id === 'string' ? ownerActor.user_id : null;
		if (!ownerUserId) return;

		const dayStart = new Date();
		dayStart.setUTCHours(0, 0, 0, 0);
		const { data: existing } = await params.admin
			.from('user_notifications')
			.select('id')
			.eq('user_id', ownerUserId)
			.eq('event_type', 'agent.guest_lane.paused')
			.contains('data', {
				kind: GUEST_LANE_REASON.dailyLimit,
				project_id: params.project.id,
				member_user_id: params.memberUserId
			})
			.gte('created_at', dayStart.toISOString())
			.limit(1);
		if (Array.isArray(existing) && existing.length > 0) return;

		const { data: member } = await params.admin
			.from('users')
			.select('name')
			.eq('id', params.memberUserId)
			.maybeSingle();
		const memberName =
			typeof member?.name === 'string' && member.name.trim()
				? member.name.trim()
				: 'A member';

		await params.admin.from('user_notifications').insert({
			user_id: ownerUserId,
			type: 'warning',
			title: `${memberName}'s agent was paused in ${params.project.name}`,
			message: `It made ${GUEST_AGENT_DAILY_WRITE_LIMIT} changes in 24 hours, so BuildOS stopped its changes until tomorrow. You can turn their agents off in the project's sharing settings.`,
			priority: 'normal',
			action_url: `/projects/${params.project.id}`,
			event_type: 'agent.guest_lane.paused',
			data: {
				kind: GUEST_LANE_REASON.dailyLimit,
				project_id: params.project.id,
				member_user_id: params.memberUserId
			}
		});
	} catch (error) {
		console.warn('[GuestLane] Failed to notify owner of daily limit:', error);
	}
}

/**
 * Returns the scope this one write call runs with. Projects the user owns pass through
 * unchanged; a project someone else owns stays writable only if this call is inside the
 * guest lane. Throws a plain FORBIDDEN for a lane-eligible call that breaks a lane rule.
 */
export async function applyGuestAgentLane(params: {
	admin: any;
	userId: string;
	callerId?: string;
	op: string;
	args: Record<string, unknown>;
	scope: AgentCallScope;
}): Promise<AgentCallScope> {
	const actorId = await ensureActorId(params.admin, params.userId);
	const projects = await fetchProjectSummaries(params.admin, actorId);
	const shared = new Map(
		projects.filter((project) => project.is_shared).map((project) => [project.id, project])
	);
	if (shared.size === 0) return params.scope;

	const baseWrite = Array.isArray(params.scope.write_project_ids)
		? params.scope.write_project_ids
		: projects
				.filter(
					(project) =>
						project.access_level === 'write' || project.access_level === 'admin'
				)
				.map((project) => project.id);
	const ownWrite = baseWrite.filter((projectId) => !shared.has(projectId));
	const laneScope: AgentCallScope = { ...params.scope, write_project_ids: ownWrite };

	const target = await resolveLaneTarget(params.admin, params.op, params.args);
	if (!target) return laneScope;
	const project = shared.get(target.projectId);
	if (!project || !baseWrite.includes(target.projectId)) return laneScope;

	const agentAccess = await loadEffectiveAgentAccess(params.admin, project.id, actorId);
	if (agentAccess !== 'write') {
		throw new ExternalToolGatewayError(
			'FORBIDDEN',
			`The owner of "${project.name}" lets your agents read this project, not change it.`,
			{ reason: GUEST_LANE_REASON.agentWriteOff, project_id: project.id }
		);
	}

	const outsideLane = () =>
		new ExternalToolGatewayError(
			'FORBIDDEN',
			`"${project.name}" belongs to someone else. Here your agent can add tasks and documents, and change only tasks and documents your person created or is assigned to.`,
			{ reason: GUEST_LANE_REASON.outsideLane, project_id: project.id }
		);

	// Archiving a task also sets deleted_at (the board's soft delete), and the lane never
	// deletes. Refuse archive and restore alike, even on items the person created.
	if (target.kind !== 'create' && params.args.archived !== undefined) {
		throw new ExternalToolGatewayError(
			'FORBIDDEN',
			`"${project.name}" belongs to someone else. Your agent can't archive or restore items there; your person can do that in BuildOS.`,
			{ reason: GUEST_LANE_REASON.outsideLane, project_id: project.id, action: 'archive' }
		);
	}

	if (target.kind === 'task') {
		const owns =
			target.createdBy === actorId ||
			(await isAssignedToTask(params.admin, target.entityId, actorId));
		if (!owns) throw outsideLane();
		if (
			target.attachDocument &&
			(target.attachDocument.projectId !== project.id ||
				target.attachDocument.createdBy !== actorId)
		) {
			throw outsideLane();
		}
	} else if (target.kind === 'document' && target.createdBy !== actorId) {
		throw outsideLane();
	}

	if (!params.callerId) throw outsideLane();
	const recent = await countRecentConnectorChanges(params.admin, project.id, params.callerId);
	if (recent >= GUEST_AGENT_DAILY_WRITE_LIMIT) {
		await notifyOwnerOfDailyLimit({
			admin: params.admin,
			project,
			memberUserId: params.userId
		});
		throw new ExternalToolGatewayError(
			'FORBIDDEN',
			`This connection made ${GUEST_AGENT_DAILY_WRITE_LIMIT} changes in "${project.name}" in the last 24 hours, so changes there are paused until tomorrow. Reading still works.`,
			{ reason: GUEST_LANE_REASON.dailyLimit, project_id: project.id }
		);
	}

	return { ...laneScope, write_project_ids: [...ownWrite, project.id] };
}
