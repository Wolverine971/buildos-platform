// apps/web/src/routes/api/onto/invites/token/[token]/accept/+server.ts
/**
 * Accept a project invite by token.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { logOntologyApiError } from '../../../../shared/error-logging';
import { createHash } from 'crypto';

export const POST: RequestHandler = async ({ params, locals }) => {
	const supabase = locals.supabase;
	let userId: string | undefined;
	let projectId: string | undefined;
	let tokenHashPrefix: string | undefined;
	try {
		const { user } = await locals.safeGetSession();
		userId = user?.id;
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

		const actorId = await ensureActorId(supabase, user.id);
		const tokenHash = createHash('sha256').update(token).digest('hex');
		tokenHashPrefix = tokenHash.slice(0, 8);

		const { data, error } = await supabase.rpc('accept_project_invite', {
			p_token_hash: tokenHash,
			p_actor_id: actorId,
			p_user_email: user.email
		});

		if (error) {
			await logOntologyApiError({
				supabase,
				error,
				endpoint: '/api/onto/invites/token/:token/accept',
				method: 'POST',
				userId: user.id,
				entityType: 'project_invite',
				operation: 'project_invite_accept',
				metadata: {
					actorId,
					tokenHashPrefix: tokenHash.slice(0, 8)
				}
			});
			return ApiResponse.error(error.message, 400);
		}

		const result = Array.isArray(data) ? data[0] : data;
		projectId = result?.project_id;
		return ApiResponse.success({
			projectId: result?.project_id,
			role_key: result?.role_key,
			access: result?.access
		});
	} catch (error) {
		console.error('[Invite Accept API] Failed to accept invite:', error);
		await logOntologyApiError({
			supabase,
			error,
			endpoint: '/api/onto/invites/token/:token/accept',
			method: 'POST',
			userId,
			projectId,
			entityType: 'project_invite',
			operation: 'project_invite_accept',
			metadata: tokenHashPrefix ? { tokenHashPrefix } : undefined
		});
		return ApiResponse.internalError(error, 'Failed to accept invite');
	}
};
