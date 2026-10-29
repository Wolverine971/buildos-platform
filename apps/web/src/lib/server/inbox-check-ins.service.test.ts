// apps/web/src/lib/server/inbox-check-ins.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	ensureActorId: vi.fn(),
	runGatewayWriteOp: vi.fn(),
	archiveTaskCanonical: vi.fn(),
	logUpdateAsync: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: mocks.ensureActorId
}));
vi.mock('@buildos/shared-agent-ops/gateway/op-execution-gateway', () => ({
	runGatewayWriteOp: mocks.runGatewayWriteOp
}));
vi.mock('$lib/server/task-archive.service', () => ({
	archiveTaskCanonical: mocks.archiveTaskCanonical
}));
vi.mock('$lib/services/async-activity-logger', () => ({
	logUpdateAsync: mocks.logUpdateAsync
}));

import {
	answerCheckIns,
	buildCheckInChatOpener,
	CheckInChatError,
	countInboxCheckInCards,
	createCheckInChatSession,
	loadInboxCheckIns,
	parseCheckInAnswers,
	resolveCheckInTimeZone
} from './inbox-check-ins.service';

const USER_ID = 'user-1';
const WAYNE = '11111111-1111-4111-8111-111111111111';
const CEO = '22222222-2222-4222-8222-222222222222';
const CADRE = '33333333-3333-4333-8333-333333333333';
const TASK_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TASK_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = new Date('2026-10-29T14:00:00.000Z');

type Filter = [string, string, unknown];
type QueryRecord = {
	table: string;
	action: 'select' | 'insert' | 'update' | 'delete';
	columns: string;
	payload?: unknown;
	filters: Filter[];
	orders: Array<[string, unknown]>;
	limit?: number;
};
type Result = { data: unknown; error: unknown };

function createSupabase(
	handlers: Record<string, (query: QueryRecord) => Result | undefined>,
	rpcHandler?: (fn: string, args: Record<string, unknown>) => Result | undefined
) {
	const queries: QueryRecord[] = [];
	const from = vi.fn((table: string) => {
		const record: QueryRecord = {
			table,
			action: 'select',
			columns: '',
			filters: [],
			orders: []
		};
		queries.push(record);
		const resolve = () => handlers[table]?.(record) ?? { data: null, error: null };
		const filter = (op: string) => (column: string, value?: unknown, extra?: unknown) => {
			record.filters.push([op, column, extra === undefined ? value : [value, extra]]);
			return builder;
		};
		const builder: Record<string, unknown> = {
			select: (columns: string) => {
				if (record.action === 'select') record.columns = columns;
				return builder;
			},
			insert: (payload: unknown) => {
				record.action = 'insert';
				record.payload = payload;
				return builder;
			},
			update: (payload: unknown) => {
				record.action = 'update';
				record.payload = payload;
				return builder;
			},
			delete: () => {
				record.action = 'delete';
				return builder;
			},
			eq: filter('eq'),
			is: filter('is'),
			in: filter('in'),
			lt: filter('lt'),
			gte: filter('gte'),
			not: filter('not'),
			contains: filter('contains'),
			order: (column: string, options: unknown) => {
				record.orders.push([column, options]);
				return builder;
			},
			limit: (value: number) => {
				record.limit = value;
				return builder;
			},
			maybeSingle: () => Promise.resolve(resolve()),
			single: () => Promise.resolve(resolve()),
			then: (
				onFulfilled: (value: Result) => unknown,
				onRejected?: (error: unknown) => unknown
			) => Promise.resolve(resolve()).then(onFulfilled, onRejected)
		};
		return builder;
	});
	const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
		return rpcHandler?.(fn, args) ?? { data: null, error: null };
	});
	return { client: { from, rpc }, queries };
}

function filterValue(query: QueryRecord, op: string, column: string): unknown {
	return query.filters.find(([o, c]) => o === op && c === column)?.[2];
}

function memberRow(project: Record<string, unknown>) {
	return {
		project_id: project.id,
		access: 'admin',
		onto_projects: {
			kind: 'project',
			archived_at: null,
			deleted_at: null,
			...project
		}
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.ensureActorId.mockResolvedValue('actor-1');
});

describe('resolveCheckInTimeZone', () => {
	it('keeps a valid IANA zone and falls back to New York otherwise', () => {
		expect(resolveCheckInTimeZone('America/Los_Angeles')).toBe('America/Los_Angeles');
		expect(resolveCheckInTimeZone('Mars/Olympus')).toBe('America/New_York');
		expect(resolveCheckInTimeZone(null)).toBe('America/New_York');
	});
});

describe('loadInboxCheckIns', () => {
	function wayneTasks() {
		return [
			// Oct 13 in New York.
			{
				id: 'oct13',
				project_id: WAYNE,
				title: 'Follow up with Murtech',
				state_key: 'todo',
				due_at: '2026-10-13T16:00:00+00:00',
				updated_at: '2026-10-28T19:00:00+00:00'
			},
			// 10 PM Oct 7 in New York, already Oct 8 in UTC: belongs to the Oct 7 card.
			{
				id: 'late',
				project_id: WAYNE,
				title: 'Send the route recap',
				state_key: 'todo',
				due_at: '2026-10-08T02:00:00+00:00',
				updated_at: '2026-10-07T12:00:00+00:00'
			},
			{
				id: 'dogs',
				project_id: WAYNE,
				title: 'Call Dauntless Dogs: ask for Casey Fenske',
				state_key: 'todo',
				due_at: '2026-10-07T13:00:00+00:00',
				updated_at: '2026-10-07T12:00:00+00:00'
			},
			{
				id: 'cindy',
				project_id: WAYNE,
				title: "Walk in: Cindy's Hot Shots, ask for John Merson",
				state_key: 'in_progress',
				due_at: '2026-10-07T14:00:00+00:00',
				updated_at: '2026-10-07T12:00:00+00:00'
			}
		];
	}

	it('groups overdue tasks by due day in the viewer’s zone, newest day first', async () => {
		const { client, queries } = createSupabase({
			onto_project_members: () => ({
				data: [
					memberRow({
						id: WAYNE,
						name: 'Wayne Strategies',
						state_key: 'active',
						updated_at: '2026-10-20T01:04:04+00:00'
					})
				],
				error: null
			}),
			onto_tasks: () => ({ data: wayneTasks(), error: null })
		});

		const payload = await loadInboxCheckIns({
			supabase: client,
			userId: USER_ID,
			timeZone: 'America/New_York',
			now: NOW
		});

		expect(payload.today).toBe('2026-10-29');
		expect(payload.card_count).toBe(1);
		expect(payload.task_count).toBe(4);
		const [wayne] = payload.projects;
		expect(wayne).toMatchObject({
			project_id: WAYNE,
			project_name: 'Wayne Strategies',
			quiet: false,
			overdue_count: 4,
			oldest_due_date: '2026-10-07',
			newest_due_date: '2026-10-13',
			truncated: false
		});
		expect(wayne!.groups.map((group) => [group.label, group.task_count])).toEqual([
			['Oct 13', 1],
			['Oct 7', 3]
		]);
		expect(wayne!.groups[1]!.tasks.map((task) => task.id)).toEqual(['dogs', 'cindy', 'late']);

		const members = queries.find((query) => query.table === 'onto_project_members')!;
		expect(filterValue(members, 'eq', 'actor_id')).toBe('actor-1');
		expect(filterValue(members, 'in', 'access')).toEqual(['write', 'admin']);
		expect(filterValue(members, 'in', 'onto_projects.state_key')).toEqual([
			'active',
			'planning'
		]);
		const tasks = queries.find((query) => query.table === 'onto_tasks')!;
		// Overdue = due before today started in New York (same boundary as the Today chip).
		expect(filterValue(tasks, 'lt', 'due_at')).toBe('2026-10-29T04:00:00.000Z');
		expect(filterValue(tasks, 'in', 'state_key')).toEqual(['todo', 'in_progress', 'blocked']);
		expect(filterValue(tasks, 'is', 'archived_at')).toBeNull();
		expect(filterValue(tasks, 'in', 'project_id')).toEqual([WAYNE]);
		// Nothing was old enough to ask about quietness.
		expect(queries.filter((query) => query.table === 'onto_tasks')).toHaveLength(1);
	});

	it('asks "Still on?" only when the project and all its tasks have been still for 45 days', async () => {
		const { client, queries } = createSupabase({
			onto_project_members: () => ({
				data: [
					memberRow({
						id: CEO,
						name: 'BuildOS CEO Training Sprint',
						state_key: 'active',
						updated_at: '2026-07-09T04:43:26+00:00'
					}),
					memberRow({
						id: CADRE,
						name: 'The Cadre',
						state_key: 'planning',
						updated_at: '2026-07-01T00:00:00+00:00'
					})
				],
				error: null
			}),
			onto_tasks: (query) => {
				if (query.columns.startsWith('project_id, updated_at')) {
					// Latest task change per project, newest first.
					return {
						data: [
							{ project_id: CADRE, updated_at: '2026-10-25T00:00:00+00:00' },
							{ project_id: CEO, updated_at: '2026-08-11T19:04:57+00:00' },
							{ project_id: CEO, updated_at: '2026-07-10T00:00:00+00:00' }
						],
						error: null
					};
				}
				return {
					data: [
						{
							id: 'ceo-1',
							project_id: CEO,
							title: 'Attend The Perfect Problem Statement Training',
							state_key: 'todo',
							due_at: '2026-07-10T16:00:00+00:00',
							updated_at: '2026-07-10T00:00:00+00:00'
						},
						{
							id: 'cadre-1',
							project_id: CADRE,
							title: 'Draft the onboarding note',
							state_key: 'todo',
							due_at: '2026-07-11T16:00:00+00:00',
							updated_at: '2026-07-01T00:00:00+00:00'
						}
					],
					error: null
				};
			}
		});

		const payload = await loadInboxCheckIns({
			supabase: client,
			userId: USER_ID,
			timeZone: 'America/New_York',
			now: NOW
		});

		const byId = Object.fromEntries(payload.projects.map((p) => [p.project_id, p]));
		expect(byId[CEO]).toMatchObject({
			quiet: true,
			last_touched_at: '2026-08-11T19:04:57+00:00',
			last_touched_date: '2026-08-11',
			oldest_due_date: '2026-07-10'
		});
		// A task changed last week, so this one is asked task by task.
		expect(byId[CADRE]).toMatchObject({ quiet: false, last_touched_date: '2026-10-24' });

		const activity = queries.filter((query) => query.table === 'onto_tasks')[1]!;
		expect(filterValue(activity, 'in', 'project_id')).toEqual([CADRE, CEO]);
		expect(activity.orders[0]).toEqual(['updated_at', { ascending: false }]);
	});

	it('does not call a project quiet when the activity read fails', async () => {
		const { client } = createSupabase({
			onto_project_members: () => ({
				data: [
					memberRow({
						id: CEO,
						name: 'Sprint',
						state_key: 'active',
						updated_at: '2026-07-09T00:00:00+00:00'
					})
				],
				error: null
			}),
			onto_tasks: (query) =>
				query.columns.startsWith('project_id, updated_at')
					? { data: null, error: { message: 'boom' } }
					: {
							data: [
								{
									id: 'ceo-1',
									project_id: CEO,
									title: 'Old task',
									state_key: 'todo',
									due_at: '2026-07-10T16:00:00+00:00',
									updated_at: '2026-07-10T00:00:00+00:00'
								}
							],
							error: null
						}
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const payload = await loadInboxCheckIns({ supabase: client, userId: USER_ID, now: NOW });

		expect(payload.projects[0]!.quiet).toBe(false);
		warn.mockRestore();
	});

	it('skips paused, workspace and archived projects even if the filter slipped', async () => {
		const { client, queries } = createSupabase({
			onto_project_members: () => ({
				data: [
					memberRow({ id: WAYNE, name: 'Paused', state_key: 'paused' }),
					memberRow({
						id: CEO,
						name: 'Workspace',
						state_key: 'active',
						kind: 'workspace'
					}),
					memberRow({
						id: CADRE,
						name: 'Archived',
						state_key: 'active',
						archived_at: '2026-10-01T00:00:00Z'
					})
				],
				error: null
			})
		});

		const payload = await loadInboxCheckIns({ supabase: client, userId: USER_ID, now: NOW });

		expect(payload.projects).toEqual([]);
		expect(queries.some((query) => query.table === 'onto_tasks')).toBe(false);
	});

	it('caps a project at 40 tasks and says so', async () => {
		const many = Array.from({ length: 45 }, (_, index) => ({
			id: `t${String(index).padStart(2, '0')}`,
			project_id: WAYNE,
			title: `Stop ${index}`,
			state_key: 'todo',
			due_at: '2026-10-07T13:00:00+00:00',
			updated_at: '2026-10-28T00:00:00+00:00'
		}));
		const { client } = createSupabase({
			onto_project_members: () => ({
				data: [
					memberRow({ id: WAYNE, name: 'Wayne', state_key: 'active', updated_at: null })
				],
				error: null
			}),
			onto_tasks: () => ({ data: many, error: null })
		});

		const payload = await loadInboxCheckIns({ supabase: client, userId: USER_ID, now: NOW });

		const [group] = payload.projects[0]!.groups;
		expect(group!.task_count).toBe(45);
		expect(group!.tasks).toHaveLength(40);
		expect(payload.projects[0]!.truncated).toBe(true);
		expect(payload.projects[0]!.overdue_count).toBe(45);
	});
});

describe('countInboxCheckInCards', () => {
	it('counts one card per project with overdue tasks', async () => {
		const { client } = createSupabase({
			onto_project_members: () => ({
				data: [
					memberRow({ id: WAYNE, name: 'Wayne', state_key: 'active' }),
					memberRow({ id: CEO, name: 'Sprint', state_key: 'active' }),
					memberRow({ id: CADRE, name: 'Cadre', state_key: 'planning' })
				],
				error: null
			}),
			onto_tasks: () => ({
				data: [
					{
						id: '1',
						project_id: WAYNE,
						state_key: 'todo',
						due_at: '2026-10-07T13:00:00Z'
					},
					{
						id: '2',
						project_id: WAYNE,
						state_key: 'todo',
						due_at: '2026-10-08T13:00:00Z'
					},
					{
						id: '3',
						project_id: CEO,
						state_key: 'blocked',
						due_at: '2026-07-10T13:00:00Z'
					}
				],
				error: null
			})
		});

		const result = await countInboxCheckInCards({
			supabase: client,
			userId: USER_ID,
			now: NOW
		});

		expect(result).toEqual({ cards: 2, by_project: { [WAYNE]: 1, [CEO]: 1 } });
	});
});

describe('parseCheckInAnswers', () => {
	it('accepts task and project answers', () => {
		const parsed = parseCheckInAnswers({
			answers: [
				{ task_id: TASK_A, answer: 'done' },
				{ task_id: TASK_B, answer: 'move', due_at: '2026-11-02T13:00:00.000Z' },
				{
					task_id: TASK_A,
					answer: 'restore',
					previous: { state_key: 'todo', due_at: '2026-10-07T13:00:00Z', archived: false }
				},
				{ project_id: CEO, project_answer: 'pause' },
				{ project_id: CEO, project_answer: 'restore', previous_state: 'active' }
			]
		});
		expect(parsed.ok).toBe(true);
	});

	it('rejects incomplete or unknown answers', () => {
		expect(parseCheckInAnswers({ answers: [] }).ok).toBe(false);
		expect(parseCheckInAnswers({ answers: [{ task_id: 'nope', answer: 'done' }] }).ok).toBe(
			false
		);
		expect(parseCheckInAnswers({ answers: [{ task_id: TASK_A, answer: 'maybe' }] }).ok).toBe(
			false
		);
		expect(parseCheckInAnswers({ answers: [{ task_id: TASK_A, answer: 'move' }] }).ok).toBe(
			false
		);
		expect(parseCheckInAnswers({ answers: [{ task_id: TASK_A, answer: 'restore' }] }).ok).toBe(
			false
		);
		expect(
			parseCheckInAnswers({
				answers: [{ project_id: CEO, project_answer: 'restore', previous_state: 'gone' }]
			}).ok
		).toBe(false);
		expect(
			parseCheckInAnswers({
				answers: Array.from({ length: 61 }, () => ({ task_id: TASK_A, answer: 'done' }))
			}).ok
		).toBe(false);
	});
});

describe('answerCheckIns', () => {
	const taskSync = { syncTaskEvents: vi.fn() };

	function taskRow(overrides: Record<string, unknown> = {}) {
		return {
			id: TASK_A,
			project_id: WAYNE,
			state_key: 'todo',
			due_at: '2026-10-07T13:00:00+00:00',
			archived_at: null,
			deleted_at: null,
			...overrides
		};
	}

	function gatewayReturns(task: Record<string, unknown>) {
		mocks.runGatewayWriteOp.mockResolvedValueOnce({ ok: true, data: { task } });
	}

	it('marks a task done through the task write gateway, fenced to its project', async () => {
		const { client } = createSupabase({
			onto_tasks: () => ({ data: [taskRow()], error: null })
		});
		gatewayReturns({ ...taskRow(), state_key: 'done' });

		const payload = await answerCheckIns({
			supabase: client,
			userId: USER_ID,
			answers: [{ task_id: TASK_A, answer: 'done' }],
			taskSync: taskSync as any
		});

		expect(mocks.runGatewayWriteOp).toHaveBeenCalledWith(
			expect.objectContaining({
				admin: client,
				userId: USER_ID,
				op: 'onto.task.update',
				args: { task_id: TASK_A, state_key: 'done' },
				scope: expect.objectContaining({
					mode: 'read_write',
					allowed_ops: ['onto.task.update'],
					project_ids: [WAYNE],
					write_project_ids: [WAYNE]
				}),
				taskSync
			})
		);
		expect(payload.results[0]).toEqual({
			kind: 'task',
			task_id: TASK_A,
			answer: 'done',
			ok: true,
			changed: true,
			task: { state_key: 'done', due_at: '2026-10-07T13:00:00+00:00', archived: false },
			previous: { state_key: 'todo', due_at: '2026-10-07T13:00:00+00:00', archived: false }
		});
		expect(payload).toMatchObject({ changed: 1, failed: 0 });
	});

	it('moves a task to the date the client sent', async () => {
		const { client } = createSupabase({
			onto_tasks: () => ({ data: [taskRow()], error: null })
		});
		gatewayReturns({ ...taskRow(), due_at: '2026-11-02T14:00:00+00:00' });

		const payload = await answerCheckIns({
			supabase: client,
			userId: USER_ID,
			answers: [{ task_id: TASK_A, answer: 'move', due_at: '2026-11-02T14:00:00.000Z' }],
			taskSync: taskSync as any
		});

		expect(mocks.runGatewayWriteOp.mock.calls[0]![0].args).toEqual({
			task_id: TASK_A,
			due_at: '2026-11-02T14:00:00.000Z'
		});
		expect(payload.results[0]).toMatchObject({
			ok: true,
			task: { due_at: '2026-11-02T14:00:00+00:00' }
		});
	});

	it('drops a task with the canonical archive and restores it on Undo', async () => {
		mocks.archiveTaskCanonical.mockResolvedValue({
			ok: true,
			archivedAt: '2026-10-29T14:00:00.000Z'
		});
		const { client } = createSupabase({
			onto_tasks: () => ({ data: [taskRow()], error: null })
		});

		const dropped = await answerCheckIns({
			supabase: client,
			userId: USER_ID,
			answers: [{ task_id: TASK_A, answer: 'drop' }],
			taskSync: taskSync as any
		});

		expect(mocks.archiveTaskCanonical).toHaveBeenCalledWith(
			expect.objectContaining({
				supabase: client,
				userId: USER_ID,
				actorId: 'actor-1',
				taskId: TASK_A,
				projectId: WAYNE,
				changeSource: 'form'
			})
		);
		expect(mocks.runGatewayWriteOp).not.toHaveBeenCalled();
		const result = dropped.results[0]!;
		expect(result).toMatchObject({ ok: true, task: { archived: true } });

		// Undo: the task is archived now; put back what the drop returned as `previous`.
		const archivedNow = createSupabase({
			onto_tasks: () => ({
				data: [
					taskRow({
						archived_at: '2026-10-29T14:00:00Z',
						deleted_at: '2026-10-29T14:00:00Z'
					})
				],
				error: null
			})
		});
		gatewayReturns({ ...taskRow(), archived_at: null });
		const restored = await answerCheckIns({
			supabase: archivedNow.client,
			userId: USER_ID,
			answers: [
				{
					task_id: TASK_A,
					answer: 'restore',
					previous: result.ok && result.kind === 'task' ? result.previous : undefined
				}
			],
			taskSync: taskSync as any
		});

		expect(mocks.runGatewayWriteOp.mock.calls[0]![0].args).toEqual({
			task_id: TASK_A,
			archived: false
		});
		expect(restored.results[0]).toMatchObject({
			ok: true,
			changed: true,
			task: { archived: false, state_key: 'todo' }
		});
	});

	it('restores a done task to its earlier state', async () => {
		const { client } = createSupabase({
			onto_tasks: () => ({ data: [taskRow({ state_key: 'done' })], error: null })
		});
		gatewayReturns({ ...taskRow(), state_key: 'in_progress' });

		await answerCheckIns({
			supabase: client,
			userId: USER_ID,
			answers: [
				{
					task_id: TASK_A,
					answer: 'restore',
					previous: {
						state_key: 'in_progress',
						due_at: '2026-10-07T13:00:00Z',
						archived: false
					}
				}
			],
			taskSync: taskSync as any
		});

		expect(mocks.runGatewayWriteOp.mock.calls[0]![0].args).toEqual({
			task_id: TASK_A,
			state_key: 'in_progress'
		});
	});

	it('runs a task’s answers in order: Undo first, then the new answer', async () => {
		const { client } = createSupabase({
			onto_tasks: () => ({ data: [taskRow({ state_key: 'done' })], error: null })
		});
		gatewayReturns({ ...taskRow(), state_key: 'todo' });
		mocks.archiveTaskCanonical.mockResolvedValue({
			ok: true,
			archivedAt: '2026-10-29T14:00:00Z'
		});

		const payload = await answerCheckIns({
			supabase: client,
			userId: USER_ID,
			answers: [
				{
					task_id: TASK_A,
					answer: 'restore',
					previous: { state_key: 'todo', due_at: '2026-10-07T13:00:00Z', archived: false }
				},
				{ task_id: TASK_A, answer: 'drop' }
			],
			taskSync: taskSync as any
		});

		expect(mocks.runGatewayWriteOp.mock.calls[0]![0].args).toEqual({
			task_id: TASK_A,
			state_key: 'todo'
		});
		expect(mocks.archiveTaskCanonical).toHaveBeenCalledTimes(1);
		expect(payload.results.map((result) => result.ok)).toEqual([true, true]);
		expect(payload.results[1]).toMatchObject({
			previous: { state_key: 'todo', archived: false },
			task: { archived: true }
		});
	});

	it('writes nothing when the task already matches, and reports missing tasks', async () => {
		const { client } = createSupabase({
			onto_tasks: () => ({ data: [taskRow({ state_key: 'done' })], error: null })
		});

		const payload = await answerCheckIns({
			supabase: client,
			userId: USER_ID,
			answers: [
				{ task_id: TASK_A, answer: 'done' },
				{ task_id: TASK_B, answer: 'done' }
			],
			taskSync: taskSync as any
		});

		expect(mocks.runGatewayWriteOp).not.toHaveBeenCalled();
		expect(payload.results[0]).toMatchObject({ ok: true, changed: false });
		expect(payload.results[1]).toMatchObject({ ok: false, status: 404 });
		expect(payload).toMatchObject({ changed: 0, failed: 1 });
	});

	it('passes gateway refusals back per answer', async () => {
		const { client } = createSupabase({
			onto_tasks: () => ({ data: [taskRow()], error: null })
		});
		mocks.runGatewayWriteOp.mockResolvedValueOnce({
			ok: false,
			error: { code: 'FORBIDDEN', message: 'Read-only access' }
		});

		const payload = await answerCheckIns({
			supabase: client,
			userId: USER_ID,
			answers: [{ task_id: TASK_A, answer: 'done' }],
			taskSync: taskSync as any
		});

		expect(payload.results[0]).toMatchObject({
			ok: false,
			status: 403,
			error: 'Read-only access'
		});
	});

	it('pauses a project with member write access and can put it back', async () => {
		let projectState = 'active';
		const { client, queries } = createSupabase(
			{
				onto_projects: (query) => {
					if (query.action === 'update') {
						projectState = (query.payload as { state_key: string }).state_key;
						return { data: { id: CEO, state_key: projectState }, error: null };
					}
					return { data: { id: CEO, state_key: projectState }, error: null };
				}
			},
			(fn) =>
				fn === 'current_actor_has_project_member_access'
					? { data: true, error: null }
					: undefined
		);

		const paused = await answerCheckIns({
			supabase: client,
			userId: USER_ID,
			answers: [{ project_id: CEO, project_answer: 'pause' }]
		});

		expect(client.rpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: CEO,
			p_required_access: 'write'
		});
		expect(paused.results[0]).toEqual({
			kind: 'project',
			project_id: CEO,
			project_answer: 'pause',
			ok: true,
			changed: true,
			state_key: 'paused',
			previous_state: 'active'
		});
		expect(mocks.logUpdateAsync).toHaveBeenCalledWith(
			client,
			CEO,
			'project',
			CEO,
			{ state_key: 'active' },
			{ state_key: 'paused' },
			USER_ID,
			'form'
		);

		const restored = await answerCheckIns({
			supabase: client,
			userId: USER_ID,
			answers: [{ project_id: CEO, project_answer: 'restore', previous_state: 'active' }]
		});
		expect(restored.results[0]).toMatchObject({ ok: true, state_key: 'active' });
		expect(queries.filter((query) => query.action === 'update')).toHaveLength(2);
	});

	it('refuses a project answer without write access', async () => {
		const { client, queries } = createSupabase({}, () => ({ data: false, error: null }));

		const payload = await answerCheckIns({
			supabase: client,
			userId: USER_ID,
			answers: [{ project_id: CEO, project_answer: 'finish' }]
		});

		expect(payload.results[0]).toMatchObject({ ok: false, status: 403 });
		expect(queries.some((query) => query.action === 'update')).toBe(false);
	});
});

describe('check-in chat', () => {
	const tasks = [
		{
			id: TASK_A,
			title: 'Call Dauntless Dogs: ask for Casey Fenske',
			state_key: 'todo',
			due_at: '2026-10-07T13:00:00+00:00'
		},
		{
			id: TASK_B,
			title: "Walk in: Cindy's Hot Shots, ask for John Merson",
			state_key: 'todo',
			due_at: '2026-10-07T14:00:00+00:00'
		}
	];

	it('writes a short opener that is true however many were already answered', () => {
		const opener = buildCheckInChatOpener(
			tasks.map((task) => ({ ...task, day: '2026-10-07' })),
			'2026-10-29'
		);
		expect(opener).toBe(
			[
				"2 tasks from your Oct 7 list aren't marked yet:",
				'',
				'- Call Dauntless Dogs: ask for Casey Fenske',
				"- Walk in: Cindy's Hot Shots, ask for John Merson",
				'',
				"How did it go? Tell me what happened and I'll mark what got done, move what didn't, and drop what's off."
			].join('\n')
		);
	});

	it('creates a project chat where the assistant speaks first', async () => {
		const { client, queries } = createSupabase({
			onto_projects: () => ({ data: { id: WAYNE, name: 'Wayne Strategies' }, error: null }),
			onto_tasks: () => ({ data: tasks, error: null }),
			chat_sessions: (query) =>
				query.action === 'insert'
					? { data: { id: 'session-1' }, error: null }
					: { data: null, error: null },
			chat_sessions_projects: () => ({ data: null, error: null }),
			chat_messages: () => ({ data: null, error: null })
		});

		const result = await createCheckInChatSession({
			supabase: client,
			userId: USER_ID,
			projectId: WAYNE,
			taskIds: [TASK_A, TASK_B],
			timeZone: 'America/New_York',
			now: NOW
		});

		expect(result).toEqual({
			chat_session_id: 'session-1',
			context_type: 'project',
			entity_id: WAYNE,
			created: true
		});
		const session = queries.find(
			(query) => query.table === 'chat_sessions' && query.action === 'insert'
		)!.payload as Record<string, any>;
		expect(session).toMatchObject({
			user_id: USER_ID,
			context_type: 'project',
			entity_id: WAYNE,
			chat_type: 'project',
			status: 'active'
		});
		expect(session.agent_metadata).toMatchObject({
			source: 'ai_inbox',
			source_type: 'check_in',
			project_id: WAYNE,
			check_in_key: '2026-10-07',
			check_in_task_ids: [TASK_A, TASK_B],
			focus: { focusType: 'project-wide', projectId: WAYNE }
		});
		const llmText = session.agent_metadata.proposal_context.llm_text as string;
		expect(llmText).toContain('You opened this conversation with the message above');
		expect(llmText).toContain(`- ${TASK_A} — Call Dauntless Dogs`);
		expect(llmText).toContain('ask for one before moving it');

		const link = queries.find((query) => query.table === 'chat_sessions_projects')!;
		expect(link.payload).toMatchObject({ chat_session_id: 'session-1', project_id: WAYNE });
		const message = queries.find((query) => query.table === 'chat_messages')!.payload as Record<
			string,
			any
		>;
		expect(message).toMatchObject({
			session_id: 'session-1',
			role: 'assistant',
			message_type: 'assistant_message',
			metadata: { source: 'ai_inbox', source_type: 'check_in', seed_message: true }
		});
		expect(message.content).toContain("2 tasks from your Oct 7 list aren't marked yet:");
	});

	it('reopens the same card’s chat instead of starting another', async () => {
		const { client, queries } = createSupabase({
			onto_projects: () => ({ data: { id: WAYNE, name: 'Wayne Strategies' }, error: null }),
			onto_tasks: () => ({ data: tasks, error: null }),
			chat_sessions: () => ({ data: { id: 'existing' }, error: null })
		});

		const result = await createCheckInChatSession({
			supabase: client,
			userId: USER_ID,
			projectId: WAYNE,
			taskIds: [TASK_A, TASK_B],
			now: NOW
		});

		expect(result).toMatchObject({ chat_session_id: 'existing', created: false });
		const lookup = queries.find((query) => query.table === 'chat_sessions')!;
		expect(filterValue(lookup, 'contains', 'agent_metadata')).toEqual({
			source: 'ai_inbox',
			source_type: 'check_in',
			project_id: WAYNE,
			check_in_key: '2026-10-07'
		});
		expect(client.rpc).toHaveBeenCalledWith(
			'merge_chat_session_agent_metadata',
			expect.objectContaining({ p_session_id: 'existing' })
		);
		expect(queries.some((query) => query.action === 'insert')).toBe(false);
	});

	it('refuses when every task is already answered', async () => {
		const { client } = createSupabase({
			onto_projects: () => ({ data: { id: WAYNE, name: 'Wayne' }, error: null }),
			onto_tasks: () => ({ data: [{ ...tasks[0], state_key: 'done' }], error: null })
		});

		await expect(
			createCheckInChatSession({
				supabase: client,
				userId: USER_ID,
				projectId: WAYNE,
				taskIds: [TASK_A],
				now: NOW
			})
		).rejects.toMatchObject({ status: 409, code: 'NOTHING_OPEN' });
		expect(CheckInChatError).toBeDefined();
	});
});
