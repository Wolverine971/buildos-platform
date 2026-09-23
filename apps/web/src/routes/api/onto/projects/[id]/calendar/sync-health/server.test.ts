// apps/web/src/routes/api/onto/projects/[id]/calendar/sync-health/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	requireProjectMemberAccess: vi.fn(),
	retryProjectEventSyncTarget: vi.fn()
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: mocks.requireProjectMemberAccess
}));

vi.mock('$lib/services/project-calendar.service', () => ({
	ProjectCalendarService: vi.fn(function () {
		return { retryProjectEventSyncTarget: mocks.retryProjectEventSyncTarget };
	})
}));

import { POST } from './+server';

describe('POST /api/onto/projects/[id]/calendar/sync-health', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireProjectMemberAccess.mockResolvedValue({ ok: true, userId: 'user-1' });
		mocks.retryProjectEventSyncTarget.mockResolvedValue(new Response('{}'));
	});

	it('never forwards a client-chosen action; the event row decides delete vs upsert', async () => {
		await POST({
			params: { id: 'project-1' },
			locals: { supabase: {} },
			request: new Request(
				'http://localhost/api/onto/projects/project-1/calendar/sync-health',
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						eventId: 'event-1',
						targetUserId: 'user-2',
						action: 'delete'
					})
				}
			)
		} as any);

		expect(mocks.retryProjectEventSyncTarget).toHaveBeenCalledWith('project-1', 'user-1', {
			eventId: 'event-1',
			targetUserId: 'user-2'
		});
	});
});
