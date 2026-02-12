// apps/web/src/routes/api/onto/projects/[id]/invites/[inviteId]/revoke/+server.ts
/**
 * Revoke a pending project invite (collaborators with write access).
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { logOntologyApiError } from '../../../../../shared/error-logging';

export const POST: RequestHandler = async ({ params, locals }) => {
	const supabase = locals.supabase;
	let userId: string | undefined;
	const projectId = params.id;
	const inviteId = params.inviteId;
	try {
		const { user } = await locals.safeGetSession();
		userId = user?.id;
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		if (!projectId || !inviteId) {
			return ApiResponse.badRequest('Project ID and invite ID required');
		}

		const actorId = await ensureActorId(supabase, user.id);

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: projectId,
				p_required_access: 'write'
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

		const { data: revokedInvite, error: updateError } = await supabase
			.from('onto_project_invites')
			.update({ status: 'revoked' })
			.eq('id', inviteId)
			.eq('status', 'pending')
			.select('id, status')
			.maybeSingle();

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

		if (!revokedInvite) {
			const { data: latestInvite } = await supabase
				.from('onto_project_invites')
				.select('status')
				.eq('id', inviteId)
				.eq('project_id', projectId)
				.maybeSingle();

			if (!latestInvite) {
				return ApiResponse.notFound('Invite');
			}

			if (latestInvite.status === 'accepted') {
				return ApiResponse.badRequest('Invite has already been accepted');
			}

			if (latestInvite.status === 'revoked') {
				return ApiResponse.badRequest('Invite has already been revoked');
			}

			if (latestInvite.status === 'expired') {
				return ApiResponse.badRequest('Invite has expired');
			}

			return ApiResponse.error('Invite is no longer pending and cannot be revoked', 409);
		}

		const { error: logError } = await supabase.from('onto_project_logs').insert({
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
		if (logError) {
			console.warn('[Project Invites API] Failed to log invite revoke:', logError);
			void logOntologyApiError({
				supabase,
				error: logError,
				endpoint: `/api/onto/projects/${projectId}/invites/${inviteId}/revoke`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_invite_log_revoke'
			});
		}

		return ApiResponse.success({ inviteId });
	} catch (error) {
		console.error('[Project Invites API] Failed to revoke invite:', error);
		await logOntologyApiError({
			supabase,
			error,
			endpoint:
				projectId && inviteId
					? `/api/onto/projects/${projectId}/invites/${inviteId}/revoke`
					: '/api/onto/projects/:id/invites/:inviteId/revoke',
			method: 'POST',
			userId,
			projectId,
			entityType: 'project',
			operation: 'project_invite_revoke'
		});
		return ApiResponse.internalError(error, 'Failed to revoke invite');
	}
};
