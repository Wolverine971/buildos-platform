// apps/web/src/lib/server/chat-classification.service.ts
import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';
import { PRIVATE_RAILWAY_WORKER_TOKEN } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { addQueueJobWithPublicId } from '$lib/server/queue-job-id';

const WORKER_URL = PUBLIC_RAILWAY_WORKER_URL;
const REQUEST_TIMEOUT_MS = 8000;

async function queueChatSessionClassificationDirect(params: {
	sessionId: string;
	userId: string;
}): Promise<{ queued: boolean; jobId?: string; reason?: string }> {
	try {
		const supabase = createAdminSupabaseClient();
		const { queueJobId } = await addQueueJobWithPublicId(supabase, {
			p_user_id: params.userId,
			p_job_type: 'classify_chat_session',
			p_metadata: { sessionId: params.sessionId, userId: params.userId },
			p_priority: 8,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: `classify-session-${params.sessionId}`
		});

		return { queued: true, jobId: queueJobId, reason: 'direct_queue' };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Direct queue failed';
		return { queued: false, reason: message };
	}
}

export async function queueChatSessionClassification(params: {
	sessionId: string;
	userId: string;
}): Promise<{ queued: boolean; jobId?: string; reason?: string }> {
	if (!WORKER_URL) {
		console.warn(
			'[Chat Classification] Worker URL not configured. Falling back to direct queue.'
		);
		return queueChatSessionClassificationDirect(params);
	}

	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};

	if (PRIVATE_RAILWAY_WORKER_TOKEN) {
		headers.Authorization = `Bearer ${PRIVATE_RAILWAY_WORKER_TOKEN}`;
	}

	try {
		const response = await fetch(`${WORKER_URL}/queue/chat/classify`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				sessionId: params.sessionId,
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

		let result: { jobId?: string } | null = null;
		try {
			result = (await response.json()) as { jobId?: string } | null;
		} catch (parseError) {
			console.warn(
				'[Chat Classification] Failed to parse worker success response; falling back to direct queue',
				parseError
			);
			return queueChatSessionClassificationDirect(params);
		}
		return { queued: true, jobId: result?.jobId };
	} catch (error) {
		console.warn(
			'[Chat Classification] Worker unreachable. Falling back to direct queue.',
			error
		);
		return queueChatSessionClassificationDirect(params);
	}
}
