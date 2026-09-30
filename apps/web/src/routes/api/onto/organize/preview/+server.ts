// apps/web/src/routes/api/onto/organize/preview/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { previewOrApplyOrganize } from '$lib/server/organize/organize-service';
import { organizeRequest, organizeFailure } from '$lib/server/organize/organize-http';

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const parsed = await parseJsonRequest(request, organizeRequest);
	if (!parsed.ok) return parsed.response;
	try {
		return ApiResponse.success(
			await previewOrApplyOrganize({
				session: locals.supabase,
				admin: createAdminSupabaseClient(),
				userId: user.id,
				request: parsed.data,
				apply: false
			})
		);
	} catch (error) {
		return organizeFailure(error);
	}
};
