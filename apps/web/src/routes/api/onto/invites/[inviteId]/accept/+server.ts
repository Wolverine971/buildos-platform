// apps/web/src/routes/api/onto/invites/[inviteId]/accept/+server.ts
/**
 * Accept a project invite by invite id.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../shared/error-logging';

export const POST: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const inviteId = params.inviteId?.trim();
		if (!inviteId) {
			return ApiResponse.badRequest('Invite ID required');
		}

		const supabase = locals.supabase;
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
		return ApiResponse.success({
			projectId: result?.project_id,
			role_key: result?.role_key,
			access: result?.access
		});
	} catch (error) {
		console.error('[Invite Accept API] Failed to accept invite:', error);
		return ApiResponse.internalError(error, 'Failed to accept invite');
	}
};
