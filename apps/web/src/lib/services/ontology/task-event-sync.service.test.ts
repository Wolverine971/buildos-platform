// apps/web/src/lib/services/ontology/task-event-sync.service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskEventSyncService } from './task-event-sync.service';

const createEventMock = vi.fn();
const updateEventMock = vi.fn();
const deleteEventMock = vi.fn();

vi.mock('./onto-event-sync.service', () => ({
	OntoEventSyncService: vi.fn().mockImplementation(() => ({
		createEvent: createEventMock,
		updateEvent: updateEventMock,
		deleteEvent: deleteEventMock
	}))
}));

type Fixtures = {
	edgeIds: string[];
	events: Array<Record<string, any>>;
};

class QueryBuilderMock {
	private action: 'select' | 'delete' | null = null;
	private filters: Record<string, unknown> = {};
	private inValues: Record<string, unknown[]> = {};

	constructor(
		private readonly table: string,
		private readonly fixtures: Fixtures
	) {}

	select() {
		if (!this.action) this.action = 'select';
		return this;
	}

	delete() {
		this.action = 'delete';
		return this;
	}

	eq(column: string, value: unknown) {
		this.filters[column] = value;
		return this;
	}

	in(column: string, values: unknown[]) {
		this.inValues[column] = values;
		return this;
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	) {
		return this.execute().then(onfulfilled, onrejected);
	}

	private async execute(): Promise<{ data: any; error: any }> {
		if (this.table === 'onto_edges' && this.action === 'select') {
			return {
				data: this.fixtures.edgeIds.map((dst_id) => ({ dst_id })),
				error: null
			};
		}

		if (this.table === 'onto_events' && this.action === 'select') {
			const ids = this.inValues.id as string[] | undefined;
			const data = ids
				? this.fixtures.events.filter((event) => ids.includes(event.id))
				: this.fixtures.events;
			return { data, error: null };
		}

		if (this.table === 'onto_edges' && this.action === 'delete') {
			return { data: null, error: null };
		}

		return { data: null, error: null };
	}
}

function createSupabaseMock(fixtures: Fixtures) {
	return {
		from: (table: string) => new QueryBuilderMock(table, fixtures)
	};
}

describe('TaskEventSyncService completion behavior', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));
		createEventMock.mockReset();
		updateEventMock.mockReset();
		deleteEventMock.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('removes only future task events when task transitions to done', async () => {
		const fixtures: Fixtures = {
			edgeIds: [
				'event-future-start',
				'event-past-start',
				'event-future-due',
				'event-past-due'
			],
			events: [
				{
					id: 'event-future-start',
					start_at: '2026-02-16T09:00:00Z',
					end_at: '2026-02-16T09:30:00Z',
					props: { task_event_kind: 'start' }
				},
				{
					id: 'event-past-start',
					start_at: '2026-02-14T09:00:00Z',
					end_at: '2026-02-14T09:30:00Z',
					props: { task_event_kind: 'start' }
				},
				{
					id: 'event-future-due',
					start_at: '2026-02-15T11:50:00Z',
					end_at: '2026-02-15T12:10:00Z',
					props: { task_event_kind: 'due' }
				},
				{
					id: 'event-past-due',
					start_at: '2026-02-15T10:30:00Z',
					end_at: '2026-02-15T11:00:00Z',
					props: { task_event_kind: 'due' }
				}
			]
		};
		const supabase = createSupabaseMock(fixtures);
		const service = new TaskEventSyncService(supabase as any);

		await service.syncTaskEvents('user1', 'actor1', {
			id: 'task1',
			project_id: 'proj1',
			title: 'Task',
			state_key: 'done',
			start_at: '2026-02-16T09:00:00Z',
			due_at: '2026-02-16T10:00:00Z'
		} as any);

		expect(createEventMock).not.toHaveBeenCalled();
		expect(updateEventMock).not.toHaveBeenCalled();
		expect(deleteEventMock).toHaveBeenCalledTimes(2);
		expect(deleteEventMock.mock.calls.map((call) => call[1]?.eventId).sort()).toEqual([
			'event-future-due',
			'event-future-start'
		]);
	});

	it('does not create task events when a task is created already done', async () => {
		const supabase = createSupabaseMock({ edgeIds: [], events: [] });
		const service = new TaskEventSyncService(supabase as any);

		await service.syncTaskEvents('user1', 'actor1', {
			id: 'task1',
			project_id: 'proj1',
			title: 'Task',
			state_key: 'done',
			start_at: '2026-02-16T09:00:00Z',
			due_at: '2026-02-16T10:00:00Z'
		} as any);

		expect(createEventMock).not.toHaveBeenCalled();
		expect(updateEventMock).not.toHaveBeenCalled();
		expect(deleteEventMock).not.toHaveBeenCalled();
	});
});
