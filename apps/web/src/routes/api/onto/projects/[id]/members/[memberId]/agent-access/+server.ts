// apps/web/src/routes/api/onto/projects/[id]/members/[memberId]/agent-access/+server.ts
//
// PATCH { agent_access: 'off' | 'read' | 'write' }: the owner sets what one
// member's agents may do in this project. Off is the pause. Write needs a member
// who can edit (set_project_member_agent_access enforces owner-only and that rule).

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { logOntologyApiError } from '../../../../../shared/error-logging';
import { asRecord, peopleRpcErrorResponse } from '$lib/server/people/people-api';
import { isAgentAccess } from '$lib/components/people/people-copy';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const projectId = params.id;
	const memberId = params.memberId;
	if (!projectId || !isValidUUID(projectId)) return ApiResponse.badRequest('Invalid project ID');
	if (!memberId || !isValidUUID(memberId)) return ApiResponse.badRequest('Invalid member ID');

	const body = asRecord(await request.json().catch(() => null));
	const agentAccess = body.agent_access;
	if (!isAgentAccess(agentAccess)) {
		return ApiResponse.badRequest('Agent access must be off, read, or write');
	}

	const supabase = locals.supabase;
	const { data, error } = await supabase.rpc('set_project_member_agent_access', {
		p_project_id: projectId,
		p_member_id: memberId,
		p_agent_access: agentAccess
	});
	if (error) {
		if (error.code !== '22023' && error.code !== '42501' && error.code !== 'P0002') {
			void logOntologyApiError({
				supabase,
				error,
				endpoint: `/api/onto/projects/${projectId}/members/${memberId}/agent-access`,
				method: 'PATCH',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_member_agent_access_update'
			});
		}
		return peopleRpcErrorResponse(error, 'Could not update their agents');
	}

	// Who changed what an agent may do is part of the project's record.
	try {
		const actorId = await ensureActorId(supabase, user.id);
		const { error: logError } = await supabase.from('onto_project_logs').insert({
			project_id: projectId,
			entity_type: 'project',
			entity_id: projectId,
			action: 'updated',
			changed_by: user.id,
			changed_by_actor_id: actorId,
			change_source: 'api',
			after_data: {
				event: 'member_agent_access_updated',
				member_id: memberId,
				agent_access: agentAccess
			}
		});
		if (logError) throw logError;
	} catch (logError) {
		console.warn('[Project Members API] Failed to log agent access change:', logError);
	}

	const result = asRecord(data);
	return ApiResponse.success({
		member_id: typeof result.member_id === 'string' ? result.member_id : memberId,
		agent_access: isAgentAccess(result.agent_access) ? result.agent_access : agentAccess
	});
};
