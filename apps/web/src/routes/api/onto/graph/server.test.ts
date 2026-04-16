// apps/web/src/routes/api/onto/graph/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadGraphScopeCountTotalsMock, loadMultipleProjectGraphsMock, loadProjectGraphDataMock } =
	vi.hoisted(() => ({
		loadGraphScopeCountTotalsMock: vi.fn(),
		loadMultipleProjectGraphsMock: vi.fn(),
		loadProjectGraphDataMock: vi.fn()
	}));

vi.mock('./workspace-graph-counts', () => ({
	loadGraphScopeCountTotals: loadGraphScopeCountTotalsMock
}));

vi.mock('$lib/services/ontology/project-graph-loader', () => ({
	loadMultipleProjectGraphs: loadMultipleProjectGraphsMock,
	loadProjectGraphData: loadProjectGraphDataMock
}));

import { GET } from './+server';

const now = '2026-04-16T15:00:00.000Z';

function makeProject(index: number) {
	return {
		id: `project-${index}`,
		name: `Project ${index}`,
		description: null,
		type_key: 'project',
		state_key: 'active',
		props: null,
		facet_context: null,
		facet_scale: 'medium',
		facet_stage: null,
		created_by: 'actor-1',
		created_at: now,
		updated_at: new Date(Date.parse(now) + index).toISOString()
	} as any;
}

function makeTask(projectId: string, index: number) {
	return {
		id: `${projectId}-task-${index}`,
		project_id: projectId,
		type_key: 'task',
		title: `Task ${index}`,
		description: null,
		state_key: 'in_progress',
		priority: 3,
		props: null,
		created_by: 'actor-1',
		created_at: now,
		updated_at: new Date(Date.parse(now) + index).toISOString()
	} as any;
}

function makeEdge(projectId: string, taskId: string, index: number) {
	return {
		id: `${projectId}-edge-${index}`,
		project_id: projectId,
		src_kind: 'project',
		src_id: projectId,
		dst_kind: 'task',
		dst_id: taskId,
		rel: 'has_task',
		props: null,
		created_at: now
	} as any;
}

function createTableQuery(rows: any[]) {
	const filters: Array<(row: any) => boolean> = [];
	const getRows = () => rows.filter((row) => filters.every((filter) => filter(row)));
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn((column: string, value: unknown) => {
			filters.push((row) => row[column] === value);
			return query;
		}),
		in: vi.fn((column: string, values: unknown[]) => {
			const selected = new Set(values);
			filters.push((row) => selected.has(row[column]));
			return query;
		}),
		is: vi.fn((column: string, value: unknown) => {
			filters.push((row) => row[column] === value || (value === null && row[column] == null));
			return query;
		}),
		order: vi.fn(() => Promise.resolve({ data: getRows(), error: null })),
		single: vi.fn(() => {
			const [row] = getRows();
			return Promise.resolve({
				data: row ?? null,
				error: row ? null : { message: 'Not found' }
			});
		}),
		then: (resolve: any, reject: any) =>
			Promise.resolve({ data: getRows(), error: null }).then(resolve, reject)
	};
	return query;
}

function createSupabase(projects: any[], members: any[] = []) {
	return {
		rpc: vi.fn((fn: string) =>
			Promise.resolve({
				data: fn === 'current_actor_has_project_access' ? true : 'actor-1',
				error: null
			})
		),
		from: vi.fn((table: string) => {
			if (table === 'onto_projects') return createTableQuery(projects);
			if (table === 'onto_project_members') return createTableQuery(members);
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

describe('GET /api/onto/graph', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadProjectGraphDataMock.mockReset();
		loadMultipleProjectGraphsMock.mockReset();
		loadGraphScopeCountTotalsMock.mockResolvedValue({});
	});

	it('returns a truncated workspace graph instead of 413 when the graph exceeds the limit', async () => {
		const projects = Array.from({ length: 3 }, (_, index) => makeProject(index));
		const supabase = createSupabase(projects);

		loadMultipleProjectGraphsMock.mockImplementation(async (_client, projectIds: string[]) => {
			const graphs = new Map();
			for (const projectId of projectIds) {
				const tasks = Array.from({ length: 8 }, (_, index) => makeTask(projectId, index));
				graphs.set(projectId, {
					project: projects.find((project) => project.id === projectId),
					tasks,
					documents: [],
					plans: [],
					goals: [],
					milestones: [],
					risks: [],
					edges: tasks.map((task, index) => makeEdge(projectId, task.id, index))
				});
			}
			return graphs;
		});

		const response = await GET({
			url: new URL('http://localhost/api/onto/graph?viewMode=projects&limit=10'),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.graph.nodes.length).toBeLessThanOrEqual(10);
		expect(payload.data.metadata.truncated).toBe(true);
		expect(payload.data.metadata.originalNodeCount).toBe(27);
		expect(payload.data.metadata.returnedNodeCount).toBeLessThanOrEqual(10);
		expect(loadMultipleProjectGraphsMock).toHaveBeenCalledWith(
			supabase,
			['project-2', 'project-1', 'project-0'],
			{ excludeCompletedTasks: true }
		);
	});

	it('loads only projects owned by or shared with the current actor', async () => {
		const projects = [
			makeProject(0),
			{ ...makeProject(1), created_by: 'actor-2' },
			{ ...makeProject(2), created_by: 'actor-3' }
		];
		const supabase = createSupabase(projects, [
			{
				id: 'member-1',
				project_id: 'project-1',
				actor_id: 'actor-1',
				removed_at: null
			},
			{
				id: 'member-2',
				project_id: 'project-2',
				actor_id: 'actor-1',
				removed_at: now
			}
		]);
		loadMultipleProjectGraphsMock.mockResolvedValue(
			new Map([
				[
					'project-0',
					{
						project: projects[0],
						tasks: [],
						documents: [],
						plans: [],
						goals: [],
						milestones: [],
						risks: [],
						edges: []
					}
				],
				[
					'project-1',
					{
						project: projects[1],
						tasks: [],
						documents: [],
						plans: [],
						goals: [],
						milestones: [],
						risks: [],
						edges: []
					}
				]
			])
		);

		const response = await GET({
			url: new URL('http://localhost/api/onto/graph?viewMode=projects'),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.source.projects.map((project: any) => project.id).sort()).toEqual([
			'project-0',
			'project-1'
		]);
		expect(payload.data.metadata.projectScope).toMatchObject({
			type: 'actor-project-access',
			actorId: 'actor-1',
			projectCount: 2,
			ownedProjectCount: 1,
			memberProjectCount: 1
		});
		expect(loadMultipleProjectGraphsMock).toHaveBeenCalledWith(
			supabase,
			['project-1', 'project-0'],
			{ excludeCompletedTasks: true }
		);
		expect(loadMultipleProjectGraphsMock.mock.calls[0][1]).not.toContain('project-2');
	});

	it('does not let admin-wide project access expand single-project graph access', async () => {
		const projects = [{ ...makeProject(0), created_by: 'actor-2' }];
		const supabase = createSupabase(projects);

		const response = await GET({
			url: new URL('http://localhost/api/onto/graph?projectId=project-0'),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(403);
		expect(payload.success).toBe(false);
		expect(loadProjectGraphDataMock).not.toHaveBeenCalled();
		expect(supabase.rpc).not.toHaveBeenCalledWith(
			'current_actor_has_project_access',
			expect.anything()
		);
	});

	it('passes completed task preference through to the graph loader', async () => {
		const projects = [makeProject(0)];
		const supabase = createSupabase(projects);
		loadMultipleProjectGraphsMock.mockResolvedValue(
			new Map([
				[
					'project-0',
					{
						project: projects[0],
						tasks: [{ ...makeTask('project-0', 0), state_key: 'done' }],
						documents: [],
						plans: [],
						goals: [],
						milestones: [],
						risks: [],
						edges: []
					}
				]
			])
		);

		const response = await GET({
			url: new URL('http://localhost/api/onto/graph?viewMode=projects&showDoneTasks=true'),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.metadata.filters.showDoneTasks).toBe(true);
		expect(loadMultipleProjectGraphsMock).toHaveBeenCalledWith(supabase, ['project-0'], {
			excludeCompletedTasks: false
		});
	});
});
