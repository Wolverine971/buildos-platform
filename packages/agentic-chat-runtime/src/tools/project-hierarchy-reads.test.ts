// packages/agentic-chat-runtime/src/tools/project-hierarchy-reads.test.ts
//
// Tasker 122, phase 1: project reads show where a project sits. On 10-16 global
// chat told the owner "projects can't nest" because no read ever showed a
// parent. Rule under test everywhere: name a parent or sub-project only when the
// viewer can open it, and never fail the read when the hierarchy lookup fails.
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import { getOntoProjectDetails, listOntoProjects, searchOntoProjects } from './ontology-reads';
import { getFieldInfo, getProjectOverview, getWorkspaceOverview } from './overview-reads';

const summary = (id: string, name: string, updated_at: string) => ({
	id,
	name,
	description: `${name} work`,
	type_key: 'project.generic',
	state_key: 'active',
	updated_at,
	task_count: 0,
	document_count: 0,
	plan_count: 0,
	goal_count: 0
});

// Accessible: a hub with two children, plus a project whose parent the viewer
// cannot open. `secret-child` sits under the hub but is not accessible.
const SUMMARIES = [
	summary('hub', 'Wayne Strategies', '2026-10-16T12:00:00Z'),
	summary('cadre', 'Cadre Content Ops', '2026-10-15T12:00:00Z'),
	summary('redline', 'Redline', '2026-10-14T12:00:00Z'),
	summary('solo', 'Solo Client', '2026-10-13T12:00:00Z')
];

const HIERARCHY_ROWS = [
	{ id: 'hub', parent_project_id: null },
	{ id: 'cadre', parent_project_id: 'hub' },
	{ id: 'redline', parent_project_id: 'hub' },
	{ id: 'solo', parent_project_id: 'secret-parent' },
	{ id: 'secret-child', parent_project_id: 'hub' }
];

type TableResult = { data: unknown; error: { message: string } | null };

const HIERARCHY_COLUMNS = 'id, parent_project_id';

function builder(result: TableResult, hierarchy?: TableResult | 'throw') {
	const chain: Record<string, any> = {};
	for (const method of ['in', 'is', 'eq', 'not', 'gte', 'lte', 'order', 'limit']) {
		chain[method] = () => chain;
	}
	// Only the hierarchy read is swapped; other onto_projects reads keep the table rows.
	chain.select = (columns: string) => {
		if (columns !== HIERARCHY_COLUMNS || !hierarchy) return chain;
		if (hierarchy === 'throw') throw new Error('network down');
		return builder(hierarchy);
	};
	chain.maybeSingle = async () => ({
		data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
		error: result.error
	});
	chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
		Promise.resolve({
			data: result.data,
			count: Array.isArray(result.data) ? result.data.length : 0,
			error: result.error
		}).then(resolve, reject);
	return chain;
}

function makeContext(
	options: {
		tables?: Record<string, TableResult>;
		hierarchy?: TableResult | 'throw';
		rpc?: (fn: string, args: Record<string, unknown>) => Promise<TableResult>;
	} = {}
) {
	const rpc = vi.fn(options.rpc ?? (async () => ({ data: null, error: null })));
	const client = {
		from: (table: string) =>
			builder(
				options.tables?.[table] ?? { data: [], error: null },
				table === 'onto_projects' ? options.hierarchy : undefined
			),
		rpc
	};
	const context = {
		client,
		userId: 'user-1',
		timezone: null,
		access: {
			getActorId: async () => 'actor-1',
			resolveProjectSummaries: async () => SUMMARIES,
			assertProjectAccess: async () => undefined,
			assertEntityAccess: async () => undefined
		}
	} as unknown as AgenticChatSharedReadContextV1;
	return { context, rpc };
}

const withHierarchy = () => makeContext({ hierarchy: { data: HIERARCHY_ROWS, error: null } });

describe('list_onto_projects / search_onto_projects hierarchy', () => {
	it('shows an accessible parent and counts only accessible sub-projects', async () => {
		const { projects } = await listOntoProjects(withHierarchy().context, {});
		const byId = new Map(projects.map((project) => [project.id, project]));

		expect(byId.get('cadre').parent).toEqual({ id: 'hub', name: 'Wayne Strategies' });
		expect(byId.get('hub').sub_project_count).toBe(2);
		expect(byId.get('hub')).not.toHaveProperty('parent');
		// The parent the viewer cannot open is omitted, not named.
		expect(byId.get('solo')).not.toHaveProperty('parent');
		expect(byId.get('redline')).not.toHaveProperty('sub_project_count');
		expect(JSON.stringify(projects)).not.toContain('secret');
	});

	it('counts a hub’s children even when the search returns only the hub', async () => {
		const { projects } = await searchOntoProjects(withHierarchy().context, {
			query: 'wayne'
		});
		expect(projects).toHaveLength(1);
		expect(projects[0]).toMatchObject({ id: 'hub', sub_project_count: 2 });
	});

	it('still lists projects when the hierarchy read errors or throws', async () => {
		for (const hierarchy of [
			{ data: null, error: { message: 'permission denied' } },
			'throw' as const
		]) {
			const { projects, total } = await listOntoProjects(
				makeContext({ hierarchy }).context,
				{}
			);
			expect(total).toBe(4);
			for (const project of projects) {
				expect(project).not.toHaveProperty('parent');
				expect(project).not.toHaveProperty('sub_project_count');
			}
		}
	});
});

describe('get_onto_project_details hierarchy', () => {
	const tables = {
		onto_projects: {
			data: [{ id: 'hub', name: 'Wayne Strategies', state_key: 'active' }],
			error: null
		}
	};

	it('adds the parent and readable sub-projects from the family RPC with the actor', async () => {
		const { context, rpc } = makeContext({
			tables,
			rpc: async () => ({
				data: {
					project_id: 'hub',
					parent: null,
					shelf: [],
					children: [
						{ id: 'cadre', name: 'Cadre Content Ops' },
						{ id: 'redline', name: 'Redline' }
					],
					child_count: 3
				},
				error: null
			})
		});
		const payload = await getOntoProjectDetails(context, { project_id: 'hub' });

		expect(rpc).toHaveBeenCalledWith('onto_project_family_v1', {
			p_project_id: 'hub',
			p_actor_id: 'actor-1'
		});
		// The count is what the viewer can open (2), not the RPC's all-children 3.
		expect(payload.project).toMatchObject({
			id: 'hub',
			sub_project_count: 2,
			sub_projects: [
				{ id: 'cadre', name: 'Cadre Content Ops' },
				{ id: 'redline', name: 'Redline' }
			]
		});
		expect(payload.project).not.toHaveProperty('parent');
	});

	it('loads the details without hierarchy fields when the family RPC fails', async () => {
		const { context } = makeContext({
			tables,
			rpc: async () => ({ data: null, error: { message: 'project_family_access_denied' } })
		});
		const payload = await getOntoProjectDetails(context, { project_id: 'hub' });
		expect(payload.project).toEqual({
			id: 'hub',
			name: 'Wayne Strategies',
			state_key: 'active'
		});
	});
});

describe('get_project_overview / get_workspace_overview hierarchy', () => {
	it('gives a child its parent and a hub its sub-projects (global surface)', async () => {
		const child = await getProjectOverview(withHierarchy().context, { project_id: 'cadre' });
		expect(child.project.parent).toEqual({ id: 'hub', name: 'Wayne Strategies' });
		expect(child.project).not.toHaveProperty('sub_projects');

		const hub = await getProjectOverview(withHierarchy().context, {
			query: 'Wayne Strategies'
		});
		expect(hub.match.status).toBe('resolved');
		expect(hub.project).toMatchObject({
			sub_project_count: 2,
			sub_projects: [
				{ id: 'cadre', name: 'Cadre Content Ops' },
				{ id: 'redline', name: 'Redline' }
			]
		});
		expect(JSON.stringify(hub)).not.toContain('secret');
	});

	it('omits a parent the viewer cannot open', async () => {
		const solo = await getProjectOverview(withHierarchy().context, { project_id: 'solo' });
		expect(solo.project).not.toHaveProperty('parent');
		expect(JSON.stringify(solo)).not.toContain('secret');
	});

	it('labels each workspace project and survives a failed hierarchy read', async () => {
		const workspace = await getWorkspaceOverview(withHierarchy().context);
		const byId = new Map<string, Record<string, any>>(
			workspace.projects.map((project: Record<string, any>) => [project.project_id, project])
		);
		expect(byId.get('cadre')?.parent).toEqual({ id: 'hub', name: 'Wayne Strategies' });
		expect(byId.get('hub')?.sub_project_count).toBe(2);
		expect(byId.get('solo')).not.toHaveProperty('parent');

		const failed = await getWorkspaceOverview(makeContext({ hierarchy: 'throw' }).context);
		expect(failed.projects).toHaveLength(4);
		expect(JSON.stringify(failed.projects)).not.toContain('"parent"');
	});
});

describe('get_field_info curated wording', () => {
	it('says a field missing from the curated list may still exist', () => {
		expect(() =>
			getFieldInfo({ entity_type: 'ontology_project', field_name: 'org_id' })
		).toThrow(/not in the curated field guide.*does not mean the field doesn't exist/);
		expect(() =>
			getFieldInfo({ entity_type: 'ontology_project', field_name: 'org_id' })
		).not.toThrow(/Available fields/);
	});

	it('documents parent_project_id as read-only', () => {
		const info = getFieldInfo({
			entity_type: 'ontology_project',
			field_name: 'parent_project_id'
		});
		expect(info.fields.parent_project_id).toMatchObject({ type: 'string' });
	});
});
