// apps/web/src/routes/api/daily-briefs/generate/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus, parseRequestBody } from '$lib/utils/api-response';
import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';
import { PRIVATE_RAILWAY_WORKER_TOKEN } from '$env/static/private';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!PUBLIC_RAILWAY_WORKER_URL) {
		return ApiResponse.error(
			'Local brief generation is deprecated. Configure Railway worker and use queue-based generation.',
			HttpStatus.SERVICE_UNAVAILABLE
		);
	}

	const body = await parseRequestBody(request);
	if (!body) {
		return ApiResponse.badRequest('Invalid request body');
	}

	const { briefDate, forceRegenerate = false, timezone, includeProjects, excludeProjects } = body;

	try {
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
				briefDate,
				timezone,
				forceRegenerate,
				options: {
					includeProjects,
					excludeProjects,
					useOntology: true
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
		return ApiResponse.success(
			{
				brief_id: result?.jobId || null,
				jobId: result?.jobId || null,
				status: 'processing',
				queued: true
			},
			'Brief generation queued'
		);
	} catch (err) {
		return ApiResponse.internalError(err, 'Failed to queue daily brief generation');
	}
};

// Legacy SSE endpoint kept only to avoid breaking callers in environments without worker connectivity.
export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			const event = {
				type: 'error',
				data: {
					message:
						'Local SSE brief generation has been removed. Use queue-based worker generation.'
				}
			};
			controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
			controller.close();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
