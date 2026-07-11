// apps/web/src/routes/api/onto/projects/[id]/activation-packet/server.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const { requireProjectMemberAccessMock } = vi.hoisted(() => ({
	requireProjectMemberAccessMock: vi.fn()
}));

vi.mock('$lib/server/ontology-project-access', () => ({
	requireProjectMemberAccess: requireProjectMemberAccessMock
}));

import { GET } from './+server';

type QueryResult = { data?: unknown; count?: number | null; error?: unknown };

// Chainable, awaitable supabase query builder stub.
function queryBuilder(result: QueryResult) {
	const builder: Record<string, unknown> = {};
	for (const method of ['select', 'eq', 'is', 'order', 'limit']) {
		builder[method] = vi.fn(() => builder);
	}
	builder.maybeSingle = vi.fn(() => Promise.resolve(result));
	builder.then = (
		resolve: (value: QueryResult) => unknown,
		reject?: (reason: unknown) => unknown
	) => Promise.resolve(result).then(resolve, reject);
	return builder;
}

const createEvent = (resultsByTable: Record<string, QueryResult>): RequestEvent => {
	return {
		params: { id: 'project-1' },
		locals: {
			supabase: {
				from: vi.fn((table: string) =>
					queryBuilder(resultsByTable[table] ?? { data: [], count: 0 })
				)
			},
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
		}
	} as unknown as RequestEvent;
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

	it('assembles project, counts, Start Here excerpt, and sample entities', async () => {
		const response = await GET(
			createEvent({
				onto_projects: {
					data: {
						id: 'project-1',
						name: 'Launch the newsletter',
						description: 'Weekly essay pipeline',
						next_step_short: 'Draft issue one',
						created_at: '2026-07-10T00:00:00Z'
					},
					error: null
				},
				onto_tasks: {
					data: [
						{ id: 't1', title: 'Outline the first essay' },
						{ id: 't2', title: 'Pick a platform' }
					],
					count: 6
				},
				onto_goals: { data: [{ id: 'g1', name: 'Publish weekly' }], count: 1 },
				onto_documents: {
					data: [
						{
							id: 'd1',
							title: 'Start Here',
							content: '# Start here\n\n## What this is\nA newsletter project.',
							type_key: 'document.context.project',
							props: { origin: 'start_here_template' },
							created_at: '2026-07-10T00:00:00Z',
							updated_at: '2026-07-10T00:00:00Z'
						},
						{
							id: 'd2',
							title: 'Research notes',
							content: 'notes',
							type_key: 'document.note',
							props: {},
							created_at: '2026-07-10T00:01:00Z',
							updated_at: '2026-07-10T00:01:00Z'
						}
					],
					count: 2
				},
				onto_plans: { count: 1 },
				onto_milestones: { count: 0 }
			})
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
		expect(packet.start_here).toMatchObject({ id: 'd1', truncated: false });
		expect(packet.start_here.excerpt).toContain('What this is');
		// The Start Here doc itself is excluded from the recognizable-entities sample.
		expect(packet.sample_entities).toEqual([
			{ kind: 'task', id: 't1', name: 'Outline the first essay' },
			{ kind: 'task', id: 't2', name: 'Pick a platform' },
			{ kind: 'goal', id: 'g1', name: 'Publish weekly' },
			{ kind: 'document', id: 'd2', name: 'Research notes' }
		]);
	});
});
