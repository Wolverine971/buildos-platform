import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pingOntoEntityMock, getChangeSourceFromRequestMock } = vi.hoisted(() => ({
	pingOntoEntityMock: vi.fn(),
	getChangeSourceFromRequestMock: vi.fn()
}));

vi.mock('$lib/server/entity-mention-ping.service', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/entity-mention-ping.service')>()),
	pingOntoEntity: pingOntoEntityMock
}));

vi.mock('$lib/services/async-activity-logger', () => ({
	getChangeSourceFromRequest: getChangeSourceFromRequestMock
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

import { EntityMentionPingServiceError } from '$lib/server/entity-mention-ping.service';

describe('POST /api/onto/mentions/ping', () => {
	const taggedUserId = '11111111-1111-4111-8111-111111111111';

	beforeEach(() => {
		vi.clearAllMocks();
		getChangeSourceFromRequestMock.mockReturnValue('chat');
		pingOntoEntityMock.mockResolvedValue({
			project_id: 'project-1',
			entity_type: 'task',
			entity_id: 'task-1',
			mentioned_user_ids: [taggedUserId],
			notified_user_ids: [taggedUserId]
		});
	});

	it('delegates valid requests to the shared authenticated tag-ping boundary', async () => {
		const supabase = {};
		const { POST } = await import('./+server');

		const response = await POST({
			request: new Request('http://localhost/api/onto/mentions/ping', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Change-Source': 'chat'
				},
				body: JSON.stringify({
					project_id: 'project-1',
					entity_type: 'task',
					entity_id: 'task-1',
					mentioned_user_ids: [taggedUserId],
					message: 'Please review this today.'
				})
			}),
			locals: {
				supabase,
				safeGetSession: async () => ({
					user: { id: 'user-actor', name: 'DJ', email: 'dj@example.com' }
				})
			}
		} as any);

		expect(response.status).toBe(200);
		expect(pingOntoEntityMock).toHaveBeenCalledWith({
			client: supabase,
			projectId: 'project-1',
			entityType: 'task',
			entityId: 'task-1',
			mentionedUserIds: [taggedUserId],
			messageSuffix: 'Please review this today.',
			source: 'agent_ping',
			caller: { kind: 'authenticated', userId: 'user-actor', actorDisplayName: 'DJ' }
		});

		const payload = await response.json();
		expect(payload.success).toBe(true);
		expect(payload.data.notified_user_ids).toEqual([taggedUserId]);
	});

	it('preserves the legacy bad-request response for ineligible recipients', async () => {
		pingOntoEntityMock.mockRejectedValueOnce(
			new EntityMentionPingServiceError(
				'ineligible_recipients',
				'known_failed',
				`mentioned_user_ids must be active project members: ${taggedUserId}`
			)
		);
		const { POST } = await import('./+server');

		const response = await POST({
			request: new Request('http://localhost/api/onto/mentions/ping', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: 'project-1',
					entity_type: 'task',
					entity_id: 'task-1',
					mentioned_user_ids: [taggedUserId]
				})
			}),
			locals: {
				supabase: {},
				safeGetSession: async () => ({
					user: { id: 'user-actor', name: 'DJ', email: 'dj@example.com' }
				})
			}
		} as any);

		expect(response.status).toBe(400);
	});
});
