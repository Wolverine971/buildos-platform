import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadProjectGraphDataMock, buildGraphDataMock } = vi.hoisted(() => ({
	loadProjectGraphDataMock: vi.fn(),
	buildGraphDataMock: vi.fn()
}));

vi.mock('$lib/services/ontology/project-graph-loader', () => ({
	loadProjectGraphData: loadProjectGraphDataMock
}));

vi.mock('$lib/components/ontology/graph/lib/graph.service', () => ({
	OntologyGraphService: {
		buildGraphData: buildGraphDataMock
	}
}));

import { GET } from './+server';

function createSupabase(project: { id: string; is_public: boolean } | null) {
	const maybeSingle = vi.fn().mockResolvedValue({
		data: project,
		error: null
	});
	const queryBuilder: any = {
		select: vi.fn(() => queryBuilder),
		eq: vi.fn(() => queryBuilder),
		is: vi.fn(() => ({ maybeSingle }))
	};

	return {
		from: vi.fn((table: string) => {
			if (table === 'onto_projects') return queryBuilder;
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

describe('GET /api/public/projects/[id]/graph', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadProjectGraphDataMock.mockResolvedValue({
			project: {
				id: 'project-1',
				name: 'Public Project',
				description: 'Shown publicly',
				props: {},
				state_key: 'active',
				start_at: null,
				end_at: null
			},
			edges: [],
			tasks: [
				{ id: 'task-1', state_key: 'done' },
				{ id: 'task-2', state_key: 'active' }
			],
			documents: [],
			plans: [],
			goals: [],
			milestones: [],
			risks: []
		});
		buildGraphDataMock.mockReturnValue({
			nodes: [{ id: 'task-1' }, { id: 'task-2' }],
			edges: []
		});
	});

	it('loads a public project graph without using the service role path', async () => {
		const supabase = createSupabase({ id: 'project-1', is_public: true });
		const response = await GET({
			params: { id: 'project-1' },
			url: new URL('http://localhost/api/public/projects/project-1/graph'),
			locals: { supabase }
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(loadProjectGraphDataMock).toHaveBeenCalledWith(supabase, 'project-1');
		expect(payload.data.stats.totalTasks).toBe(2);
	});

	it('returns 404 for non-public projects', async () => {
		const response = await GET({
			params: { id: 'project-1' },
			url: new URL('http://localhost/api/public/projects/project-1/graph'),
			locals: { supabase: createSupabase({ id: 'project-1', is_public: false }) }
		} as any);

		expect(response.status).toBe(404);
		expect(loadProjectGraphDataMock).not.toHaveBeenCalled();
	});
});
