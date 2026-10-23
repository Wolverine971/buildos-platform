// apps/web/src/routes/api/onto/projects/[id]/invite-link/+server.ts
/**
 * The project's quick invite link (owner only; the RPCs check auth.uid() themselves).
 *
 * - GET    → { link: null | { id, role_key, agent_access, expires_at, expired, join_count, url, ... } }
 * - POST   { role_key?, agent_access?, expires_in_days? } → create, or reset: the current
 *          link stops working and a new one replaces it. → { link, replaced }
 * - PATCH  { role_key, agent_access, expires_in_days? } → change the current link's
 *          settings; the URL stays the same. expires_in_days counts from now.
 * - DELETE → turn it off. People who joined stay members.
 *
 * The URL is rebuilt from the link id with a server secret (invite-links.ts); the
 * database keeps only the token's hash.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { asRecord, peopleRpcErrorResponse } from '$lib/server/people/people-api';
import {
	inviteLinkForOwner,
	newInviteLink,
	readInviteLinkDays,
	readInviteLinkSettings
} from '$lib/server/people/invite-links';
import {
	agentAccessAllowed,
	DEFAULT_AGENT_ACCESS,
	DEFAULT_INVITE_LINK_DAYS,
	isAgentAccess,
	isPersonRole,
	type AgentAccess,
	type PersonRole
} from '$lib/components/people/people-copy';

type Settings = { role: PersonRole; agentAccess: AgentAccess; days: number | null };

function readSettings(
	body: Record<string, unknown>,
	defaults: { days: number | null }
): { ok: true; settings: Settings } | { ok: false; message: string } {
	const role = body.role_key ?? 'viewer';
	const agentAccess = body.agent_access ?? DEFAULT_AGENT_ACCESS;
	if (!isPersonRole(role)) return { ok: false, message: 'Role must be viewer or editor' };
	if (!isAgentAccess(agentAccess)) {
		return { ok: false, message: 'Agent access must be off, read, or write' };
	}
	if (!agentAccessAllowed(role, agentAccess)) {
		return {
			ok: false,
			message:
				'Agents can only write where their person can edit. Make it an Editor link, or choose Read.'
		};
	}
	let days = defaults.days;
	if (body.expires_in_days !== undefined && body.expires_in_days !== null) {
		days = readInviteLinkDays(body.expires_in_days);
		if (days === null) return { ok: false, message: 'A link can last 1 to 30 days' };
	}
	return { ok: true, settings: { role, agentAccess, days } };
}

function linkResponse(value: unknown, extra: Record<string, unknown> = {}) {
	const settings = readInviteLinkSettings(asRecord(value).link);
	return ApiResponse.success({ link: settings ? inviteLinkForOwner(settings) : null, ...extra });
}

// An explicit union: inferred object-literal unions add `response?: undefined` to the
// success branch, so `'response' in session` would not narrow.
type OwnerSession = { response: Response } | { user: { id: string }; projectId: string };

async function requireOwnerSession(
	locals: App.Locals,
	projectId: string | undefined
): Promise<OwnerSession> {
	const { user } = await locals.safeGetSession();
	if (!user) return { response: ApiResponse.unauthorized('Authentication required') };
	if (!projectId || !isValidUUID(projectId)) {
		return { response: ApiResponse.badRequest('Invalid project ID') };
	}
	return { user, projectId };
}

/** Sharing is changed only from a BuildOS page, never a cross-site request. */
function crossSite(request: Request, url: URL): boolean {
	const origin = request.headers.get('origin');
	return Boolean(origin && origin !== url.origin);
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await requireOwnerSession(locals, params.id);
	if ('response' in session) return session.response;

	const { data, error } = await locals.supabase.rpc('get_project_invite_link', {
		p_project_id: session.projectId
	});
	if (error) return peopleRpcErrorResponse(error, 'Could not load the invite link');
	return linkResponse(data);
};

export const POST: RequestHandler = async ({ params, locals, request, url }) => {
	const session = await requireOwnerSession(locals, params.id);
	if ('response' in session) return session.response;
	if (crossSite(request, url)) return ApiResponse.forbidden('Invalid origin');

	const body = asRecord(await request.json().catch(() => null));
	const parsed = readSettings(body, { days: DEFAULT_INVITE_LINK_DAYS });
	if (!parsed.ok) return ApiResponse.badRequest(parsed.message);

	const link = newInviteLink();
	const { data, error } = await locals.supabase.rpc('create_project_invite_link', {
		p_project_id: session.projectId,
		p_link_id: link.id,
		p_token_hash: link.tokenHash,
		p_role_key: parsed.settings.role,
		p_agent_access: parsed.settings.agentAccess,
		p_expires_in_days: parsed.settings.days ?? DEFAULT_INVITE_LINK_DAYS
	});
	if (error) {
		if (error.code === '23505') {
			return ApiResponse.error('The link changed at the same moment. Try again.', 409);
		}
		return peopleRpcErrorResponse(error, 'Could not make the invite link');
	}
	return linkResponse(data, { replaced: asRecord(data).replaced === true });
};

export const PATCH: RequestHandler = async ({ params, locals, request, url }) => {
	const session = await requireOwnerSession(locals, params.id);
	if ('response' in session) return session.response;
	if (crossSite(request, url)) return ApiResponse.forbidden('Invalid origin');

	const body = asRecord(await request.json().catch(() => null));
	const parsed = readSettings(body, { days: null });
	if (!parsed.ok) return ApiResponse.badRequest(parsed.message);

	const { data, error } = await locals.supabase.rpc('update_project_invite_link', {
		p_project_id: session.projectId,
		p_role_key: parsed.settings.role,
		p_agent_access: parsed.settings.agentAccess,
		...(parsed.settings.days !== null ? { p_expires_in_days: parsed.settings.days } : {})
	});
	if (error) return peopleRpcErrorResponse(error, 'Could not change the invite link');
	return linkResponse(data);
};

export const DELETE: RequestHandler = async ({ params, locals, request, url }) => {
	const session = await requireOwnerSession(locals, params.id);
	if ('response' in session) return session.response;
	if (crossSite(request, url)) return ApiResponse.forbidden('Invalid origin');

	const { data, error } = await locals.supabase.rpc('turn_off_project_invite_link', {
		p_project_id: session.projectId
	});
	if (error) return peopleRpcErrorResponse(error, 'Could not turn off the invite link');
	return ApiResponse.success({ turned_off: asRecord(data).turned_off === true, link: null });
};
