// apps/web/src/routes/api/onto/invites/pending/+server.ts
/**
 * Pending invite list for the authenticated user.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../shared/error-logging';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const supabase = locals.supabase;
		const { data, error } = await supabase.rpc('list_pending_project_invites');

		if (error) {
			await logOntologyApiError({
				supabase,
				error,
				endpoint: '/api/onto/invites/pending',
				method: 'GET',
				userId: user.id,
				entityType: 'project_invite',
				operation: 'project_invites_pending_list'
			});
			return ApiResponse.internalError(error, 'Failed to load invites');
		}

		return ApiResponse.success({ invites: data ?? [] });
	} catch (error) {
		console.error('[Invite Pending API] Failed to load invites:', error);
		return ApiResponse.internalError(error, 'Failed to load invites');
	}
};
