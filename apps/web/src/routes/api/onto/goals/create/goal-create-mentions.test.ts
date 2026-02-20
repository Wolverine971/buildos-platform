// apps/web/src/routes/api/onto/goals/create/goal-create-mentions.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveEntityMentionUserIdsMock = vi.fn();
const notifyEntityMentionsAddedMock = vi.fn();

vi.mock('$lib/services/async-activity-logger', () => ({
	logCreateAsync: vi.fn(),
	getChangeSourceFromRequest: vi.fn(() => 'ui'),
	getChatSessionIdFromRequest: vi.fn(() => null)
}));

vi.mock('$lib/services/ontology/auto-organizer.service', () => ({
	AutoOrganizeError: class AutoOrganizeError extends Error {
		status = 400;
	},
	autoOrganizeConnections: vi.fn(),
	assertEntityRefsInProject: vi.fn()
}));

vi.mock('$lib/server/ontology-classification.service', () => ({
	classifyOntologyEntity: vi.fn()
}));

vi.mock('$lib/server/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: resolveEntityMentionUserIdsMock,
	notifyEntityMentionsAdded: notifyEntityMentionsAddedMock
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

class QueryBuilderMock {
	private action: 'select' | 'insert' | null = null;
	private insertPayload: Record<string, unknown> | null = null;

	constructor(private readonly table: string) {}

	select() {
		if (!this.action) this.action = 'select';
		return this;
	}

	insert(payload: Record<string, unknown>) {
		this.action = 'insert';
		this.insertPayload = payload;
		return this;
	}

	eq() {
		return this;
	}

	is() {
		return this;
	}

	async single() {
		if (this.table === 'onto_projects' && this.action === 'select') {
			return {
				data: {
					id: 'project-1',
					name: 'Project One',
					created_by: 'actor-owner'
				},
				error: null
			};
		}

		if (this.table === 'onto_goals' && this.action === 'insert') {
			return {
				data: {
					id: 'goal-1',
					project_id: this.insertPayload?.project_id,
					name: this.insertPayload?.name,
					goal: this.insertPayload?.goal,
					description: this.insertPayload?.description,
					type_key: 'goal.default',
					state_key: this.insertPayload?.state_key ?? 'draft'
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
			if (fn === 'ensure_actor_for_user') {
				return { data: 'actor-current', error: null };
			}
			if (fn === 'current_actor_has_project_access') {
				return { data: true, error: null };
			}
			return { data: null, error: null };
		}),
		from: (table: string) => new QueryBuilderMock(table)
	};
}

describe('POST /api/onto/goals/create mention notifications', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resolveEntityMentionUserIdsMock.mockResolvedValue(['user-mentioned']);
		notifyEntityMentionsAddedMock.mockResolvedValue({ notifiedUserIds: ['user-mentioned'] });
	});

	it('creates mention notifications for tagged users', async () => {
		const { POST } = await import('./+server');
		const response = await POST({
			request: new Request('http://localhost/api/onto/goals/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: 'project-1',
					name: 'Goal title',
					goal: 'Ship to [[user:user-mentioned|Jo]]',
					description: 'Description text'
				})
			}),
			locals: {
				supabase: createSupabaseMock() as any,
				safeGetSession: async () => ({
					user: { id: 'user-actor', name: 'DJ', email: 'dj@example.com' }
				})
			}
		} as any);

		expect(response.status).toBe(201);
		expect(resolveEntityMentionUserIdsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				projectOwnerActorId: 'actor-owner',
				actorUserId: 'user-actor',
				nextTextValues: [
					'Goal title',
					'Ship to [[user:user-mentioned|Jo]]',
					'Description text'
				]
			})
		);
		expect(notifyEntityMentionsAddedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				projectName: 'Project One',
				entityType: 'goal',
				entityId: 'goal-1',
				entityTitle: 'Goal title',
				actorUserId: 'user-actor',
				mentionedUserIds: ['user-mentioned']
			})
		);
	});
});
