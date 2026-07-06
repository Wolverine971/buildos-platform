// apps/web/src/lib/server/project-loops.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	addQueueJobWithPublicId: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

vi.mock('$lib/server/queue-job-id', () => ({
	addQueueJobWithPublicId: mocks.addQueueJobWithPublicId
}));

vi.mock('$lib/config/project-loops', () => ({
	PROJECT_LOOPS_ENABLED: true
}));

import { queueProjectLoop } from './project-loops.service';

type Operation = {
	table: string;
	action: 'select' | 'insert' | 'update' | null;
	payload: unknown;
	filters: Array<{ column: string; value: unknown }>;
};

function createSupabaseMock() {
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
					data: projectLoopRunSelectCount === 1 ? null : { finished_at: null },
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
				return Promise.resolve({ data: null, error: null });
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
		mocks.addQueueJobWithPublicId.mockResolvedValue({
			queueJobId: 'queue-job-1',
			metadata: { runId: 'loop-run-1' }
		});
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

	it('fails a freshly-created run when queue dedup returns an existing run', async () => {
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

		const failedRunUpdate = operations.find(
			(operation) =>
				operation.table === 'project_loop_runs' &&
				operation.action === 'update' &&
				(operation.payload as Record<string, unknown>).status === 'failed'
		);
		expect(failedRunUpdate?.payload).toMatchObject({
			status: 'failed',
			error_message:
				'Deduplicated onto active project loop job queue-job-existing for run loop-run-existing'
		});
		expect(failedRunUpdate?.filters).toEqual([
			{ column: 'id', value: 'loop-run-1' },
			{ column: 'status', value: 'queued' }
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
});
