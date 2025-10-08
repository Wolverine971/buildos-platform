// apps/web/src/routes/api/sms/scheduled/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';

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
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const status = url.searchParams.get('status');
		const limit = url.searchParams.get('limit') || '50';

		// Build query string
		const queryParams = new URLSearchParams();
		if (status) queryParams.set('status', status);
		queryParams.set('limit', limit);

		// Call worker API
		const workerUrl = `${PUBLIC_RAILWAY_WORKER_URL}/sms/scheduled/user/${user.id}?${queryParams.toString()}`;
		const response = await fetch(workerUrl);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ error: 'Failed to fetch' }));
			return json(errorData, { status: response.status });
		}

		const data = await response.json();
		return json(data);
	} catch (error: any) {
		console.error('Error fetching scheduled SMS:', error);
		return json(
			{
				success: false,
				error: error.message || 'Failed to fetch scheduled SMS messages'
			},
			{ status: 500 }
		);
	}
};
