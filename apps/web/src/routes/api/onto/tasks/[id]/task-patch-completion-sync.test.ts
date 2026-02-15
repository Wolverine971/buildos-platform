// apps/web/src/routes/api/onto/tasks/[id]/task-patch-completion-sync.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncTaskEventsMock = vi.fn();

vi.mock('$lib/services/ontology/task-event-sync.service', () => ({
	TaskEventSyncService: vi.fn().mockImplementation(() => ({
		syncTaskEvents: syncTaskEventsMock
	}))
}));

vi.mock('$lib/services/async-activity-logger', () => ({
	logUpdateAsync: vi.fn(),
	logDeleteAsync: vi.fn(),
	getChangeSourceFromRequest: vi.fn(() => 'ui'),
	getChatSessionIdFromRequest: vi.fn(() => null)
}));

class QueryBuilderMock {
	private action: 'select' | 'update' | null = null;
	private updatePayload: Record<string, unknown> | null = null;
	private filters: Record<string, unknown> = {};

	constructor(
		private readonly table: string,
		private readonly fixtures: {
			existingTask: any;
			updatedTask?: any;
		}
	) {}

	select() {
		if (!this.action) this.action = 'select';
		return this;
	}

	update(payload: Record<string, unknown>) {
		this.action = 'update';
		this.updatePayload = payload;
		return this;
	}

	eq(column: string, value: unknown) {
		this.filters[column] = value;
		return this;
	}

	is(column: string, value: unknown) {
		this.filters[column] = value;
		return this;
	}

	async single() {
		const result = await this.execute();
		return { data: result.data ?? null, error: result.error ?? null };
	}

	private async execute(): Promise<{ data?: any; error?: any }> {
		if (this.table !== 'onto_tasks') {
			return { data: null, error: null };
		}

		if (this.action === 'select') {
			return { data: this.fixtures.existingTask, error: null };
		}

		if (this.action === 'update') {
			return {
				data: this.fixtures.updatedTask ?? {
					...this.fixtures.existingTask,
					...this.updatePayload
				},
				error: null
			};
		}

		return { data: null, error: null };
	}
}

function createSupabaseMock(fixtures: { existingTask: any; updatedTask?: any }) {
	return {
		rpc: vi.fn(async (fn: string) => {
			if (fn === 'ensure_actor_for_user') {
				return { data: 'actor1', error: null };
			}
			if (fn === 'current_actor_has_project_access') {
				return { data: true, error: null };
			}
			return { data: null, error: null };
		}),
		from: (table: string) => new QueryBuilderMock(table, fixtures)
	};
}

describe('PATCH /api/onto/tasks/[id] completion sync behavior', () => {
	beforeEach(() => {
		syncTaskEventsMock.mockReset();
	});

	it('syncs task events when transitioning to done', async () => {
		const supabase = createSupabaseMock({
			existingTask: {
				id: 'task1',
				project_id: 'proj1',
				title: 'Task',
				type_key: 'task.default',
				state_key: 'todo',
				props: {},
				project: { id: 'proj1', created_by: 'actor1' }
			},
			updatedTask: {
				id: 'task1',
				project_id: 'proj1',
				title: 'Task',
				type_key: 'task.default',
				state_key: 'done',
				props: {}
			}
		});

		const { PATCH } = await import('./+server');
		const request = new Request('http://localhost/api/onto/tasks/task1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ state_key: 'done' })
		});

		await PATCH({
			params: { id: 'task1' },
			request,
			locals: {
				supabase: supabase as any,
				safeGetSession: async () => ({ user: { id: 'user1' } })
			}
		} as any);

		expect(syncTaskEventsMock).toHaveBeenCalledTimes(1);
		expect(syncTaskEventsMock).toHaveBeenCalledWith(
			'user1',
			'actor1',
			expect.objectContaining({ id: 'task1', state_key: 'done' })
		);
	});

	it('does not sync task events for non-done state-only transitions', async () => {
		const supabase = createSupabaseMock({
			existingTask: {
				id: 'task1',
				project_id: 'proj1',
				title: 'Task',
				type_key: 'task.default',
				state_key: 'todo',
				props: {},
				project: { id: 'proj1', created_by: 'actor1' }
			},
			updatedTask: {
				id: 'task1',
				project_id: 'proj1',
				title: 'Task',
				type_key: 'task.default',
				state_key: 'in_progress',
				props: {}
			}
		});

		const { PATCH } = await import('./+server');
		const request = new Request('http://localhost/api/onto/tasks/task1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ state_key: 'in_progress' })
		});

		await PATCH({
			params: { id: 'task1' },
			request,
			locals: {
				supabase: supabase as any,
				safeGetSession: async () => ({ user: { id: 'user1' } })
			}
		} as any);

		expect(syncTaskEventsMock).not.toHaveBeenCalled();
	});
});
