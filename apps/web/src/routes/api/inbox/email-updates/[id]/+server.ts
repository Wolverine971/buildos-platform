// apps/web/src/routes/api/inbox/email-updates/[id]/+server.ts
// Tasker 154: Apply / Not now on one "From your email" card.
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { decideEmailUpdate } from '$lib/server/email-project-updates.service';

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { safeGetSession, supabase }
}) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();
	const body = await request.json().catch(() => null);
	const decision = body?.decision;
	if (decision !== 'apply' && decision !== 'dismiss') {
		return ApiResponse.badRequest("decision must be 'apply' or 'dismiss'");
	}
	const result = await decideEmailUpdate({
		admin: createAdminSupabaseClient(),
		userDb: supabase,
		userId: user.id,
		id: params.id,
		decision
	});
	return ApiResponse.success(result);
};
