// apps/web/src/lib/server/task-archive.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ logDeleteAsync: vi.fn() }));

vi.mock('$lib/services/async-activity-logger', () => ({
	logDeleteAsync: mocks.logDeleteAsync
}));

import { archiveTaskCanonical } from './task-archive.service';

type Row = Record<string, unknown>;

function makeClient(options: { task: Row | null; hasAccess?: boolean; updated?: Row | null }) {
	const updates: Row[] = [];
	const filters: Array<[string, string, unknown]> = [];
	const tables: string[] = [];
	const client = {
		rpc: vi.fn(async (name: string) =>
			name === 'ensure_actor_for_user'
				? { data: 'actor-1', error: null }
				: { data: options.hasAccess ?? true, error: null }
		),
		from: vi.fn((table: string) => {
			tables.push(table);
			let isUpdate = false;
			const builder: any = {
				select: vi.fn(() => builder),
				eq: vi.fn((field: string, value: unknown) => {
					if (isUpdate) filters.push(['eq', field, value]);
					return builder;
				}),
				is: vi.fn((field: string, value: unknown) => {
					if (isUpdate) filters.push(['is', field, value]);
					return builder;
				}),
				update: vi.fn((payload: Row) => {
					isUpdate = true;
					updates.push(payload);
					return builder;
				}),
				maybeSingle: vi.fn(async () => ({
					data: isUpdate
						? options.updated === undefined
							? { id: 'task-1' }
							: options.updated
						: options.task,
					error: null
				}))
			};
			return builder;
		})
	};
	return { client, updates, filters, tables };
}

const liveTask = {
	id: 'task-1',
	project_id: 'project-1',
	title: 'Build referral pipeline',
	type_key: 'task.execute',
	state_key: 'todo',
	start_at: null,
	due_at: '2026-03-01T00:00:00.000Z',
	deleted_at: null
};

describe('archiveTaskCanonical', () => {
	beforeEach(() => vi.clearAllMocks());

	it('sets deleted_at and archived_at together, logs a delete, and leaves events alone', async () => {
		const { client, updates, filters, tables } = makeClient({ task: liveTask });
		const result = await archiveTaskCanonical({
			supabase: client,
			userId: 'user-1',
			taskId: 'task-1',
			projectId: 'project-1',
			changeSource: 'agent_call',
			chatSessionId: 'chat-1'
		});

		expect(result).toEqual({ ok: true, archivedAt: expect.any(String) });
		expect(client.rpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: 'project-1',
			p_required_access: 'write'
		});
		expect(updates).toHaveLength(1);
		const [payload] = updates;
		expect(payload!.deleted_at).toBe(payload!.archived_at);
		expect(payload!.updated_at).toBe(payload!.archived_at);
		expect(filters).toEqual([
			['eq', 'id', 'task-1'],
			['eq', 'project_id', 'project-1'],
			['is', 'deleted_at', null]
		]);
		expect(tables).not.toContain('onto_events');
		expect(mocks.logDeleteAsync).toHaveBeenCalledWith(
			client,
			'project-1',
			'task',
			'task-1',
			{
				title: 'Build referral pipeline',
				type_key: 'task.execute',
				state_key: 'todo',
				start_at: null,
				due_at: '2026-03-01T00:00:00.000Z'
			},
			'user-1',
			'agent_call',
			'chat-1'
		);
	});

	it('skips the actor lookup when the caller already ensured the actor', async () => {
		const { client } = makeClient({ task: liveTask });
		const result = await archiveTaskCanonical({
			supabase: client,
			userId: 'user-1',
			actorId: 'actor-1',
			taskId: 'task-1',
			projectId: 'project-1'
		});
		expect(result.ok).toBe(true);
		expect(client.rpc).not.toHaveBeenCalledWith('ensure_actor_for_user', expect.anything());
	});

	it.each([
		['a missing task', null],
		['a task in another project', { ...liveTask, project_id: 'project-2' }],
		['a deleted task', { ...liveTask, deleted_at: '2026-07-02T00:00:00.000Z' }]
	])('returns 404 without writing for %s', async (_label, task) => {
		const { client, updates } = makeClient({ task });
		const result = await archiveTaskCanonical({
			supabase: client,
			userId: 'user-1',
			taskId: 'task-1',
			projectId: 'project-1'
		});
		expect(result).toMatchObject({ ok: false, status: 404 });
		expect(updates).toHaveLength(0);
		expect(mocks.logDeleteAsync).not.toHaveBeenCalled();
	});

	it('returns 403 without writing when the user lacks write access', async () => {
		const { client, updates } = makeClient({ task: liveTask, hasAccess: false });
		const result = await archiveTaskCanonical({
			supabase: client,
			userId: 'user-1',
			taskId: 'task-1',
			projectId: 'project-1'
		});
		expect(result).toMatchObject({ ok: false, status: 403 });
		expect(updates).toHaveLength(0);
	});

	it('returns 404 when the task was archived concurrently', async () => {
		const { client } = makeClient({ task: liveTask, updated: null });
		const result = await archiveTaskCanonical({
			supabase: client,
			userId: 'user-1',
			taskId: 'task-1',
			projectId: 'project-1'
		});
		expect(result).toMatchObject({ ok: false, status: 404 });
		expect(mocks.logDeleteAsync).not.toHaveBeenCalled();
	});
});
