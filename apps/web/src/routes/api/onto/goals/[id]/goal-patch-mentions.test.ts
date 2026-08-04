// apps/web/src/routes/api/onto/goals/[id]/goal-patch-mentions.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveEntityMentionUserIdsMock = vi.fn();
const notifyEntityMentionsAddedMock = vi.fn();
const assertEntityRefsInProjectMock = vi.fn();
const prepareRelationshipMutationPlanMock = vi.fn();
let capturedGoalUpdatePayload: Record<string, unknown> | null = null;
let capturedRelationshipPlan: Record<string, unknown> | null = null;

vi.mock('$lib/services/async-activity-logger', () => ({
	logUpdateAsync: vi.fn(),
	logDeleteAsync: vi.fn(),
	getChangeSourceFromRequest: vi.fn(() => 'ui'),
	getChatSessionIdFromRequest: vi.fn(() => null)
}));

vi.mock('$lib/services/ontology/auto-organizer.service', () => ({
	AutoOrganizeError: class AutoOrganizeError extends Error {
		status = 400;

		constructor(message: string, status = 400) {
			super(message);
			this.status = status;
		}
	},
	assertEntityRefsInProject: assertEntityRefsInProjectMock,
	prepareRelationshipMutationPlan: prepareRelationshipMutationPlanMock,
	relationshipMutationErrorFromDatabase: vi.fn(() => null)
}));

vi.mock('$lib/server/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: resolveEntityMentionUserIdsMock,
	notifyEntityMentionsAdded: notifyEntityMentionsAddedMock
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

class QueryBuilderMock {
	private action: 'select' | null = null;
	private existingGoal = {
		id: 'goal-1',
		project_id: 'project-1',
		name: 'Goal title',
		goal: 'Goal body',
		description: 'Before description',
		props: {},
		state_key: 'draft',
		type_key: 'goal.default',
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

		return { data: null, error: null };
	}
}

function createSupabaseMock() {
	return {
		rpc: vi.fn(async (fn: string, args?: Record<string, any>) => {
			if (fn === 'ensure_actor_for_user') {
				return { data: 'actor-current', error: null };
			}
			if (fn === 'current_actor_has_project_member_access') {
				return { data: true, error: null };
			}
			if (fn === 'onto_goal_update_atomic') {
				capturedGoalUpdatePayload = args?.p_updates ?? null;
				capturedRelationshipPlan = args?.p_relationship_plan ?? null;
				return {
					data: {
						goal: {
							id: 'goal-1',
							project_id: 'project-1',
							name: 'Goal title',
							goal: 'Goal body',
							description: 'Before description',
							props: {},
							state_key: 'draft',
							type_key: 'goal.default',
							...args?.p_updates
						}
					},
					error: null
				};
			}
			return { data: null, error: null };
		}),
		from: (table: string) => new QueryBuilderMock(table)
	};
}

describe('PATCH /api/onto/goals/[id] mention notifications', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedGoalUpdatePayload = null;
		capturedRelationshipPlan = null;
		assertEntityRefsInProjectMock.mockResolvedValue(undefined);
		prepareRelationshipMutationPlanMock.mockResolvedValue({
			references: [],
			entityContainment: {},
			semantic: [],
			projectEdges: [],
			childContainment: []
		});
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

	it('persists type_key updates from goal edit callers', async () => {
		const { PATCH } = await import('./+server');
		const response = await PATCH({
			params: { id: 'goal-1' },
			request: new Request('http://localhost/api/onto/goals/goal-1', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type_key: 'goal.metric.revenue'
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
		expect(capturedGoalUpdatePayload).toMatchObject({
			type_key: 'goal.metric.revenue'
		});
		expect(capturedRelationshipPlan).toBeNull();
	});

	it('returns 400 when props is not an object', async () => {
		const { PATCH } = await import('./+server');
		const response = await PATCH({
			params: { id: 'goal-1' },
			request: new Request('http://localhost/api/onto/goals/goal-1', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					props: 'not-json-object'
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
		await expect(response.json()).resolves.toMatchObject({
			success: false,
			error: 'props must be an object'
		});
	});

	it('passes a prepared relationship replacement with the row update in one atomic call', async () => {
		const preparedPlan = {
			references: [{ kind: 'plan', id: 'plan-1' }],
			entityContainment: { type: 'containment' },
			semantic: [],
			projectEdges: [],
			childContainment: []
		};
		prepareRelationshipMutationPlanMock.mockResolvedValueOnce(preparedPlan);

		const { PATCH } = await import('./+server');
		const response = await PATCH({
			params: { id: 'goal-1' },
			request: new Request('http://localhost/api/onto/goals/goal-1', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'Updated with relationship',
					connections: [{ kind: 'plan', id: 'plan-1' }]
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
		expect(prepareRelationshipMutationPlanMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				entity: { kind: 'goal', id: 'goal-1' },
				connections: [{ kind: 'plan', id: 'plan-1' }],
				referencesValidated: true
			})
		);
		expect(capturedGoalUpdatePayload).toMatchObject({ name: 'Updated with relationship' });
		expect(capturedRelationshipPlan).toEqual(preparedPlan);
	});

	it('validates relationship references before updating the goal row', async () => {
		const { AutoOrganizeError } = await import('$lib/services/ontology/auto-organizer.service');
		assertEntityRefsInProjectMock.mockRejectedValue(
			new AutoOrganizeError('plan not found', 404)
		);

		const { PATCH } = await import('./+server');
		const response = await PATCH({
			params: { id: 'goal-1' },
			request: new Request('http://localhost/api/onto/goals/goal-1', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'Updated goal title',
					connections: [{ kind: 'plan', id: 'missing-plan' }]
				})
			}),
			locals: {
				supabase: createSupabaseMock() as any,
				safeGetSession: async () => ({
					user: { id: 'user-actor', name: 'DJ', email: 'dj@example.com' }
				})
			}
		} as any);

		expect(response.status).toBe(404);
		expect(assertEntityRefsInProjectMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				refs: [{ kind: 'plan', id: 'missing-plan' }]
			})
		);
		expect(capturedGoalUpdatePayload).toBeNull();
		expect(prepareRelationshipMutationPlanMock).not.toHaveBeenCalled();
	});
});
