// apps/web/src/routes/api/onto/projects/[id]/invites/+server.ts
/**
 * Project invite endpoints
 * - GET: list pending invites (project owner only). Invites sent to an @handle show
 *   the handle, never the email behind it. Each row carries `effective_status`:
 *   'expired' once a pending invite is past `expires_at`, else its status.
 * - POST: create invite + send email (project owner only). Invite by `email`, by
 *   `invitee_handle` (a person findable by handle; the email is looked up on the
 *   server and never returned), or by `invitee_actor_id` (someone already in another
 *   project you own; their email is looked up on the server and never returned).
 *   `agent_access` sets what their agents may do:
 *   off | read (default) | write (editors only). The response carries `invite_url`
 *   once, so the owner can also copy the link; only its hash is stored.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { EmailService } from '$lib/services/email-service';
import { logOntologyApiError } from '../../../shared/error-logging';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	hideHandleInviteEmail,
	normalizeHandle,
	resolveHandleInvitee
} from '$lib/server/people/people-api';
import {
	agentAccessAllowed,
	DEFAULT_AGENT_ACCESS,
	isAgentAccess
} from '$lib/components/people/people-copy';
import { appBaseUrl } from '$lib/server/people/invite-links';
import { buildProjectInviteEmail } from '$lib/server/people/people-emails';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createHash, randomBytes } from 'crypto';

const INVITE_EXPIRY_DAYS = 7;
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLE_ACCESS_MAP = {
	editor: 'write',
	viewer: 'read'
} as const;

type InviteRole = keyof typeof ROLE_ACCESS_MAP;

const HANDLE_NOT_FOUND_MESSAGE =
	'No one with that handle can be found. Check the spelling, or invite them by email.';

type CoMemberInvitee =
	| { ok: true; userId: string | null; email: string; name: string | null }
	| { ok: false; status: 400 | 403; message: string };

const NOT_A_CO_MEMBER_MESSAGE =
	'You can only add someone this way if they are already in another project you own.';

/**
 * Invite by person: allowed only when that person is an active member of another
 * project the caller owns (admin access, not deleted). Their email is read with the
 * admin client and never leaves the server.
 */
async function resolveCoMemberInvitee({
	supabase,
	callerActorId,
	projectId,
	inviteeActorId
}: {
	supabase: any;
	callerActorId: string;
	projectId: string;
	inviteeActorId: string;
}): Promise<CoMemberInvitee> {
	const { data: owned, error: ownedError } = await supabase
		.from('onto_project_members')
		.select('project_id')
		.eq('actor_id', callerActorId)
		.eq('access', 'admin')
		.is('removed_at', null)
		.neq('project_id', projectId);
	if (ownedError) throw ownedError;
	const ownedIds = [
		...new Set(((owned ?? []) as Array<{ project_id: string }>).map((row) => row.project_id))
	];
	if (ownedIds.length === 0) {
		return { ok: false, status: 403, message: NOT_A_CO_MEMBER_MESSAGE };
	}

	const { data: shared, error: sharedError } = await supabase
		.from('onto_project_members')
		.select('project_id')
		.eq('actor_id', inviteeActorId)
		.is('removed_at', null)
		.in('project_id', ownedIds);
	if (sharedError) throw sharedError;
	const sharedIds = [
		...new Set(((shared ?? []) as Array<{ project_id: string }>).map((row) => row.project_id))
	];
	if (sharedIds.length === 0) {
		return { ok: false, status: 403, message: NOT_A_CO_MEMBER_MESSAGE };
	}

	const { data: liveProject, error: liveError } = await supabase
		.from('onto_projects')
		.select('id')
		.in('id', sharedIds)
		.is('deleted_at', null)
		.limit(1)
		.maybeSingle();
	if (liveError) throw liveError;
	if (!liveProject) {
		return { ok: false, status: 403, message: NOT_A_CO_MEMBER_MESSAGE };
	}

	const admin = createAdminSupabaseClient();
	const { data: actor, error: actorError } = await admin
		.from('onto_actors')
		.select('id, user_id, name, email')
		.eq('id', inviteeActorId)
		.maybeSingle();
	if (actorError) throw actorError;
	if (!actor) {
		return { ok: false, status: 403, message: NOT_A_CO_MEMBER_MESSAGE };
	}

	let email = typeof actor.email === 'string' ? actor.email.trim().toLowerCase() : '';
	if (actor.user_id) {
		const { data: account, error: accountError } = await admin
			.from('users')
			.select('email, deletion_status')
			.eq('id', actor.user_id)
			.maybeSingle();
		if (accountError) throw accountError;
		if (account?.deletion_status) {
			return { ok: false, status: 400, message: 'That account is being deleted.' };
		}
		if (typeof account?.email === 'string' && account.email.trim()) {
			email = account.email.trim().toLowerCase();
		}
	}
	if (!email || !EMAIL_REGEX.test(email)) {
		return { ok: false, status: 400, message: 'That person has no email we can send to.' };
	}

	return {
		ok: true,
		userId: actor.user_id ?? null,
		email,
		name: typeof actor.name === 'string' && actor.name.trim() ? actor.name.trim() : null
	};
}

/** A pending invite past its expiry date reads as expired (the row keeps 'pending'). */
function effectiveInviteStatus(
	invite: { status: string; expires_at: string | null },
	now: number
): string {
	if (invite.status !== 'pending' || !invite.expires_at) return invite.status;
	const expiresAt = Date.parse(invite.expires_at);
	return Number.isFinite(expiresAt) && expiresAt < now ? 'expired' : invite.status;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const supabase = locals.supabase;
	let userId: string | undefined;
	const projectId = params.id;
	try {
		const { user } = await locals.safeGetSession();
		userId = user?.id;
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		if (!projectId) {
			return ApiResponse.badRequest('Project ID required');
		}

		const actorId = await ensureActorId(supabase, user.id);

		// Only the owner manages invites, so only the owner reads them.
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
			.select(
				'id, invitee_email, invitee_handle, role_key, access, agent_access, status, created_at, expires_at'
			)
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

		const now = Date.now();
		return ApiResponse.success({
			invites: (invites ?? []).map((invite) => ({
				...hideHandleInviteEmail(invite),
				effective_status: effectiveInviteStatus(invite, now)
			})),
			actorId
		});
	} catch (error) {
		console.error('[Project Invites API] Failed to load invites:', error);
		await logOntologyApiError({
			supabase,
			error,
			endpoint: projectId
				? `/api/onto/projects/${projectId}/invites`
				: '/api/onto/projects/:id/invites',
			method: 'GET',
			userId,
			projectId,
			entityType: 'project',
			operation: 'project_invites_list'
		});
		return ApiResponse.internalError(error, 'Failed to load invites');
	}
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const supabase = locals.supabase;
	let userId: string | undefined;
	const projectId = params.id;
	try {
		const { user } = await locals.safeGetSession();
		userId = user?.id;
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		if (!projectId) {
			return ApiResponse.badRequest('Project ID required');
		}

		const body = await request.json().catch(() => null);
		const rawEmail = typeof body?.email === 'string' ? body.email.trim() : '';
		const rawHandle =
			typeof body?.invitee_handle === 'string' ? body.invitee_handle.trim() : '';
		const rawActorId =
			typeof body?.invitee_actor_id === 'string' ? body.invitee_actor_id.trim() : '';
		const roleKey = (body?.role_key as InviteRole | undefined) ?? 'editor';
		const agentAccess = body?.agent_access ?? DEFAULT_AGENT_ACCESS;

		if ([rawHandle, rawActorId].filter(Boolean).length > 1) {
			return ApiResponse.badRequest(
				'Invite one person at a time: an email, @handle, or person'
			);
		}
		if (rawActorId && !isValidUUID(rawActorId)) {
			return ApiResponse.badRequest('invitee_actor_id must be a valid id');
		}
		if (!rawHandle && !rawActorId && (!rawEmail || !EMAIL_REGEX.test(rawEmail))) {
			return ApiResponse.badRequest('Valid email address or @handle required');
		}

		const inviteeHandle = rawHandle ? normalizeHandle(rawHandle) : null;
		if (rawHandle && !inviteeHandle) {
			return ApiResponse.badRequest(
				'Enter a handle like @sam: 3 to 24 letters, numbers, or single hyphens.'
			);
		}

		if (!(roleKey in ROLE_ACCESS_MAP)) {
			return ApiResponse.badRequest('Role must be editor or viewer');
		}

		if (!isAgentAccess(agentAccess)) {
			return ApiResponse.badRequest('Agent access must be off, read, or write');
		}
		if (!agentAccessAllowed(roleKey, agentAccess)) {
			return ApiResponse.badRequest(
				'Agents can only write where their person can edit. Make them an Editor, or choose Read.'
			);
		}

		const access = ROLE_ACCESS_MAP[roleKey];

		if (
			!inviteeHandle &&
			!rawActorId &&
			user.email &&
			rawEmail.toLowerCase() === user.email.toLowerCase()
		) {
			return ApiResponse.badRequest('You cannot invite yourself');
		}

		const actorId = await ensureActorId(supabase, user.id);

		// Sharing is owner-only: editors can work in a project but not re-share it.
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
			return ApiResponse.forbidden('Only the project owner can invite people');
		}

		// A handle resolves to a findable account on the server. "No such handle"
		// and "not findable" read the same, and the email stays here.
		let inviteeUserId: string | null = null;
		let inviteeEmail = rawEmail.toLowerCase();
		if (inviteeHandle) {
			const invitee = await resolveHandleInvitee(createAdminSupabaseClient(), inviteeHandle);
			if (!invitee) {
				return ApiResponse.error(HANDLE_NOT_FOUND_MESSAGE, 404, 'NOT_FOUND');
			}
			if (invitee.userId === user.id) {
				return ApiResponse.badRequest('You cannot invite yourself');
			}
			inviteeUserId = invitee.userId;
			inviteeEmail = invitee.email;
		}
		// A person from another of your projects: their email resolves here and stays here.
		let inviteeActorName: string | null = null;
		if (rawActorId) {
			if (rawActorId === actorId) {
				return ApiResponse.badRequest('You cannot invite yourself');
			}
			const known = await resolveCoMemberInvitee({
				supabase,
				callerActorId: actorId,
				projectId,
				inviteeActorId: rawActorId
			});
			if (!known.ok) {
				return known.status === 403
					? ApiResponse.forbidden(known.message)
					: ApiResponse.badRequest(known.message);
			}
			inviteeUserId = known.userId;
			inviteeEmail = known.email;
			inviteeActorName = known.name;
		}
		const inviteeLabel = inviteeHandle
			? `@${inviteeHandle}`
			: rawActorId
				? inviteeActorName || 'them'
				: inviteeEmail;

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

		const { data: inviteeActor } = inviteeUserId
			? await supabase
					.from('onto_actors')
					.select('id')
					.eq('user_id', inviteeUserId)
					.maybeSingle()
			: await supabase
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
				invitee_user_id: inviteeUserId,
				invitee_handle: inviteeHandle,
				agent_access: agentAccess,
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
					? inviteeHandle || rawActorId
						? `An invite is already waiting for ${inviteeLabel}`
						: 'An invite is already pending for that email'
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

		const inviterName = user.name || user.email || 'A teammate';
		const inviteUrl = `${appBaseUrl()}/invites/${token}`;
		const inviteEmail = buildProjectInviteEmail({
			inviterName,
			projectName: project.name,
			projectDescription: project.description,
			roleKey,
			agentAccess,
			inviteUrl,
			expiresAt
		});

		const emailService = new EmailService(supabase);
		const emailResult = await emailService.sendEmail({
			to: inviteeEmail,
			subject: inviteEmail.subject,
			body: inviteEmail.text,
			html: inviteEmail.html,
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
			const inviteeDomain = inviteeEmail.split('@')[1] ?? null;
			await logOntologyApiError({
				supabase,
				error: new Error(emailResult.error ?? 'Email send failed'),
				endpoint: `/api/onto/projects/${projectId}/invites`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project_invite',
				operation: 'project_invite_email_send',
				metadata: {
					inviteId: invite?.id,
					inviteeDomain
				}
			});
			// The invite exists and works; the owner can still copy its link and send it.
		}
		const emailSent = emailResult.success === true;

		const { error: logError } = await supabase.from('onto_project_logs').insert({
			project_id: projectId,
			entity_type: 'project',
			entity_id: projectId,
			action: 'updated',
			changed_by: user.id,
			changed_by_actor_id: actorId,
			change_source: 'api',
			after_data: {
				event: 'invite_created',
				// Handle and person invites log who, never the email behind them.
				...(inviteeHandle
					? { invitee_handle: inviteeHandle }
					: rawActorId
						? { invitee_actor_id: rawActorId }
						: { invitee_email: inviteeEmail }),
				role_key: roleKey,
				access,
				agent_access: agentAccess
			}
		});
		if (logError) {
			console.warn('[Project Invites API] Failed to log invite creation:', logError);
			void logOntologyApiError({
				supabase,
				error: logError,
				endpoint: `/api/onto/projects/${projectId}/invites`,
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'project',
				operation: 'project_invite_log_create'
			});
		}

		return ApiResponse.success({
			inviteId: invite?.id,
			invitee_email: inviteeHandle || rawActorId ? null : inviteeEmail,
			invitee_handle: inviteeHandle,
			invitee_actor_id: rawActorId || null,
			role_key: roleKey,
			access,
			agent_access: agentAccess,
			expires_at: expiresAt,
			email_sent: emailSent,
			// Only here, right after creation: the token is never stored, so the owner can
			// copy this link now (the browser keeps it) but not read it back later.
			invite_url: inviteUrl
		});
	} catch (error) {
		console.error('[Project Invites API] Failed to create invite:', error);
		await logOntologyApiError({
			supabase,
			error,
			endpoint: projectId
				? `/api/onto/projects/${projectId}/invites`
				: '/api/onto/projects/:id/invites',
			method: 'POST',
			userId,
			projectId,
			entityType: 'project',
			operation: 'project_invite_create'
		});
		return ApiResponse.internalError(error, 'Failed to create invite');
	}
};
