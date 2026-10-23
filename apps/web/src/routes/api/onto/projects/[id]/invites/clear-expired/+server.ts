// apps/web/src/routes/api/onto/projects/[id]/invites/clear-expired/+server.ts
/**
 * POST: mark every pending invite past its expiry date as expired (project owner only).
 * Rows stay 'pending' when nobody answers, so the Share window and People & agents
 * kept showing months-old invites as live. Returns { cleared }.
 * Expired invites can still be resent from their own row before this runs.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { logOntologyApiError } from '../../../../shared/error-logging';

export const POST: RequestHandler = async ({ params, locals, request, url }) => {
	const supabase = locals.supabase;
	const projectId = params.id;
	let userId: string | undefined;
	try {
		const { user } = await locals.safeGetSession();
		userId = user?.id;
		if (!user) return ApiResponse.unauthorized('Authentication required');
		if (!projectId || !isValidUUID(projectId)) {
			return ApiResponse.badRequest('Invalid project ID');
		}
		const origin = request.headers.get('origin');
		if (origin && origin !== url.origin) return ApiResponse.forbidden('Invalid origin');

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_member_access',
			{ p_project_id: projectId, p_required_access: 'admin' }
		);
		if (accessError) {
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}
		if (!hasAccess) {
			return ApiResponse.forbidden('Only the project owner can clear invites');
		}

		const { data: cleared, error: updateError } = await supabase
			.from('onto_project_invites')
			.update({ status: 'expired' })
			.eq('project_id', projectId)
			.eq('status', 'pending')
			.lt('expires_at', new Date().toISOString())
			.select('id');
		if (updateError) {
			await logOntologyApiError({
				supabase,
				error: updateError,
				endpoint: `/api/onto/projects/${projectId}/invites/clear-expired`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_invites_clear_expired',
				tableName: 'onto_project_invites'
			});
			return ApiResponse.databaseError(updateError);
		}

		const clearedCount = (cleared ?? []).length;
		if (clearedCount > 0) {
			const actorId = await ensureActorId(supabase, user.id);
			const { error: logError } = await supabase.from('onto_project_logs').insert({
				project_id: projectId,
				entity_type: 'project',
				entity_id: projectId,
				action: 'updated',
				changed_by: user.id,
				changed_by_actor_id: actorId,
				change_source: 'api',
				after_data: { event: 'invites_cleared_expired', count: clearedCount }
			});
			if (logError) {
				console.warn('[Project Invites API] Failed to log cleared invites:', logError);
			}
		}

		return ApiResponse.success({ cleared: clearedCount });
	} catch (error) {
		console.error('[Project Invites API] Failed to clear expired invites:', error);
		await logOntologyApiError({
			supabase,
			error,
			endpoint: `/api/onto/projects/${projectId}/invites/clear-expired`,
			method: 'POST',
			userId,
			projectId,
			entityType: 'project',
			operation: 'project_invites_clear_expired'
		});
		return ApiResponse.internalError(error, 'Failed to clear expired invites');
	}
};
