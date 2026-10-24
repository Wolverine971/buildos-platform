// apps/web/src/routes/api/onto/invite-links/join/+server.ts
/**
 * POST { token } → join a project with its invite link, as the signed-in user.
 *
 * Every expected outcome is a 200 with a `status` the join page turns into plain words:
 * joined | already_member | rejoin_requested | rejoin_pending | rejoin_denied |
 * rate_limited | expired | reset | turned_off | not_found.
 *
 * Someone who left or was removed doesn't rejoin by link: the owner gets a rejoin
 * request (in BuildOS, plus an email here) and lets them back in or denies it.
 *
 * The RPC settles competing entrances and enqueues owner notification delivery
 * atomically with membership, preserving existing activity/channel preferences.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { asRecord, peopleRpcErrorResponse } from '$lib/server/people/people-api';
import { hashInviteToken, INVITE_LINK_TOKEN_SHAPE } from '$lib/server/people/invite-links';
import { sendPeopleRequestReceivedEmail } from '$lib/server/people/people-emails';

const STATUSES = new Set([
	'joined',
	'already_member',
	'rejoin_requested',
	'rejoin_pending',
	'rejoin_denied',
	'rate_limited',
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

	const requestId = text(result.request_id);
	if (status === 'rejoin_requested' && requestId) {
		await sendPeopleRequestReceivedEmail(requestId);
	}

	return ApiResponse.success({
		status,
		project_id: projectId,
		project_name: projectName,
		role_key: text(result.role_key),
		agent_access: text(result.agent_access)
	});
};
