// apps/web/src/routes/api/today/changes/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { getWhatChangedFeed } from '$lib/server/what-changed.service';

export const GET: RequestHandler = async ({
	url,
	locals: { safeGetSession, supabase, serverTiming }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const feed = await getWhatChangedFeed({
			supabase,
			userId: user.id,
			since: url.searchParams.get('since'),
			timing: serverTiming
		});
		return ApiResponse.success({ feed });
	} catch (err) {
		console.error('[Today Changes] Failed to load what-changed feed:', err);
		return ApiResponse.internalError(err, 'Failed to load recent changes');
	}
};
