// apps/web/src/routes/api/onto/organize/undo/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { undoOrganize } from '$lib/server/organize/organize-service';
import { organizeUndoRequest, organizeFailure } from '$lib/server/organize/organize-http';
export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const parsed = await parseJsonRequest(request, organizeUndoRequest);
	if (!parsed.ok) return parsed.response;
	try {
		return ApiResponse.success(
			await undoOrganize({
				session: locals.supabase,
				admin: createAdminSupabaseClient(),
				userId: user.id,
				sourceBatchId: parsed.data.source_batch_id,
				batchId: parsed.data.batch_id,
				confirmationToken: parsed.data.confirmation_token
			})
		);
	} catch (error) {
		return organizeFailure(error);
	}
};
