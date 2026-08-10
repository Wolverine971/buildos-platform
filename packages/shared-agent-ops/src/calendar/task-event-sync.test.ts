import { describe, expect, it, vi } from 'vitest';
import {
	buildTaskEventSpecs,
	futureTaskEventsOnCompletion,
	TaskEventSyncCoordinator,
	type TaskEventMutationPort
} from './task-event-sync';

function event(id: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		project_id: 'project-1',
		owner_entity_type: 'task',
		owner_entity_id: 'task-1',
		type_key: 'event.task_work',
		state_key: 'scheduled',
		title: 'Task',
		description: null,
		location: null,
		start_at: '2026-08-10T09:00:00.000Z',
		end_at: '2026-08-10T09:30:00.000Z',
		all_day: false,
		timezone: null,
		recurrence: {},
		external_link: null,
		props: {},
		created_by: 'actor-1',
		created_at: '2026-08-09T00:00:00.000Z',
		updated_at: '2026-08-09T00:00:00.000Z',
		deleted_at: null,
		org_id: null,
		last_synced_at: null,
		sync_status: 'pending',
		sync_error: null,
		facet_context: null,
		facet_scale: null,
		facet_stage: null,
		...overrides
	} as any;
}

function coordinatorClient(edgeIds: string[], events: any[]) {
	const edgeInserts: unknown[] = [];
	const edgeDeletes: string[] = [];

	class Query {
		private action: 'select' | 'insert' | 'delete' | null = null;
		private values: Record<string, unknown> = {};

		constructor(private readonly table: string) {}

		select() {
			this.action = 'select';
			return this;
		}

		insert(value: unknown) {
			this.action = 'insert';
			edgeInserts.push(value);
			return this;
		}

		delete() {
			this.action = 'delete';
			return this;
		}

		eq(column: string, value: unknown) {
			this.values[column] = value;
			if (this.action === 'delete' && column === 'dst_id') edgeDeletes.push(String(value));
			return this;
		}

		in() {
			return this;
		}

		then<TResult1 = any, TResult2 = never>(
			onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
		}

		private execute() {
			if (this.table === 'onto_edges' && this.action === 'select') {
				return { data: edgeIds.map((dst_id) => ({ dst_id })), error: null };
			}
			if (this.table === 'onto_events' && this.action === 'select') {
				return {
					data: events.filter(
						(event) =>
							this.values.project_id === undefined ||
							event.project_id === this.values.project_id
					),
					error: null
				};
			}
			return { data: null, error: null };
		}
	}

	return {
		client: { from: (table: string) => new Query(table) },
		edgeInserts,
		edgeDeletes
	};
}

function mutationPort(): TaskEventMutationPort & {
	createEvent: ReturnType<typeof vi.fn>;
	updateEvent: ReturnType<typeof vi.fn>;
	deleteEvent: ReturnType<typeof vi.fn>;
} {
	let nextId = 1;
	return {
		createEvent: vi.fn(async (_userId, request) => ({
			event: event(`created-${nextId++}`, {
				title: request.title,
				start_at: request.startAt,
				end_at: request.endAt,
				props: request.props
			})
		})),
		updateEvent: vi.fn(async (_userId, request) =>
			event(request.eventId, {
				title: request.title,
				start_at: request.startAt,
				end_at: request.endAt,
				props: request.props
			})
		),
		deleteEvent: vi.fn(async (_userId, request) =>
			event(request.eventId, { deleted_at: '2026-08-09T12:00:00.000Z' })
		)
	};
}

describe('task event scheduling parity', () => {
	it('builds the legacy start, due, short-range, and long-range shapes', () => {
		expect(
			buildTaskEventSpecs({ title: 'Ship', start_at: '2026-08-10T09:00:00Z', due_at: null })
		).toEqual([
			{
				kind: 'start',
				startAt: '2026-08-10T09:00:00.000Z',
				endAt: '2026-08-10T09:30:00.000Z',
				title: 'Start: Ship'
			}
		]);
		expect(
			buildTaskEventSpecs({ title: 'Ship', start_at: null, due_at: '2026-08-10T17:00:00Z' })
		).toEqual([
			{
				kind: 'due',
				startAt: '2026-08-10T16:30:00.000Z',
				endAt: '2026-08-10T17:00:00.000Z',
				title: 'Due: Ship'
			}
		]);
		expect(
			buildTaskEventSpecs({
				title: 'Ship',
				start_at: '2026-08-10T09:00:00Z',
				due_at: '2026-08-10T17:00:00Z'
			})
		).toEqual([
			{
				kind: 'range',
				startAt: '2026-08-10T09:00:00.000Z',
				endAt: '2026-08-10T17:00:00.000Z',
				title: 'Ship'
			}
		]);
		expect(
			buildTaskEventSpecs({
				title: 'Ship',
				start_at: '2026-08-10T09:00:00Z',
				due_at: '2026-08-11T17:00:00Z'
			}).map((spec) => spec.kind)
		).toEqual(['start', 'due']);
	});

	it('removes only future completion events with due events keyed by their end', () => {
		const now = Date.parse('2026-08-10T12:00:00Z');
		expect(
			futureTaskEventsOnCompletion(
				[
					event('future-start', {
						start_at: '2026-08-11T09:00:00Z',
						props: { task_event_kind: 'start' }
					}),
					event('past-start', {
						start_at: '2026-08-09T09:00:00Z',
						props: { task_event_kind: 'start' }
					}),
					event('future-due', {
						start_at: '2026-08-10T11:45:00Z',
						end_at: '2026-08-10T12:15:00Z',
						props: { task_event_kind: 'due' }
					})
				],
				now
			).map((candidate) => candidate.id)
		).toEqual(['future-start', 'future-due']);
	});

	it('creates the long-range pair and durable task-event edges', async () => {
		const { client, edgeInserts } = coordinatorClient([], []);
		const mutations = mutationPort();
		const coordinator = new TaskEventSyncCoordinator(client as any, mutations);

		await coordinator.syncTaskEvents(
			'user-1',
			'actor-1',
			{
				id: 'task-1',
				project_id: 'project-1',
				title: 'Ship',
				state_key: 'todo',
				start_at: '2026-08-10T09:00:00Z',
				due_at: '2026-08-11T17:00:00Z'
			} as any,
			{
				activityLog: {
					changeSource: 'agent_call',
					actorContext: { agentCallSessionId: 'session-1' }
				}
			}
		);

		expect(mutations.createEvent).toHaveBeenCalledTimes(2);
		expect(mutations.createEvent).toHaveBeenNthCalledWith(
			1,
			'user-1',
			expect.objectContaining({
				title: 'Start: Ship',
				props: expect.objectContaining({
					task_event_kind: 'start',
					task_id: 'task-1',
					project_id: 'project-1'
				}),
				activityLog: {
					changeSource: 'agent_call',
					actorContext: {
						agentCallSessionId: 'session-1',
						changedByActorId: 'actor-1'
					}
				}
			})
		);
		expect(edgeInserts).toHaveLength(2);
		expect(edgeInserts[0]).toMatchObject({
			project_id: 'project-1',
			src_id: 'task-1',
			dst_id: 'created-1',
			rel: 'has_event'
		});
	});

	it('updates the matching kind and removes surplus legacy events', async () => {
		const range = event('range-1', {
			props: { task_event_kind: 'range', retained: true }
		});
		const surplus = event('surplus-1', { props: {} });
		const { client, edgeDeletes } = coordinatorClient([range.id, surplus.id], [range, surplus]);
		const mutations = mutationPort();
		const coordinator = new TaskEventSyncCoordinator(client as any, mutations);

		await coordinator.syncTaskEvents('user-1', 'actor-1', {
			id: 'task-1',
			project_id: 'project-1',
			title: 'Updated',
			state_key: 'todo',
			start_at: '2026-08-10T09:00:00Z',
			due_at: '2026-08-10T17:00:00Z'
		} as any);

		expect(mutations.updateEvent).toHaveBeenCalledWith(
			'user-1',
			expect.objectContaining({
				eventId: 'range-1',
				title: 'Updated',
				props: expect.objectContaining({ retained: true, task_event_kind: 'range' })
			})
		);
		expect(mutations.deleteEvent).toHaveBeenCalledWith(
			'user-1',
			expect.objectContaining({ eventId: 'surplus-1' })
		);
		expect(edgeDeletes).toEqual(['surplus-1']);
	});

	it('never mutates a linked event outside the task project under a service-role client', async () => {
		const crossProject = event('cross-project', { project_id: 'project-2' });
		const { client } = coordinatorClient([crossProject.id], [crossProject]);
		const mutations = mutationPort();
		const coordinator = new TaskEventSyncCoordinator(client as any, mutations);

		await coordinator.syncTaskEvents('user-1', 'actor-1', {
			id: 'task-1',
			project_id: 'project-1',
			title: 'Ship',
			state_key: 'todo',
			start_at: '2026-08-10T09:00:00Z',
			due_at: null
		} as any);

		expect(mutations.updateEvent).not.toHaveBeenCalled();
		expect(mutations.deleteEvent).not.toHaveBeenCalled();
		expect(mutations.createEvent).toHaveBeenCalledOnce();
	});
});
