// apps/web/src/routes/api/worker/health/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';
import { PRIVATE_RAILWAY_WORKER_TOKEN } from '$env/static/private';

const HEALTH_TIMEOUT_MS = 5000;

export const GET: RequestHandler = async () => {
	if (!PUBLIC_RAILWAY_WORKER_URL) {
		return ApiResponse.error('Worker URL not configured', HttpStatus.SERVICE_UNAVAILABLE);
	}
	if (!PRIVATE_RAILWAY_WORKER_TOKEN) {
		return ApiResponse.error(
			'Worker auth token not configured',
			HttpStatus.SERVICE_UNAVAILABLE
		);
	}

	try {
		const response = await fetch(`${PUBLIC_RAILWAY_WORKER_URL}/health`, {
			signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
		});

		if (!response.ok) {
			return ApiResponse.error('Worker health check failed', response.status);
		}

		const payload = await response.json().catch(() => ({}));
		const status = (payload as { status?: string } | null)?.status ?? 'ok';

		return ApiResponse.success({
			status,
			worker: payload
		});
	} catch (error) {
		console.error('[Worker Health] Failed to reach worker:', error);
		return ApiResponse.error(
			'Worker health check failed',
			HttpStatus.SERVICE_UNAVAILABLE,
			undefined,
			error instanceof Error ? error.message : error
		);
	}
};
