import { describe, expect, it, vi, beforeEach } from 'vitest';

const deleteEventMock = vi.fn();

vi.mock('$lib/services/ontology/onto-event-sync.service', () => ({
	OntoEventSyncService: vi.fn().mockImplementation(() => ({
		deleteEvent: deleteEventMock
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
	private filters: Record<string, unknown> = {};

	constructor(
		private readonly table: string,
		private readonly data: {
			taskRow?: any;
			eventRows?: Array<{ id: string }>;
		}
	) {}

	select() {
		this.action = 'select';
		return this;
	}

	update() {
		this.action = 'update';
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

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	) {
		return this.execute().then(onfulfilled, onrejected);
	}

	private async execute(): Promise<{ data?: any; error?: any }> {
		if (this.table === 'onto_tasks' && this.action === 'select') {
			return { data: this.data.taskRow ?? null, error: null };
		}

		if (this.table === 'onto_tasks' && this.action === 'update') {
			return { data: null, error: null };
		}

		if (this.table === 'onto_events' && this.action === 'select') {
			return { data: this.data.eventRows ?? [], error: null };
		}

		return { data: null, error: null };
	}
}

function createSupabaseMock(fixtures: {
	taskRow?: any;
	eventRows?: Array<{ id: string }>;
}) {
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

describe('DELETE /api/onto/tasks/[id] calendar cleanup', () => {
	beforeEach(() => {
		deleteEventMock.mockReset();
	});

	it('deletes linked events and deletes from calendar by default', async () => {
		const supabase = createSupabaseMock({
			taskRow: {
				id: 'task1',
				project_id: 'proj1',
				title: 'Task',
				type_key: 'task.default',
				state_key: 'todo',
				project: { id: 'proj1', created_by: 'actor1' }
			},
			eventRows: [{ id: 'event1' }, { id: 'event2' }]
		});

		const { DELETE } = await import('./+server');
		const request = new Request('http://localhost/api/onto/tasks/task1', { method: 'DELETE' });

		await DELETE({
			params: { id: 'task1' },
			request,
			locals: {
				supabase: supabase as any,
				safeGetSession: async () => ({ user: { id: 'user1' } })
			}
		} as any);

		expect(deleteEventMock).toHaveBeenCalledTimes(2);
		expect(deleteEventMock).toHaveBeenNthCalledWith(1, 'user1', {
			eventId: 'event1',
			syncToCalendar: true
		});
		expect(deleteEventMock).toHaveBeenNthCalledWith(2, 'user1', {
			eventId: 'event2',
			syncToCalendar: true
		});
	});

	it('respects sync_to_calendar=false', async () => {
		const supabase = createSupabaseMock({
			taskRow: {
				id: 'task1',
				project_id: 'proj1',
				title: 'Task',
				type_key: 'task.default',
				state_key: 'todo',
				project: { id: 'proj1', created_by: 'actor1' }
			},
			eventRows: [{ id: 'event1' }]
		});

		const { DELETE } = await import('./+server');
		const request = new Request('http://localhost/api/onto/tasks/task1', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sync_to_calendar: false })
		});

		await DELETE({
			params: { id: 'task1' },
			request,
			locals: {
				supabase: supabase as any,
				safeGetSession: async () => ({ user: { id: 'user1' } })
			}
		} as any);

		expect(deleteEventMock).toHaveBeenCalledTimes(1);
		expect(deleteEventMock).toHaveBeenCalledWith('user1', {
			eventId: 'event1',
			syncToCalendar: false
		});
	});

	it('skips deleting linked events when delete_linked_events=false', async () => {
		const supabase = createSupabaseMock({
			taskRow: {
				id: 'task1',
				project_id: 'proj1',
				title: 'Task',
				type_key: 'task.default',
				state_key: 'todo',
				project: { id: 'proj1', created_by: 'actor1' }
			},
			eventRows: [{ id: 'event1' }]
		});

		const { DELETE } = await import('./+server');
		const request = new Request('http://localhost/api/onto/tasks/task1', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ delete_linked_events: false })
		});

		await DELETE({
			params: { id: 'task1' },
			request,
			locals: {
				supabase: supabase as any,
				safeGetSession: async () => ({ user: { id: 'user1' } })
			}
		} as any);

		expect(deleteEventMock).not.toHaveBeenCalled();
	});
});

