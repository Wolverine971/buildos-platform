// apps/web/src/routes/api/onto/projects/[id]/invites/[inviteId]/resend/+server.ts
/**
 * Resend a project invite (project owner only). Invites sent to an @handle are
 * logged and reported by handle; the email behind it stays on the server.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { logOntologyApiError } from '../../../../../shared/error-logging';
import { EmailService } from '$lib/services/email-service';
import { appBaseUrl } from '$lib/server/people/invite-links';
import { buildProjectInviteEmail } from '$lib/server/people/people-emails';
import { createHash, randomBytes } from 'crypto';

const INVITE_EXPIRY_DAYS = 7;

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
			'current_actor_has_project_member_access',
			{
				p_project_id: projectId,
				p_required_access: 'admin'
			}
		);

		if (accessError) {
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/projects/${projectId}/invites/${inviteId}/resend`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_invites_access'
			});
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('Only the project owner can resend invites');
		}

		const { data: invite, error: inviteError } = await supabase
			.from('onto_project_invites')
			.select('id, invitee_email, invitee_handle, role_key, access, agent_access, status')
			.eq('id', inviteId)
			.eq('project_id', projectId)
			.maybeSingle();

		if (inviteError) {
			await logOntologyApiError({
				supabase,
				error: inviteError,
				endpoint: `/api/onto/projects/${projectId}/invites/${inviteId}/resend`,
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

		if (invite.status === 'accepted') {
			return ApiResponse.badRequest('Invite has already been accepted');
		}

		if (invite.status === 'revoked') {
			return ApiResponse.badRequest('Invite has been revoked');
		}

		const token = randomBytes(32).toString('hex');
		const tokenHash = createHash('sha256').update(token).digest('hex');
		const expiresAt = new Date(
			Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
		).toISOString();

		const { data: updatedInvite, error: updateError } = await supabase
			.from('onto_project_invites')
			.update({
				token_hash: tokenHash,
				expires_at: expiresAt,
				status: 'pending'
			})
			.eq('id', inviteId)
			.in('status', ['pending', 'expired', 'declined'])
			.select('id, status')
			.maybeSingle();

		if (updateError) {
			await logOntologyApiError({
				supabase,
				error: updateError,
				endpoint: `/api/onto/projects/${projectId}/invites/${inviteId}/resend`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_invites_update',
				tableName: 'onto_project_invites'
			});
			return ApiResponse.databaseError(updateError);
		}

		if (!updatedInvite) {
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
				return ApiResponse.badRequest('Invite has been revoked');
			}

			return ApiResponse.error('Invite is no longer pending and cannot be resent', 409);
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, name, description')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError) {
			await logOntologyApiError({
				supabase,
				error: projectError,
				endpoint: `/api/onto/projects/${projectId}/invites/${inviteId}/resend`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_invites_project_fetch',
				tableName: 'onto_projects'
			});
		}

		if (projectError || !project) {
			return ApiResponse.error('Project not found', 404);
		}

		const inviterName = user.name || user.email || 'A teammate';
		const inviteUrl = `${appBaseUrl()}/invites/${token}`;
		const inviteEmail = buildProjectInviteEmail({
			inviterName,
			projectName: project.name,
			projectDescription: project.description,
			roleKey: invite.role_key,
			agentAccess: invite.agent_access ?? 'read',
			inviteUrl,
			expiresAt,
			reminder: true
		});

		const emailService = new EmailService(supabase);
		const emailResult = await emailService.sendEmail({
			to: invite.invitee_email,
			subject: inviteEmail.subject,
			body: inviteEmail.text,
			html: inviteEmail.html,
			userId: user.id,
			createdBy: user.id,
			metadata: {
				type: 'project_invite_resend',
				project_id: projectId,
				invite_id: inviteId,
				invited_by_actor_id: actorId
			}
		});

		if (!emailResult.success) {
			const inviteeDomain = invite.invitee_email.split('@')[1] ?? null;
			await logOntologyApiError({
				supabase,
				error: new Error(emailResult.error ?? 'Email send failed'),
				endpoint: `/api/onto/projects/${projectId}/invites/${inviteId}/resend`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project_invite',
				operation: 'project_invite_email_resend',
				metadata: {
					inviteId,
					inviteeDomain
				}
			});
			return ApiResponse.error(
				`Invite updated, but email failed to send: ${emailResult.error ?? 'Unknown error'}`,
				500
			);
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
				event: 'invite_resent',
				...(invite.invitee_handle
					? { invitee_handle: invite.invitee_handle }
					: { invitee_email: invite.invitee_email }),
				role_key: invite.role_key,
				access: invite.access
			}
		});
		if (logError) {
			console.warn('[Project Invites API] Failed to log invite resend:', logError);
			void logOntologyApiError({
				supabase,
				error: logError,
				endpoint: `/api/onto/projects/${projectId}/invites/${inviteId}/resend`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_invite_log_resend'
			});
		}

		// The new link exists only in this response (only its hash is stored).
		return ApiResponse.success({ inviteId, expires_at: expiresAt, invite_url: inviteUrl });
	} catch (error) {
		console.error('[Project Invites API] Failed to resend invite:', error);
		await logOntologyApiError({
			supabase,
			error,
			endpoint:
				projectId && inviteId
					? `/api/onto/projects/${projectId}/invites/${inviteId}/resend`
					: '/api/onto/projects/:id/invites/:inviteId/resend',
			method: 'POST',
			userId,
			projectId,
			entityType: 'project',
			operation: 'project_invite_resend'
		});
		return ApiResponse.internalError(error, 'Failed to resend invite');
	}
};
