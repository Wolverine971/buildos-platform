import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildGraphDataMock } = vi.hoisted(() => ({
	buildGraphDataMock: vi.fn()
}));

const { createAdminSupabaseClientMock } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn()
}));

vi.mock('$lib/components/ontology/graph/lib/graph.service', () => ({
	OntologyGraphService: {
		buildGraphData: buildGraphDataMock
	}
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

import { GET } from './+server';

function createQuery(data: unknown) {
	const builder: any = {};
	const result = Promise.resolve({ data, error: null });
	builder.select = vi.fn(() => builder);
	builder.eq = vi.fn(() => builder);
	builder.is = vi.fn(() => builder);
	builder.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
	builder.then = result.then.bind(result);
	return builder;
}

function createSupabase(
	project: Record<string, unknown> | null,
	rowsByTable: Record<string, unknown[]> = {}
) {
	const projectQuery: any = (() => {
		const builder: any = {};
		builder.select = vi.fn(() => builder);
		builder.eq = vi.fn(() => builder);
		builder.is = vi.fn(() => builder);
		builder.maybeSingle = vi.fn().mockResolvedValue({ data: project, error: null });
		return builder;
	})();

	return {
		from: vi.fn((table: string) => {
			if (table === 'onto_projects') return projectQuery;
			return createQuery(rowsByTable[table] ?? []);
		})
	};
}

describe('GET /api/public/projects/[id]/graph', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		buildGraphDataMock.mockReturnValue({
			nodes: [{ id: 'task-1' }, { id: 'task-2' }],
			edges: []
		});
	});

	it('loads a public project graph through the explicit public route projection', async () => {
		const supabase = createSupabase(
			{
				id: 'project-1',
				name: 'Public Project',
				description: 'Shown publicly',
				type_key: 'project.example',
				state_key: 'active',
				props: {
					commander: 'Public lead',
					private_note: 'do not expose'
				},
				start_at: null,
				end_at: null,
				doc_structure: {
					version: 1,
					root: [
						{
							id: 'folder-1',
							type: 'folder',
							title: 'Folder',
							description: 'private folder note',
							order: 0,
							children: [
								{ id: 'doc-1', type: 'doc', title: 'Stale title', order: 0 },
								{ id: 'doc-archived', type: 'doc', title: 'Archived doc', order: 1 }
							]
						}
					]
				},
				icon_svg: null,
				icon_concept: null,
				next_step_short: 'Do the public thing'
			},
			{
				onto_tasks: [
					{
						id: 'task-1',
						project_id: 'project-1',
						type_key: 'task',
						title: 'Public task',
						description: 'Visible task',
						state_key: 'done',
						priority: 1,
						created_at: '2026-01-01T00:00:00Z',
						updated_at: '2026-01-02T00:00:00Z',
						props: { secret: true },
						created_by: 'actor-private'
					},
					{
						id: 'task-2',
						project_id: 'project-1',
						type_key: 'task',
						title: 'Active task',
						state_key: 'active',
						priority: 2,
						created_at: '2026-01-01T00:00:00Z',
						updated_at: '2026-01-02T00:00:00Z'
					}
				],
				onto_documents: [
					{
						id: 'doc-1',
						project_id: 'project-1',
						type_key: 'doc',
						title: 'Public doc',
						description: 'Visible doc',
						state_key: 'ready',
						created_at: '2026-01-01T00:00:00Z',
						updated_at: '2026-01-02T00:00:00Z',
						content: 'do not expose'
					},
					{
						id: 'doc-archived',
						project_id: 'project-1',
						type_key: 'doc',
						title: 'Archived doc',
						state_key: 'archived',
						created_at: '2026-01-01T00:00:00Z',
						updated_at: '2026-01-02T00:00:00Z'
					}
				],
				onto_plans: [
					{
						id: 'plan-1',
						project_id: 'project-1',
						type_key: 'plan',
						name: 'Public plan',
						description: 'Visible plan',
						state_key: 'active',
						created_at: '2026-01-01T00:00:00Z',
						updated_at: '2026-01-02T00:00:00Z',
						plan: 'do not expose'
					}
				],
				onto_goals: [],
				onto_milestones: [],
				onto_risks: [
					{
						id: 'risk-1',
						project_id: 'project-1',
						title: 'Public risk',
						type_key: 'risk',
						impact: 'medium',
						state_key: 'identified',
						created_at: '2026-01-01T00:00:00Z',
						updated_at: '2026-01-02T00:00:00Z',
						content: 'do not expose'
					}
				],
				onto_edges: [
					{
						id: 'edge-1',
						project_id: 'project-1',
						src_id: 'task-1',
						src_kind: 'task',
						dst_id: 'doc-1',
						dst_kind: 'document',
						rel: 'has_document',
						props: { inferred: true, weight: 2, secret: 'nope' }
					},
					{
						id: 'edge-2',
						project_id: 'project-1',
						src_id: 'task-1',
						src_kind: 'task',
						dst_id: 'doc-archived',
						dst_kind: 'document',
						rel: 'has_document',
						props: {}
					}
				],
				onto_events: [
					{
						id: 'event-1',
						project_id: 'project-1',
						type_key: 'event',
						state_key: 'scheduled',
						title: 'Public event',
						start_at: '2026-01-03T00:00:00Z',
						all_day: true,
						props: { secret: true },
						created_by: 'actor-private'
					},
					{
						id: 'event-2',
						project_id: 'project-1',
						type_key: 'event',
						state_key: 'cancelled',
						title: 'Cancelled event',
						start_at: '2026-01-04T00:00:00Z',
						all_day: true
					}
				]
			}
		);
		createAdminSupabaseClientMock.mockReturnValue(supabase);
		const response = await GET({
			params: { id: 'project-1' },
			url: new URL('http://localhost/api/public/projects/project-1/graph'),
			locals: {}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.stats.totalTasks).toBe(2);
		expect(payload.data.project.props).toEqual({ commander: 'Public lead' });
		expect(payload.data.project.next_step_long).toBeUndefined();
		expect(payload.data.source.tasks[0]).not.toHaveProperty('props');
		expect(payload.data.source.tasks[0]).not.toHaveProperty('created_by');
		expect(payload.data.source.documents[0]).not.toHaveProperty('content');
		expect(payload.data.source.plans[0]).not.toHaveProperty('plan');
		expect(payload.data.source.risks[0]).not.toHaveProperty('content');
		expect(payload.data.source.events).toHaveLength(1);
		expect(payload.data.source.events[0]).not.toHaveProperty('props');
		expect(payload.data.source.edges).toEqual([
			expect.objectContaining({
				id: 'edge-1',
				props: { inferred: true, weight: 2 }
			})
		]);
		expect(payload.data.project.doc_structure.root[0].description).toBeUndefined();
		expect(payload.data.project.doc_structure.root[0].children).toEqual([
			expect.objectContaining({
				id: 'doc-1',
				title: 'Public doc',
				description: 'Visible doc'
			})
		]);

		const sourceArg = buildGraphDataMock.mock.calls[0][0];
		expect(sourceArg.tasks[0]).not.toHaveProperty('props');
		expect(sourceArg.edges).toHaveLength(1);
	});

	it('returns 404 for non-public projects', async () => {
		createAdminSupabaseClientMock.mockReturnValue(createSupabase(null));
		const response = await GET({
			params: { id: 'project-1' },
			url: new URL('http://localhost/api/public/projects/project-1/graph'),
			locals: {}
		} as any);

		expect(response.status).toBe(404);
		expect(buildGraphDataMock).not.toHaveBeenCalled();
	});
});
