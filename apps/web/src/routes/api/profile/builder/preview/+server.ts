// apps/web/src/routes/api/profile/builder/preview/+server.ts
// GET → the owner's own page exactly as the public page renders it (drafts included,
// since the owner can read their own draft). The editor shows it in a phone frame.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { loadBuilderProfileAs } from '$lib/server/builder-profile/builder-profile.service';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const admin = createAdminSupabaseClient() as any;
	const { data: row } = await admin.from('users').select('username').eq('id', user.id).maybeSingle();
	const handle = (row as { username?: string } | null)?.username;
	if (!handle) return ApiResponse.success({ view: null, origin: url.origin });
	try {
		const result = await loadBuilderProfileAs(admin, handle, user.id);
		return ApiResponse.success({ view: result.found ? result : null, origin: url.origin });
	} catch (error) {
		return ApiResponse.internalError(error, 'Could not load the preview');
	}
};
