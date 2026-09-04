// packages/shared-agent-ops/src/calendar/worker-task-event-mutation-port.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkerTaskSyncPort } from './worker-task-event-mutation-port';

function event(id: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		org_id: null,
		project_id: 'project-1',
		owner_entity_type: 'task',
		owner_entity_id: 'task-1',
		type_key: 'event.task_work',
		state_key: 'scheduled',
		title: 'Start: Original',
		description: null,
		location: null,
		start_at: '2026-08-10T09:00:00.000Z',
		end_at: '2026-08-10T09:30:00.000Z',
		all_day: false,
		timezone: null,
		recurrence: {},
		external_link: null,
		props: { task_event_kind: 'start' },
		created_by: 'actor-1',
		created_at: '2026-08-09T00:00:00.000Z',
		updated_at: '2026-08-09T00:00:00.000Z',
		deleted_at: null,
		last_synced_at: null,
		sync_status: 'pending',
		sync_error: null,
		facet_context: null,
		facet_scale: null,
		facet_stage: null,
		...overrides
	};
}

function task(overrides: Record<string, unknown> = {}) {
	return {
		id: 'task-1',
		project_id: 'project-1',
		title: 'Ship',
		state_key: 'todo',
		start_at: '2026-08-10T09:00:00Z',
		due_at: null,
		...overrides
	} as any;
}

function supabaseState(
	options: {
		events?: Array<Record<string, any>>;
		edges?: Array<{ src_id: string; dst_id: string }>;
		projectProps?: Record<string, unknown>;
		calendarUsers?: string[];
		queueError?: { message: string } | null;
	} = {}
) {
	const events = new Map((options.events ?? []).map((row) => [row.id, { ...row }]));
	const edges = [...(options.edges ?? [])];
	const inserts: Array<{ table: string; value: any }> = [];
	const updates: Array<{ table: string; value: any; id?: string }> = [];
	const deletes: Array<{ table: string; id?: string }> = [];
	const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
	let nextEventId = 1;

	class Query {
		private action: 'select' | 'insert' | 'update' | 'delete' | null = null;
		private payload: any;
		private filters: Record<string, unknown> = {};
		private inValues: Record<string, unknown[]> = {};

		constructor(private readonly table: string) {}

		select() {
			if (!this.action) this.action = 'select';
			return this;
		}

		insert(value: any) {
			this.action = 'insert';
			this.payload = value;
			inserts.push({ table: this.table, value });
			return this;
		}

		update(value: any) {
			this.action = 'update';
			this.payload = value;
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

		is() {
			return this;
		}

		or() {
			return this;
		}

		async maybeSingle() {
			return this.execute(true);
		}

		async single() {
			return this.execute(true);
		}

		then<TResult1 = any, TResult2 = never>(
			onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return Promise.resolve(this.execute(false)).then(onfulfilled, onrejected);
		}

		private execute(single: boolean) {
			if (this.table === 'onto_edges') {
				if (this.action === 'select') {
					return {
						data: edges
							.filter((edge) => edge.src_id === this.filters.src_id)
							.map((edge) => ({ dst_id: edge.dst_id })),
						error: null
					};
				}
				if (this.action === 'insert') {
					edges.push({ src_id: this.payload.src_id, dst_id: this.payload.dst_id });
					return { data: null, error: null };
				}
				if (this.action === 'delete') {
					const index = edges.findIndex((edge) => edge.dst_id === this.filters.dst_id);
					if (index >= 0) edges.splice(index, 1);
					deletes.push({ table: this.table, id: String(this.filters.dst_id) });
					return { data: null, error: null };
				}
			}

			if (this.table === 'onto_events') {
				if (this.action === 'insert') {
					const created = event(`event-${nextEventId++}`, this.payload);
					events.set(created.id, created);
					return { data: created, error: null };
				}
				if (this.action === 'update') {
					const id = String(this.filters.id);
					const current = events.get(id);
					if (!current) return { data: null, error: { message: 'Event not found' } };
					const updated = {
						...current,
						...this.payload,
						updated_at: this.payload.updated_at ?? '2026-08-09T01:00:00.000Z'
					};
					events.set(id, updated);
					updates.push({ table: this.table, value: this.payload, id });
					return { data: single ? updated : null, error: null };
				}
				if (this.action === 'select') {
					const ids = this.inValues.id;
					const rows = ids
						? [...events.values()].filter((row) => ids.includes(row.id))
						: [...events.values()];
					if (single) {
						return {
							data: rows.find((row) => row.id === this.filters.id) ?? null,
							error: null
						};
					}
					return { data: rows, error: null };
				}
			}

			if (this.table === 'onto_projects') {
				return { data: { props: options.projectProps ?? {} }, error: null };
			}
			if (this.table === 'project_calendars') {
				return {
					data: (options.calendarUsers ?? []).map((user_id) => ({ user_id })),
					error: null
				};
			}
			if (this.table === 'onto_project_logs' && this.action === 'insert') {
				return { data: null, error: null };
			}

			return { data: null, error: null };
		}
	}

	const client = {
		from: (table: string) => new Query(table),
		rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
			rpcCalls.push({ name, args });
			return { data: null, error: options.queueError ?? null };
		})
	};

	return { client, events, edges, inserts, updates, deletes, rpcCalls };
}

describe('worker task-event synchronization', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('creates a task event, activity row, edge, and durable calendar job without web calls', async () => {
		const state = supabaseState();
		const sync = createWorkerTaskSyncPort(state.client as any);

		await sync.syncTaskEvents('user-1', 'actor-1', task(), {
			activityLog: {
				changeSource: 'agent_call',
				actorContext: { agentCallSessionId: 'session-1' }
			}
		});

		const created = [...state.events.values()][0];
		expect(created).toMatchObject({
			title: 'Start: Ship',
			start_at: '2026-08-10T09:00:00.000Z',
			end_at: '2026-08-10T09:30:00.000Z',
			props: {
				task_event_kind: 'start',
				task_id: 'task-1',
				task_title: 'Ship',
				task_link: '/projects/project-1/tasks/task-1',
				project_id: 'project-1'
			}
		});
		expect(state.edges).toEqual([{ src_id: 'task-1', dst_id: created.id }]);
		expect(state.inserts).toContainEqual({
			table: 'onto_project_logs',
			value: expect.objectContaining({
				entity_type: 'event',
				entity_id: created.id,
				action: 'created',
				changed_by_actor_id: 'actor-1',
				agent_call_session_id: 'session-1',
				change_source: 'agent_call'
			})
		});
		expect(state.rpcCalls).toEqual([
			{
				name: 'add_queue_job',
				args: expect.objectContaining({
					p_user_id: 'user-1',
					p_job_type: 'sync_calendar',
					p_dedup_key: expect.stringContaining(
						`onto-project-event-sync:upsert:${created.id}:user-1:`
					),
					p_metadata: expect.objectContaining({
						kind: 'onto_project_event_sync',
						action: 'upsert',
						eventId: created.id,
						targetUserId: 'user-1'
					})
				})
			}
		]);
	});

	it('updates the existing event and enqueues the new event version', async () => {
		const existing = event('event-existing');
		const state = supabaseState({
			events: [existing],
			edges: [{ src_id: 'task-1', dst_id: existing.id }]
		});
		const sync = createWorkerTaskSyncPort(state.client as any);

		await sync.syncTaskEvents(
			'user-1',
			'actor-1',
			task({ title: 'Renamed', start_at: '2026-08-10T10:00:00Z' })
		);

		expect(state.events.get(existing.id)).toMatchObject({
			title: 'Start: Renamed',
			start_at: '2026-08-10T10:00:00.000Z',
			end_at: '2026-08-10T10:30:00.000Z'
		});
		expect(state.rpcCalls[0]?.args).toMatchObject({
			p_metadata: expect.objectContaining({ action: 'upsert', eventId: existing.id })
		});
		expect(state.inserts).toContainEqual({
			table: 'onto_project_logs',
			value: expect.objectContaining({ action: 'updated', entity_id: existing.id })
		});
	});

	it('soft-deletes only future events on completion and enqueues deletion', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-10T12:00:00Z'));
		const future = event('future', { start_at: '2026-08-11T09:00:00Z' });
		const past = event('past', { start_at: '2026-08-09T09:00:00Z' });
		const state = supabaseState({
			events: [future, past],
			edges: [
				{ src_id: 'task-1', dst_id: future.id },
				{ src_id: 'task-1', dst_id: past.id }
			]
		});
		const sync = createWorkerTaskSyncPort(state.client as any);

		await sync.syncTaskEvents('user-1', 'actor-1', task({ state_key: 'done' }));

		expect(state.events.get(future.id)?.deleted_at).toBe('2026-08-10T12:00:00.000Z');
		expect(state.events.get(past.id)?.deleted_at).toBeNull();
		expect(state.edges).toEqual([{ src_id: 'task-1', dst_id: past.id }]);
		expect(state.rpcCalls[0]?.args).toMatchObject({
			p_metadata: expect.objectContaining({ action: 'delete', eventId: future.id })
		});
	});

	it('fans out one deduplicated job per mapped member when the project opts in', async () => {
		const state = supabaseState({
			projectProps: { calendar_sync_mode: 'member_fanout' },
			calendarUsers: ['user-1', 'user-2', 'user-2']
		});
		const sync = createWorkerTaskSyncPort(state.client as any);

		await sync.syncTaskEvents('user-1', 'actor-1', task());

		expect(state.rpcCalls.map((call) => call.args.p_user_id)).toEqual(['user-1', 'user-2']);
	});

	it('marks the event failed without failing the task sync when job enqueue is rejected', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const state = supabaseState({ queueError: { message: 'queue unavailable' } });
		const sync = createWorkerTaskSyncPort(state.client as any);

		// The enqueue failure is recorded on the event; the sync itself still
		// reports the event it created.
		await expect(sync.syncTaskEvents('user-1', 'actor-1', task())).resolves.toMatchObject({
			events: [expect.objectContaining({ id: expect.any(String) })],
			removed_event_count: 0
		});

		const created = [...state.events.values()][0];
		expect(created).toMatchObject({
			sync_status: 'failed',
			sync_error: 'Failed to enqueue calendar sync job'
		});
	});
});
