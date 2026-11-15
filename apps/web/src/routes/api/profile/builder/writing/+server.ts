// apps/web/src/routes/api/profile/builder/writing/+server.ts
// PUT { page_ids: string[] } → the public pages shown under Writing on the owner's page, in
// this order. Only their own published public pages; an empty list hides Writing.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	BuilderProfileError,
	parseWritingPicks,
	replaceWriting
} from '$lib/server/builder-profile/builder-profile.service';

export const PUT: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const body = (await request.json().catch(() => null)) as { page_ids?: unknown } | null;
	try {
		const pageIds = parseWritingPicks(body?.page_ids);
		await replaceWriting({
			admin: createAdminSupabaseClient() as any,
			userId: user.id,
			pageIds
		});
		return ApiResponse.success({ page_ids: pageIds });
	} catch (error) {
		if (error instanceof BuilderProfileError)
			return ApiResponse.error(error.message, error.status);
		return ApiResponse.internalError(error, 'Could not save your Writing picks');
	}
};
