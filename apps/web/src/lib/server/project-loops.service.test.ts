// apps/web/src/lib/server/project-loops.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	addQueueJobWithPublicId: vi.fn(),
	isWorkspaceProjectId: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('$lib/server/workspace-guard', () => ({
	isWorkspaceProjectId: mocks.isWorkspaceProjectId
}));

vi.mock('$lib/server/queue-job-id', () => ({
	addQueueJobWithPublicId: mocks.addQueueJobWithPublicId
}));

vi.mock('$lib/config/project-loops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

import { queueProjectLoop, WORKSPACE_NOT_REVIEWABLE } from './project-loops.service';

type Operation = {
	table: string;
	action: 'select' | 'insert' | 'update' | 'delete' | null;
	payload: unknown;
	filters: Array<{ column: string; value: unknown }>;
};

function createSupabaseMock(
	options: {
		active?: { id: string; status: string; started_at: string | null; created_at: string };
		reclaimLost?: boolean;
	} = {}
) {
	const operations: Operation[] = [];
	let projectLoopRunSelectCount = 0;

	class QueryBuilderMock {
		private action: Operation['action'] = null;
		private payload: unknown = null;
		private filters: Array<{ column: string; value: unknown }> = [];

		constructor(private readonly table: string) {}

		select() {
			if (!this.action) this.action = 'select';
			return this;
		}

		insert(payload: unknown) {
			this.action = 'insert';
			this.payload = payload;
			return this;
		}

		delete() {
			this.action = 'delete';
			return this;
		}

		update(payload: unknown) {
			this.action = 'update';
			this.payload = payload;
			return this;
		}

		eq(column: string, value: unknown) {
			this.filters.push({ column, value });
			return this;
		}

		in(column: string, value: unknown) {
			this.filters.push({ column, value });
			return this;
		}

		not(column: string, operator: string, value: unknown) {
			this.filters.push({ column, value: `${operator}:${value}` });
			return this;
		}

		neq(column: string, value: unknown) {
			this.filters.push({ column, value: `neq:${value}` });
			return this;
		}

		is(column: string, value: unknown) {
			return this.eq(column, value);
		}

		order() {
			return this;
		}

		limit() {
			return this;
		}

		throwOnError() {
			return this.resolve().then(({ error }) => {
				if (error) throw error;
				return { data: null, error: null };
			});
		}

		private recordOperation() {
			operations.push({
				table: this.table,
				action: this.action,
				payload: this.payload,
				filters: [...this.filters]
			});
		}

		private resolve() {
			this.recordOperation();

			if (this.table === 'project_loop_runs' && this.action === 'select') {
				projectLoopRunSelectCount += 1;
				return Promise.resolve({
					data:
						projectLoopRunSelectCount === 1
							? (options.active ?? null)
							: { finished_at: null },
					error: null
				});
			}
			if (this.table === 'chat_sessions' && this.action === 'insert') {
				return Promise.resolve({ data: { id: 'chat-1' }, error: null });
			}
			if (this.table === 'chat_sessions_projects' && this.action === 'insert') {
				return Promise.resolve({ data: null, error: null });
			}
			if (this.table === 'project_loop_runs' && this.action === 'insert') {
				return Promise.resolve({ data: { id: 'loop-run-1' }, error: null });
			}
			if (this.table === 'project_loop_runs' && this.action === 'update') {
				return Promise.resolve({
					data: options.reclaimLost ? null : (options.active ?? null),
					error: null
				});
			}

			return Promise.resolve({ data: null, error: null });
		}

		single() {
			return this.resolve();
		}

		maybeSingle() {
			return this.resolve();
		}

		then<TResult1 = any, TResult2 = never>(
			onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return this.resolve().then(onfulfilled, onrejected);
		}
	}

	const supabase = {
		from: vi.fn((table: string) => new QueryBuilderMock(table))
	};

	return { supabase, operations };
}

function findOperation(
	operations: Operation[],
	table: string,
	action: Operation['action']
): Operation | undefined {
	return operations.find((operation) => operation.table === table && operation.action === action);
}

describe('queueProjectLoop', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.isWorkspaceProjectId.mockResolvedValue(false);
		mocks.addQueueJobWithPublicId.mockResolvedValue({
			queueJobId: 'queue-job-1',
			metadata: { runId: 'loop-run-1' }
		});
	});

	it('refuses the Workspace (loose items) without creating a run', async () => {
		const { supabase, operations } = createSupabaseMock();
		mocks.createAdminSupabaseClient.mockReturnValue(supabase);
		mocks.isWorkspaceProjectId.mockResolvedValue(true);

		await expect(
			queueProjectLoop({
				projectId: 'workspace-1',
				userId: 'user-1',
				triggerReason: 'manual'
			})
		).resolves.toEqual({ queued: false, reason: WORKSPACE_NOT_REVIEWABLE });
		expect(mocks.isWorkspaceProjectId).toHaveBeenCalledWith(supabase, 'workspace-1');
		expect(operations.some((operation) => operation.action === 'insert')).toBe(false);
		expect(mocks.addQueueJobWithPublicId).not.toHaveBeenCalled();
	});

	it.each(['manual', 'burst'] as const)(
		'replaces stale running rows for %s triggers',
		async (triggerReason) => {
			const active = {
				id: 'stuck-run',
				status: 'running',
				started_at: '2020-01-01T00:00:00.000Z',
				created_at: '2020-01-01T00:00:00.000Z'
			};
			const { supabase, operations } = createSupabaseMock({ active });
			mocks.createAdminSupabaseClient.mockReturnValue(supabase);
			await expect(
				queueProjectLoop({ projectId: 'project-1', userId: 'user-1', triggerReason })
			).resolves.toMatchObject({ queued: true });
			expect(findOperation(operations, 'project_loop_runs', 'update')?.filters).toEqual(
				expect.arrayContaining([
					{ column: 'id', value: active.id },
					{ column: 'status', value: 'running' },
					{ column: 'started_at', value: active.started_at }
				])
			);
			if (triggerReason === 'burst')
				expect(
					operations.some((op) =>
						op.filters.some((f) => f.column === 'id' && f.value === 'neq:stuck-run')
					)
				).toBe(true);
		}
	);

	it.each(['fresh', 'renewed'])('keeps %s active runs', async (kind) => {
		const { supabase } = createSupabaseMock({
			active: {
				id: 'active-run',
				status: 'running',
				started_at:
					kind === 'fresh' ? new Date().toISOString() : '2020-01-01T00:00:00.000Z',
				created_at: '2020-01-01T00:00:00.000Z'
			},
			reclaimLost: kind === 'renewed'
		});
		mocks.createAdminSupabaseClient.mockReturnValue(supabase);
		await expect(
			queueProjectLoop({ projectId: 'project-1', userId: 'user-1', triggerReason: 'manual' })
		).resolves.toMatchObject({ queued: false, reason: 'already_running' });
		expect(mocks.addQueueJobWithPublicId).not.toHaveBeenCalled();
	});

	it('creates a database-safe project chat session for the loop run', async () => {
		const { supabase, operations } = createSupabaseMock();
		mocks.createAdminSupabaseClient.mockReturnValue(supabase);

		const result = await queueProjectLoop({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'manual'
		});

		expect(result).toEqual({ queued: true, runId: 'loop-run-1', jobId: 'queue-job-1' });
		expect(findOperation(operations, 'chat_sessions', 'insert')?.payload).toMatchObject({
			user_id: 'user-1',
			context_type: 'project',
			entity_id: 'project-1',
			chat_type: 'project',
			title: 'Manual Project Review'
		});
		expect(findOperation(operations, 'project_loop_runs', 'insert')?.payload).toMatchObject({
			project_id: 'project-1',
			user_id: 'user-1',
			trigger_reason: 'manual',
			chat_session_id: 'chat-1'
		});
	});

	it('deletes the unqueued run when queue dedup returns an existing run', async () => {
		const { supabase, operations } = createSupabaseMock();
		mocks.createAdminSupabaseClient.mockReturnValue(supabase);
		mocks.addQueueJobWithPublicId.mockResolvedValue({
			queueJobId: 'queue-job-existing',
			metadata: { runId: 'loop-run-existing', projectId: 'project-1' }
		});

		const result = await queueProjectLoop({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'manual'
		});

		expect(result).toEqual({
			queued: false,
			runId: 'loop-run-existing',
			jobId: 'queue-job-existing',
			reason: 'already_running'
		});

		expect(findOperation(operations, 'project_loop_runs', 'update')).toBeUndefined();
		expect(findOperation(operations, 'project_loop_runs', 'delete')?.filters).toEqual([
			{ column: 'id', value: 'loop-run-1' },
			{ column: 'status', value: 'queued' },
			{ column: 'queue_job_id', value: null }
		]);
		expect(operations).toContainEqual({
			table: 'chat_sessions',
			action: 'update',
			payload: { status: 'archived' },
			filters: [
				{ column: 'id', value: 'chat-1' },
				{ column: 'status', value: 'active' }
			]
		});
	});
	it('discards an unqueued run when queue metadata is missing without returning the deleted id', async () => {
		const { supabase, operations } = createSupabaseMock();
		mocks.createAdminSupabaseClient.mockReturnValue(supabase);
		mocks.addQueueJobWithPublicId.mockResolvedValue({
			queueJobId: 'queue-job-existing',
			metadata: {}
		});
		const result = await queueProjectLoop({
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'manual'
		});
		expect(result).toMatchObject({ queued: false, reason: 'queue_metadata_mismatch' });
		expect(result.runId).toBeUndefined();
		expect(findOperation(operations, 'project_loop_runs', 'delete')).toBeDefined();
		expect(findOperation(operations, 'project_loop_runs', 'update')).toBeUndefined();
	});
});
