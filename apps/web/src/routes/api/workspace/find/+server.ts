// apps/web/src/routes/api/workspace/find/+server.ts
// GET ?q=…: Workspace search's word matches (tasker 159). Every project the signed-in person
// can open, their Workspace included, note text included. Free: one database call.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { FindError, findItems } from '$lib/server/workspace/find.service';
import { normalizeFindQuery } from '$lib/components/workspace/find-model';

export const GET: RequestHandler = async ({ locals, url, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const query = normalizeFindQuery(url.searchParams.get('q'));
	const limit = Number(url.searchParams.get('limit') ?? '') || undefined;
	try {
		const items = await findItems({
			session: locals.supabase as never,
			query,
			limit,
			signal: request.signal
		});
		return ApiResponse.success({ query, items });
	} catch (error) {
		if (error instanceof FindError) return ApiResponse.error(error.message, error.status);
		return ApiResponse.internalError(error, 'Search is unavailable right now.');
	}
};
