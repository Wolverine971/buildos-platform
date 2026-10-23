// apps/web/src/routes/join/[token]/+page.server.ts
//
// The page behind a project's quick invite link. Works signed out: it shows the
// project, who invited them, and their role, then sends them to sign in or create an
// account and back here to finish. The preview reveals nothing else about the project.

import type { PageServerLoad } from './$types';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import {
	hashInviteToken,
	INVITE_LINK_TOKEN_SHAPE,
	readInviteLinkPreview,
	type InviteLinkPreview
} from '$lib/server/people/invite-links';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const token = params.token?.trim() ?? '';
	const { user } = await locals.safeGetSession();
	const viewer = user ? { email: user.email ?? null, name: user.name ?? null } : null;
	const base = { token, viewer, redirectTo: url.pathname };

	if (!INVITE_LINK_TOKEN_SHAPE.test(token)) {
		return { ...base, preview: { status: 'not_found' } as InviteLinkPreview, loadError: false };
	}

	const tokenHash = hashInviteToken(token);
	const { data, error } = await locals.supabase.rpc('get_project_invite_link_preview', {
		p_token_hash: tokenHash
	});

	if (error) {
		await ErrorLoggerService.getInstance(locals.supabase).logError(error, {
			endpoint: '/join/:token',
			httpMethod: 'GET',
			operationType: 'project_invite_link_preview',
			metadata: { tokenHashPrefix: tokenHash.slice(0, 8) }
		});
		return { ...base, preview: { status: 'not_found' } as InviteLinkPreview, loadError: true };
	}

	return { ...base, preview: readInviteLinkPreview(data), loadError: false };
};
