// apps/web/src/routes/api/onto/invites/[inviteId]/accept/+server.ts
/**
 * Accept a project invite by invite id.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../shared/error-logging';

export const POST: RequestHandler = async ({ params, locals }) => {
	const supabase = locals.supabase;
	let userId: string | undefined;
	let projectId: string | undefined;
	const inviteId = params.inviteId?.trim();

	try {
		const { user } = await locals.safeGetSession();
		userId = user?.id;
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		if (!inviteId) {
			return ApiResponse.badRequest('Invite ID required');
		}

		const { data, error } = await supabase.rpc('accept_project_invite_by_id', {
			p_invite_id: inviteId
		});

		if (error) {
			await logOntologyApiError({
				supabase,
				error,
				endpoint: `/api/onto/invites/${inviteId}/accept`,
				method: 'POST',
				userId: user.id,
				entityType: 'project_invite',
				operation: 'project_invite_accept'
			});
			return ApiResponse.error(error.message, 400);
		}

		const result = Array.isArray(data) ? data[0] : data;
		projectId = result?.project_id as string | undefined;

		// Settlement, activity preferences and owner delivery are queued atomically by the RPC.

		return ApiResponse.success({
			projectId: result?.project_id,
			role_key: result?.role_key,
			access: result?.access,
			agent_access: result?.agent_access,
			project_name: result?.project_name,
			status: result?.status
		});
	} catch (error) {
		console.error('[Invite Accept API] Failed to accept invite:', error);
		await logOntologyApiError({
			supabase,
			error,
			endpoint: inviteId
				? `/api/onto/invites/${inviteId}/accept`
				: '/api/onto/invites/:inviteId/accept',
			method: 'POST',
			userId,
			projectId,
			entityType: 'project_invite',
			entityId: inviteId,
			operation: 'project_invite_accept'
		});
		return ApiResponse.internalError(error, 'Failed to accept invite');
	}
};
