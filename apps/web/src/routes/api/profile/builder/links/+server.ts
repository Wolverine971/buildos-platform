// apps/web/src/routes/api/profile/builder/links/+server.ts
// PUT { links: [{ kind: 'social'|'link', url, label?, note?, audience? }], base_rev? } → replaces
// the page's links in this order. base_rev is the save counter the editor loaded; a stale one
// (another tab saved since) gets 409 instead of overwriting. Returns the new counter.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	BuilderProfileError,
	parseLinks,
	replaceLinks
} from '$lib/server/builder-profile/builder-profile.service';

export const PUT: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const body = (await request.json().catch(() => null)) as {
		links?: unknown;
		base_rev?: unknown;
	} | null;
	try {
		const links = parseLinks(body?.links);
		const { rev } = await replaceLinks({
			admin: createAdminSupabaseClient() as any,
			userId: user.id,
			links,
			baseRev: typeof body?.base_rev === 'number' ? body.base_rev : null
		});
		return ApiResponse.success({ links, rev });
	} catch (error) {
		if (error instanceof BuilderProfileError)
			return ApiResponse.error(error.message, error.status);
		return ApiResponse.internalError(error, 'Could not save your links');
	}
};
