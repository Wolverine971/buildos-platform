// apps/web/src/routes/api/onto/projects/[id]/activation-packet/server.test.ts
import { assert, describe, expect, it, vi, beforeEach } from 'vitest';
import type { RequestEvent } from './$types';

const { requireProjectMemberAccessMock } = vi.hoisted(() => ({
	requireProjectMemberAccessMock: vi.fn()
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: requireProjectMemberAccessMock
}));

import { GET } from './+server';

type QueryResult = { data?: unknown; count?: number | null; error?: unknown };

type RecordedQuery = { table: string; select: string; eq: Array<[string, unknown]> };

// Chainable, awaitable supabase query builder stub. The result is resolved when
// the query runs, so one table can answer differently per filter: a
// `type_key` filter on onto_documents reads the `onto_documents:start_here` key.
function queryBuilder(
	table: string,
	resultsByTable: Record<string, QueryResult>,
	recorded: RecordedQuery[]
) {
	const query: RecordedQuery = { table, select: '', eq: [] };
	recorded.push(query);
	const resolveResult = (): QueryResult => {
		const isStartHere =
			table === 'onto_documents' && query.eq.some(([column]) => column === 'type_key');
		const key = isStartHere ? 'onto_documents:start_here' : table;
		return resultsByTable[key] ?? { data: [], count: 0 };
	};
	const builder: Record<string, unknown> = {};
	builder.select = vi.fn((columns: string) => {
		query.select = columns;
		return builder;
	});
	builder.eq = vi.fn((column: string, value: unknown) => {
		query.eq.push([column, value]);
		return builder;
	});
	for (const method of ['is', 'order', 'limit']) {
		builder[method] = vi.fn(() => builder);
	}
	builder.maybeSingle = vi.fn(() => Promise.resolve(resolveResult()));
	builder.then = (
		resolve: (value: QueryResult) => unknown,
		reject?: (reason: unknown) => unknown
	) => Promise.resolve(resolveResult()).then(resolve, reject);
	return builder;
}

const createEvent = (
	resultsByTable: Record<string, QueryResult>,
	recorded: RecordedQuery[] = []
): RequestEvent => {
	return {
		params: { id: 'project-1' },
		locals: {
			supabase: {
				from: vi.fn((table: string) => queryBuilder(table, resultsByTable, recorded))
			},
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
		}
	} as unknown as RequestEvent;
};

const PROJECT_ROW = {
	data: {
		id: 'project-1',
		name: 'Launch the newsletter',
		description: 'Weekly essay pipeline',
		next_step_short: 'Draft issue one',
		created_at: '2026-07-10T00:00:00Z'
	},
	error: null
};

describe('GET /api/onto/projects/[id]/activation-packet', () => {
	beforeEach(() => {
		requireProjectMemberAccessMock.mockReset();
		requireProjectMemberAccessMock.mockResolvedValue({ ok: true });
	});

	it('returns the denied response when access fails', async () => {
		const denied = new Response('denied', { status: 403 });
		requireProjectMemberAccessMock.mockResolvedValue({ ok: false, response: denied });

		const response = await GET(createEvent({}));
		expect(response.status).toBe(403);
	});

	it('returns 404 when the project does not exist', async () => {
		const response = await GET(
			createEvent({
				onto_projects: { data: null, error: null }
			})
		);
		expect(response.status).toBe(404);
	});

	it('assembles project, counts, Start Here orientation, and sample entities', async () => {
		const recorded: RecordedQuery[] = [];
		const response = await GET(
			createEvent(
				{
					onto_projects: PROJECT_ROW,
					onto_tasks: {
						data: [
							{ id: 't1', title: 'Outline the first essay' },
							{ id: 't2', title: 'Pick a platform' }
						],
						count: 6
					},
					onto_goals: { data: [{ id: 'g1', name: 'Publish weekly' }], count: 1 },
					// The list query returns no bodies.
					onto_documents: {
						data: [
							{
								id: 'd1',
								title: 'Start Here',
								type_key: 'document.context.project',
								props: { origin: 'start_here_template' },
								created_at: '2026-07-10T00:00:00Z',
								updated_at: '2026-07-10T00:00:00Z'
							},
							{
								id: 'd2',
								title: 'Research notes',
								type_key: 'document.note',
								props: {},
								created_at: '2026-07-10T00:01:00Z',
								updated_at: '2026-07-10T00:01:00Z'
							}
						],
						count: 2
					},
					'onto_documents:start_here': {
						data: [
							{
								id: 'd1',
								title: 'Start Here',
								content: [
									'# Start here',
									'',
									'<!-- managed:status v=1 -->',
									'**State:** Unknown',
									'<!-- /managed:status -->',
									'',
									'## What this is',
									'A newsletter project.',
									'',
									'## Non-goals',
									'> _Capture target: what this project is deliberately not doing._',
									'',
									'## Current state',
									'Issue one is drafted.'
								].join('\n'),
								props: { origin: 'start_here_template' },
								created_at: '2026-07-10T00:00:00Z',
								updated_at: '2026-07-10T00:00:00Z'
							}
						]
					},
					onto_plans: { count: 1 },
					onto_milestones: { count: 0 }
				},
				recorded
			)
		);

		expect(response.status).toBe(200);
		const payload = await response.json();
		const packet = payload.data ?? payload;

		expect(packet.project).toMatchObject({
			id: 'project-1',
			name: 'Launch the newsletter',
			next_step_short: 'Draft issue one'
		});
		expect(packet.counts).toEqual({
			tasks: 6,
			goals: 1,
			documents: 2,
			plans: 1,
			milestones: 0
		});
		// Only the orientation paragraph: no headings, markers, or other sections.
		expect(packet.start_here).toEqual({
			id: 'd1',
			title: 'Start Here',
			excerpt: 'A newsletter project.',
			truncated: false
		});
		// The Start Here doc itself is excluded from the recognizable-entities sample.
		expect(packet.sample_entities).toEqual([
			{ kind: 'task', id: 't1', name: 'Outline the first essay' },
			{ kind: 'task', id: 't2', name: 'Pick a platform' },
			{ kind: 'goal', id: 'g1', name: 'Publish weekly' },
			{ kind: 'document', id: 'd2', name: 'Research notes' }
		]);

		// Bodies are read only for Start Here candidates.
		const documentQueries = recorded.filter((query) => query.table === 'onto_documents');
		expect(documentQueries).toHaveLength(2);
		const [listQuery, startHereQuery] = documentQueries;
		assert.isDefined(listQuery);
		assert.isDefined(startHereQuery);
		expect(listQuery.select).not.toContain('content');
		expect(startHereQuery.select).toContain('content');
		expect(startHereQuery.eq).toContainEqual(['type_key', 'document.context.project']);
	});

	it('finds Start Here outside the first 25 documents', async () => {
		const response = await GET(
			createEvent({
				onto_projects: PROJECT_ROW,
				onto_documents: {
					data: [
						{
							id: 'd2',
							title: 'Research notes',
							type_key: 'document.note',
							props: {},
							created_at: '2026-07-10T00:01:00Z',
							updated_at: '2026-07-10T00:01:00Z'
						}
					],
					count: 40
				},
				'onto_documents:start_here': {
					data: [
						{
							id: 'd40',
							title: 'START HERE - Newsletter',
							content: '## Vision & Summary\n\nShip a weekly essay.',
							props: {},
							created_at: '2026-07-11T00:00:00Z',
							updated_at: '2026-07-11T00:00:00Z'
						}
					]
				}
			})
		);

		const payload = await response.json();
		const packet = payload.data ?? payload;
		expect(packet.start_here).toMatchObject({ id: 'd40', excerpt: 'Ship a weekly essay.' });
	});

	it('returns no excerpt for an unfilled Start Here template', async () => {
		const response = await GET(
			createEvent({
				onto_projects: PROJECT_ROW,
				'onto_documents:start_here': {
					data: [
						{
							id: 'd1',
							title: 'START HERE - Newsletter',
							content: [
								'# START HERE - Newsletter',
								'',
								'## What this is',
								'> _Capture target: one paragraph on what this project is._',
								'',
								'## Current state',
								'> _Capture target: what just happened._'
							].join('\n'),
							props: { origin: 'start_here_template' },
							created_at: '2026-07-10T00:00:00Z',
							updated_at: '2026-07-10T00:00:00Z'
						}
					]
				}
			})
		);

		const payload = await response.json();
		const packet = payload.data ?? payload;
		expect(packet.start_here).toEqual({
			id: 'd1',
			title: 'START HERE - Newsletter',
			excerpt: null,
			truncated: false
		});
	});
});
