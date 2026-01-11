// apps/web/src/routes/api/onto/projects/[id]/invites/+server.ts
/**
 * Project invite endpoints
 * - GET: list pending invites (admin only)
 * - POST: create invite + send email (admin only)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { EmailService } from '$lib/services/email-service';
import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate';
import { logOntologyApiError } from '../../../shared/error-logging';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { PUBLIC_APP_URL } from '$env/static/public';
import { dev } from '$app/environment';
import { createHash, randomBytes } from 'crypto';

const INVITE_EXPIRY_DAYS = 7;
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLE_ACCESS_MAP = {
	editor: 'write',
	viewer: 'read'
} as const;

type InviteRole = keyof typeof ROLE_ACCESS_MAP;

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const projectId = params.id;
		if (!projectId) {
			return ApiResponse.badRequest('Project ID required');
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
				endpoint: `/api/onto/projects/${projectId}/invites`,
				method: 'GET',
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

		const { data: invites, error } = await supabase
			.from('onto_project_invites')
			.select('id, invitee_email, role_key, access, status, created_at, expires_at')
			.eq('project_id', projectId)
			.eq('status', 'pending')
			.order('created_at', { ascending: false });

		if (error) {
			await logOntologyApiError({
				supabase,
				error,
				endpoint: `/api/onto/projects/${projectId}/invites`,
				method: 'GET',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_invites_fetch',
				tableName: 'onto_project_invites'
			});
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({ invites: invites ?? [], actorId });
	} catch (error) {
		console.error('[Project Invites API] Failed to load invites:', error);
		return ApiResponse.internalError(error, 'Failed to load invites');
	}
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const projectId = params.id;
		if (!projectId) {
			return ApiResponse.badRequest('Project ID required');
		}

		const body = await request.json().catch(() => null);
		const rawEmail = typeof body?.email === 'string' ? body.email.trim() : '';
		const roleKey = (body?.role_key as InviteRole | undefined) ?? 'editor';

		if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
			return ApiResponse.badRequest('Valid email address required');
		}

		if (!(roleKey in ROLE_ACCESS_MAP)) {
			return ApiResponse.badRequest('Role must be editor or viewer');
		}

		const inviteeEmail = rawEmail.toLowerCase();
		const access = ROLE_ACCESS_MAP[roleKey];

		if (user.email && inviteeEmail === user.email.toLowerCase()) {
			return ApiResponse.badRequest('You cannot invite yourself');
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
				endpoint: `/api/onto/projects/${projectId}/invites`,
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

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, name')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError) {
			await logOntologyApiError({
				supabase,
				error: projectError,
				endpoint: `/api/onto/projects/${projectId}/invites`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_invites_project_fetch',
				tableName: 'onto_projects'
			});
			return ApiResponse.databaseError(projectError);
		}

		if (!project) {
			return ApiResponse.notFound('Project');
		}

		const { data: inviteeActor } = await supabase
			.from('onto_actors')
			.select('id')
			.eq('email', inviteeEmail)
			.maybeSingle();

		if (inviteeActor?.id) {
			const { data: existingMember } = await supabase
				.from('onto_project_members')
				.select('id')
				.eq('project_id', projectId)
				.eq('actor_id', inviteeActor.id)
				.is('removed_at', null)
				.maybeSingle();

			if (existingMember?.id) {
				return ApiResponse.badRequest('That user is already a member of this project');
			}
		}

		const token = randomBytes(32).toString('hex');
		const tokenHash = createHash('sha256').update(token).digest('hex');
		const expiresAt = new Date(
			Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
		).toISOString();

		const { data: invite, error: inviteError } = await supabase
			.from('onto_project_invites')
			.insert({
				project_id: projectId,
				invitee_email: inviteeEmail,
				token_hash: tokenHash,
				role_key: roleKey,
				access,
				status: 'pending',
				expires_at: expiresAt,
				invited_by_actor_id: actorId
			})
			.select('id')
			.single();

		if (inviteError) {
			const message =
				inviteError.code === '23505'
					? 'An invite is already pending for that email'
					: inviteError.message;
			await logOntologyApiError({
				supabase,
				error: inviteError,
				endpoint: `/api/onto/projects/${projectId}/invites`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_invites_insert',
				tableName: 'onto_project_invites'
			});
			return ApiResponse.error(message, inviteError.code === '23505' ? 409 : 500);
		}

		const baseUrl = PUBLIC_APP_URL || (dev ? 'http://localhost:5173' : 'https://build-os.com');
		const inviterName = user.name || user.email || 'A teammate';
		const invitePath = `/invites/${token}`;
		const inviteUrl = `${baseUrl}${invitePath}`;
		const registerUrl = `${baseUrl}/auth/register?redirect=${encodeURIComponent(invitePath)}`;
		const loginUrl = `${baseUrl}/auth/login?redirect=${encodeURIComponent(invitePath)}`;
		const subject = `${inviterName} invited you to "${project.name}" on BuildOS`;
		const roleLabel = roleKey === 'editor' ? 'Editor' : 'Viewer';
		const roleDescription =
			roleKey === 'editor'
				? 'You can view, edit, and manage project content.'
				: 'You can view project content and progress.';

		const content = `
<div style="text-align: center; margin-bottom: 24px;">
	<img src="https://build-os.com/s-brain-bolt.png" alt="BuildOS" width="64" height="64" style="display: inline-block; margin-bottom: 16px;" />
	<h1 style="margin: 0 0 8px 0; font-size: 28px; color: #1A1A1D;">You're invited!</h1>
	<p style="margin: 0; font-size: 16px; color: #6F6E75;">Join a project on BuildOS</p>
</div>

<div style="background-color: #FAF9F7; border: 1px solid #DCD9D1; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
	<p style="margin: 0 0 12px 0; font-size: 16px; color: #6F6E75;">
		<strong style="color: #1A1A1D;">${inviterName}</strong> has invited you to collaborate on:
	</p>
	<p style="margin: 0 0 16px 0; font-size: 22px; font-weight: 600; color: #1A1A1D;">
		${project.name}
	</p>
	<div style="display: inline-block; background-color: #EDEBE6; border-radius: 4px; padding: 6px 12px;">
		<span style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #6F6E75;">Role:</span>
		<span style="font-size: 14px; font-weight: 600; color: #1A1A1D; margin-left: 4px;">${roleLabel}</span>
	</div>
	<p style="margin: 12px 0 0 0; font-size: 14px; color: #6F6E75;">
		${roleDescription}
	</p>
</div>

<div style="text-align: center; margin-bottom: 24px;">
	<a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #D96C1E 0%, #E8943A 100%); color: #FAF9F7; font-size: 16px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px; box-shadow: 0 2px 8px rgba(217, 108, 30, 0.3);">
		Accept Invitation
	</a>
</div>

<p style="text-align: center; font-size: 13px; color: #6F6E75; margin: 0 0 16px 0;">
	New to BuildOS? <a href="${registerUrl}" style="color: #D96C1E; font-weight: 600; text-decoration: none;">Create an account</a> to accept.<br />
	Already have an account? <a href="${loginUrl}" style="color: #D96C1E; font-weight: 600; text-decoration: none;">Sign in</a>.
</p>

<p style="text-align: center; font-size: 13px; color: #9A9A9A; margin: 0;">
	This invitation expires in ${INVITE_EXPIRY_DAYS} days. If you didn't expect this email, you can safely ignore it.
</p>
		`.trim();

		const html = generateMinimalEmailHTML({ subject, content });
		const textBody = `${inviterName} invited you to collaborate on \"${project.name}\".\n\nAccept the invite: ${inviteUrl}\n\nNew to BuildOS? Create an account: ${registerUrl}\nAlready have an account? Sign in: ${loginUrl}\n\nThis invite expires in ${INVITE_EXPIRY_DAYS} days.`;

		const emailService = new EmailService(supabase);
		const emailResult = await emailService.sendEmail({
			to: inviteeEmail,
			subject,
			body: textBody,
			html,
			userId: user.id,
			createdBy: user.id,
			metadata: {
				type: 'project_invite',
				project_id: projectId,
				invite_id: invite?.id,
				invited_by_actor_id: actorId
			}
		});

		if (!emailResult.success) {
			return ApiResponse.error(
				`Invite created, but email failed to send: ${emailResult.error ?? 'Unknown error'}`,
				500
			);
		}

		await supabase
			.from('onto_project_logs')
			.insert({
				project_id: projectId,
				entity_type: 'project',
				entity_id: projectId,
				action: 'updated',
				changed_by: user.id,
				changed_by_actor_id: actorId,
				change_source: 'api',
				after_data: {
					event: 'invite_created',
					invitee_email: inviteeEmail,
					role_key: roleKey,
					access
				}
			})
			.then(({ error: logError }: { error: any }) => {
				if (logError) {
					console.warn('[Project Invites API] Failed to log invite creation:', logError);
				}
			});

		return ApiResponse.success({
			inviteId: invite?.id,
			invitee_email: inviteeEmail,
			role_key: roleKey,
			access,
			expires_at: expiresAt
		});
	} catch (error) {
		console.error('[Project Invites API] Failed to create invite:', error);
		return ApiResponse.internalError(error, 'Failed to create invite');
	}
};
