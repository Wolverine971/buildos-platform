// apps/web/src/lib/server/chat-classification.service.ts
import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';
import { PRIVATE_RAILWAY_WORKER_TOKEN } from '$env/static/private';

const WORKER_URL = PUBLIC_RAILWAY_WORKER_URL;
const REQUEST_TIMEOUT_MS = 8000;

export async function queueChatSessionClassification(params: {
	sessionId: string;
	userId: string;
}): Promise<{ queued: boolean; jobId?: string; reason?: string }> {
	if (!WORKER_URL) {
		console.warn('[Chat Classification] Worker URL not configured');
		return { queued: false, reason: 'worker_not_configured' };
	}

	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};

	if (PRIVATE_RAILWAY_WORKER_TOKEN) {
		headers.Authorization = `Bearer ${PRIVATE_RAILWAY_WORKER_TOKEN}`;
	}

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

	const result = await response.json().catch(() => ({}));
	return { queued: true, jobId: result?.jobId };
}
