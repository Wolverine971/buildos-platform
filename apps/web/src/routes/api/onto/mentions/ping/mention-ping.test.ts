// apps/web/src/routes/api/onto/mentions/ping/mention-ping.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureActorIdMock = vi.fn();
const resolveEligibleProjectMentionUserIdsMock = vi.fn();
const notifyEntityMentionsAddedMock = vi.fn();
const getChangeSourceFromRequestMock = vi.fn();

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock
}));

vi.mock('$lib/server/entity-mention-notification.service', () => ({
	resolveEligibleProjectMentionUserIds: resolveEligibleProjectMentionUserIdsMock,
	notifyEntityMentionsAdded: notifyEntityMentionsAddedMock
}));

vi.mock('$lib/services/async-activity-logger', () => ({
	getChangeSourceFromRequest: getChangeSourceFromRequestMock
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

class QueryBuilderMock {
	constructor(private readonly table: string) {}

	select() {
		return this;
	}

	eq() {
		return this;
	}

	is() {
		return this;
	}

	async maybeSingle() {
		if (this.table === 'onto_projects') {
			return {
				data: {
					id: 'project-1',
					name: 'Project One',
					created_by: 'actor-owner'
				},
				error: null
			};
		}

		if (this.table === 'onto_tasks') {
			return {
				data: {
					id: 'task-1',
					project_id: 'project-1',
					title: 'Task title'
				},
				error: null
			};
		}

		if (this.table === 'onto_goals') {
			return {
				data: {
					id: 'goal-1',
					project_id: 'project-1',
					name: 'Goal name'
				},
				error: null
			};
		}

		if (this.table === 'onto_documents') {
			return {
				data: {
					id: 'document-1',
					project_id: 'project-1',
					title: 'Document title'
				},
				error: null
			};
		}

		return { data: null, error: null };
	}
}

function createSupabaseMock() {
	return {
		rpc: vi.fn(async (fn: string) => {
			if (fn === 'current_actor_has_project_access') {
				return { data: true, error: null };
			}
			return { data: null, error: null };
		}),
		from: (table: string) => new QueryBuilderMock(table)
	};
}

describe('POST /api/onto/mentions/ping', () => {
	const taggedUserId = '11111111-1111-4111-8111-111111111111';

	beforeEach(() => {
		vi.clearAllMocks();
		ensureActorIdMock.mockResolvedValue('actor-current');
		getChangeSourceFromRequestMock.mockReturnValue('chat');
		resolveEligibleProjectMentionUserIdsMock.mockResolvedValue({
			eligibleUserIds: [taggedUserId],
			ineligibleUserIds: []
		});
		notifyEntityMentionsAddedMock.mockResolvedValue({
			notifiedUserIds: [taggedUserId]
		});
	});

	it('sends manual tag notifications for valid recipients', async () => {
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
				supabase: createSupabaseMock() as any,
				safeGetSession: async () => ({
					user: { id: 'user-actor', name: 'DJ', email: 'dj@example.com' }
				})
			}
		} as any);

		expect(response.status).toBe(200);
		expect(resolveEligibleProjectMentionUserIdsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				candidateUserIds: [taggedUserId]
			})
		);
		expect(notifyEntityMentionsAddedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				entityType: 'task',
				entityId: 'task-1',
				mentionedUserIds: [taggedUserId],
				source: 'agent_ping',
				messageSuffix: 'Please review this today.'
			})
		);

		const payload = await response.json();
		expect(payload.success).toBe(true);
		expect(payload.data.notified_user_ids).toEqual([taggedUserId]);
	});

	it('rejects ineligible recipients', async () => {
		resolveEligibleProjectMentionUserIdsMock.mockResolvedValueOnce({
			eligibleUserIds: [],
			ineligibleUserIds: [taggedUserId]
		});

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
				supabase: createSupabaseMock() as any,
				safeGetSession: async () => ({
					user: { id: 'user-actor', name: 'DJ', email: 'dj@example.com' }
				})
			}
		} as any);

		expect(response.status).toBe(400);
		expect(notifyEntityMentionsAddedMock).not.toHaveBeenCalled();
	});
});
