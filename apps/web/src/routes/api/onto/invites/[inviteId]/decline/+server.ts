// apps/web/src/routes/api/onto/invites/[inviteId]/decline/+server.ts
/**
 * Decline a project invite by invite id.
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
		const { data, error } = await supabase.rpc('decline_project_invite', {
			p_invite_id: inviteId
		});

		if (error) {
			await logOntologyApiError({
				supabase,
				error,
				endpoint: `/api/onto/invites/${inviteId}/decline`,
				method: 'POST',
				userId: user.id,
				entityType: 'project_invite',
				operation: 'project_invite_decline'
			});
			return ApiResponse.error(error.message, 400);
		}

		const result = Array.isArray(data) ? data[0] : data;
		return ApiResponse.success({
			inviteId: result?.invite_id ?? inviteId,
			status: result?.status ?? 'declined'
		});
	} catch (error) {
		console.error('[Invite Decline API] Failed to decline invite:', error);
		return ApiResponse.internalError(error, 'Failed to decline invite');
	}
};
