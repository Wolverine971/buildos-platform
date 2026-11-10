// apps/web/src/routes/api/inbox/email-updates/+server.ts
// Tasker 154: the AI Inbox's "From your email" cards (pending, last two weeks).
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { listEmailUpdateCards } from '$lib/server/email-project-updates.service';

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();
	try {
		const items = await listEmailUpdateCards({
			db: supabase,
			userId: user.id,
			withCurrent: true
		});
		return ApiResponse.success({ items });
	} catch (error) {
		console.warn('[Email updates] list failed:', error);
		return ApiResponse.success({ items: [] });
	}
};
