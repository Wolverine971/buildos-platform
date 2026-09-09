// apps/web/src/routes/api/webhooks/calendar-sync-job/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { processJob } = vi.hoisted(() => ({ processJob: vi.fn() }));
vi.mock('$env/static/private', () => ({ PRIVATE_BUILDOS_WEBHOOK_SECRET: 'test-secret' }));
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: vi.fn(() => ({})) }));
vi.mock('$lib/services/ontology/onto-event-sync.service', () => ({
	OntoEventSyncService: class {
		processProjectEventSyncJob = processJob;
	}
}));
import { POST } from './+server';
const payload = {
	kind: 'onto_project_event_sync',
	action: 'delete',
	eventId: 'event-1',
	projectId: 'project-1',
	targetUserId: 'user-1',
	deletionSnapshot: {
		externalEventId: 'google-1',
		calendarId: 'calendar-1',
		calendarSourceId: 'source-1'
	}
};
function post(body: unknown, secret = 'test-secret') {
	return POST({
		request: new Request('http://localhost/api/webhooks/calendar-sync-job', {
			method: 'POST',
			headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as any);
}
beforeEach(() => {
	vi.clearAllMocks();
	processJob.mockResolvedValue({ outcome: 'deleted' });
});
describe('calendar deletion snapshot webhook', () => {
	it('passes durable deletion identity through to the shared service', async () => {
		expect((await post(payload)).status).toBe(200);
		expect(processJob).toHaveBeenCalledWith(
			expect.objectContaining({ deletionSnapshot: payload.deletionSnapshot })
		);
	});
	it.each([
		{ ...payload, action: 'upsert' },
		{ ...payload, deletionSnapshot: {} },
		{ ...payload, deletionSnapshot: { externalEventId: 'google-1', calendarId: '' } }
	])('rejects unsafe or incomplete snapshot payloads', async (body) => {
		expect((await post(body)).status).toBe(400);
		expect(processJob).not.toHaveBeenCalled();
	});
	it('requires the worker secret before accepting deletion identities', async () => {
		expect((await post(payload, 'wrong')).status).toBe(401);
		expect(processJob).not.toHaveBeenCalled();
	});
	it('returns a retryable error when provider cleanup fails', async () => {
		processJob.mockRejectedValue(new Error('Google unavailable'));
		expect((await post(payload)).status).toBe(500);
	});
});
