// apps/worker/tests/calendarSyncWorker.test.ts
// sync_calendar acts only for its queue row owner: metadata.targetUserId must match.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processCalendarSyncJob } from '../src/workers/calendar/calendarSyncWorker';

const fetchMock = vi.fn();

function job(queueUserId: string, targetUserId: string) {
	return {
		id: 'job-1',
		userId: queueUserId,
		correlationId: null,
		attempts: 0,
		signal: new AbortController().signal,
		data: {
			kind: 'onto_project_event_sync',
			action: 'delete',
			eventId: 'event-1',
			projectId: 'project-1',
			targetUserId,
			deletionSnapshot: { calendar_id: 'primary', external_event_id: 'g-1' }
		},
		updateProgress: vi.fn(async () => undefined),
		log: vi.fn(async () => undefined)
	} as never;
}

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
	vi.stubEnv('PRIVATE_BUILDOS_WEBHOOK_SECRET', 'test-secret');
	vi.stubEnv('PUBLIC_APP_URL', 'https://example.test');
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe('processCalendarSyncJob owner binding', () => {
	it('refuses a job whose targetUserId is not the queue row owner, without calling the webhook', async () => {
		await expect(
			processCalendarSyncJob(job('user-attacker', 'user-victim'))
		).rejects.toMatchObject({ kind: 'permanent', code: 'target_user_mismatch' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('syncs a same-user job through the webhook', async () => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ data: { outcome: 'deleted', reason: 'ok' } }), {
				status: 200
			})
		);
		const result = await processCalendarSyncJob(job('user-1', 'user-1'));
		expect(result).toMatchObject({ success: true, outcome: 'deleted' });
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe('https://example.test/api/webhooks/calendar-sync-job');
		expect(JSON.parse(init.body)).toMatchObject({ targetUserId: 'user-1', eventId: 'event-1' });
	});
});
