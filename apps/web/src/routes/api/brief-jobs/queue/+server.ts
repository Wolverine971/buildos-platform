// apps/web/src/routes/api/brief-jobs/queue/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';
import { PRIVATE_RAILWAY_WORKER_TOKEN } from '$env/static/private';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!PUBLIC_RAILWAY_WORKER_URL) {
		return ApiResponse.error('Worker URL not configured', HttpStatus.SERVICE_UNAVAILABLE);
	}

	try {
		const body = await request.json().catch(() => ({}));
		const {
			scheduledFor,
			briefDate,
			timezone,
			includeProjects,
			excludeProjects,
			useOntology,
			forceRegenerate
		} = body ?? {};

		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};

		if (PRIVATE_RAILWAY_WORKER_TOKEN) {
			headers.Authorization = `Bearer ${PRIVATE_RAILWAY_WORKER_TOKEN}`;
		}

		const response = await fetch(`${PUBLIC_RAILWAY_WORKER_URL}/queue/brief`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				userId: user.id,
				scheduledFor,
				briefDate,
				timezone,
				forceRegenerate,
				options: {
					includeProjects,
					excludeProjects,
					useOntology
				}
			})
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			return ApiResponse.error(
				error?.error || 'Failed to queue brief generation',
				response.status,
				undefined,
				error
			);
		}

		const result = await response.json();
		return ApiResponse.success(result, 'Brief generation queued');
	} catch (error) {
		console.error('Error queueing brief generation:', error);
		return ApiResponse.error(
			'Failed to queue brief generation',
			HttpStatus.INTERNAL_SERVER_ERROR,
			undefined,
			error instanceof Error ? error.message : error
		);
	}
};
