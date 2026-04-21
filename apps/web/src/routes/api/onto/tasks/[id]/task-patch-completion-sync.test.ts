// apps/web/src/routes/api/onto/tasks/[id]/task-patch-completion-sync.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncTaskEventsMock = vi.fn();
let capturedAtomicArgs: Record<string, unknown> | null = null;

vi.mock('$lib/services/ontology/task-event-sync.service', () => ({
	TaskEventSyncService: vi.fn().mockImplementation(() => ({
		syncTaskEvents: syncTaskEventsMock
	}))
}));

vi.mock('$lib/services/ontology/onto-event-sync.service', () => ({
	OntoEventSyncService: vi.fn().mockImplementation(() => ({
		deleteEvent: vi.fn()
	}))
}));

vi.mock('$lib/services/ontology/auto-organizer.service', () => ({
	AutoOrganizeError: class AutoOrganizeError extends Error {
		status = 400;
	},
	ENTITY_TABLES: {
		project: 'onto_projects',
		plan: 'onto_plans',
		goal: 'onto_goals',
		milestone: 'onto_milestones',
		task: 'onto_tasks',
		document: 'onto_documents'
	},
	autoOrganizeConnections: vi.fn(),
	assertEntityRefsInProject: vi.fn(),
	toParentRefs: vi.fn(() => [])
}));

vi.mock('$lib/services/async-activity-logger', () => ({
	logUpdateAsync: vi.fn(),
	logDeleteAsync: vi.fn(),
	getChangeSourceFromRequest: vi.fn(() => 'ui'),
	getChatSessionIdFromRequest: vi.fn(() => null)
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

vi.mock('$lib/server/task-assignment.service', () => ({
	TaskAssignmentValidationError: class TaskAssignmentValidationError extends Error {
		status: number;
		constructor(message: string, status = 400) {
			super(message);
			this.status = status;
		}
	},
	parseAssigneeActorIds: vi.fn(() => ({
		hasInput: false,
		assigneeActorIds: []
	})),
	validateAssigneesAreProjectEligible: vi.fn(async () => {}),
	syncTaskAssignees: vi.fn(async () => ({ addedActorIds: [] })),
	notifyTaskAssignmentAdded: vi.fn(async () => ({ recipientUserIds: [] })),
	fetchTaskAssigneesMap: vi.fn(async () => new Map()),
	attachAssigneesToTask: vi.fn((task: Record<string, unknown>) => ({
		...task,
		assignees: []
	}))
}));

vi.mock('$lib/server/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: vi.fn(async () => []),
	notifyEntityMentionsAdded: vi.fn(async () => ({ notifiedUserIds: [] }))
}));

const routeModule = import('./+server');

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
		rpc: vi.fn(async (fn: string, args?: Record<string, unknown>) => {
			if (fn === 'ensure_actor_for_user') {
				return { data: 'actor1', error: null };
			}
			if (fn === 'current_actor_has_project_access') {
				return { data: true, error: null };
			}
			if (fn === 'onto_task_update_atomic') {
				capturedAtomicArgs = args ?? null;
				return {
					data: {
						task:
							fixtures.updatedTask ??
							({
								...fixtures.existingTask,
								...((args?.p_updates as Record<string, unknown> | undefined) ?? {})
							} as Record<string, unknown>),
						added_actor_ids: []
					},
					error: null
				};
			}
			return { data: null, error: null };
		}),
		from: (table: string) => new QueryBuilderMock(table, fixtures)
	};
}

describe('PATCH /api/onto/tasks/[id] completion sync behavior', () => {
	beforeEach(() => {
		capturedAtomicArgs = null;
		syncTaskEventsMock.mockReset();
		syncTaskEventsMock.mockResolvedValue(undefined);
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

		const { PATCH } = await routeModule;
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

	it('normalizes priority, dates, and type_key before the atomic update RPC', async () => {
		const supabase = createSupabaseMock({
			existingTask: {
				id: 'task1',
				project_id: 'proj1',
				title: 'Task',
				type_key: 'task.default',
				state_key: 'todo',
				props: {},
				project: { id: 'proj1', created_by: 'actor1' }
			}
		});

		const { PATCH } = await routeModule;
		const request = new Request('http://localhost/api/onto/tasks/task1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				priority: 'low',
				type_key: 'task.review.qa',
				start_at: '2026-04-20',
				due_at: '2026-04-21'
			})
		});

		const response = await PATCH({
			params: { id: 'task1' },
			request,
			locals: {
				supabase: supabase as any,
				safeGetSession: async () => ({ user: { id: 'user1' } })
			}
		} as any);

		expect(response.status).toBe(200);
		expect(capturedAtomicArgs?.p_updates).toMatchObject({
			priority: 5,
			type_key: 'task.review.qa',
			start_at: '2026-04-20T00:00:00.000Z',
			due_at: '2026-04-21T23:59:59.000Z'
		});
	});

	it('returns 400 for invalid update priority before the atomic update RPC', async () => {
		const supabase = createSupabaseMock({
			existingTask: {
				id: 'task1',
				project_id: 'proj1',
				title: 'Task',
				type_key: 'task.default',
				state_key: 'todo',
				props: {},
				project: { id: 'proj1', created_by: 'actor1' }
			}
		});

		const { PATCH } = await routeModule;
		const request = new Request('http://localhost/api/onto/tasks/task1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ priority: { rank: 1 } })
		});

		const response = await PATCH({
			params: { id: 'task1' },
			request,
			locals: {
				supabase: supabase as any,
				safeGetSession: async () => ({ user: { id: 'user1' } })
			}
		} as any);

		expect(response.status).toBe(400);
		expect(capturedAtomicArgs).toBeNull();
		await expect(response.json()).resolves.toMatchObject({
			success: false,
			error: expect.stringContaining('priority')
		});
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

		const { PATCH } = await routeModule;
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

	it('does not sync task events when reopening without scheduling edits', async () => {
		const supabase = createSupabaseMock({
			existingTask: {
				id: 'task1',
				project_id: 'proj1',
				title: 'Task',
				type_key: 'task.default',
				state_key: 'done',
				start_at: '2026-02-16T09:00:00Z',
				due_at: '2026-02-16T10:00:00Z',
				props: {},
				project: { id: 'proj1', created_by: 'actor1' }
			},
			updatedTask: {
				id: 'task1',
				project_id: 'proj1',
				title: 'Task',
				type_key: 'task.default',
				state_key: 'todo',
				start_at: '2026-02-16T09:00:00Z',
				due_at: '2026-02-16T10:00:00Z',
				props: {}
			}
		});

		const { PATCH } = await routeModule;
		const request = new Request('http://localhost/api/onto/tasks/task1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ state_key: 'todo', title: 'Reopened task' })
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

	it('syncs task events when reopening with explicit scheduling edits', async () => {
		const supabase = createSupabaseMock({
			existingTask: {
				id: 'task1',
				project_id: 'proj1',
				title: 'Task',
				type_key: 'task.default',
				state_key: 'done',
				start_at: '2026-02-16T09:00:00Z',
				due_at: '2026-02-16T10:00:00Z',
				props: {},
				project: { id: 'proj1', created_by: 'actor1' }
			},
			updatedTask: {
				id: 'task1',
				project_id: 'proj1',
				title: 'Task',
				type_key: 'task.default',
				state_key: 'todo',
				start_at: '2026-02-17T09:00:00Z',
				due_at: '2026-02-17T10:00:00Z',
				props: {}
			}
		});

		const { PATCH } = await routeModule;
		const request = new Request('http://localhost/api/onto/tasks/task1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				state_key: 'todo',
				start_at: '2026-02-17T09:00:00Z',
				due_at: '2026-02-17T10:00:00Z'
			})
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
			expect.objectContaining({ id: 'task1', state_key: 'todo' })
		);
	});
});
