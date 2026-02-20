// apps/web/src/routes/api/onto/goals/[id]/goal-patch-mentions.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveEntityMentionUserIdsMock = vi.fn();
const notifyEntityMentionsAddedMock = vi.fn();

vi.mock('$lib/services/async-activity-logger', () => ({
	logUpdateAsync: vi.fn(),
	logDeleteAsync: vi.fn(),
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

vi.mock('$lib/server/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: resolveEntityMentionUserIdsMock,
	notifyEntityMentionsAdded: notifyEntityMentionsAddedMock
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

class QueryBuilderMock {
	private action: 'select' | 'update' | null = null;
	private updatePayload: Record<string, unknown> | null = null;
	private existingGoal = {
		id: 'goal-1',
		project_id: 'project-1',
		name: 'Goal title',
		goal: 'Goal body',
		description: 'Before description',
		props: {},
		state_key: 'draft',
		project: {
			id: 'project-1',
			name: 'Project One',
			created_by: 'actor-owner'
		}
	};

	constructor(private readonly table: string) {}

	select() {
		if (!this.action) this.action = 'select';
		return this;
	}

	update(payload: Record<string, unknown>) {
		this.action = 'update';
		this.updatePayload = payload;
		return this;
	}

	eq() {
		return this;
	}

	is() {
		return this;
	}

	async single() {
		if (this.table === 'onto_goals' && this.action === 'select') {
			return { data: this.existingGoal, error: null };
		}

		if (this.table === 'onto_goals' && this.action === 'update') {
			return {
				data: {
					...this.existingGoal,
					...this.updatePayload,
					project: undefined
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

describe('PATCH /api/onto/goals/[id] mention notifications', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resolveEntityMentionUserIdsMock.mockResolvedValue(['user-mentioned']);
		notifyEntityMentionsAddedMock.mockResolvedValue({ notifiedUserIds: ['user-mentioned'] });
	});

	it('notifies newly added mentions on goal updates', async () => {
		const { PATCH } = await import('./+server');
		const response = await PATCH({
			params: { id: 'goal-1' },
			request: new Request('http://localhost/api/onto/goals/goal-1', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					description: 'Updated [[user:user-mentioned|Jo]]'
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
		expect(resolveEntityMentionUserIdsMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				projectOwnerActorId: 'actor-owner',
				actorUserId: 'user-actor',
				nextTextValues: ['Goal title', 'Goal body', 'Updated [[user:user-mentioned|Jo]]'],
				previousTextValues: ['Goal title', 'Goal body', 'Before description']
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
