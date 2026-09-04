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
