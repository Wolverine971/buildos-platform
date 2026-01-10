// apps/web/src/routes/api/onto/projects/[id]/invites/[inviteId]/revoke/+server.ts
/**
 * Revoke a pending project invite (admin only).
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { logOntologyApiError } from '../../../../../shared/error-logging';

export const POST: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const projectId = params.id;
		const inviteId = params.inviteId;
		if (!projectId || !inviteId) {
			return ApiResponse.badRequest('Project ID and invite ID required');
		}

		const supabase = locals.supabase;
		const actorId = await ensureActorId(supabase, user.id);

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: projectId,
				p_required_access: 'admin'
			}
		);

		if (accessError) {
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/projects/${projectId}/invites/${inviteId}/revoke`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_invites_access'
			});
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('Access denied');
		}

		const { data: invite, error: inviteError } = await supabase
			.from('onto_project_invites')
			.select('id, invitee_email, status')
			.eq('id', inviteId)
			.eq('project_id', projectId)
			.maybeSingle();

		if (inviteError) {
			await logOntologyApiError({
				supabase,
				error: inviteError,
				endpoint: `/api/onto/projects/${projectId}/invites/${inviteId}/revoke`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_invites_fetch',
				tableName: 'onto_project_invites'
			});
			return ApiResponse.databaseError(inviteError);
		}

		if (!invite) {
			return ApiResponse.notFound('Invite');
		}

		if (invite.status !== 'pending') {
			return ApiResponse.badRequest('Only pending invites can be revoked');
		}

		const { error: updateError } = await supabase
			.from('onto_project_invites')
			.update({ status: 'revoked' })
			.eq('id', inviteId);

		if (updateError) {
			await logOntologyApiError({
				supabase,
				error: updateError,
				endpoint: `/api/onto/projects/${projectId}/invites/${inviteId}/revoke`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_invites_revoke',
				tableName: 'onto_project_invites'
			});
			return ApiResponse.databaseError(updateError);
		}

		await supabase.from('onto_project_logs').insert({
			project_id: projectId,
			entity_type: 'project',
			entity_id: projectId,
			action: 'updated',
			changed_by: user.id,
			changed_by_actor_id: actorId,
			change_source: 'api',
			after_data: {
				event: 'invite_revoked',
				invitee_email: invite.invitee_email
			}
		});

		return ApiResponse.success({ inviteId });
	} catch (error) {
		console.error('[Project Invites API] Failed to revoke invite:', error);
		return ApiResponse.internalError(error, 'Failed to revoke invite');
	}
};
