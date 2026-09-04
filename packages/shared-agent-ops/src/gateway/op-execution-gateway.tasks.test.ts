// packages/shared-agent-ops/src/gateway/op-execution-gateway.tasks.test.ts
import { describe, expect, it, vi } from 'vitest';

const { syncCreatedTaskSideEffectsMock, syncUpdatedTaskSideEffectsMock } = vi.hoisted(() => ({
	syncCreatedTaskSideEffectsMock: vi.fn(async () => undefined),
	syncUpdatedTaskSideEffectsMock: vi.fn(async () => undefined)
}));

vi.mock('./op-execution-gateway.activity', () => ({
	syncCreatedTaskSideEffects: syncCreatedTaskSideEffectsMock,
	syncUpdatedTaskSideEffects: syncUpdatedTaskSideEffectsMock
}));

import { createTask, detectNoEffectTaskUpdate, updateTask } from './op-execution-gateway.tasks';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const ASSIGNEE_ACTOR_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const GOAL_ID = '66666666-6666-4666-8666-666666666666';
const MILESTONE_ID = '77777777-7777-4777-8777-777777777777';
const PLAN_ID = '88888888-8888-4888-8888-888888888888';

function projectSummary() {
	return {
		id: PROJECT_ID,
		name: 'Atomic project',
		description: null,
		type_key: 'project.default',
		state_key: 'active',
		props: {},
		created_at: '2026-08-01T00:00:00.000Z',
		updated_at: '2026-08-01T00:00:00.000Z',
		task_count: 1,
		goal_count: 1,
		plan_count: 1,
		document_count: 0,
		owner_actor_id: OWNER_ACTOR_ID,
		access_role: 'owner',
		access_level: 'admin',
		is_shared: false
	};
}

describe('detectNoEffectTaskUpdate', () => {
	const existingTask = {
		id: '33333333-3333-4333-8333-333333333333',
		title: 'Existing task',
		description: null,
		type_key: 'task.default',
		state_key: 'todo',
		priority: 2,
		start_at: '2026-08-09T12:00:00.000Z',
		due_at: null,
		props: { retained: true }
	};

	it('detects scalar echoes with trimmed text and equivalent timestamps', () => {
		expect(
			detectNoEffectTaskUpdate(
				existingTask,
				{
					title: ' Existing task ',
					start_at: '2026-08-09T08:00:00-04:00',
					updated_at: 'ignored'
				},
				['title', 'start_at']
			)
		).toEqual({
			noEffect: true,
			comparedFields: ['title', 'start_at'],
			taskTitle: 'Existing task'
		});
	});

	it('allows a scalar update when at least one value changes', () => {
		expect(
			detectNoEffectTaskUpdate(
				existingTask,
				{ title: 'Existing task', state_key: 'in_progress' },
				['title', 'state_key']
			)
		).toMatchObject({ noEffect: false, comparedFields: ['title', 'state_key'] });
	});

	it('skips deep props and archival comparisons like the legacy executor', () => {
		expect(
			detectNoEffectTaskUpdate(existingTask, { props: existingTask.props }, ['props'])
		).toEqual({ noEffect: false, comparedFields: [] });
		expect(detectNoEffectTaskUpdate(existingTask, { archived_at: null }, ['archived'])).toEqual(
			{ noEffect: false, comparedFields: [] }
		);
	});
});

describe('createTask atomic idempotent surface', () => {
	it('commits the task, assignees, and relationships with the stable downstream key', async () => {
		syncCreatedTaskSideEffectsMock.mockClear();
		let createdTaskId = '';
		const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
			if (name === 'ensure_actor_for_user') return { data: OWNER_ACTOR_ID, error: null };
			if (name === 'get_onto_project_summaries_v1') {
				return { data: [projectSummary()], error: null };
			}
			if (name === 'onto_task_create_with_relationships_atomic') {
				const task = args?.p_task as Record<string, unknown>;
				createdTaskId = String(task.id);
				return {
					data: {
						task: {
							...task,
							idempotency_key: 'chat-effect:stable-create',
							created_at: '2026-08-10T12:00:00.000Z',
							updated_at: '2026-08-10T12:00:00.000Z'
						},
						added_actor_ids: [ASSIGNEE_ACTOR_ID],
						idempotent_replay: false
					},
					error: null
				};
			}
			throw new Error(`unexpected rpc ${name}`);
		});

		class Query {
			constructor(private readonly table: string) {}
			select() {
				return this;
			}
			eq() {
				return this;
			}
			in() {
				return this;
			}
			is() {
				return this;
			}
			order() {
				return this;
			}
			then<TResult1 = unknown, TResult2 = never>(
				onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
				onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
			) {
				let result: { data: unknown[]; error: null };
				if (this.table === 'onto_project_members') {
					result = {
						data: [
							{
								actor_id: ASSIGNEE_ACTOR_ID,
								actor: {
									id: ASSIGNEE_ACTOR_ID,
									user_id: 'assignee-user',
									name: 'Sam Person',
									email: 'sam@example.com'
								}
							}
						],
						error: null
					};
				} else if (this.table === 'onto_plans') {
					result = { data: [{ id: PLAN_ID }], error: null };
				} else if (this.table === 'onto_milestones') {
					result = { data: [{ id: MILESTONE_ID }], error: null };
				} else if (this.table === 'onto_task_assignees') {
					result = {
						data: [
							{
								created_at: '2026-08-10T12:00:00.000Z',
								assignee: {
									id: ASSIGNEE_ACTOR_ID,
									user_id: 'assignee-user',
									name: 'Sam Person',
									email: 'sam@example.com'
								}
							}
						],
						error: null
					};
				} else {
					throw new Error(`unexpected awaited table ${this.table}`);
				}
				return Promise.resolve(result).then(onfulfilled, onrejected);
			}
		}

		const admin = { rpc, from: vi.fn((table: string) => new Query(table)) };
		const result = await createTask(
			{
				admin,
				userId: USER_ID,
				downstreamIdempotencyKey: 'chat-effect:stable-create',
				scope: {
					mode: 'read_write',
					allowed_ops: ['onto.task.create'],
					project_ids: [PROJECT_ID],
					write_project_ids: [PROJECT_ID]
				}
			} as never,
			{
				project_id: PROJECT_ID,
				title: 'Atomic create',
				assignee_handles: ['@sam'],
				plan_id: PLAN_ID,
				supporting_milestone_id: MILESTONE_ID,
				props: { retained: true }
			}
		);

		const atomicCall = rpc.mock.calls.find(
			([name]) => name === 'onto_task_create_with_relationships_atomic'
		);
		expect(createdTaskId).toMatch(/^[0-9a-f-]{36}$/);
		expect(atomicCall?.[1]).toMatchObject({
			p_sync_assignees: true,
			p_assignee_actor_ids: [ASSIGNEE_ACTOR_ID],
			p_assigned_by_actor_id: OWNER_ACTOR_ID,
			p_source: 'manual',
			p_idempotency_key: 'chat-effect:stable-create',
			p_task: {
				id: createdTaskId,
				project_id: PROJECT_ID,
				title: 'Atomic create',
				priority: 3,
				props: {
					retained: true,
					supporting_milestone_id: MILESTONE_ID
				}
			}
		});
		expect(atomicCall?.[1]?.p_relationship_plan).toMatchObject({
			entityContainment: { child: { kind: 'task', id: createdTaskId } },
			semantic: expect.arrayContaining([
				expect.objectContaining({
					entity: { kind: 'task', id: createdTaskId },
					rel: 'targets_milestone'
				})
			])
		});
		expect(syncCreatedTaskSideEffectsMock).toHaveBeenCalledWith(
			expect.objectContaining({ addedAssigneeActorIds: [ASSIGNEE_ACTOR_ID] })
		);
		expect(result).toMatchObject({
			task: {
				id: createdTaskId,
				project_id: PROJECT_ID,
				assignees: [expect.objectContaining({ actor_id: ASSIGNEE_ACTOR_ID })]
			}
		});
		expect(result.task).not.toHaveProperty('idempotency_key');
	});

	it('returns the existing task without replaying post-commit side effects', async () => {
		syncCreatedTaskSideEffectsMock.mockClear();
		const existing = {
			id: TASK_ID,
			project_id: PROJECT_ID,
			title: 'Existing task',
			props: {}
		};
		const admin = {
			rpc: vi.fn(async (name: string) => {
				if (name === 'get_onto_project_summaries_v1') {
					return { data: [projectSummary()], error: null };
				}
				if (name === 'ensure_actor_for_user') return { data: OWNER_ACTOR_ID, error: null };
				if (name === 'onto_task_create_with_relationships_atomic') {
					return {
						data: { task: existing, added_actor_ids: [], idempotent_replay: true },
						error: null
					};
				}
				throw new Error(`unexpected rpc ${name}`);
			}),
			from: vi.fn(() => ({
				select: () => ({
					eq: () => ({
						eq: () => ({
							order: async () => ({ data: [], error: null })
						})
					})
				})
			}))
		};

		await expect(
			createTask(
				{
					admin,
					userId: USER_ID,
					downstreamIdempotencyKey: 'chat-effect:stable-create',
					scope: {
						mode: 'read_write',
						allowed_ops: ['onto.task.create'],
						project_ids: [PROJECT_ID],
						write_project_ids: [PROJECT_ID]
					}
				} as never,
				{ project_id: PROJECT_ID, title: 'Existing task' }
			)
		).resolves.toMatchObject({ task: { id: TASK_ID, assignees: [] } });
		expect(syncCreatedTaskSideEffectsMock).not.toHaveBeenCalled();
	});
});

describe('updateTask atomic relationship surface', () => {
	it('commits assignees plus goal/milestone plans through one RPC and returns enrichment', async () => {
		syncUpdatedTaskSideEffectsMock.mockClear();
		const existingTask = {
			id: TASK_ID,
			project_id: PROJECT_ID,
			title: 'Original task',
			description: 'Original description',
			type_key: 'task.default',
			state_key: 'todo',
			priority: 2,
			start_at: null,
			due_at: null,
			completed_at: null,
			props: { retained: true },
			created_at: '2026-08-01T00:00:00.000Z',
			updated_at: '2026-08-01T00:00:00.000Z',
			archived_at: null
		};
		const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
			if (name === 'ensure_actor_for_user') return { data: OWNER_ACTOR_ID, error: null };
			if (name === 'get_onto_project_summaries_v1') {
				return {
					data: [
						{
							id: PROJECT_ID,
							name: 'Atomic project',
							description: null,
							type_key: 'project.default',
							state_key: 'active',
							props: {},
							created_at: '2026-08-01T00:00:00.000Z',
							updated_at: '2026-08-01T00:00:00.000Z',
							task_count: 1,
							goal_count: 1,
							plan_count: 0,
							document_count: 0,
							owner_actor_id: OWNER_ACTOR_ID,
							access_role: 'owner',
							access_level: 'admin',
							is_shared: false
						}
					],
					error: null
				};
			}
			if (name === 'onto_task_update_with_relationships_atomic') {
				const updates = args?.p_updates as Record<string, unknown>;
				return {
					data: {
						task: { ...existingTask, ...updates, title: 'Atomic update' },
						added_actor_ids: [ASSIGNEE_ACTOR_ID]
					},
					error: null
				};
			}
			throw new Error(`unexpected rpc ${name}`);
		});

		class Query {
			constructor(private readonly table: string) {}
			select() {
				return this;
			}
			eq() {
				return this;
			}
			in() {
				return this;
			}
			is() {
				return this;
			}
			order() {
				return this;
			}
			async maybeSingle() {
				if (this.table !== 'onto_tasks')
					throw new Error(`unexpected maybeSingle ${this.table}`);
				return { data: existingTask, error: null };
			}
			then<TResult1 = unknown, TResult2 = never>(
				onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
				onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
			) {
				let result: { data: unknown[]; error: null };
				if (this.table === 'onto_project_members') {
					result = {
						data: [
							{
								actor_id: ASSIGNEE_ACTOR_ID,
								actor: {
									id: ASSIGNEE_ACTOR_ID,
									user_id: 'assignee-user',
									name: 'Sam Person',
									email: 'sam@example.com'
								}
							}
						],
						error: null
					};
				} else if (this.table === 'onto_goals') {
					result = { data: [{ id: GOAL_ID }], error: null };
				} else if (this.table === 'onto_milestones') {
					result = { data: [{ id: MILESTONE_ID }], error: null };
				} else if (this.table === 'onto_task_assignees') {
					result = {
						data: [
							{
								created_at: '2026-08-10T12:00:00.000Z',
								assignee: {
									id: ASSIGNEE_ACTOR_ID,
									user_id: 'assignee-user',
									name: 'Sam Person',
									email: 'sam@example.com'
								}
							}
						],
						error: null
					};
				} else {
					throw new Error(`unexpected awaited table ${this.table}`);
				}
				return Promise.resolve(result).then(onfulfilled, onrejected);
			}
		}

		const admin = {
			rpc,
			from: vi.fn((table: string) => new Query(table))
		};
		const result = await updateTask(
			{
				admin,
				userId: USER_ID,
				scope: {
					mode: 'read_write',
					allowed_ops: ['onto.task.update'],
					project_ids: [PROJECT_ID],
					write_project_ids: [PROJECT_ID]
				}
			} as never,
			{
				task_id: TASK_ID,
				title: 'Atomic update',
				assignee_handles: ['@sam'],
				goal_id: GOAL_ID,
				supporting_milestone_id: MILESTONE_ID
			}
		);

		const atomicCall = rpc.mock.calls.find(
			([name]) => name === 'onto_task_update_with_relationships_atomic'
		);
		expect(atomicCall?.[1]).toMatchObject({
			p_task_id: TASK_ID,
			p_sync_assignees: true,
			p_assignee_actor_ids: [ASSIGNEE_ACTOR_ID],
			p_assigned_by_actor_id: OWNER_ACTOR_ID,
			p_source: 'manual',
			p_updates: {
				title: 'Atomic update',
				props: {
					retained: true,
					goal_id: GOAL_ID,
					supporting_milestone_id: MILESTONE_ID
				}
			}
		});
		expect(atomicCall?.[1]?.p_relationship_plan).toMatchObject({
			entityContainment: { child: { kind: 'task', id: TASK_ID } },
			semantic: expect.arrayContaining([
				expect.objectContaining({
					entity: { kind: 'task', id: TASK_ID },
					rel: 'targets_milestone'
				})
			])
		});
		expect(syncUpdatedTaskSideEffectsMock).toHaveBeenCalledWith(
			expect.objectContaining({ addedAssigneeActorIds: [ASSIGNEE_ACTOR_ID] })
		);
		expect(result).toMatchObject({
			task: {
				id: TASK_ID,
				project_id: PROJECT_ID,
				title: 'Atomic update',
				assignees: [
					expect.objectContaining({ actor_id: ASSIGNEE_ACTOR_ID, name: 'Sam Person' })
				]
			}
		});
	});
});

describe('createTask civil-date normalization', () => {
	function adminFor(timezoneRow: { timezone?: string } | null, capture: { task?: any }) {
		const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
			if (name === 'ensure_actor_for_user') return { data: OWNER_ACTOR_ID, error: null };
			if (name === 'get_onto_project_summaries_v1') {
				return { data: [projectSummary()], error: null };
			}
			if (name === 'onto_task_create_with_relationships_atomic') {
				capture.task = args?.p_task as Record<string, unknown>;
				return {
					data: {
						task: { ...capture.task },
						added_actor_ids: [],
						idempotent_replay: false
					},
					error: null
				};
			}
			throw new Error(`unexpected rpc ${name}`);
		});

		const from = vi.fn((table: string) => {
			if (table === 'users') {
				return {
					select: () => ({
						eq: () => ({
							maybeSingle: async () => ({ data: timezoneRow, error: null })
						})
					})
				};
			}
			// Assignee enrichment read.
			return {
				select: () => ({
					eq: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) })
				})
			};
		});

		return { rpc, from };
	}

	function contextFor(admin: unknown) {
		return {
			admin,
			userId: USER_ID,
			scope: {
				mode: 'read_write',
				allowed_ops: ['onto.task.create'],
				project_ids: [PROJECT_ID],
				write_project_ids: [PROJECT_ID]
			}
		} as never;
	}

	it('resolves a date-only due_at to the end of that civil day in the user timezone', async () => {
		const capture: { task?: any } = {};
		const admin = adminFor({ timezone: 'America/New_York' }, capture);

		await createTask(contextFor(admin), {
			project_id: PROJECT_ID,
			title: 'Ship it',
			due_at: '2026-09-18'
		});

		// Previously the gateway stored the raw "2026-09-18", which Postgres read
		// as midnight UTC — Sept 17, 8:00 PM in New York.
		expect(capture.task?.due_at).toBe('2026-09-19T03:59:59.000Z');
		expect(admin.from).toHaveBeenCalledWith('users');
	});

	it('resolves a date-only start_at to the start of that civil day', async () => {
		const capture: { task?: any } = {};
		const admin = adminFor({ timezone: 'America/New_York' }, capture);

		await createTask(contextFor(admin), {
			project_id: PROJECT_ID,
			title: 'Ship it',
			start_at: '2026-09-18'
		});

		expect(capture.task?.start_at).toBe('2026-09-18T04:00:00.000Z');
	});

	it('falls back to UTC when the user has no usable timezone', async () => {
		const capture: { task?: any } = {};
		const admin = adminFor(null, capture);

		await createTask(contextFor(admin), {
			project_id: PROJECT_ID,
			title: 'Ship it',
			due_at: '2026-09-18'
		});

		expect(capture.task?.due_at).toBe('2026-09-18T23:59:59.000Z');
	});

	it('passes a full datetime through without reading the user timezone', async () => {
		const capture: { task?: any } = {};
		const admin = adminFor({ timezone: 'America/New_York' }, capture);

		await createTask(contextFor(admin), {
			project_id: PROJECT_ID,
			title: 'Ship it',
			due_at: '2026-09-18T17:00:00.000Z'
		});

		expect(capture.task?.due_at).toBe('2026-09-18T17:00:00.000Z');
		expect(admin.from).not.toHaveBeenCalledWith('users');
	});

	it('rejects an unusable date', async () => {
		const capture: { task?: any } = {};
		const admin = adminFor({ timezone: 'America/New_York' }, capture);

		await expect(
			createTask(contextFor(admin), {
				project_id: PROJECT_ID,
				title: 'Ship it',
				due_at: 'next tuesday'
			})
		).rejects.toThrow(/due_at must be a valid ISO date/);
	});

	it('passes calendar_sync: none through to the side-effect layer', async () => {
		const capture: { task?: any } = {};
		const admin = adminFor({ timezone: 'America/New_York' }, capture);
		syncCreatedTaskSideEffectsMock.mockClear();
		syncCreatedTaskSideEffectsMock.mockResolvedValue({ calendar_sync: 'skipped' } as never);

		const result = await createTask(contextFor(admin), {
			project_id: PROJECT_ID,
			title: 'Ship it',
			due_at: '2026-09-18',
			calendar_sync: 'none'
		});

		expect(syncCreatedTaskSideEffectsMock).toHaveBeenCalledWith(
			expect.objectContaining({ calendarSync: 'none' })
		);
		expect(result).toMatchObject({ calendar_sync: 'skipped' });
		syncCreatedTaskSideEffectsMock.mockResolvedValue(undefined as never);
	});

	it('rejects an unknown calendar_sync value', async () => {
		const capture: { task?: any } = {};
		const admin = adminFor({ timezone: 'America/New_York' }, capture);

		await expect(
			createTask(contextFor(admin), {
				project_id: PROJECT_ID,
				title: 'Ship it',
				calendar_sync: 'off'
			})
		).rejects.toThrow(/calendar_sync must be one of: auto, none/);
	});
});
