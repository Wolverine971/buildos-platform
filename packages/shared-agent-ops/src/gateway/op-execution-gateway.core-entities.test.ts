import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const ENTITY_ID = '22222222-2222-4222-8222-222222222222';
const GOAL_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '55555555-5555-4555-8555-555555555555';

const mocks = vi.hoisted(() => ({
	project: {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Fixture project',
		access_level: 'admin',
		access_role: 'owner'
	},
	actorId: '44444444-4444-4444-8444-444444444444',
	insertPayloads: [] as Array<{ table: string; payload: Record<string, unknown> }>,
	updatePayloads: [] as Array<{ table: string; payload: Record<string, unknown> }>,
	existingByKind: new Map<string, Record<string, unknown>>(),
	createOptionalParentEdges: vi.fn(async () => undefined),
	logCreate: vi.fn(async () => undefined),
	logUpdate: vi.fn(async () => undefined),
	resolveMentionUserIds: vi.fn(async () => ['mentioned-user']),
	notifyMentions: vi.fn(async () => undefined)
}));

vi.mock('../ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn(async () => mocks.actorId)
}));

vi.mock('../ops/async-activity-logger', () => ({
	logCreateAsync: mocks.logCreate,
	logUpdateAsync: mocks.logUpdate
}));

vi.mock('../ops/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: mocks.resolveMentionUserIds,
	notifyEntityMentionsAdded: mocks.notifyMentions
}));

vi.mock('./op-execution-gateway.access', () => ({
	assertAccessibleProject: vi.fn(() => mocks.project),
	assertProjectWriteAccess: vi.fn(),
	getProjectIdsForVisibleContext: vi.fn(() => [PROJECT_ID]),
	loadVisibleProjects: vi.fn(async () => ({
		projects: [mocks.project],
		projectMap: new Map([[mocks.project.id, mocks.project]])
	})),
	withProjectName: vi.fn((row: Record<string, unknown>) => row)
}));

vi.mock('./op-execution-gateway.activity', () => ({
	getExternalAgentActivityContext: vi.fn(() => ({}))
}));

vi.mock('./op-execution-gateway.edges', () => ({
	createOptionalParentEdges: mocks.createOptionalParentEdges
}));

vi.mock('./op-execution-gateway.entity-access', () => ({
	loadCoreEntityForAccess: vi.fn(async (_context: unknown, kind: string, id: unknown) => ({
		kind,
		entity:
			mocks.existingByKind.get(kind) ??
			({ id, project_id: mocks.project.id, props: {} } as Record<string, unknown>),
		project: mocks.project,
		projectId: mocks.project.id
	}))
}));

vi.mock('./op-execution-gateway.serializers', () => ({
	serializeExternalEntity: vi.fn((_kind: string, row: Record<string, unknown>) => row)
}));

import {
	createGoal,
	createMilestone,
	createRisk,
	updateGoal,
	updateMilestone,
	updatePlan,
	updateRisk
} from './op-execution-gateway.core-entities';

function createAdmin() {
	return {
		from: vi.fn((table: string) => ({
			insert: (payload: Record<string, unknown>) => {
				mocks.insertPayloads.push({ table, payload });
				return {
					select: () => ({
						single: async () => ({
							data: { id: ENTITY_ID, ...payload },
							error: null
						})
					})
				};
			},
			update: (payload: Record<string, unknown>) => {
				mocks.updatePayloads.push({ table, payload });
				return {
					eq: () => ({
						select: () => ({
							single: async () => ({
								data: {
									...(mocks.existingByKind.get(tableKind(table)) ?? {}),
									...payload
								},
								error: null
							})
						})
					})
				};
			}
		}))
	};
}

function tableKind(table: string): string {
	return table.replace(/^onto_/, '').replace(/s$/, '');
}

function context() {
	return {
		admin: createAdmin(),
		userId: USER_ID,
		scope: {
			mode: 'read_write',
			allowed_ops: [],
			project_ids: [PROJECT_ID],
			write_project_ids: [PROJECT_ID]
		}
	} as never;
}

describe('core entity gateway legacy row parity', () => {
	beforeEach(() => {
		mocks.insertPayloads.length = 0;
		mocks.updatePayloads.length = 0;
		mocks.existingByKind.clear();
		mocks.createOptionalParentEdges.mockClear();
		mocks.logCreate.mockClear();
		mocks.logUpdate.mockClear();
		mocks.resolveMentionUserIds.mockClear();
		mocks.resolveMentionUserIds.mockResolvedValue(['mentioned-user']);
		mocks.notifyMentions.mockClear();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-10T12:00:00.000Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('normalizes goal create fields and preserves the legacy props mirrors', async () => {
		await createGoal(context(), {
			project_id: PROJECT_ID,
			name: '  Ship beta  ',
			type_key: 'not-a-goal-type',
			description: '   ',
			measurement_criteria: '  20 users  ',
			priority: 'high',
			props: { retained: true }
		});

		expect(mocks.insertPayloads).toEqual([
			{
				table: 'onto_goals',
				payload: expect.objectContaining({
					name: 'Ship beta',
					type_key: 'goal.default',
					description: null,
					props: {
						retained: true,
						goal: null,
						description: null,
						target_date: null,
						measurement_criteria: '20 users',
						priority: 'high'
					}
				})
			}
		]);
		expect(mocks.resolveMentionUserIds).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: PROJECT_ID,
				nextTextValues: ['Ship beta', null, null]
			})
		);
		expect(mocks.notifyMentions).toHaveBeenCalledWith(
			expect.objectContaining({
				entityType: 'goal',
				entityId: ENTITY_ID,
				mentionedUserIds: ['mentioned-user'],
				source: 'agent_ping'
			})
		);
	});

	it('mirrors goal updates and diffs mentions against the prior row', async () => {
		mocks.existingByKind.set('goal', {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			name: 'Old goal',
			description: 'Old description',
			type_key: 'goal.outcome.project',
			state_key: 'active',
			props: { retained: true }
		});

		await updateGoal(context(), {
			goal_id: ENTITY_ID,
			name: 'New goal',
			description: '  New description  ',
			state_key: 'achieved',
			target_date: '2026-08-31T23:59:59.000Z'
		});

		expect(mocks.updatePayloads[0]).toMatchObject({
			payload: {
				name: 'New goal',
				description: 'New description',
				state_key: 'achieved',
				completed_at: '2026-08-10T12:00:00.000Z',
				props: {
					retained: true,
					description: 'New description',
					state_key: 'achieved',
					target_date: '2026-08-31T23:59:59.000Z'
				}
			}
		});
		expect(mocks.resolveMentionUserIds).toHaveBeenCalledWith(
			expect.objectContaining({
				nextTextValues: ['New goal', null, 'New description'],
				previousTextValues: ['Old goal', null, 'Old description']
			})
		);
	});

	it('mirrors plan body, description, and dates into merged props on update', async () => {
		mocks.existingByKind.set('plan', {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			name: 'Plan',
			type_key: 'plan.phase.project',
			props: { retained: true }
		});

		await updatePlan(context(), {
			plan_id: ENTITY_ID,
			plan: '  # Steps  ',
			description: '   ',
			start_date: ' 2026-08-11 ',
			end_date: ''
		});

		expect(mocks.updatePayloads[0]).toMatchObject({
			table: 'onto_plans',
			payload: {
				plan: '  # Steps  ',
				description: null,
				props: {
					retained: true,
					plan: '  # Steps  ',
					description: null,
					start_date: '2026-08-11',
					end_date: null
				}
			}
		});
	});

	it('mirrors milestone create state and description while keeping its goal edge', async () => {
		mocks.existingByKind.set('goal', {
			id: GOAL_ID,
			project_id: PROJECT_ID,
			name: 'Goal',
			props: {}
		});

		await createMilestone(context(), {
			project_id: PROJECT_ID,
			goal_id: GOAL_ID,
			title: 'Beta ready',
			state_key: 'in_progress',
			description: '  Validate beta  ',
			props: { retained: true }
		});

		expect(mocks.insertPayloads[0]).toMatchObject({
			table: 'onto_milestones',
			payload: {
				description: 'Validate beta',
				state_key: 'in_progress',
				props: {
					retained: true,
					description: 'Validate beta',
					state_key: 'in_progress'
				}
			}
		});
		expect(mocks.createOptionalParentEdges).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ id: PROJECT_ID }),
			'milestone',
			ENTITY_ID,
			[{ kind: 'goal', id: GOAL_ID, rel: 'has_milestone' }]
		);
	});

	it('sets milestone completion time and merges compatibility props on update', async () => {
		mocks.existingByKind.set('milestone', {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			title: 'Beta ready',
			state_key: 'pending',
			completed_at: null,
			props: { retained: true }
		});

		await updateMilestone(context(), {
			milestone_id: ENTITY_ID,
			state_key: 'completed',
			description: ' Done '
		});

		expect(mocks.updatePayloads[0]).toMatchObject({
			payload: {
				state_key: 'completed',
				completed_at: '2026-08-10T12:00:00.000Z',
				description: 'Done',
				props: {
					retained: true,
					state_key: 'completed',
					description: 'Done'
				}
			}
		});
	});

	it('uses description as risk content and mirrors mitigation fields on create', async () => {
		await createRisk(context(), {
			project_id: PROJECT_ID,
			title: 'Launch slip',
			impact: 'high',
			content: '   ',
			description: '  Vendor delay  ',
			mitigation_strategy: '  Add buffer  ',
			props: { retained: true }
		});

		expect(mocks.insertPayloads[0]).toMatchObject({
			table: 'onto_risks',
			payload: {
				content: 'Vendor delay',
				props: {
					retained: true,
					description: 'Vendor delay',
					mitigation_strategy: 'Add buffer'
				}
			}
		});
	});

	it('clears risk mitigation time and blank compatibility values when state reopens', async () => {
		mocks.existingByKind.set('risk', {
			id: ENTITY_ID,
			project_id: PROJECT_ID,
			title: 'Launch slip',
			state_key: 'mitigated',
			mitigated_at: '2026-08-09T12:00:00.000Z',
			props: { retained: true, owner: 'Sam' }
		});

		await updateRisk(context(), {
			risk_id: ENTITY_ID,
			state_key: 'identified',
			content: ' ',
			description: '',
			mitigation_strategy: '  ',
			owner: null
		});

		expect(mocks.updatePayloads[0]).toMatchObject({
			payload: {
				state_key: 'identified',
				mitigated_at: null,
				content: null,
				props: {
					retained: true,
					description: null,
					mitigation_strategy: null,
					owner: null
				}
			}
		});
	});
});
