// packages/shared-agent-ops/src/gateway/op-execution-gateway.access-wall.ts
//
// When a connected agent is refused, say exactly what is in the way and the one step
// that clears it (tasker/140-agent-access-wall.md). Every refusal in a project the
// person can see carries `details.access_needed`:
//
//   wall          what is in the way (see ACCESS_WALL)
//   who_can_fix   'you' (the agent's person), 'owner' (the project owner), 'nobody' (a rule)
//   next          'you':   { open_url } (filled in by the web layer from `link`)
//                 'owner': { tool: 'request_project_access', args, ask_your_person_first }
//                 'nobody': null
//   say_to_user   one or two sentences the agent can show its person as is
//
// Projects this connection can't read never have their name in the payload (the owner
// or the person kept them out); the person knows which project they asked about.
//
// Runs on the refusal path only. Any lookup failure leaves the original error as is.
import { isValidUUID } from '@buildos/shared-types';
import type { AgentCallScope } from '@buildos/shared-types';
import {
	ensureActorId,
	fetchProjectSummaries,
	type OntologyProjectSummary
} from '../ontology/ontology-projects.service';
import { isWriteOp } from '../policy';
import {
	AGENTS_OFF_BY_OWNER,
	PROJECT_NOT_GRANTED_TO_CONNECTOR,
	VIEWER_CANNOT_WRITE,
	WRITE_NOT_GRANTED
} from './op-execution-gateway.access';
import {
	GUEST_AGENT_DAILY_WRITE_LIMIT,
	GUEST_LANE_REASON,
	isGuestLaneOp
} from './op-execution-gateway.guest-lane';
import {
	loadMemberAgentAccess,
	loadProjectOwnerName
} from './op-execution-gateway.member-agent-access';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';

export {
	effectiveMemberAgentAccess,
	loadMemberAgentAccess,
	loadProjectOwnerName,
	type MemberAgentAccess,
	type MemberAgentAccessRow
} from './op-execution-gateway.member-agent-access';

export const ACCESS_WALL = {
	/** 1. This connection hasn't been given the project. The person fixes it in one tap. */
	projectNotGranted: 'project_not_granted',
	/** 2. The connection (or its grant for this project) is read-only. The person fixes it. */
	connectionReadOnly: 'connection_read_only',
	/** 3. The owner turned this person's agents Off. */
	ownerTurnedAgentsOff: 'owner_turned_agents_off',
	/** 4. The owner lets this person's agents read, not change. */
	ownerAllowsReadOnly: 'owner_allows_read_only',
	/** 5. The person is a viewer, so their agents can't change anything. */
	viewerOnly: 'viewer_only',
	/** 6. Outside the guest lane (not the person's own or assigned work). A rule. */
	outsideGuestLane: 'outside_guest_lane',
	/** 7. 50 changes per project per day. A rule. */
	dailyLimit: 'daily_limit'
} as const;

export type AccessWall = (typeof ACCESS_WALL)[keyof typeof ACCESS_WALL];
export type AccessNeed = 'agents_read' | 'agents_write' | 'edit';
export type AccessWhoCanFix = 'you' | 'owner' | 'nobody';
/** Which page the web layer links for a 'you' wall. */
export type AccessLinkKind = 'grant' | 'allow_writes';

export type AccessNeeded = {
	wall: AccessWall;
	who_can_fix: AccessWhoCanFix;
	/** Null only for a connection-wide wall (a read-only connection calling a write tool). */
	project_id: string | null;
	/** Only when this connection can read the project. */
	project_name?: string;
	/** Only for owner walls and rules in someone else's project. Never an email. */
	owner_name?: string;
	/** What to ask the owner for (owner walls only). */
	need?: AccessNeed;
	next:
		| { open_url: string | null }
		| {
				tool: 'request_project_access';
				args: { project_id: string; need: AccessNeed };
				ask_your_person_first: true;
		  }
		| null;
	/** Web layer turns this into next.open_url; removed before the agent sees it. */
	link?: AccessLinkKind;
	say_to_user: string;
};

const WHO_CAN_FIX: Record<AccessWall, AccessWhoCanFix> = {
	project_not_granted: 'you',
	connection_read_only: 'you',
	owner_turned_agents_off: 'owner',
	owner_allows_read_only: 'owner',
	viewer_only: 'owner',
	outside_guest_lane: 'nobody',
	daily_limit: 'nobody'
};

function quoted(name: string | null | undefined): string | null {
	const trimmed = typeof name === 'string' ? name.trim() : '';
	return trimmed ? `"${trimmed}"` : null;
}

/** One wall, ready for the agent. The names passed in decide what the agent may learn. */
export function buildAccessNeeded(input: {
	wall: AccessWall;
	projectId: string | null;
	/** Pass only when this connection can read the project. */
	projectName?: string | null;
	ownerName?: string | null;
	need?: AccessNeed;
	/** connection_read_only: the whole connection is read-only (not just this project). */
	connectionReadOnly?: boolean;
	/** connection_read_only: an OAuth connection, which must reconnect to allow changes. */
	viaOAuth?: boolean;
	/** outside_guest_lane: the refusal was an archive or restore. */
	archive?: boolean;
	/** outside_guest_lane: the write is one agents never make there (a goal, plan, the project). */
	ownerItems?: boolean;
}): AccessNeeded {
	const project = quoted(input.projectName);
	const projectOrThat = project ?? 'that project';
	const ownerName = input.ownerName?.trim() || null;
	const Owner = ownerName ?? 'The owner';
	const owner = ownerName ?? 'the owner';
	const who = WHO_CAN_FIX[input.wall];

	let sayToUser: string;
	let link: AccessLinkKind | undefined;
	switch (input.wall) {
		case 'project_not_granted':
			link = 'grant';
			sayToUser =
				"That project isn't connected to me yet. Tap the link to let me in, then I'll try again.";
			break;
		case 'connection_read_only':
			link = 'allow_writes';
			sayToUser =
				input.viaOAuth && input.connectionReadOnly
					? `${project ? `I can read ${project}, but you` : 'You'} connected me without permission to make changes. Open the link to reconnect with changes allowed, then I'll try again.`
					: input.connectionReadOnly
						? `${project ? `I can read ${project}, but this` : 'This'} connection can only read. Tap the link to allow changes, then I'll try again.`
						: `I can read ${projectOrThat}, but this connection isn't allowed to make changes there yet. Tap the link to allow changes, then I'll try again.`;
			break;
		case 'owner_turned_agents_off':
			sayToUser = `${Owner} turned off agents for you in that project, so I can't open it. Only ${owner} can turn them back on. Want me to ask ${owner}?`;
			break;
		case 'owner_allows_read_only':
			sayToUser = `${Owner} lets me read ${projectOrThat} for you, but not change it. Want me to ask ${owner} to let me make changes?`;
			break;
		case 'viewer_only':
			sayToUser = `You're a viewer in ${projectOrThat}, so I can't change it for you. Want me to ask ${owner} to make you an editor and let me make changes?`;
			break;
		case 'outside_guest_lane':
			sayToUser = input.archive
				? `${project ?? 'That project'} belongs to ${owner}, so I can't archive or restore items there. You can do that yourself in BuildOS.`
				: input.ownerItems
					? `${project ?? 'That project'} belongs to ${owner}. There I can add tasks and documents and change the ones you created or are assigned to. Goals, plans, and the rest stay with ${owner}. I can add this as a task instead, or you can make the change yourself in BuildOS if you can edit there.`
					: `${project ?? 'That project'} belongs to ${owner}. There I can add tasks and documents and change the ones you created or are assigned to, but not this one. You can change it yourself in BuildOS, or ask ${owner} to assign it to you.`;
			break;
		case 'daily_limit':
			sayToUser = `I've made ${GUEST_AGENT_DAILY_WRITE_LIMIT} changes in ${projectOrThat} today, so my changes there are paused until tomorrow. ${Owner} was told. I can still read it.`;
			break;
	}

	const next: AccessNeeded['next'] =
		who === 'owner' && input.need && input.projectId
			? {
					tool: 'request_project_access',
					args: { project_id: input.projectId, need: input.need },
					ask_your_person_first: true
				}
			: who === 'you'
				? { open_url: null }
				: null;

	return {
		wall: input.wall,
		who_can_fix: who,
		project_id: input.projectId,
		...(input.projectName?.trim() ? { project_name: input.projectName.trim() } : {}),
		...(ownerName && who !== 'you' ? { owner_name: ownerName } : {}),
		...(who === 'owner' && input.need && input.projectId ? { need: input.need } : {}),
		next,
		...(link ? { link } : {}),
		say_to_user: sayToUser
	};
}

export type ProjectAccessIntent = 'read' | 'write';

export type ProjectAccessDiagnosis =
	| { status: 'not_found' }
	| {
			status: 'ready';
			project_id: string;
			project_name: string;
			can_write: boolean;
			/** In someone else's project, writes stay inside the guest lane. */
			guest_lane: boolean;
	  }
	| { status: 'blocked'; project_id: string; access_needed: AccessNeeded };

/**
 * Where this connection stands on one project, without trying an op. Used on the
 * refusal path and by check_project_access. Never reveals a project the person can't
 * see (not_found), and never names one this connection can't read.
 */
export async function diagnoseProjectAccess(params: {
	admin: any;
	userId: string;
	oauthGrantId?: string;
	scope: AgentCallScope;
	projectId: string;
	intent: ProjectAccessIntent;
	/** The write that was refused, when known. Writes agents never make in someone
	 *  else's project get the rule (wall 6) instead of a wall that couldn't help. */
	op?: string;
	/** Already loaded by the caller (saves two reads). */
	actorId?: string;
	projects?: OntologyProjectSummary[];
}): Promise<ProjectAccessDiagnosis> {
	const actorId = params.actorId ?? (await ensureActorId(params.admin, params.userId));
	const projects = params.projects ?? (await fetchProjectSummaries(params.admin, actorId));
	const project = projects.find((candidate) => candidate.id === params.projectId);
	if (!project) return { status: 'not_found' };

	const readable =
		!Array.isArray(params.scope.project_ids) ||
		params.scope.project_ids.includes(params.projectId);
	const personCanEdit = project.access_level === 'write' || project.access_level === 'admin';
	const member = project.is_shared
		? ((await loadMemberAgentAccess(params.admin, actorId, [project.id])).get(project.id) ??
			null)
		: null;
	const ownerName = project.is_shared
		? await loadProjectOwnerName(params.admin, project.owner_actor_id)
		: null;
	const blocked = (accessNeeded: AccessNeeded): ProjectAccessDiagnosis => ({
		status: 'blocked',
		project_id: project.id,
		access_needed: accessNeeded
	});

	if (!readable) {
		if (project.is_shared && (member?.effective ?? 'off') === 'off') {
			return blocked(
				buildAccessNeeded({
					wall: ACCESS_WALL.ownerTurnedAgentsOff,
					projectId: project.id,
					ownerName,
					need:
						params.intent === 'write'
							? personCanEdit
								? 'agents_write'
								: 'edit'
							: 'agents_read'
				})
			);
		}
		return blocked(
			buildAccessNeeded({ wall: ACCESS_WALL.projectNotGranted, projectId: project.id })
		);
	}

	if (params.intent === 'write' && project.is_shared && params.op && !isGuestLaneOp(params.op)) {
		return blocked(
			buildAccessNeeded({
				wall: ACCESS_WALL.outsideGuestLane,
				projectId: project.id,
				projectName: project.name,
				ownerName,
				ownerItems: true
			})
		);
	}

	const canWrite = Array.isArray(params.scope.write_project_ids)
		? params.scope.write_project_ids.includes(project.id)
		: personCanEdit && params.scope.mode === 'read_write';
	if (params.intent === 'read' || canWrite) {
		return {
			status: 'ready',
			project_id: project.id,
			project_name: project.name,
			can_write: canWrite,
			guest_lane: project.is_shared
		};
	}

	if (project.is_shared && !personCanEdit) {
		return blocked(
			buildAccessNeeded({
				wall: ACCESS_WALL.viewerOnly,
				projectId: project.id,
				projectName: project.name,
				ownerName,
				need: 'edit'
			})
		);
	}
	if (project.is_shared && member?.effective !== 'write') {
		return blocked(
			buildAccessNeeded({
				wall: ACCESS_WALL.ownerAllowsReadOnly,
				projectId: project.id,
				projectName: project.name,
				ownerName,
				need: 'agents_write'
			})
		);
	}
	return blocked(
		buildAccessNeeded({
			wall: ACCESS_WALL.connectionReadOnly,
			projectId: project.id,
			projectName: project.name,
			connectionReadOnly: params.scope.mode !== 'read_write',
			viaOAuth: Boolean(params.oauthGrantId)
		})
	);
}

// Read at call time, not module load, so tests that mock the access module still load this one.
function isDiagnosedReason(reason: string): boolean {
	return (
		reason === PROJECT_NOT_GRANTED_TO_CONNECTOR ||
		reason === AGENTS_OFF_BY_OWNER ||
		reason === WRITE_NOT_GRANTED ||
		reason === VIEWER_CANNOT_WRITE ||
		reason === GUEST_LANE_REASON.agentWriteOff
	);
}

/**
 * Adds `details.access_needed` to a refusal that names a project. Everything else, and
 * any refusal it can't explain, passes through unchanged.
 */
export async function explainAccessWall(
	context: {
		admin: any;
		userId: string;
		oauthGrantId?: string;
		scope: AgentCallScope;
	},
	op: string,
	error: ExternalToolGatewayError
): Promise<ExternalToolGatewayError> {
	if (error.code !== 'FORBIDDEN') return error;
	const details = error.details ?? {};
	if (details.access_needed) return error;
	const reason = typeof details.reason === 'string' ? details.reason : '';
	const projectId = details.project_id;
	if (!reason || typeof projectId !== 'string' || !isValidUUID(projectId)) return error;

	try {
		let accessNeeded: AccessNeeded | null = null;
		if (isDiagnosedReason(reason)) {
			const diagnosis = await diagnoseProjectAccess({
				...context,
				projectId,
				op,
				intent:
					reason === PROJECT_NOT_GRANTED_TO_CONNECTOR || reason === AGENTS_OFF_BY_OWNER
						? isWriteOp(op)
							? 'write'
							: 'read'
						: 'write'
			});
			if (diagnosis.status === 'blocked') accessNeeded = diagnosis.access_needed;
		} else if (
			reason === GUEST_LANE_REASON.outsideLane ||
			reason === GUEST_LANE_REASON.dailyLimit
		) {
			const actorId = await ensureActorId(context.admin, context.userId);
			const project = (await fetchProjectSummaries(context.admin, actorId)).find(
				(candidate) => candidate.id === projectId
			);
			if (project) {
				accessNeeded = buildAccessNeeded({
					wall:
						reason === GUEST_LANE_REASON.dailyLimit
							? ACCESS_WALL.dailyLimit
							: ACCESS_WALL.outsideGuestLane,
					projectId,
					projectName: project.name,
					ownerName: await loadProjectOwnerName(context.admin, project.owner_actor_id),
					archive: details.action === 'archive'
				});
			}
		}
		if (!accessNeeded) return error;
		return new ExternalToolGatewayError(error.code, error.message, {
			...details,
			access_needed: accessNeeded
		});
	} catch (diagnoseError) {
		console.warn('[AccessWall] Could not explain refusal:', diagnoseError);
		return error;
	}
}
