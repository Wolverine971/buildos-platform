// apps/web/src/lib/services/project-calendar.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { ProjectCalendarService } from './project-calendar.service';

type Fixtures = {
	tables: Record<string, Array<Record<string, any>>>;
	rpcAddQueueJob?: { data: string | null; error: any };
};

class QueryBuilderMock {
	private filtersEq: Record<string, unknown> = {};
	private filtersIn: Record<string, unknown[]> = {};
	private filtersIs: Record<string, unknown> = {};
	private filtersGte: Record<string, unknown> = {};
	private orderBy: { column: string; ascending: boolean } | null = null;
	private limitValue: number | null = null;

	constructor(
		private readonly table: string,
		private readonly fixtures: Fixtures,
		private readonly limitCalls: Record<string, number[]>
	) {}

	select() {
		return this;
	}

	eq(column: string, value: unknown) {
		this.filtersEq[column] = value;
		return this;
	}

	in(column: string, values: unknown[]) {
		this.filtersIn[column] = values;
		return this;
	}

	is(column: string, value: unknown) {
		this.filtersIs[column] = value;
		return this;
	}

	gte(column: string, value: unknown) {
		this.filtersGte[column] = value;
		return this;
	}

	order(column: string, options?: { ascending?: boolean }) {
		this.orderBy = { column, ascending: options?.ascending ?? true };
		return this;
	}

	limit(value: number) {
		this.limitValue = value;
		if (!this.limitCalls[this.table]) {
			this.limitCalls[this.table] = [];
		}
		this.limitCalls[this.table].push(value);
		return this;
	}

	async maybeSingle() {
		const { data, error } = await this.execute();
		if (error) return { data: null, error };
		return { data: data[0] ?? null, error: null };
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	) {
		return this.execute().then(onfulfilled, onrejected);
	}

	private async execute(): Promise<{ data: any[]; error: any }> {
		let rows = [...(this.fixtures.tables[this.table] ?? [])];

		for (const [column, value] of Object.entries(this.filtersEq)) {
			rows = rows.filter((row) => row[column] === value);
		}

		for (const [column, values] of Object.entries(this.filtersIn)) {
			rows = rows.filter((row) => values.includes(row[column]));
		}

		for (const [column, value] of Object.entries(this.filtersIs)) {
			if (value === null) {
				rows = rows.filter((row) => row[column] == null);
			} else {
				rows = rows.filter((row) => row[column] === value);
			}
		}

		for (const [column, value] of Object.entries(this.filtersGte)) {
			rows = rows.filter((row) => String(row[column]) >= String(value));
		}

		if (this.orderBy) {
			const { column, ascending } = this.orderBy;
			rows.sort((a, b) => {
				const aValue = a[column];
				const bValue = b[column];
				if (aValue === bValue) return 0;
				if (aValue == null) return 1;
				if (bValue == null) return -1;
				if (ascending) return aValue > bValue ? 1 : -1;
				return aValue < bValue ? 1 : -1;
			});
		}

		if (this.limitValue !== null) {
			rows = rows.slice(0, this.limitValue);
		}

		return { data: rows, error: null };
	}
}

function createSupabaseMock(fixtures: Fixtures) {
	const limitCalls: Record<string, number[]> = {};
	const rpc = vi.fn(async (fn: string, _args: Record<string, unknown>) => {
		if (fn !== 'add_queue_job') {
			return { data: null, error: new Error(`Unexpected RPC: ${fn}`) };
		}
		if (fixtures.rpcAddQueueJob) {
			return fixtures.rpcAddQueueJob;
		}
		return { data: 'queue-job-1', error: null };
	});

	return {
		supabase: {
			from: (table: string) => new QueryBuilderMock(table, fixtures, limitCalls),
			rpc
		},
		limitCalls,
		rpc
	};
}

describe('ProjectCalendarService sync health and retries', () => {
	it('aggregates per-target sync health with queue retry metadata', async () => {
		const { supabase } = createSupabaseMock({
			tables: {
				onto_events: [
					{
						id: 'event-1',
						project_id: 'project-1',
						title: 'Kickoff',
						start_at: '2026-02-28T09:00:00.000Z',
						end_at: '2026-02-28T10:00:00.000Z',
						updated_at: '2026-02-28T08:00:00.000Z',
						deleted_at: null
					}
				],
				onto_event_sync: [
					{
						event_id: 'event-1',
						user_id: 'user-1',
						sync_status: 'synced',
						sync_error: null,
						last_synced_at: '2026-02-28T08:30:00.000Z',
						provider: 'google'
					},
					{
						event_id: 'event-1',
						user_id: 'user-2',
						sync_status: 'failed',
						sync_error: 'Google permission denied',
						last_synced_at: null,
						provider: 'google'
					}
				],
				queue_jobs: [
					{
						id: 'job-1',
						job_type: 'sync_calendar',
						status: 'failed',
						attempts: 2,
						max_attempts: 3,
						error_message: 'Google permission denied',
						created_at: '2026-02-28T08:45:00.000Z',
						metadata: {
							kind: 'onto_project_event_sync',
							action: 'upsert',
							eventId: 'event-1',
							projectId: 'project-1',
							targetUserId: 'user-2'
						}
					}
				],
				onto_actors: [
					{
						user_id: 'user-1',
						name: 'Current User',
						email: 'current@example.com',
						kind: 'user'
					},
					{
						user_id: 'user-2',
						name: 'Teammate',
						email: 'teammate@example.com',
						kind: 'user'
					}
				]
			}
		});

		const service = new ProjectCalendarService(supabase as any);
		const response = await service.getProjectEventSyncHealth('project-1', 'user-1', 12);
		expect(response.status).toBe(200);

		const payload = await response.json();
		expect(payload.success).toBe(true);
		expect(payload.data.summary).toMatchObject({
			total_events: 1,
			total_targets: 2,
			failed_targets: 1,
			active_queue_targets: 0
		});

		const [eventItem] = payload.data.events;
		expect(eventItem.title).toBe('Kickoff');
		expect(eventItem.targets).toHaveLength(2);

		const [currentUserTarget, teammateTarget] = eventItem.targets;
		expect(currentUserTarget.display_name).toBe('You');
		expect(currentUserTarget.can_retry).toBe(false);
		expect(teammateTarget.user_id).toBe('user-2');
		expect(teammateTarget.sync_status).toBe('failed');
		expect(teammateTarget.queue_status).toBe('failed');
		expect(teammateTarget.queue_attempts).toBe(2);
		expect(teammateTarget.retry_action).toBe('upsert');
		expect(teammateTarget.can_retry).toBe(true);
	});

	it('caps sync-health limit to max value', async () => {
		const { supabase, limitCalls } = createSupabaseMock({
			tables: {
				onto_events: []
			}
		});

		const service = new ProjectCalendarService(supabase as any);
		const response = await service.getProjectEventSyncHealth('project-1', 'user-1', 999);
		expect(response.status).toBe(200);
		expect(limitCalls.onto_events?.[0]).toBe(50);

		const payload = await response.json();
		expect(payload.success).toBe(true);
		expect(payload.data.summary).toMatchObject({
			total_events: 0,
			total_targets: 0,
			failed_targets: 0,
			active_queue_targets: 0
		});
	});

	it('enqueues manual project event sync retry with current event version', async () => {
		const { supabase, rpc } = createSupabaseMock({
			tables: {
				onto_events: [
					{
						id: 'event-1',
						project_id: 'project-1',
						created_at: '2026-02-28T08:00:00.000Z',
						updated_at: '2026-02-28T09:00:00.000Z',
						deleted_at: null
					}
				],
				project_calendars: [
					{
						id: 'calendar-row-1',
						project_id: 'project-1',
						user_id: 'user-2'
					}
				]
			},
			rpcAddQueueJob: { data: 'queue-123', error: null }
		});

		const service = new ProjectCalendarService(supabase as any);
		const response = await service.retryProjectEventSyncTarget('project-1', 'user-1', {
			eventId: 'event-1',
			targetUserId: 'user-2'
		});
		expect(response.status).toBe(200);

		const payload = await response.json();
		expect(payload.success).toBe(true);
		expect(payload.data.queue_job_id).toBe('queue-123');

		expect(rpc).toHaveBeenCalledWith(
			'add_queue_job',
			expect.objectContaining({
				p_user_id: 'user-2',
				p_job_type: 'sync_calendar'
			})
		);

		const rpcArgs = rpc.mock.calls[0]?.[1] as Record<string, any>;
		expect(rpcArgs?.p_metadata).toMatchObject({
			kind: 'onto_project_event_sync',
			action: 'upsert',
			eventId: 'event-1',
			projectId: 'project-1',
			targetUserId: 'user-2',
			triggeredByUserId: 'user-1',
			eventUpdatedAt: '2026-02-28T09:00:00.000Z'
		});
	});
});
