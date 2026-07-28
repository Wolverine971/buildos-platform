// apps/web/src/routes/api/onto/projects/[id]/external-agent-access/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	getSecurityEventLogOptions,
	getSecurityRequestContext,
	logSecurityEvent
} from '$lib/server/security-event-logger';

type ExternalAgentAccess = 'standard' | 'restricted';

export const PATCH: RequestHandler = async ({ params, locals, request, platform }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!params.id) return ApiResponse.badRequest('Project ID required');

	const body = await request.json().catch(() => null);
	const externalAgentAccess =
		body && typeof body === 'object' && 'external_agent_access' in body
			? body.external_agent_access
			: null;
	if (externalAgentAccess !== 'standard' && externalAgentAccess !== 'restricted') {
		return ApiResponse.badRequest('external_agent_access must be standard or restricted');
	}

	const { data: hasAdminAccess, error: accessError } = await locals.supabase.rpc(
		'current_actor_has_project_member_access',
		{ p_project_id: params.id, p_required_access: 'admin' }
	);
	if (accessError)
		return ApiResponse.internalError(accessError, 'Failed to check project access');
	if (!hasAdminAccess) {
		return ApiResponse.forbidden('Project admin access is required');
	}

	const { data: project, error } = await locals.supabase
		.from('onto_projects')
		.update({ external_agent_access: externalAgentAccess as ExternalAgentAccess })
		.eq('id', params.id)
		.select('id, external_agent_access')
		.single();
	if (error || !project) {
		return ApiResponse.internalError(error, 'Failed to update connected AI access');
	}

	await logSecurityEvent(
		{
			eventType: 'external_agent.project_access.updated',
			category: 'agent',
			outcome: 'success',
			severity: externalAgentAccess === 'restricted' ? 'medium' : 'low',
			actorType: 'user',
			actorUserId: user.id,
			targetType: 'onto_project',
			targetId: params.id,
			...getSecurityRequestContext(request),
			metadata: { externalAgentAccess }
		},
		getSecurityEventLogOptions(platform)
	);

	return ApiResponse.success({ project });
};
