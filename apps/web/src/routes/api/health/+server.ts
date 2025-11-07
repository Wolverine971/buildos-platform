// apps/web/src/routes/api/health/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
	// This endpoint forces the server to check the current auth state
	const { user } = await safeGetSession();

	return ApiResponse.success({
		status: 'ok',
		timestamp: new Date().toISOString(),
		authenticated: !!user,
		userId: user?.id || null
	});
};
