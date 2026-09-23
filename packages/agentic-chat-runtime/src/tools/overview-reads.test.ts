// packages/agentic-chat-runtime/src/tools/overview-reads.test.ts
import { describe, expect, it } from 'vitest';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import { getProjectOverview, getWorkspaceOverview } from './overview-reads';
import { executeAgenticChatSharedReadToolV1 } from './shared-read-dispatch';

type TableRows = Record<string, unknown[]>;

/** Minimal chainable/thenable stand-in for the PostgREST query builder. */
function tableQuery(rows: unknown[]) {
	const builder: Record<string, unknown> = {};
	for (const method of ['select', 'in', 'is', 'gte', 'lte', 'order', 'limit', 'eq']) {
		builder[method] = () => builder;
	}
	builder.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
		resolve({ data: rows, error: null });
	return builder;
}

const PROJECT_SUMMARY = {
	id: 'proj-1',
	name: 'Cedar House',
	state_key: 'active',
	description: 'Main project',
	next_step_short: 'Frame the roof',
	updated_at: '2026-09-01T15:00:00.000Z',
	task_count: 1,
	document_count: 0,
	plan_count: 0,
	goal_count: 0
};

function makeContext(rows: TableRows, timezone: string | null = null) {
	return {
		client: { from: (table: string) => tableQuery(rows[table] ?? []) },
		userId: 'user-1',
		timezone,
		access: {
			getActorId: async () => 'actor-1',
			resolveProjectSummaries: async () => [PROJECT_SUMMARY],
			assertProjectAccess: async () => undefined,
			assertEntityAccess: async () => undefined
		}
	} as unknown as AgenticChatSharedReadContextV1;
}

const PROJECT_ROWS: TableRows = {
	onto_projects: [
		{ id: 'proj-1', start_at: '2026-09-01T04:00:00+00:00', end_at: '2026-09-23T03:59:59+00:00' }
	],
	onto_tasks: [
		{
			id: 'task-1',
			project_id: 'proj-1',
			title: 'Order lumber',
			state_key: 'in_progress',
			priority: 3,
			due_at: '2026-09-23T03:59:59+00:00',
			completed_at: null,
			updated_at: '2026-09-01T15:00:00.000Z'
		}
	]
};

describe('get_project_overview project dates', () => {
	it('returns the project start_at/end_at the summaries RPC does not carry', async () => {
		const payload = await getProjectOverview(makeContext(PROJECT_ROWS), {
			project_id: 'proj-1'
		});

		expect(payload.project).toMatchObject({
			id: 'proj-1',
			start_at: '2026-09-01T04:00:00+00:00',
			end_at: '2026-09-23T03:59:59+00:00'
		});
	});

	it('resolves the same dates through a query match', async () => {
		const payload = await getProjectOverview(makeContext(PROJECT_ROWS), {
			query: 'cedar'
		});

		expect(payload.match.status).toBe('resolved');
		expect(payload.project.start_at).toBe('2026-09-01T04:00:00+00:00');
		expect(payload.project.end_at).toBe('2026-09-23T03:59:59+00:00');
	});

	it('leaves the dates null when the project row carries none', async () => {
		const payload = await getProjectOverview(
			makeContext({ ...PROJECT_ROWS, onto_projects: [{ id: 'proj-1' }] }),
			{ project_id: 'proj-1' }
		);

		expect(payload.project.start_at).toBeNull();
		expect(payload.project.end_at).toBeNull();
	});

	it('still builds a workspace overview with the extra project query in place', async () => {
		const payload = await getWorkspaceOverview(makeContext(PROJECT_ROWS));
		expect(payload.projects).toHaveLength(1);
	});
});

describe('shared read dispatch timezone projection', () => {
	it('renders overview instants in the user civil timezone', async () => {
		const payload = (await executeAgenticChatSharedReadToolV1({
			toolName: 'get_project_overview',
			context: makeContext(PROJECT_ROWS, 'America/New_York'),
			arguments: { project_id: 'proj-1' }
		})) as Record<string, any>;

		// A New York user's "due September 22" is stored as 03:59:59Z the next
		// day; the model must see the day the user typed.
		expect(payload.project.end_at).toBe('2026-09-22T23:59:59-04:00');
		expect(payload.project.start_at).toBe('2026-09-01T00:00:00-04:00');
		// The task's due_at is rendered too, wherever the payload bucketed it.
		const serialized = JSON.stringify(payload);
		expect(serialized).toContain('2026-09-22T23:59:59-04:00');
		expect(serialized).not.toContain('2026-09-23T03:59:59+00:00');
	});

	it('leaves the payload untouched when the context has no timezone', async () => {
		const payload = (await executeAgenticChatSharedReadToolV1({
			toolName: 'get_project_overview',
			context: makeContext(PROJECT_ROWS, null),
			arguments: { project_id: 'proj-1' }
		})) as Record<string, any>;

		expect(payload.project.end_at).toBe('2026-09-23T03:59:59+00:00');
	});
});

/** Records filters per table and honours .limit(), unlike the minimal stand-in above. */
function recordingContext(rows: TableRows) {
	const calls: Record<string, Array<[string, ...unknown[]]>> = {};
	const client = {
		from: (table: string) => {
			let limit: number | null = null;
			const builder: Record<string, unknown> = {};
			for (const method of ['select', 'in', 'is', 'gte', 'lte', 'order', 'eq']) {
				builder[method] = (...args: unknown[]) => {
					(calls[table] ??= []).push([method, ...args]);
					return builder;
				};
			}
			builder.limit = (value: number) => {
				(calls[table] ??= []).push(['limit', value]);
				limit = value;
				return builder;
			};
			builder.then = (resolve: (value: { data: unknown[]; error: null }) => unknown) => {
				const tableRows = rows[table] ?? [];
				return resolve({
					data: limit === null ? tableRows : tableRows.slice(0, limit),
					error: null
				});
			};
			return builder;
		}
	};
	const context = {
		client,
		userId: 'user-1',
		timezone: null,
		access: {
			getActorId: async () => 'actor-1',
			resolveProjectSummaries: async () => [PROJECT_SUMMARY],
			assertProjectAccess: async () => undefined,
			assertEntityAccess: async () => undefined
		}
	} as unknown as AgenticChatSharedReadContextV1;
	return { context, calls };
}

function openTask(index: number) {
	return {
		id: `task-${index}`,
		project_id: 'proj-1',
		title: `Task ${index}`,
		state_key: 'todo',
		priority: 1,
		due_at: null,
		completed_at: null,
		updated_at: '2026-09-01T15:00:00.000Z'
	};
}

describe('overview working-set filters', () => {
	it('excludes archived tasks, milestones, plans, and risks from overview counts', async () => {
		const { context, calls } = recordingContext(PROJECT_ROWS);

		await getProjectOverview(context, { project_id: 'proj-1' });

		for (const table of ['onto_tasks', 'onto_milestones', 'onto_plans', 'onto_risks']) {
			expect(calls[table]).toContainEqual(['is', 'deleted_at', null]);
			expect(calls[table]).toContainEqual(['is', 'archived_at', null]);
		}
	});

	it('bounds the task read and flags a truncated overview', async () => {
		const tasks = Array.from({ length: 300 }, (_, index) => openTask(index));
		const { context, calls } = recordingContext({ ...PROJECT_ROWS, onto_tasks: tasks });

		const payload = await getProjectOverview(context, { project_id: 'proj-1' });

		expect(calls.onto_tasks).toContainEqual(['limit', 251]);
		expect(calls.onto_tasks).toContainEqual([
			'order',
			'completed_at',
			{ ascending: true, nullsFirst: true }
		]);
		expect(payload.tasks_truncated).toBe(true);
		expect(payload.task_fetch_limit).toBe(250);
		expect(payload.counts.active_tasks).toBe(250);
	});

	it('does not flag an overview whose tasks fit under the cap', async () => {
		const { context } = recordingContext(PROJECT_ROWS);

		const payload = await getWorkspaceOverview(context);

		expect(payload.tasks_truncated).toBeUndefined();
	});
});
