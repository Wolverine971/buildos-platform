// apps/web/src/routes/api/auth/user/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized('Not authenticated');
	}

	return ApiResponse.success({
		id: user.id,
		email: user.email,
		is_admin: user.is_admin,
		is_beta_user: user.is_beta_user || false
		// Add any other user fields you need
	});
};
