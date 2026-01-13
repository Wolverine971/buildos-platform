// apps/web/src/routes/api/sms/scheduled/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';
import { PRIVATE_RAILWAY_WORKER_TOKEN } from '$env/static/private';

/**
 * GET /api/sms/scheduled
 * List scheduled SMS messages for the current user
 *
 * Query params:
 * - status: Filter by status (scheduled, sent, cancelled, etc.)
 * - limit: Max results (default: 50)
 */
export const GET: RequestHandler = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const status = url.searchParams.get('status');
		const limit = url.searchParams.get('limit') || '50';

		// Build query string
		const queryParams = new URLSearchParams();
		if (status) queryParams.set('status', status);
		queryParams.set('limit', limit);

		const headers: Record<string, string> = {};
		if (PRIVATE_RAILWAY_WORKER_TOKEN) {
			headers.Authorization = `Bearer ${PRIVATE_RAILWAY_WORKER_TOKEN}`;
		}

		// Call worker API
		const workerUrl = `${PUBLIC_RAILWAY_WORKER_URL}/sms/scheduled/user/${user.id}?${queryParams.toString()}`;
		const response = await fetch(workerUrl, { headers });

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ error: 'Failed to fetch' }));
			return ApiResponse.error(
				errorData.error || 'Failed to fetch scheduled SMS messages',
				response.status,
				undefined,
				{ details: errorData }
			);
		}

		const data = await response.json();
		return ApiResponse.success(data);
	} catch (error: any) {
		console.error('Error fetching scheduled SMS:', error);
		return ApiResponse.internalError(
			error,
			error.message || 'Failed to fetch scheduled SMS messages'
		);
	}
};
