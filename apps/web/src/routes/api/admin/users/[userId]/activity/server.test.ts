// apps/web/src/routes/api/admin/users/[userId]/activity/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock, getErrorSummaryMock, getRecentErrorsMock } = vi.hoisted(
	() => ({
		createAdminSupabaseClientMock: vi.fn(),
		getErrorSummaryMock: vi.fn(),
		getRecentErrorsMock: vi.fn()
	})
);

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('$lib/services/errorLogger.service', () => ({
	ErrorLoggerService: {
		getInstance: vi.fn(() => ({
			getRecentErrors: getRecentErrorsMock,
			getErrorSummary: getErrorSummaryMock
		}))
	}
}));

import { GET } from './+server';

type Row = Record<string, unknown>;
type Filter =
	| { type: 'eq'; column: string; value: unknown }
	| { type: 'in'; column: string; values: unknown[] }
	| { type: 'is'; column: string; value: unknown };

function createQuery(table: string, rowsByTable: Record<string, Row[]>) {
	const filters: Filter[] = [];
	let limitCount: number | null = null;

	const applyFilters = () => {
		let rows = [...(rowsByTable[table] ?? [])];
		for (const filter of filters) {
			if (filter.type === 'eq') {
				rows = rows.filter((row) => row[filter.column] === filter.value);
			} else if (filter.type === 'in') {
				rows = rows.filter((row) => filter.values.includes(row[filter.column]));
			} else if (filter.type === 'is') {
				rows = rows.filter((row) => row[filter.column] === filter.value);
			}
		}
		return limitCount === null ? rows : rows.slice(0, limitCount);
	};

	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn((column: string, value: unknown) => {
			filters.push({ type: 'eq', column, value });
			return query;
		}),
		in: vi.fn((column: string, values: unknown[]) => {
			filters.push({ type: 'in', column, values });
			return query;
		}),
		is: vi.fn((column: string, value: unknown) => {
			filters.push({ type: 'is', column, value });
			return query;
		}),
		order: vi.fn(() => query),
		limit: vi.fn((count: number) => {
			limitCount = count;
			return query;
		}),
		single: vi.fn(async () => ({
			data: applyFilters()[0] ?? null,
			error: null
		})),
		then: (onFulfilled: any, onRejected: any) =>
			Promise.resolve({ data: applyFilters(), error: null }).then(onFulfilled, onRejected)
	};

	return query;
}

function createSupabase(rowsByTable: Record<string, Row[]>, actorId = 'actor-1') {
	const queriesByTable = new Map<string, any[]>();
	const supabase = {
		from: vi.fn((table: string) => {
			const query = createQuery(table, rowsByTable);
			queriesByTable.set(table, [...(queriesByTable.get(table) ?? []), query]);
			return query;
		}),
		rpc: vi.fn(async (name: string) => {
			if (name === 'ensure_actor_for_user') {
				return { data: actorId, error: null };
			}
			return { data: null, error: new Error(`Unexpected RPC: ${name}`) };
		}),
		queriesByTable
	};

	return supabase;
}

describe('GET /api/admin/users/[userId]/activity', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createAdminSupabaseClientMock.mockReturnValue({});
		getRecentErrorsMock.mockResolvedValue([]);
		getErrorSummaryMock.mockResolvedValue({
			total_errors: 0,
			unresolved_errors: 0,
			critical_errors: 0,
			errors_last_24h: 0
		});
	});

	it('hydrates sparse project log entity names from ontology tables', async () => {
		const rowsByTable: Record<string, Row[]> = {
			users: [{ id: 'user-1', email: 'adelina@example.com', name: 'Adelina' }],
			user_context: [{ user_id: 'user-1' }],
			onto_project_members: [],
			onto_projects: [
				{
					id: 'project-1',
					name: 'Photo to Lego Set Creator',
					created_by: 'user-1',
					deleted_at: null,
					state_key: 'active',
					description: null,
					next_step_long: null,
					next_step_short: null,
					created_at: '2026-06-24T12:00:00.000Z',
					updated_at: '2026-06-24T12:30:00.000Z'
				}
			],
			onto_tasks: [],
			onto_documents: [],
			ontology_daily_briefs: [],
			onto_project_logs: [
				{
					project_id: 'project-1',
					entity_id: 'goal-1',
					entity_type: 'goal',
					action: 'created',
					before_data: null,
					after_data: {},
					created_at: '2026-06-24T12:40:00.000Z'
				}
			],
			task_calendar_events: [],
			chat_sessions: [],
			onto_goals: [{ id: 'goal-1', project_id: 'project-1', name: 'Launch prototype' }]
		};
		const supabase = createSupabase(rowsByTable);

		const response = await GET({
			params: { userId: 'user-1' },
			locals: {
				supabase,
				safeGetSession: vi
					.fn()
					.mockResolvedValue({ user: { id: 'admin-1', is_admin: true } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.projects[0].access_type).toBe('owned');
		expect(payload.data.recent_activity[0]).toMatchObject({
			entity_id: 'goal-1',
			entity_type: 'goal',
			action: 'created',
			object_name: 'Launch prototype',
			project_name: 'Photo to Lego Set Creator'
		});
		expect(payload.data.projects[0].recent_activity[0]).toMatchObject({
			entity_id: 'goal-1',
			object_name: 'Launch prototype'
		});
		expect(supabase.from).toHaveBeenCalledWith('onto_goals');
		expect(supabase.queriesByTable.get('onto_project_logs')?.[0].select).toHaveBeenCalledWith(
			'project_id, entity_id, entity_type, action, before_data, after_data, created_at'
		);
	});

	it('uses later activity payload names when current rows still have placeholder titles', async () => {
		const rowsByTable: Record<string, Row[]> = {
			users: [{ id: 'user-1', email: 'lysander@example.com', name: 'Lysander' }],
			user_context: [{ user_id: 'user-1' }],
			onto_project_members: [],
			onto_projects: [
				{
					id: 'project-1',
					name: 'Pico Keypad Controller',
					created_by: 'actor-1',
					deleted_at: null,
					state_key: 'active',
					description: null,
					next_step_long: null,
					next_step_short: null,
					created_at: '2026-06-27T01:00:00.000Z',
					updated_at: '2026-06-27T01:30:00.000Z'
				}
			],
			onto_tasks: [
				{
					id: 'task-1',
					project_id: 'project-1',
					title: 'Untitled',
					state_key: 'in_progress',
					created_at: '2026-06-27T01:05:00.000Z',
					updated_at: '2026-06-27T01:10:00.000Z',
					due_at: null,
					completed_at: null,
					deleted_at: null
				}
			],
			onto_documents: [],
			ontology_daily_briefs: [],
			onto_project_logs: [
				{
					project_id: 'project-1',
					entity_id: 'task-1',
					entity_type: 'task',
					action: 'created',
					before_data: null,
					after_data: { title: 'Untitled' },
					created_at: '2026-06-27T01:05:00.000Z'
				},
				{
					project_id: 'project-1',
					entity_id: 'task-1',
					entity_type: 'task',
					action: 'updated',
					before_data: { title: 'Untitled' },
					after_data: {
						title: 'Build wireless update pipeline',
						state_key: 'in_progress'
					},
					created_at: '2026-06-27T01:10:00.000Z'
				},
				{
					project_id: 'project-1',
					entity_id: 'bad-project-log-id',
					entity_type: 'project',
					action: 'created',
					before_data: null,
					after_data: null,
					created_at: '2026-06-27T01:00:00.000Z'
				}
			],
			task_calendar_events: [],
			chat_sessions: []
		};
		const supabase = createSupabase(rowsByTable);

		const response = await GET({
			params: { userId: 'user-1' },
			locals: {
				supabase,
				safeGetSession: vi
					.fn()
					.mockResolvedValue({ user: { id: 'admin-1', is_admin: true } })
			}
		} as any);
		const payload = await response.json();
		const createdTaskActivity = payload.data.recent_activity.find(
			(activity: any) => activity.entity_type === 'task' && activity.action === 'created'
		);
		const createdProjectActivity = payload.data.recent_activity.find(
			(activity: any) => activity.entity_type === 'project' && activity.action === 'created'
		);

		expect(response.status).toBe(200);
		expect(createdTaskActivity).toMatchObject({
			entity_id: 'task-1',
			object_name: 'Build wireless update pipeline',
			project_name: 'Pico Keypad Controller'
		});
		expect(createdProjectActivity).toMatchObject({
			object_name: 'Pico Keypad Controller',
			project_name: 'Pico Keypad Controller'
		});
	});
});
