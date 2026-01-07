// apps/web/src/lib/server/braindump-processing.service.ts
import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';
import { PRIVATE_RAILWAY_WORKER_TOKEN } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

const WORKER_URL = PUBLIC_RAILWAY_WORKER_URL;
const REQUEST_TIMEOUT_MS = 8000;

async function queueBraindumpProcessingDirect(params: {
	braindumpId: string;
	userId: string;
}): Promise<{ queued: boolean; jobId?: string; reason?: string }> {
	try {
		const supabase = createAdminSupabaseClient();
		const { data, error } = await supabase.rpc('add_queue_job', {
			p_user_id: params.userId,
			p_job_type: 'process_onto_braindump',
			p_metadata: { braindumpId: params.braindumpId, userId: params.userId },
			p_priority: 7,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: `process-onto-braindump-${params.braindumpId}`
		});

		if (error) {
			return { queued: false, reason: error.message };
		}

		return { queued: true, jobId: data as string, reason: 'direct_queue' };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Direct queue failed';
		return { queued: false, reason: message };
	}
}

export async function queueBraindumpProcessing(params: {
	braindumpId: string;
	userId: string;
}): Promise<{ queued: boolean; jobId?: string; reason?: string }> {
	if (!WORKER_URL) {
		console.warn(
			'[Braindump Processing] Worker URL not configured. Falling back to direct queue.'
		);
		return queueBraindumpProcessingDirect(params);
	}

	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};

	if (PRIVATE_RAILWAY_WORKER_TOKEN) {
		headers.Authorization = `Bearer ${PRIVATE_RAILWAY_WORKER_TOKEN}`;
	}

	try {
		const response = await fetch(`${WORKER_URL}/queue/braindump/process`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				braindumpId: params.braindumpId,
				userId: params.userId
			}),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});

		if (response.status === 409) {
			const payload = await response.json().catch(() => null);
			return {
				queued: true,
				jobId: payload?.existingJobId,
				reason: 'already_queued'
			};
		}

		if (!response.ok) {
			const payload = await response.json().catch(() => null);
			const message = payload?.error || `HTTP ${response.status}`;
			return { queued: false, reason: message };
		}

		const result = await response.json().catch(() => ({}));
		return { queued: true, jobId: result?.jobId };
	} catch (error) {
		console.warn(
			'[Braindump Processing] Worker unreachable. Falling back to direct queue.',
			error
		);
		return queueBraindumpProcessingDirect(params);
	}
}
