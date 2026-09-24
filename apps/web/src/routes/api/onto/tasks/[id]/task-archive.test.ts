// apps/web/src/routes/api/onto/tasks/[id]/task-archive.test.ts
// Archive keeps a task (deleted_at + archived_at); delete leaves only deleted_at,
// which the privacy purge erases 30 days later. Restore clears both.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const activity = vi.hoisted(() => ({
	logUpdateAsync: vi.fn(),
	logDeleteAsync: vi.fn()
}));

vi.mock('$lib/services/async-activity-logger', () => ({
	...activity,
	getChangeSourceFromRequest: vi.fn(() => 'ui'),
	getChatSessionIdFromRequest: vi.fn(() => null)
}));

vi.mock('$lib/services/ontology/onto-event-sync.service', () => ({
	OntoEventSyncService: vi.fn().mockImplementation(function () {
		return { deleteEvent: vi.fn() };
	})
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn(async () => 'actor-1')
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: vi.fn(async ({ projectId }: { projectId: string }) => ({
		ok: true,
		projectId,
		userId: 'user-1',
		actorId: 'actor-1'
	}))
}));

vi.mock('$lib/server/task-assignment.service', async (importOriginal) => ({
	...(await importOriginal<object>()),
	fetchTaskAssigneesMap: vi.fn(async () => new Map()),
	attachAssigneesToTasks: vi.fn((tasks: unknown[]) => tasks)
}));

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const LONG_AGO = '2026-05-01T00:00:00.000Z';

type Call = {
	table: string;
	action: 'select' | 'update' | null;
	payload?: Record<string, unknown>;
	filters: Array<[string, string, unknown]>;
	orders: Array<[string, unknown]>;
};

function createSupabase(options: {
	taskRow?: Record<string, unknown> | null;
	listRows?: Array<Record<string, unknown>>;
	access?: boolean;
}) {
	const calls: Call[] = [];
	const rpc = vi.fn(async (fn: string) => {
		if (fn === 'ensure_actor_for_user') return { data: 'actor-1', error: null };
		if (fn === 'current_actor_has_project_member_access')
			return { data: options.access ?? true, error: null };
		return { data: null, error: null };
	});

	function from(table: string) {
		const call: Call = { table, action: null, filters: [], orders: [] };
		calls.push(call);
		const execute = async () => {
			if (table === 'onto_tasks' && call.action === 'update') {
				return {
					data: { ...(options.taskRow ?? {}), ...call.payload },
					error: null,
					count: null
				};
			}
			if (table === 'onto_tasks' && options.listRows) {
				return { data: options.listRows, error: null, count: options.listRows.length };
			}
			if (table === 'onto_tasks') {
				const row = options.taskRow ?? null;
				return { data: row, error: row ? null : { code: 'PGRST116' }, count: 1 };
			}
			return { data: [], error: null, count: 0 };
		};
		const builder = {
			select() {
				call.action ??= 'select';
				return builder;
			},
			update(payload: Record<string, unknown>) {
				call.action = 'update';
				call.payload = payload;
				return builder;
			},
			eq(column: string, value: unknown) {
				call.filters.push(['eq', column, value]);
				return builder;
			},
			is(column: string, value: unknown) {
				call.filters.push(['is', column, value]);
				return builder;
			},
			not(column: string, operator: string, value: unknown) {
				call.filters.push([`not.${operator}`, column, value]);
				return builder;
			},
			order(column: string, opts: unknown) {
				call.orders.push([column, opts]);
				return builder;
			},
			range() {
				return builder;
			},
			single: execute,
			maybeSingle: execute,
			then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
				return execute().then(resolve, reject);
			}
		};
		return builder;
	}

	return { supabase: { rpc, from }, calls };
}

function locals(supabase: unknown) {
	return {
		supabase,
		safeGetSession: async () => ({ user: { id: 'user-1' } })
	};
}

function taskRow(overrides: Record<string, unknown> = {}) {
	return {
		id: TASK_ID,
		project_id: PROJECT_ID,
		title: 'Draft the pitch',
		type_key: 'task.default',
		state_key: 'todo',
		start_at: null,
		due_at: null,
		deleted_at: null,
		archived_at: null,
		project: { id: PROJECT_ID, created_by: 'actor-1' },
		...overrides
	};
}

async function callDelete(supabase: unknown, body?: Record<string, unknown>) {
	const { DELETE } = await import('./+server');
	const request = new Request(`http://localhost/api/onto/tasks/${TASK_ID}`, {
		method: 'DELETE',
		...(body
			? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
			: {})
	});
	return DELETE({ params: { id: TASK_ID }, request, locals: locals(supabase) } as any);
}

const taskUpdate = (calls: Call[]) =>
	calls.find((call) => call.table === 'onto_tasks' && call.action === 'update');

describe('task archive, delete and restore', () => {
	beforeEach(() => {
		activity.logUpdateAsync.mockReset();
		activity.logDeleteAsync.mockReset();
	});

	it('archives a live task: deleted_at and archived_at set together, logged like a delete', async () => {
		const { supabase, calls } = createSupabase({ taskRow: taskRow() });

		const response = await callDelete(supabase, { archive: true });

		expect(response.status).toBe(200);
		expect((await response.json()).data.message).toBe('Task archived');
		const update = taskUpdate(calls)!;
		expect(update.payload?.archived_at).toEqual(expect.any(String));
		expect(update.payload?.deleted_at).toBe(update.payload?.archived_at);
		expect(update.filters).toContainEqual(['eq', 'id', TASK_ID]);
		expect(activity.logDeleteAsync).toHaveBeenCalledTimes(1);
	});

	it('deletes a live task without archived_at, so the purge erases it in 30 days', async () => {
		const { supabase, calls } = createSupabase({ taskRow: taskRow() });

		const response = await callDelete(supabase);

		expect(response.status).toBe(200);
		const update = taskUpdate(calls)!;
		expect(update.payload?.deleted_at).toEqual(expect.any(String));
		expect(update.payload?.archived_at).toBeNull();
		expect(activity.logDeleteAsync).toHaveBeenCalledTimes(1);
	});

	it('deletes an archived task: clears archived_at and restarts the 30 days', async () => {
		const { supabase, calls } = createSupabase({
			taskRow: taskRow({ deleted_at: LONG_AGO, archived_at: LONG_AGO })
		});

		const response = await callDelete(supabase);

		expect(response.status).toBe(200);
		const update = taskUpdate(calls)!;
		expect(update.payload?.archived_at).toBeNull();
		expect(Date.parse(update.payload?.deleted_at as string)).toBeGreaterThan(
			Date.parse(LONG_AGO)
		);
		expect(activity.logDeleteAsync).toHaveBeenCalledTimes(1);
	});

	it('refuses to archive an archived task or touch a deleted one', async () => {
		for (const [row, body] of [
			[taskRow({ deleted_at: LONG_AGO, archived_at: LONG_AGO }), { archive: true }],
			[taskRow({ deleted_at: LONG_AGO }), undefined],
			[taskRow({ deleted_at: LONG_AGO }), { archive: true }]
		] as const) {
			const { supabase, calls } = createSupabase({ taskRow: row });
			const response = await callDelete(supabase, body);
			expect(response.status).toBe(404);
			expect(taskUpdate(calls)).toBeUndefined();
		}
		expect(activity.logDeleteAsync).not.toHaveBeenCalled();
	});

	it('needs project write access to archive, like delete', async () => {
		const { supabase, calls } = createSupabase({ taskRow: taskRow(), access: false });

		const response = await callDelete(supabase, { archive: true });

		expect(response.status).toBe(403);
		expect(taskUpdate(calls)).toBeUndefined();
	});

	it('restore clears both deleted_at and archived_at', async () => {
		const { supabase, calls } = createSupabase({
			taskRow: taskRow({ deleted_at: LONG_AGO, archived_at: LONG_AGO })
		});
		const { POST } = await import('./restore/+server');

		const response = await POST({
			params: { id: TASK_ID },
			request: new Request(`http://localhost/api/onto/tasks/${TASK_ID}/restore`, {
				method: 'POST'
			}),
			locals: locals(supabase)
		} as any);

		expect(response.status).toBe(200);
		const update = taskUpdate(calls)!;
		expect(update.payload).toMatchObject({ deleted_at: null, archived_at: null });
		expect(activity.logUpdateAsync).toHaveBeenCalledWith(
			supabase,
			PROJECT_ID,
			'task',
			TASK_ID,
			expect.objectContaining({ deleted_at: LONG_AGO, archived_at: LONG_AGO }),
			expect.objectContaining({ deleted_at: null, archived_at: null }),
			'user-1',
			'ui',
			null
		);
	});

	it('the Archived column lists archived tasks only, newest archive first', async () => {
		const archived = taskRow({ deleted_at: LONG_AGO, archived_at: LONG_AGO });
		const { supabase, calls } = createSupabase({ listRows: [archived] });
		const { GET } = await import('../../projects/[id]/tasks/archived/+server');

		const response = await GET({
			params: { id: PROJECT_ID },
			url: new URL(`http://localhost/api/onto/projects/${PROJECT_ID}/tasks/archived`),
			locals: locals(supabase)
		} as any);

		expect(response.status).toBe(200);
		expect((await response.json()).data).toMatchObject({ total: 1, hasMore: false });
		const query = calls.find((call) => call.table === 'onto_tasks')!;
		expect(query.filters).toEqual(
			expect.arrayContaining([
				['eq', 'project_id', PROJECT_ID],
				['not.is', 'deleted_at', null],
				['not.is', 'archived_at', null]
			])
		);
		expect(query.orders[0]).toEqual(['archived_at', { ascending: false }]);
	});
});
