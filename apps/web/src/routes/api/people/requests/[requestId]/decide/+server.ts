// apps/web/src/routes/api/people/requests/[requestId]/decide/+server.ts
//
// POST { decision: 'approve' | 'decline' | 'block', grants?: [{ project_id, role, agent_access }] }
//
// Only the person who was asked can decide, from their signed-in session: the RPC
// runs on the user-scoped client and checks auth.uid() itself, plus owner-only
// projects and "agents never write where their person can't edit".
//
// After an approval (all best effort, never undoing the share):
//  - a request sent by an agent: that agent's connection gets the shared projects
//    whose agent setting isn't Off, so it can open them on its next call;
//  - the requester is subscribed to project activity, like an accepted invite;
//  - the requester gets an email saying what was shared, with a link to open it.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
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

	let grants: Grant[] = [];
	if (decision === 'approve') {
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

	const applied = (Array.isArray(result.projects) ? result.projects : []).map(asRecord);
	const requesterUserId =
		typeof result.requester_user_id === 'string' ? result.requester_user_id : null;
	const viaCallerId = typeof result.via_caller_id === 'string' ? result.via_caller_id : null;
	const agentProjectIds = applied
		.filter((grant) => grant.agent_access !== 'off' && typeof grant.project_id === 'string')
		.map((grant) => String(grant.project_id));

	let agentGrant: AgentGrantOutcome = 'none';
	if (requesterUserId && viaCallerId && agentProjectIds.length > 0) {
		try {
			await new CallerProvisioningService(
				undefined,
				getSecurityEventLogOptions(platform)
			).grantProjectsForUser(requesterUserId, viaCallerId, agentProjectIds);
			agentGrant = 'granted';
		} catch (grantError) {
			agentGrant = 'failed';
			console.error('[People API] Approved, but the requester agent grant failed:', {
				requestId,
				error: grantError instanceof Error ? grantError.message : grantError
			});
		}
	}

	if (requesterUserId) {
		try {
			// Existing subscriptions (including a deliberate opt-out) are left as they are.
			const { error: subscriptionError } = await (createAdminSupabaseClient() as any)
				.from('notification_subscriptions')
				.upsert(
					{
						user_id: requesterUserId,
						event_type: 'project.activity.batched',
						is_active: true,
						admin_only: false,
						created_by: user.id,
						updated_at: new Date().toISOString()
					},
					{ onConflict: 'user_id,event_type', ignoreDuplicates: true }
				);
			if (subscriptionError) throw subscriptionError;
		} catch (subscriptionError) {
			console.warn('[People API] Could not subscribe requester to project activity:', {
				requestId,
				error:
					subscriptionError instanceof Error
						? subscriptionError.message
						: subscriptionError
			});
		}
	}

	const email = await sendPeopleRequestApprovedEmail(requestId);

	return ApiResponse.success({
		status,
		projects: applied,
		agent_grant: agentGrant,
		email
	});
};
