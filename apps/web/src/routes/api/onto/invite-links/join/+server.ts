// apps/web/src/routes/api/onto/invite-links/join/+server.ts
/**
 * POST { token } → join a project with its invite link, as the signed-in user.
 *
 * Every expected outcome is a 200 with a `status` the join page turns into plain words:
 * joined | already_member | removed | expired | reset | turned_off | not_found.
 *
 * After a join (best effort, never undoing it): the new member follows project
 * activity when the project has that on, and the owner gets an in-app notice.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { asRecord, peopleRpcErrorResponse } from '$lib/server/people/people-api';
import { hashInviteToken, INVITE_LINK_TOKEN_SHAPE } from '$lib/server/people/invite-links';
import { roleWithArticle } from '$lib/components/people/people-copy';

const STATUSES = new Set([
	'joined',
	'already_member',
	'removed',
	'expired',
	'reset',
	'turned_off',
	'not_found'
]);

function text(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value : null;
}

export const POST: RequestHandler = async ({ request, locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Sign in to join this project');

	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) return ApiResponse.forbidden('Invalid origin');

	const body = asRecord(await request.json().catch(() => null));
	const token = typeof body.token === 'string' ? body.token.trim() : '';
	if (!INVITE_LINK_TOKEN_SHAPE.test(token)) {
		return ApiResponse.success({ status: 'not_found' });
	}

	const { data, error } = await locals.supabase.rpc('accept_project_invite_link', {
		p_token_hash: hashInviteToken(token)
	});
	if (error) return peopleRpcErrorResponse(error, 'Could not join this project');

	const result = asRecord(data);
	const status =
		typeof result.status === 'string' && STATUSES.has(result.status)
			? result.status
			: 'not_found';
	const projectId = text(result.project_id);
	const projectName = text(result.project_name);

	if (status === 'joined' && projectId) {
		await afterJoin({
			supabase: locals.supabase,
			userId: user.id,
			displayName: user.name || user.email || 'Someone',
			projectId,
			projectName: projectName ?? 'your project',
			roleKey: text(result.role_key) ?? 'viewer',
			ownerActorId: text(result.owner_actor_id)
		});
	}

	return ApiResponse.success({
		status,
		project_id: projectId,
		project_name: projectName,
		role_key: text(result.role_key),
		agent_access: text(result.agent_access)
	});
};

async function afterJoin(input: {
	supabase: App.Locals['supabase'];
	userId: string;
	displayName: string;
	projectId: string;
	projectName: string;
	roleKey: string;
	ownerActorId: string | null;
}): Promise<void> {
	const nowIso = new Date().toISOString();

	// Follow project activity, as an accepted invite does, when the project has it on.
	try {
		const { data: settingsRows } = await (input.supabase as any).rpc(
			'get_project_notification_settings',
			{ p_project_id: input.projectId }
		);
		const settings = Array.isArray(settingsRows) ? settingsRows[0] : settingsRows;
		if (settings?.effective_enabled) {
			const { error } = await (input.supabase as any)
				.from('notification_subscriptions')
				.upsert(
					{
						user_id: input.userId,
						event_type: 'project.activity.batched',
						is_active: true,
						admin_only: false,
						created_by: input.userId,
						updated_at: nowIso
					},
					{ onConflict: 'user_id,event_type' }
				);
			if (error) throw error;
		}
	} catch (error) {
		console.warn('[Invite Link Join] Could not subscribe the new member to activity', {
			projectId: input.projectId,
			error: error instanceof Error ? error.message : error
		});
	}

	// Tell the owner who joined.
	if (!input.ownerActorId) return;
	try {
		const admin = createAdminSupabaseClient() as any;
		const { data: owner, error: ownerError } = await admin
			.from('onto_actors')
			.select('user_id')
			.eq('id', input.ownerActorId)
			.maybeSingle();
		if (ownerError) throw ownerError;
		const ownerUserId = typeof owner?.user_id === 'string' ? owner.user_id : null;
		if (!ownerUserId || ownerUserId === input.userId) return;

		// Same as an accepted invite: owners hear about joins unless they turned it off
		// (an existing subscription, active or not, is left as it is).
		const { error: subscriptionError } = await admin.from('notification_subscriptions').upsert(
			{
				user_id: ownerUserId,
				event_type: 'project.invite.accepted',
				is_active: true,
				admin_only: false,
				created_by: input.userId,
				updated_at: nowIso
			},
			{ onConflict: 'user_id,event_type', ignoreDuplicates: true }
		);
		if (subscriptionError) throw subscriptionError;

		const { error: emitError } = await admin.rpc('emit_notification_event', {
			p_event_type: 'project.invite.accepted',
			p_event_source: 'api_action',
			p_actor_user_id: input.userId,
			p_target_user_id: ownerUserId,
			p_payload: {
				title: `${input.displayName} joined ${input.projectName}`,
				body: `${input.displayName} joined with your invite link as ${roleWithArticle(input.roleKey)}.`,
				action_url: `/projects/${input.projectId}`,
				project_id: input.projectId,
				project_name: input.projectName,
				actor_user_id: input.userId,
				actor_name: input.displayName,
				role_key: input.roleKey,
				via: 'invite_link'
			},
			p_metadata: {
				projectId: input.projectId,
				recipientUserId: ownerUserId,
				via: 'invite_link'
			}
		});
		if (emitError) throw emitError;
	} catch (error) {
		console.warn('[Invite Link Join] Could not notify the owner', {
			projectId: input.projectId,
			error: error instanceof Error ? error.message : error
		});
	}
}
