// apps/web/src/routes/api/onto/projects/[id]/invites/[inviteId]/resend/+server.ts
/**
 * Resend a project invite (admin only).
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { logOntologyApiError } from '../../../../../shared/error-logging';
import { EmailService } from '$lib/services/email-service';
import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate';
import { PUBLIC_APP_URL } from '$env/static/public';
import { dev } from '$app/environment';
import { createHash, randomBytes } from 'crypto';

const INVITE_EXPIRY_DAYS = 7;

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
			return ApiResponse.forbidden('Access denied');
		}

		const { data: invite, error: inviteError } = await supabase
			.from('onto_project_invites')
			.select('id, invitee_email, role_key, access, status')
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

		const { error: updateError } = await supabase
			.from('onto_project_invites')
			.update({
				token_hash: tokenHash,
				expires_at: expiresAt,
				status: 'pending'
			})
			.eq('id', inviteId);

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

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, name')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError || !project) {
			return ApiResponse.error('Project not found', 404);
		}

		const baseUrl = PUBLIC_APP_URL || (dev ? 'http://localhost:5173' : 'https://build-os.com');
		const inviterName = user.name || user.email || 'A teammate';
		const invitePath = `/invites/${token}`;
		const inviteUrl = `${baseUrl}${invitePath}`;
		const registerUrl = `${baseUrl}/auth/register?redirect=${encodeURIComponent(invitePath)}`;
		const loginUrl = `${baseUrl}/auth/login?redirect=${encodeURIComponent(invitePath)}`;
		const subject = `${inviterName} invited you to "${project.name}" on BuildOS`;
		const content = `
<h1>You've been invited to a project</h1>
<p>${inviterName} invited you to collaborate on <strong>${project.name}</strong>.</p>
<p><a href="${inviteUrl}">Accept the invite</a></p>
<p style="font-size: 13px; color: #6F6E75; margin: 16px 0;">
	New to BuildOS? <a href="${registerUrl}" style="color: #D96C1E; font-weight: 600; text-decoration: none;">Create an account</a> to accept.<br />
	Already have an account? <a href="${loginUrl}" style="color: #D96C1E; font-weight: 600; text-decoration: none;">Sign in</a>.
</p>
<p>This invite expires in ${INVITE_EXPIRY_DAYS} days.</p>
		`.trim();

		const html = generateMinimalEmailHTML({ subject, content });
		const textBody = `${inviterName} invited you to collaborate on \"${project.name}\".\n\nAccept the invite: ${inviteUrl}\n\nNew to BuildOS? Create an account: ${registerUrl}\nAlready have an account? Sign in: ${loginUrl}\n\nThis invite expires in ${INVITE_EXPIRY_DAYS} days.`;

		const emailService = new EmailService(supabase);
		const emailResult = await emailService.sendEmail({
			to: invite.invitee_email,
			subject,
			body: textBody,
			html,
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
			return ApiResponse.error(
				`Invite updated, but email failed to send: ${emailResult.error ?? 'Unknown error'}`,
				500
			);
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
				event: 'invite_resent',
				invitee_email: invite.invitee_email,
				role_key: invite.role_key,
				access: invite.access
			}
		});

		return ApiResponse.success({ inviteId, expires_at: expiresAt });
	} catch (error) {
		console.error('[Project Invites API] Failed to resend invite:', error);
		return ApiResponse.internalError(error, 'Failed to resend invite');
	}
};
