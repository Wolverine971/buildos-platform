// apps/web/src/routes/api/onto/goals/create/goal-create-mentions.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveEntityMentionUserIdsMock = vi.fn();
const notifyEntityMentionsAddedMock = vi.fn();
const assertEntityRefsInProjectMock = vi.fn();
const prepareRelationshipMutationPlanMock = vi.fn();
let capturedGoalInsertPayload: Record<string, unknown> | null = null;
let capturedRelationshipPlan: Record<string, unknown> | null = null;

vi.mock('$lib/services/async-activity-logger', () => ({
	logCreateAsync: vi.fn(),
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
	private action: 'select' | null = null;

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
			if (fn === 'onto_goal_create_atomic') {
				capturedGoalInsertPayload = args?.p_goal ?? null;
				capturedRelationshipPlan = args?.p_relationship_plan ?? null;
				return {
					data: {
						goal: {
							...args?.p_goal,
							id: 'goal-1'
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

describe('POST /api/onto/goals/create mention notifications', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedGoalInsertPayload = null;
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

	it('normalizes create fields before inserting goal data', async () => {
		const { POST } = await import('./+server');
		const response = await POST({
			request: new Request('http://localhost/api/onto/goals/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: ' project-1 ',
					name: '  Revenue target  ',
					type_key: 'goal.metric.revenue',
					state_key: 'active',
					target_date: '2026-04-30',
					measurement_criteria: '  Signed contracts  ',
					priority: 'high',
					props: { source: 'agentic-chat' }
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
		expect(capturedGoalInsertPayload).toMatchObject({
			project_id: 'project-1',
			name: 'Revenue target',
			type_key: 'goal.metric.revenue',
			state_key: 'active',
			target_date: '2026-04-30T23:59:59.000Z',
			props: {
				source: 'agentic-chat',
				target_date: '2026-04-30T23:59:59.000Z',
				measurement_criteria: 'Signed contracts',
				priority: 'high'
			}
		});
		expect(capturedRelationshipPlan).toMatchObject({
			semantic: [],
			projectEdges: []
		});
	});

	it('returns 400 for invalid target_date before inserting', async () => {
		const { POST } = await import('./+server');
		const response = await POST({
			request: new Request('http://localhost/api/onto/goals/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: 'project-1',
					name: 'Goal with invalid target',
					target_date: '2026-02-30'
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
		expect(capturedGoalInsertPayload).toBeNull();
		await expect(response.json()).resolves.toMatchObject({
			success: false,
			error: expect.stringContaining('target_date')
		});
	});

	it('passes the preplanned relationships and matching generated goal id into one atomic create', async () => {
		const preparedPlan = {
			references: [{ kind: 'plan', id: 'plan-1' }],
			entityContainment: { type: 'containment' },
			semantic: [],
			projectEdges: [],
			childContainment: []
		};
		prepareRelationshipMutationPlanMock.mockResolvedValueOnce(preparedPlan);

		const { POST } = await import('./+server');
		const response = await POST({
			request: new Request('http://localhost/api/onto/goals/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: 'project-1',
					name: 'Connected goal',
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

		expect(response.status).toBe(201);
		expect(assertEntityRefsInProjectMock).toHaveBeenCalledTimes(1);
		expect(prepareRelationshipMutationPlanMock).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'project-1',
				connections: [{ kind: 'plan', id: 'plan-1' }],
				referencesValidated: true
			})
		);
		const generatedGoalId = prepareRelationshipMutationPlanMock.mock.calls[0]?.[0]?.entity?.id;
		expect(generatedGoalId).toEqual(expect.any(String));
		expect(capturedGoalInsertPayload?.id).toBe(generatedGoalId);
		expect(capturedRelationshipPlan).toEqual(preparedPlan);
	});

	it('validates relationship references before inserting the goal', async () => {
		const { AutoOrganizeError } = await import('$lib/services/ontology/auto-organizer.service');
		assertEntityRefsInProjectMock.mockRejectedValue(
			new AutoOrganizeError('plan not found', 404)
		);

		const { POST } = await import('./+server');
		const response = await POST({
			request: new Request('http://localhost/api/onto/goals/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: 'project-1',
					name: 'Goal with invalid connection',
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
		expect(capturedGoalInsertPayload).toBeNull();
		expect(prepareRelationshipMutationPlanMock).not.toHaveBeenCalled();
	});
});
