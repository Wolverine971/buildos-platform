// apps/web/src/routes/api/onto/invites/[token]/accept/+server.ts
/**
 * Accept a project invite by token.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { createHash } from 'crypto';

export const POST: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const token = params.token?.trim();
		if (!token) {
			return ApiResponse.badRequest('Invite token required');
		}

		if (!user.email) {
			return ApiResponse.badRequest('User email required to accept invite');
		}

		const supabase = locals.supabase;
		const actorId = await ensureActorId(supabase, user.id);
		const tokenHash = createHash('sha256').update(token).digest('hex');

		const { data, error } = await supabase.rpc('accept_project_invite', {
			p_token_hash: tokenHash,
			p_actor_id: actorId,
			p_user_email: user.email
		});

		if (error) {
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
