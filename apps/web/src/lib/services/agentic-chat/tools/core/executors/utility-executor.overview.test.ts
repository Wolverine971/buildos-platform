// apps/web/src/lib/services/agentic-chat/tools/core/executors/utility-executor.overview.test.ts
import { describe, expect, it, vi } from 'vitest';
import { UtilityExecutor } from './utility-executor';

type ProjectSummaryRpcRow = {
	id: string;
	name: string;
	description: string | null;
	state_key: string;
	updated_at: string;
	next_step_short: string | null;
	owner_actor_id: string;
	access_role: 'owner' | 'editor' | 'viewer' | null;
	access_level: 'read' | 'write' | 'admin' | null;
	is_shared: boolean;
};

type TableRow = Record<string, any>;

function createProjectSummaryRow(
	overrides: Partial<ProjectSummaryRpcRow> & Pick<ProjectSummaryRpcRow, 'id' | 'name'>
): Record<string, any> {
	return {
		id: overrides.id,
		name: overrides.name,
		description: overrides.description ?? null,
		icon_svg: null,
		icon_concept: null,
		icon_generated_at: null,
		icon_generation_source: null,
		icon_generation_prompt: null,
		type_key: 'software',
		state_key: overrides.state_key ?? 'active',
		props: {},
		facet_context: null,
		facet_scale: null,
		facet_stage: null,
		created_at: overrides.updated_at ?? '2026-03-01T00:00:00.000Z',
		updated_at: overrides.updated_at ?? '2026-03-30T00:00:00.000Z',
		task_count: 0,
		goal_count: 0,
		plan_count: 0,
		document_count: 0,
		owner_actor_id: overrides.owner_actor_id ?? 'actor-1',
		access_role: overrides.access_role ?? 'owner',
		access_level: overrides.access_level ?? 'admin',
		is_shared: overrides.is_shared ?? false,
		next_step_short: overrides.next_step_short ?? null,
		next_step_long: null,
		next_step_source: null,
		next_step_updated_at: null
	};
}

function filterByProjectIds(rows: TableRow[], projectIds: unknown): TableRow[] {
	const allowed = Array.isArray(projectIds) ? new Set(projectIds.map(String)) : new Set<string>();
	return rows.filter((row) => allowed.has(String(row.project_id)));
}

function createOverviewSupabaseMock(config: {
	projectSummaries: Record<string, any>[];
	tasks?: TableRow[];
	milestones?: TableRow[];
	plans?: TableRow[];
	risks?: TableRow[];
	events?: TableRow[];
	projectLogs?: TableRow[];
}) {
	const tasks = config.tasks ?? [];
	const milestones = config.milestones ?? [];
	const plans = config.plans ?? [];
	const risks = config.risks ?? [];
	const events = config.events ?? [];
	const projectLogs = config.projectLogs ?? [];

	const rpc = vi.fn().mockImplementation((fn: string) => {
		if (fn === 'ensure_actor_for_user') {
			return Promise.resolve({ data: 'actor-1', error: null });
		}
		if (fn === 'get_onto_project_summaries_v1') {
			return Promise.resolve({ data: config.projectSummaries, error: null });
		}
		throw new Error(`Unexpected rpc call: ${fn}`);
	});

	const from = vi.fn().mockImplementation((table: string) => {
		if (table === 'onto_projects') {
			throw new Error('Unexpected direct onto_projects query in overview scope test');
		}

		if (table === 'onto_tasks') {
			return {
				select: vi.fn().mockReturnValue({
					in: vi.fn().mockImplementation((_column: string, projectIds: unknown) => ({
						is: vi.fn().mockResolvedValue({
							data: filterByProjectIds(tasks, projectIds),
							error: null
						})
					}))
				})
			};
		}

		if (table === 'onto_milestones') {
			return {
				select: vi.fn().mockReturnValue({
					in: vi.fn().mockImplementation((_column: string, projectIds: unknown) => ({
						is: vi.fn().mockResolvedValue({
							data: filterByProjectIds(milestones, projectIds),
							error: null
						})
					}))
				})
			};
		}

		if (table === 'onto_plans') {
			return {
				select: vi.fn().mockReturnValue({
					in: vi.fn().mockImplementation((_column: string, projectIds: unknown) => ({
						is: vi.fn().mockResolvedValue({
							data: filterByProjectIds(plans, projectIds),
							error: null
						})
					}))
				})
			};
		}

		if (table === 'onto_risks') {
			return {
				select: vi.fn().mockReturnValue({
					in: vi.fn().mockImplementation((_column: string, projectIds: unknown) => ({
						is: vi.fn().mockResolvedValue({
							data: filterByProjectIds(risks, projectIds),
							error: null
						})
					}))
				})
			};
		}

		if (table === 'onto_events') {
			return {
				select: vi.fn().mockReturnValue({
					in: vi.fn().mockImplementation((_column: string, projectIds: unknown) => ({
						is: vi.fn().mockReturnValue({
							gte: vi.fn().mockReturnValue({
								lte: vi.fn().mockResolvedValue({
									data: filterByProjectIds(events, projectIds),
									error: null
								})
							})
						})
					}))
				})
			};
		}

		if (table === 'onto_project_logs') {
			return {
				select: vi.fn().mockReturnValue({
					in: vi.fn().mockImplementation((_column: string, projectIds: unknown) => ({
						order: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue({
								data: filterByProjectIds(projectLogs, projectIds),
								error: null
							})
						})
					}))
				})
			};
		}

		throw new Error(`Unexpected table in overview mock: ${table}`);
	});

	return {
		rpc,
		from,
		auth: {
			getSession: vi.fn().mockResolvedValue({ data: { session: null } })
		}
	} as any;
}

function createExecutor(supabase: any): UtilityExecutor {
	return new UtilityExecutor({
		supabase,
		userId: 'user-1',
		sessionId: 'session-1',
		fetchFn: vi.fn() as any,
		getActorId: vi.fn(),
		getAdminSupabase: vi.fn(),
		getAuthHeaders: vi.fn()
	});
}

describe('UtilityExecutor overview scoping', () => {
	it('limits workspace overview to owner-or-member project summaries', async () => {
		const supabase = createOverviewSupabaseMock({
			projectSummaries: [
				createProjectSummaryRow({
					id: 'proj-owned',
					name: '9takes',
					updated_at: '2026-03-30T12:00:00.000Z',
					next_step_short: 'Ship the next release'
				}),
				createProjectSummaryRow({
					id: 'proj-shared',
					name: 'Shared Alpha',
					updated_at: '2026-03-29T12:00:00.000Z',
					owner_actor_id: 'actor-2',
					access_role: 'editor',
					access_level: 'write',
					is_shared: true
				})
			],
			tasks: [
				{
					id: 'task-owned',
					project_id: 'proj-owned',
					title: 'Owned task',
					state_key: 'blocked',
					priority: 1,
					due_at: '2026-03-29T12:00:00.000Z',
					completed_at: null,
					updated_at: '2026-03-30T10:00:00.000Z'
				},
				{
					id: 'task-shared',
					project_id: 'proj-shared',
					title: 'Shared task',
					state_key: 'todo',
					priority: 3,
					due_at: null,
					completed_at: null,
					updated_at: '2026-03-29T10:00:00.000Z'
				},
				{
					id: 'task-public',
					project_id: 'proj-public',
					title: 'Public task',
					state_key: 'todo',
					priority: 5,
					due_at: null,
					completed_at: null,
					updated_at: '2026-03-28T10:00:00.000Z'
				}
			]
		});
		const executor = createExecutor(supabase);

		const payload = await executor.getWorkspaceOverview({ project_limit: 10 });

		expect(payload.scope).toBe('workspace');
		expect(payload.projects_returned).toBe(2);
		expect(
			payload.projects.map((project: { project_id: string }) => project.project_id)
		).toEqual(['proj-owned', 'proj-shared']);
		expect(payload.projects.map((project: { name: string }) => project.name)).toEqual([
			'9takes',
			'Shared Alpha'
		]);
		expect(payload.totals.active_tasks).toBe(2);
		expect(payload.totals.blocked_tasks).toBe(1);
	});

	it('resolves named project overview within owner-or-member scope only', async () => {
		const supabase = createOverviewSupabaseMock({
			projectSummaries: [
				createProjectSummaryRow({
					id: 'proj-owned',
					name: '9takes',
					updated_at: '2026-03-30T12:00:00.000Z'
				}),
				createProjectSummaryRow({
					id: 'proj-shared',
					name: 'Shared Alpha',
					updated_at: '2026-03-29T12:00:00.000Z',
					owner_actor_id: 'actor-2',
					access_role: 'viewer',
					access_level: 'read',
					is_shared: true
				})
			],
			tasks: [
				{
					id: 'task-owned',
					project_id: 'proj-owned',
					title: 'Owned task',
					state_key: 'blocked',
					priority: 1,
					due_at: null,
					completed_at: null,
					updated_at: '2026-03-30T10:00:00.000Z'
				}
			]
		});
		const executor = createExecutor(supabase);

		const payload = await executor.getProjectOverview({ query: '9takes' });

		expect(payload.scope).toBe('project');
		expect(payload.match).toMatchObject({
			status: 'resolved',
			project_id: 'proj-owned',
			query: '9takes'
		});
		expect(payload.project).toMatchObject({
			id: 'proj-owned',
			name: '9takes'
		});
	});

	it('does not expose public-only projects via direct project_id lookup', async () => {
		const supabase = createOverviewSupabaseMock({
			projectSummaries: [
				createProjectSummaryRow({
					id: 'proj-owned',
					name: '9takes',
					updated_at: '2026-03-30T12:00:00.000Z'
				})
			]
		});
		const executor = createExecutor(supabase);

		const payload = await executor.getProjectOverview({ project_id: 'proj-public' });

		expect(payload.scope).toBe('project');
		expect(payload.match).toMatchObject({
			status: 'not_found',
			query: 'proj-public',
			candidates: []
		});
		expect(payload.message).toBe('No accessible project matched that project_id.');
	});

	it('zooms out to global context without project lookup', async () => {
		const supabase = createOverviewSupabaseMock({ projectSummaries: [] });
		const executor = createExecutor(supabase);

		const payload = await executor.changeChatContext({
			target: 'global',
			reason: 'Review all projects.'
		});

		expect(payload.changed).toBe(true);
		expect(payload.context_shift).toMatchObject({
			new_context: 'global',
			entity_id: null,
			entity_name: 'Workspace',
			entity_type: 'workspace',
			message: 'Review all projects.'
		});
		expect(payload.materialized_tools).toContain('get_workspace_overview');
		expect(payload.materialized_tools).toContain('search_all_projects');
	});

	it('zooms into a resolved project and materializes project tools', async () => {
		const supabase = createOverviewSupabaseMock({
			projectSummaries: [
				createProjectSummaryRow({
					id: 'proj-ember',
					name: 'The Last Ember',
					updated_at: '2026-04-15T12:00:00.000Z'
				})
			]
		});
		const executor = createExecutor(supabase);

		const payload = await executor.changeChatContext({
			target: 'project',
			project_query: 'Last Ember'
		});

		expect(payload.changed).toBe(true);
		expect(payload.project).toMatchObject({
			id: 'proj-ember',
			name: 'The Last Ember'
		});
		expect(payload.context_shift).toMatchObject({
			new_context: 'project',
			entity_id: 'proj-ember',
			entity_name: 'The Last Ember',
			entity_type: 'project'
		});
		expect(payload.materialized_tools).toContain('get_project_overview');
		expect(payload.materialized_tools).toContain('search_project');
		expect(payload.materialized_tools).toContain('list_onto_tasks');
	});

	it('does not change context when project resolution is ambiguous', async () => {
		const supabase = createOverviewSupabaseMock({
			projectSummaries: [
				createProjectSummaryRow({
					id: 'proj-ember-a',
					name: 'The Last Ember',
					updated_at: '2026-04-15T12:00:00.000Z'
				}),
				createProjectSummaryRow({
					id: 'proj-ember-b',
					name: 'Last Ember Archive',
					updated_at: '2026-04-14T12:00:00.000Z'
				})
			]
		});
		const executor = createExecutor(supabase);

		const payload = await executor.changeChatContext({
			target: 'project',
			project_query: 'Ember'
		});

		expect(payload.changed).toBe(false);
		expect(payload.context_shift).toBeUndefined();
		expect(payload.match).toMatchObject({
			status: 'ambiguous',
			query: 'Ember'
		});
		expect(payload.match.candidates).toHaveLength(2);
	});
});
