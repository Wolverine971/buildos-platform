import { describe, it, expect } from 'vitest';
import { loadMultipleProjectGraphs, loadProjectGraphData } from './project-graph-loader';

type TableData = Record<string, { list?: any[]; single?: any } | any[] | null>;

function createMockSupabase(tableData: TableData) {
	const calls: string[] = [];

	const supabase = {
		from(table: string) {
			calls.push(table);
			const entry = tableData[table];
			const listData = Array.isArray(entry) ? entry : (entry?.list ?? entry ?? []);
			const singleData = Array.isArray(entry)
				? (entry[0] ?? null)
				: (entry?.single ?? entry ?? null);
			const response = Promise.resolve({ data: listData, error: null });

			const builder: any = {
				select: () => builder,
				eq: () => builder,
				in: () => builder,
				single: () => Promise.resolve({ data: singleData, error: null }),
				maybeSingle: () => Promise.resolve({ data: singleData, error: null }),
				then: response.then.bind(response),
				catch: response.catch.bind(response),
				finally: response.finally.bind(response)
			};

			return builder;
		},
		__calls: calls
	};

	return supabase as any;
}

describe('loadProjectGraphData', () => {
	it('skips unrequested entity kinds when entityKinds is provided', async () => {
		const supabase = createMockSupabase({
			onto_projects: { single: { id: 'proj-1', state_key: 'active' } },
			onto_tasks: [{ id: 'task-1', project_id: 'proj-1' }],
			onto_edges: []
		});

		const result = await loadProjectGraphData(supabase, 'proj-1', { entityKinds: ['task'] });

		expect(result.tasks).toHaveLength(1);
		expect(result.plans).toHaveLength(0);
		expect(result.goals).toHaveLength(0);
		expect(result.edges).toHaveLength(0);

		expect(supabase.__calls).toContain('onto_projects');
		expect(supabase.__calls).toContain('onto_tasks');
		expect(supabase.__calls).toContain('onto_edges');
		expect(supabase.__calls).not.toContain('onto_plans');
		expect(supabase.__calls).not.toContain('onto_goals');
	});
});

describe('loadMultipleProjectGraphs', () => {
	it('groups entities by project id', async () => {
		const supabase = createMockSupabase({
			onto_projects: [
				{ id: 'proj-1', state_key: 'active' },
				{ id: 'proj-2', state_key: 'active' }
			],
			onto_tasks: [
				{ id: 'task-1', project_id: 'proj-1' },
				{ id: 'task-2', project_id: 'proj-2' }
			],
			onto_edges: []
		});

		const graphs = await loadMultipleProjectGraphs(supabase, ['proj-1', 'proj-2']);

		expect(graphs.get('proj-1')?.tasks.map((t: any) => t.id)).toEqual(['task-1']);
		expect(graphs.get('proj-2')?.tasks.map((t: any) => t.id)).toEqual(['task-2']);
	});
});
