// apps/web/src/routes/api/people/requests/[requestId]/decide/+server.ts
//
// POST { decision: 'approve' | 'decline' | 'block', grants?: [{ project_id, role, agent_access }] }
// An upgrade request (a member asked for more in projects they're in, tasker 140) is
// approved with { decision: 'approve', items: [{ project_id, need, allow }] }: every item
// the owner saw, unchecked ones with allow: false. If the request changed since the page
// loaded, the RPC refuses (409) and the owner looks again. Optionally
// editor_agents_write_project_ids: the owner's standing approval ("editors' agents can
// write here") for those projects.
//
// Only the person who was asked can decide, from their signed-in session: the RPC
// runs on the user-scoped client and checks auth.uid() itself, plus owner-only
// projects and "agents never write where their person can't edit".
//
// After an approval (all best effort, never undoing the share):
//  - the connections that asked get the shared projects whose agent setting isn't Off,
//    so they can open them on their next call: per project for upgrades (only the
//    connections that asked for that project), the sending agent for access requests;
//  - the requester gets an email saying what was shared, with a link to open it.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { CallerProvisioningService } from '$lib/server/agent-call/caller-provisioning.service';
import { getSecurityEventLogOptions } from '$lib/server/security-event-logger';
import { asRecord, peopleRpcErrorResponse } from '$lib/server/people/people-api';
import { sendPeopleRequestApprovedEmail } from '$lib/server/people/people-emails';
import {
	agentAccessAllowed,
	isAgentAccess,
	isPersonRole,
	type AgentAccess,
	type PersonRole
} from '$lib/components/people/people-copy';

const DECISIONS = new Set(['approve', 'decline', 'block']);
const MAX_GRANTS = 50;
const MAX_UPGRADE_ITEMS = 10;
const UPGRADE_NEEDS = new Set(['agents_read', 'agents_write', 'edit']);

type SeenUpgradeItem = { project_id: string; need: string; allow: boolean };

type Grant = { project_id: string; role: PersonRole; agent_access: AgentAccess };
type AgentGrantOutcome = 'granted' | 'failed' | 'none';

function parseGrants(
	value: unknown
): { ok: true; grants: Grant[] } | { ok: false; message: string } {
	if (!Array.isArray(value) || value.length === 0) {
		return { ok: false, message: 'Choose at least one project to share' };
	}
	if (value.length > MAX_GRANTS) {
		return { ok: false, message: `Share at most ${MAX_GRANTS} projects at a time` };
	}

	const grants: Grant[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		const grant = asRecord(item);
		const projectId = grant.project_id;
		if (typeof projectId !== 'string' || !isValidUUID(projectId)) {
			return { ok: false, message: 'Unknown project' };
		}
		const role = grant.role ?? 'viewer';
		const agentAccess = grant.agent_access ?? 'read';
		if (!isPersonRole(role)) return { ok: false, message: 'Role must be viewer or editor' };
		if (!isAgentAccess(agentAccess)) {
			return { ok: false, message: 'Agent access must be off, read, or write' };
		}
		if (!agentAccessAllowed(role, agentAccess)) {
			return { ok: false, message: 'Agents can only write where their person can edit' };
		}
		if (seen.has(projectId)) continue;
		seen.add(projectId);
		grants.push({ project_id: projectId, role, agent_access: agentAccess });
	}
	return { ok: true, grants };
}

export const POST: RequestHandler = async ({ params, request, locals, url, platform }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	// Sharing is decided only from a BuildOS page, never a cross-site request.
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) return ApiResponse.forbidden('Invalid origin');

	const requestId = params.requestId;
	if (!requestId || !isValidUUID(requestId)) return ApiResponse.badRequest('Invalid request ID');

	const body = asRecord(await request.json().catch(() => null));
	const decision = body.decision;
	if (typeof decision !== 'string' || !DECISIONS.has(decision)) {
		return ApiResponse.badRequest('Decision must be approve, decline, or block');
	}

	let grants: Array<Grant | SeenUpgradeItem> = [];
	const seenItems = readSeenUpgradeItems(body.items);
	if (seenItems === 'invalid') return ApiResponse.badRequest('Unknown project');
	const standingProjectIds = readProjectIds(body.editor_agents_write_project_ids);
	if (standingProjectIds === 'invalid') return ApiResponse.badRequest('Unknown project');
	if (decision === 'approve' && seenItems) {
		// Upgrade: exactly what the owner saw; the RPC refuses if the request changed.
		grants = seenItems;
	} else if (decision === 'approve' && body.project_ids !== undefined) {
		// An upgrade card from a page loaded before this change.
		return ApiResponse.error('This page is out of date. Reload and try again.', 409, 'CHANGED');
	} else if (decision === 'approve') {
		const parsed = parseGrants(body.grants);
		if (!parsed.ok) return ApiResponse.badRequest(parsed.message);
		grants = parsed.grants;
	}

	const { data, error } = await locals.supabase.rpc('decide_people_request', {
		p_request_id: requestId,
		p_decision: decision,
		p_grants: grants
	});
	if (error) return peopleRpcErrorResponse(error, 'Could not save your decision');

	const result = asRecord(data);
	const status = typeof result.status === 'string' ? result.status : decision;
	if (status !== 'approved') {
		return ApiResponse.success({ status });
	}

	const kind = typeof result.kind === 'string' ? result.kind : null;
	const applied = (Array.isArray(result.projects) ? result.projects : []).map(asRecord);
	const requesterUserId =
		typeof result.requester_user_id === 'string' ? result.requester_user_id : null;
	const viaCallerId = typeof result.via_caller_id === 'string' ? result.via_caller_id : null;

	// Which of the requester's connections get which projects. An upgrade names them per
	// project; an access request names the one agent that sent it.
	const connectionProjects = new Map<string, string[]>();
	for (const grant of applied) {
		if (grant.agent_access === 'off' || typeof grant.project_id !== 'string') continue;
		const callerIds =
			kind === 'upgrade'
				? (Array.isArray(grant.caller_ids) ? grant.caller_ids : []).filter(
						(id): id is string => typeof id === 'string' && isValidUUID(id)
					)
				: viaCallerId
					? [viaCallerId]
					: [];
		for (const callerId of new Set(callerIds)) {
			connectionProjects.set(callerId, [
				...(connectionProjects.get(callerId) ?? []),
				grant.project_id
			]);
		}
	}

	let agentGrant: AgentGrantOutcome = 'none';
	if (requesterUserId && connectionProjects.size > 0) {
		const provisioning = new CallerProvisioningService(
			undefined,
			getSecurityEventLogOptions(platform)
		);
		agentGrant = 'granted';
		for (const [callerId, projectIds] of connectionProjects) {
			try {
				await provisioning.grantProjectsForUser(requesterUserId, callerId, projectIds);
			} catch (grantError) {
				agentGrant = 'failed';
				console.error('[People API] Approved, but the requester agent grant failed:', {
					requestId,
					callerId,
					error: grantError instanceof Error ? grantError.message : grantError
				});
			}
		}
	}

	// Standing approval, chosen on the same card. The RPC checks the owner itself.
	let standing: 'none' | 'saved' | 'failed' = 'none';
	if (kind === 'upgrade' && standingProjectIds && standingProjectIds.length > 0) {
		standing = 'saved';
		for (const projectId of standingProjectIds) {
			const { error: standingError } = await locals.supabase.rpc(
				'set_project_editor_agents_write',
				{ p_project_id: projectId, p_enabled: true }
			);
			if (standingError) {
				standing = 'failed';
				console.warn('[People API] Approved, but the standing approval failed:', {
					requestId,
					projectId,
					error: standingError.message
				});
			}
		}
	}

	const email = await sendPeopleRequestApprovedEmail(requestId);

	return ApiResponse.success({
		status,
		kind,
		projects: applied.map(({ caller_ids: _callerIds, ...project }) => project),
		agent_grant: agentGrant,
		standing_approval: standing,
		email
	});
};

/** Every upgrade item the owner saw (max 10): null when absent, 'invalid' when malformed. */
function readSeenUpgradeItems(value: unknown): SeenUpgradeItem[] | null | 'invalid' {
	if (value === undefined || value === null) return null;
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_UPGRADE_ITEMS) {
		return 'invalid';
	}
	const items: SeenUpgradeItem[] = [];
	for (const raw of value) {
		const item = asRecord(raw);
		if (typeof item.project_id !== 'string' || !isValidUUID(item.project_id)) return 'invalid';
		if (typeof item.need !== 'string' || !UPGRADE_NEEDS.has(item.need)) return 'invalid';
		if (item.allow !== undefined && typeof item.allow !== 'boolean') return 'invalid';
		items.push({ project_id: item.project_id, need: item.need, allow: item.allow !== false });
	}
	return items;
}

/** Optional list of project UUIDs (max 50): null when absent, 'invalid' when malformed. */
function readProjectIds(value: unknown): string[] | null | 'invalid' {
	if (value === undefined || value === null) return null;
	if (!Array.isArray(value) || value.length > MAX_GRANTS) return 'invalid';
	const ids = [...new Set(value)];
	return ids.every((id) => typeof id === 'string' && isValidUUID(id))
		? (ids as string[])
		: 'invalid';
}
