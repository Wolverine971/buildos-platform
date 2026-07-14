// apps/web/src/lib/server/overdue-task-triage.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	ensureActorId: vi.fn(),
	fetchProjectSummaries: vi.fn(),
	fetchTaskAssigneesMap: vi.fn(),
	attachAssigneesToTasks: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: mocks.ensureActorId,
	fetchProjectSummaries: mocks.fetchProjectSummaries
}));

vi.mock('$lib/server/task-assignment.service', () => ({
	fetchTaskAssigneesMap: mocks.fetchTaskAssigneesMap,
	attachAssigneesToTasks: mocks.attachAssigneesToTasks
}));

import { fetchHydratedOverdueTasks } from './overdue-task-triage';

function makeQuery(rows: unknown[]) {
	const builder: Record<string, ReturnType<typeof vi.fn>> & {
		then?: (resolve: (value: unknown) => void) => void;
	} = {};
	for (const method of ['select', 'in', 'is', 'lt', 'order', 'limit']) {
		builder[method] = vi.fn(() => builder);
	}
	builder.then = (resolve) => resolve({ data: rows, error: null });
	return builder;
}

function project(id: string, state_key: string) {
	return {
		id,
		name: `${state_key} project`,
		state_key,
		updated_at: '2026-07-01T00:00:00.000Z',
		is_shared: false
	};
}

function task(id: string, project_id: string) {
	return {
		id,
		project_id,
		title: id,
		description: null,
		state_key: 'todo',
		due_at: '2026-07-01T12:00:00.000Z',
		priority: 3,
		updated_at: '2026-07-01T00:00:00.000Z'
	};
}

describe('fetchHydratedOverdueTasks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.ensureActorId.mockResolvedValue('actor-1');
		mocks.fetchTaskAssigneesMap.mockResolvedValue(new Map());
		mocks.attachAssigneesToTasks.mockImplementation((rows: unknown[]) =>
			rows.map((row) => ({ ...(row as object), assignees: [] }))
		);
	});

	it('excludes unfinished tasks from completed and cancelled projects', async () => {
		mocks.fetchProjectSummaries.mockResolvedValue([
			project('active-1', 'active'),
			project('planning-1', 'planning'),
			project('completed-1', 'completed'),
			project('cancelled-1', 'cancelled')
		]);
		const query = makeQuery([
			task('active-task', 'active-1'),
			task('completed-task', 'completed-1')
		]);
		const supabase = { from: vi.fn(() => query) };

		const result = await fetchHydratedOverdueTasks({
			supabase: supabase as never,
			userId: 'user-1'
		});

		expect(query.in).toHaveBeenCalledWith('project_id', ['active-1', 'planning-1']);
		expect(result.map((item) => item.id)).toEqual(['active-task']);
	});
});
