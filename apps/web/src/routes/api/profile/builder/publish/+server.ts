// apps/web/src/routes/api/profile/builder/publish/+server.ts
// POST { publish: boolean } → put the page live at /@handle, or take it down.
// Publishing also lets people find you by @handle (so they can ask from the page).

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	BuilderProfileError,
	setPublished
} from '$lib/server/builder-profile/builder-profile.service';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const body = (await request.json().catch(() => null)) as { publish?: unknown } | null;
	if (typeof body?.publish !== 'boolean') return ApiResponse.badRequest('Say publish: true or false');
	try {
		await setPublished({ admin: createAdminSupabaseClient() as any, userId: user.id, publish: body.publish });
		return ApiResponse.success({ status: body.publish ? 'published' : 'draft' });
	} catch (error) {
		if (error instanceof BuilderProfileError) return ApiResponse.error(error.message, error.status);
		return ApiResponse.internalError(error, 'Could not change your page');
	}
};
