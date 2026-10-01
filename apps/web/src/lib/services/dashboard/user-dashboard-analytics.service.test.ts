// apps/web/src/lib/services/dashboard/user-dashboard-analytics.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { getUserDashboardAnalytics } from './user-dashboard-analytics.service';

const recentProject = (id: string, name: string) => ({
	id,
	name,
	description: null,
	state_key: 'active',
	is_shared: false,
	updated_at: '2026-09-30T12:00:00.000Z',
	task_count: 1,
	goal_count: 0,
	document_count: 2
});

/** The RPC payload plus the project rows RLS lets this viewer read. */
function client(visibleRows: unknown[] | null, labelError: unknown = null) {
	const filters: unknown[][] = [];
	const query: any = {
		select: vi.fn(() => query),
		is: vi.fn((...args: unknown[]) => {
			filters.push(['is', ...args]);
			return query;
		}),
		or: vi.fn((...args: unknown[]) => {
			filters.push(['or', ...args]);
			return query;
		}),
		then: (resolve: any, reject: any) =>
			Promise.resolve({ data: visibleRows, error: labelError }).then(resolve, reject)
	};
	return {
		filters,
		from: vi.fn(() => query),
		rpc: vi.fn(async () => ({
			data: {
				snapshot: {},
				attention: {},
				recent: {
					projects: [
						recentProject('redline', 'Redline'),
						recentProject('cadre', 'The Cadre'),
						recentProject('notes', 'Notes')
					]
				}
			},
			error: null
		}))
	};
}

describe('dashboard parent labels', () => {
	it('names a sub-project parent only when the viewer can open it', async () => {
		const supabase = client([
			{ id: 'hub', name: 'Wayne Strategies', parent_project_id: null },
			{ id: 'redline', name: 'Redline', parent_project_id: 'hub' },
			// Its parent is not readable by this viewer, so RLS did not return it.
			{ id: 'cadre', name: 'The Cadre', parent_project_id: 'hidden-hub' }
		]);
		const analytics = await getUserDashboardAnalytics(
			supabase as never,
			'user-1',
			undefined,
			'actor-1'
		);
		const byId = new Map(analytics.recent.projects.map((project) => [project.id, project]));
		expect(byId.get('redline')).toMatchObject({
			parent_project_id: 'hub',
			parent_project_name: 'Wayne Strategies'
		});
		expect(byId.get('cadre')).not.toHaveProperty('parent_project_id');
		expect(byId.get('notes')).not.toHaveProperty('parent_project_name');
		// One read through the viewer's client, never the admin client.
		expect(supabase.from).toHaveBeenCalledOnce();
		expect(supabase.from).toHaveBeenCalledWith('onto_projects');
		expect(supabase.filters).toContainEqual(['is', 'deleted_at', null]);
	});

	it('keeps the dashboard when the label read fails', async () => {
		const analytics = await getUserDashboardAnalytics(
			client(null, { message: 'timeout' }) as never,
			'user-1',
			undefined,
			'actor-1'
		);
		expect(analytics.recent.projects.map((project) => project.id)).toEqual([
			'redline',
			'cadre',
			'notes'
		]);
		expect(analytics.recent.projects[0]).not.toHaveProperty('parent_project_name');
	});
});
