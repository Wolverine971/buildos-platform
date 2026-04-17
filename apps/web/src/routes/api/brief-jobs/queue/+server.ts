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
		let body: Record<string, unknown> = {};
		try {
			const raw = await request.text();
			body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
		} catch (parseError) {
			console.warn('[brief-jobs/queue] invalid JSON body', parseError);
			return ApiResponse.badRequest('Invalid JSON body');
		}
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
			const text = await response.text();
			let error: { error?: string } | string = text;
			try {
				error = text ? (JSON.parse(text) as { error?: string }) : {};
			} catch (parseError) {
				console.warn(
					'[brief-jobs/queue] worker returned non-JSON error body',
					{ status: response.status, snippet: text.slice(0, 200) },
					parseError
				);
			}
			const message =
				(typeof error === 'object' && error?.error) || 'Failed to queue brief generation';
			return ApiResponse.error(message, response.status, undefined, error);
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
