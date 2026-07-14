// apps/web/src/lib/server/today-feed.service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ontologyMocks = vi.hoisted(() => ({
	ensureActorId: vi.fn(),
	fetchProjectSummaries: vi.fn()
}));

vi.mock('$lib/services/ontology/ontology-projects.service', () => ontologyMocks);

import { getTodayFeed, resolveTodayTaskBucket } from './today-feed.service';

function makeQuery(result: { data?: unknown; count?: number | null; error?: unknown }) {
	const builder: Record<string, ReturnType<typeof vi.fn>> & {
		then?: (resolve: (value: unknown) => void) => void;
	} = {};
	for (const method of ['select', 'in', 'is', 'or', 'order', 'limit', 'lt']) {
		builder[method] = vi.fn(() => builder);
	}
	builder.then = (resolve) =>
		resolve({
			data: result.data ?? null,
			count: result.count ?? null,
			error: result.error ?? null
		});
	return builder;
}

function project(id: string, state_key: string) {
	return {
		id,
		name: `${state_key} project`,
		state_key,
		updated_at: '2026-07-01T00:00:00.000Z',
		created_by: 'actor-1',
		is_shared: false,
		next_step_short: null,
		next_step_long: null
	};
}

describe('resolveTodayTaskBucket', () => {
	it('uses the sentinel calendar date instead of shifting it across timezones', () => {
		const newYorkStart = Date.parse('2026-07-15T04:00:00.000Z');
		const newYorkEnd = Date.parse('2026-07-16T04:00:00.000Z');

		expect(
			resolveTodayTaskBucket(
				{ due_at: null, start_at: '2026-07-15T00:00:00Z', state_key: 'todo' },
				'2026-07-15',
				newYorkStart,
				newYorkEnd
			)
		).toBe('starts_today');

		// This instant is 8 PM on July 15 in New York, but the stored calendar date is July 16.
		expect(
			resolveTodayTaskBucket(
				{ due_at: null, start_at: '2026-07-16T00:00:00Z', state_key: 'todo' },
				'2026-07-15',
				newYorkStart,
				newYorkEnd
			)
		).toBeNull();
	});

	it('keeps date-only due tasks on their date even when the sentinel instant is tomorrow locally', () => {
		const parisStart = Date.parse('2026-07-14T22:00:00.000Z');
		const parisEnd = Date.parse('2026-07-15T22:00:00.000Z');

		expect(
			resolveTodayTaskBucket(
				{ due_at: '2026-07-15T23:59:59+00:00', start_at: null, state_key: 'todo' },
				'2026-07-15',
				parisStart,
				parisEnd
			)
		).toBe('due_today');
		expect(
			resolveTodayTaskBucket(
				{ due_at: '2026-07-14T23:59:59Z', start_at: null, state_key: 'todo' },
				'2026-07-15',
				parisStart,
				parisEnd
			)
		).toBeNull();
	});
});

describe('getTodayFeed', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
		ontologyMocks.ensureActorId.mockResolvedValue('actor-1');
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('marks individually failed queries as degraded instead of reporting a clear day', async () => {
		ontologyMocks.fetchProjectSummaries.mockResolvedValue([project('active-1', 'active')]);
		const taskQuery = makeQuery({ error: { message: 'tasks failed' } });
		const overdueQuery = makeQuery({ error: { message: 'overdue failed' } });
		const supabase = {
			rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'events failed' } }),
			from: vi.fn().mockReturnValueOnce(taskQuery).mockReturnValueOnce(overdueQuery)
		};

		const feed = await getTodayFeed({
			supabase: supabase as never,
			userId: 'user-1',
			timezone: 'UTC'
		});

		expect(feed.events).toEqual([]);
		expect(feed.tasks).toEqual([]);
		expect(feed.overdueCount).toBe(0);
		expect(feed.degradedSections).toEqual(['events', 'tasks', 'overdue']);
	});

	it('queries and hydrates tasks only for planning and active projects', async () => {
		ontologyMocks.fetchProjectSummaries.mockResolvedValue([
			project('active-1', 'active'),
			project('planning-1', 'planning'),
			project('completed-1', 'completed'),
			project('cancelled-1', 'cancelled')
		]);
		const taskQuery = makeQuery({
			data: [
				{
					id: 'task-active',
					project_id: 'active-1',
					title: 'Active task',
					description: null,
					state_key: 'todo',
					due_at: '2026-07-15T23:59:59+00:00',
					start_at: null,
					priority: null,
					updated_at: '2026-07-15T10:00:00.000Z'
				},
				{
					id: 'task-completed-project',
					project_id: 'completed-1',
					title: 'Should stay hidden',
					description: null,
					state_key: 'todo',
					due_at: '2026-07-15T23:59:59+00:00',
					start_at: null,
					priority: null,
					updated_at: '2026-07-15T10:00:00.000Z'
				}
			]
		});
		const overdueQuery = makeQuery({ count: 0 });
		const supabase = {
			rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
			from: vi.fn().mockReturnValueOnce(taskQuery).mockReturnValueOnce(overdueQuery)
		};

		const feed = await getTodayFeed({
			supabase: supabase as never,
			userId: 'user-1',
			timezone: 'UTC'
		});

		expect(taskQuery.in).toHaveBeenCalledWith('project_id', ['active-1', 'planning-1']);
		expect(taskQuery.or).toHaveBeenCalledWith(
			expect.stringContaining('due_at.eq.2026-07-15T23:59:59.000Z')
		);
		expect(taskQuery.or).toHaveBeenCalledWith(
			expect.stringContaining('start_at.eq.2026-07-15T00:00:00.000Z')
		);
		expect(overdueQuery.in).toHaveBeenCalledWith('project_id', ['active-1', 'planning-1']);
		expect(feed.tasks.map((task) => task.id)).toEqual(['task-active']);
		expect(feed.projects).toHaveLength(4);
		expect(feed.degradedSections).toEqual([]);
	});
});
