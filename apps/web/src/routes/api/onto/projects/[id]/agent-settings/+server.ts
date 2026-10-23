// apps/web/src/routes/api/onto/projects/[id]/agent-settings/+server.ts
//
// The owner's standing approval for members' agents (tasker 140):
//   GET   { editor_agents_write, external_agent_access }  any member can read it
//         (external_agent_access is the project's Restricted setting, shown in Share)
//   PATCH { editor_agents_write: boolean }  the owner turns it on or off
// While it is on, every editor's agents can make changes unless the owner turned that
// person's agents Off. The RPC checks the owner itself; this route only shapes input.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { peopleRpcErrorResponse } from '$lib/server/people/people-api';
import {
	getSecurityEventLogOptions,
	getSecurityRequestContext,
	logSecurityEvent
} from '$lib/server/security-event-logger';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!params.id || !isValidUUID(params.id)) return ApiResponse.badRequest('Invalid project ID');

	const [settings, project] = await Promise.all([
		(locals.supabase as any)
			.from('project_agent_settings')
			.select('editor_agents_write')
			.eq('project_id', params.id)
			.maybeSingle(),
		locals.supabase
			.from('onto_projects')
			.select('external_agent_access')
			.eq('id', params.id)
			.maybeSingle()
	]);
	if (settings.error) {
		return ApiResponse.internalError(settings.error, 'Could not load agent settings');
	}
	return ApiResponse.success({
		editor_agents_write: settings.data?.editor_agents_write === true,
		// 'restricted': only connections the owner picks reach this project (null if unreadable).
		external_agent_access:
			project.data?.external_agent_access === 'restricted'
				? 'restricted'
				: project.data
					? 'standard'
					: null
	});
};

export const PATCH: RequestHandler = async ({ params, locals, request, url, platform }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!params.id || !isValidUUID(params.id)) return ApiResponse.badRequest('Invalid project ID');
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) return ApiResponse.forbidden('Invalid origin');

	const body = await request.json().catch(() => null);
	const enabled =
		body && typeof body === 'object' && 'editor_agents_write' in body
			? (body as { editor_agents_write: unknown }).editor_agents_write
			: null;
	if (typeof enabled !== 'boolean') {
		return ApiResponse.badRequest('editor_agents_write must be true or false');
	}

	const { error } = await (locals.supabase as any).rpc('set_project_editor_agents_write', {
		p_project_id: params.id,
		p_enabled: enabled
	});
	if (error) return peopleRpcErrorResponse(error, 'Could not save this setting');

	await logSecurityEvent(
		{
			eventType: 'project.member_agents.standing_approval_updated',
			category: 'agent',
			outcome: 'success',
			severity: enabled ? 'medium' : 'low',
			actorType: 'user',
			actorUserId: user.id,
			targetType: 'onto_project',
			targetId: params.id,
			...getSecurityRequestContext(request),
			metadata: { editorAgentsWrite: enabled }
		},
		getSecurityEventLogOptions(platform)
	);

	return ApiResponse.success({ editor_agents_write: enabled });
};
