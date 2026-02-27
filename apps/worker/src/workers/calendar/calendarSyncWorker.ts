// apps/worker/src/workers/calendar/calendarSyncWorker.ts
import type { ProcessingJob } from '../../lib/supabaseQueue';
import type { OntoProjectEventSyncJobMetadata } from '@buildos/shared-types';

const WEBHOOK_TIMEOUT_MS = 30_000;
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 409, 422]);

function isProjectEventSyncMetadata(data: unknown): data is OntoProjectEventSyncJobMetadata {
	if (!data || typeof data !== 'object') return false;
	const meta = data as Record<string, unknown>;
	return (
		meta.kind === 'onto_project_event_sync' &&
		(meta.action === 'upsert' || meta.action === 'delete') &&
		typeof meta.eventId === 'string' &&
		typeof meta.projectId === 'string' &&
		typeof meta.targetUserId === 'string'
	);
}

export async function processCalendarSyncJob(job: ProcessingJob): Promise<{
	success: boolean;
	terminal?: boolean;
	outcome?: string;
	reason?: string;
	status?: number;
	error?: string;
}> {
	if (!isProjectEventSyncMetadata(job.data)) {
		await job.log('Skipping unsupported sync_calendar payload');
		return {
			success: false,
			terminal: true,
			reason: 'unsupported_sync_calendar_payload'
		};
	}

	const webhookSecret = process.env.PRIVATE_BUILDOS_WEBHOOK_SECRET;
	if (!webhookSecret) {
		throw new Error('PRIVATE_BUILDOS_WEBHOOK_SECRET is not configured');
	}

	const baseUrl = (process.env.PUBLIC_APP_URL || 'https://build-os.com')
		.trim()
		.replace(/\/$/, '');
	const endpoint = `${baseUrl}/api/webhooks/calendar-sync-job`;

	await job.log(
		`Syncing event ${job.data.eventId} (${job.data.action}) for user ${job.data.targetUserId}`
	);

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${webhookSecret}`
		},
		body: JSON.stringify(job.data),
		signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
	});

	const responseText = await response.text();
	if (!response.ok) {
		if (NON_RETRYABLE_STATUS_CODES.has(response.status)) {
			await job.log(
				`Non-retryable calendar sync response ${response.status}: ${responseText.slice(0, 200)}`
			);
			return {
				success: false,
				terminal: true,
				status: response.status,
				error: responseText.slice(0, 500)
			};
		}

		throw new Error(
			`Calendar sync webhook failed (${response.status}): ${responseText.slice(0, 500)}`
		);
	}

	let payload: unknown = null;
	try {
		payload = responseText.length > 0 ? JSON.parse(responseText) : null;
	} catch {
		payload = null;
	}

	const result = (
		payload &&
		typeof payload === 'object' &&
		'data' in (payload as Record<string, unknown>) &&
		(payload as { data?: unknown }).data &&
		typeof (payload as { data?: unknown }).data === 'object'
			? (payload as { data: Record<string, unknown> }).data
			: null
	) as Record<string, unknown> | null;

	await job.log(
		`Calendar sync completed: ${result?.outcome ?? 'synced'} (${result?.reason ?? 'ok'})`
	);

	return {
		success: true,
		outcome: typeof result?.outcome === 'string' ? result.outcome : 'synced',
		reason: typeof result?.reason === 'string' ? result.reason : 'ok'
	};
}
