// apps/web/src/routes/api/onto/projects/[id]/invites/[inviteId]/resend/+server.ts
/**
 * Resend a project invite (collaborators with write access).
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

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

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

		const baseUrl = PUBLIC_APP_URL || (dev ? 'http://localhost:5173' : 'https://build-os.com');
		const inviterName = user.name || user.email || 'A teammate';
		const safeInviterName = escapeHtml(inviterName);
		const invitePath = `/invites/${token}`;
		const inviteUrl = `${baseUrl}${invitePath}`;
		const registerUrl = `${baseUrl}/auth/register?redirect=${encodeURIComponent(invitePath)}`;
		const loginUrl = `${baseUrl}/auth/login?redirect=${encodeURIComponent(invitePath)}`;
		const projectDescription = project.description?.trim() || '';
		const safeProjectName = escapeHtml(project.name);
		const safeProjectDescription = escapeHtml(projectDescription);
		const descriptionHtml = projectDescription
			? `
	<div style="background-color: #FFFFFF; border-left: 3px solid #D96C1E; padding: 12px 16px; margin: 16px 0; border-radius: 0 4px 4px 0;">
		<p style="margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #9A9A9A; font-weight: 600;">About this project</p>
		<p style="margin: 0; font-size: 14px; color: #4A4A4A; line-height: 1.5;">${safeProjectDescription}</p>
	</div>`
			: '';
		const descriptionText = projectDescription
			? `\n\nAbout this project:\n${projectDescription}\n`
			: '';
		const subject = `Reminder: ${inviterName} invited you to "${project.name}"`;
		const htmlSubject = escapeHtml(subject);
		const roleLabel = invite.role_key === 'editor' ? 'Editor' : 'Viewer';
		const roleDescription =
			invite.role_key === 'editor'
				? 'You can view, edit, and manage project content.'
				: 'You can view project content and progress.';

		const content = `
<div style="text-align: center; margin-bottom: 28px;">
	<img src="https://build-os.com/s-brain-bolt.png" alt="BuildOS" width="56" height="56" style="display: inline-block; margin-bottom: 20px;" />
	<h1 style="margin: 0 0 8px 0; font-size: 26px; color: #1A1A1D; font-weight: 700;">Still waiting for you!</h1>
	<p style="margin: 0; font-size: 15px; color: #6F6E75;">A friendly reminder to join a project on BuildOS</p>
</div>

<div style="background-color: #FAF9F7; border: 1px solid #DCD9D1; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
	<div style="margin-bottom: 20px;">
		<p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #9A9A9A; font-weight: 600;">Invited by</p>
		<p style="margin: 0; font-size: 18px; font-weight: 600; color: #1A1A1D;">${safeInviterName}</p>
	</div>

	<div style="border-top: 1px solid #DCD9D1; padding-top: 20px;">
		<p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #9A9A9A; font-weight: 600;">Project</p>
		<p style="margin: 0; font-size: 22px; font-weight: 700; color: #1A1A1D; line-height: 1.3;">
			${safeProjectName}
		</p>
	</div>
	${descriptionHtml}
	<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #DCD9D1;">
		<div style="display: inline-block; background-color: #EDEBE6; border-radius: 6px; padding: 8px 14px;">
			<span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6F6E75; font-weight: 600;">Your role:</span>
			<span style="font-size: 14px; font-weight: 700; color: #1A1A1D; margin-left: 6px;">${roleLabel}</span>
		</div>
		<p style="margin: 10px 0 0 0; font-size: 13px; color: #6F6E75; line-height: 1.4;">
			${roleDescription}
		</p>
	</div>
</div>

<div style="text-align: center; margin-bottom: 28px;">
	<a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #D96C1E 0%, #E8943A 100%); color: #FAF9F7; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 36px; border-radius: 8px; box-shadow: 0 4px 12px rgba(217, 108, 30, 0.35);">
		Accept Invitation
	</a>
</div>

<p style="text-align: center; font-size: 13px; color: #6F6E75; margin: 0 0 16px 0; line-height: 1.6;">
	New to BuildOS? <a href="${registerUrl}" style="color: #D96C1E; font-weight: 600; text-decoration: none;">Create an account</a> to accept.<br />
	Already have an account? <a href="${loginUrl}" style="color: #D96C1E; font-weight: 600; text-decoration: none;">Sign in</a>.
</p>

<p style="text-align: center; font-size: 12px; color: #9A9A9A; margin: 0;">
	This invitation expires in ${INVITE_EXPIRY_DAYS} days. If you didn't expect this email, you can safely ignore it.
</p>
		`.trim();

		const html = generateMinimalEmailHTML({ subject: htmlSubject, content });
		const textBody = `Reminder: ${inviterName} is waiting for you to collaborate on "${project.name}".${descriptionText}Your role: ${roleLabel} - ${roleDescription}\n\nAccept the invite: ${inviteUrl}\n\nNew to BuildOS? Create an account: ${registerUrl}\nAlready have an account? Sign in: ${loginUrl}\n\nThis invite expires in ${INVITE_EXPIRY_DAYS} days.`;

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
				invitee_email: invite.invitee_email,
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

		return ApiResponse.success({ inviteId, expires_at: expiresAt });
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
