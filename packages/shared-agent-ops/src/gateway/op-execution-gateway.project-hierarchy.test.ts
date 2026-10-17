// packages/shared-agent-ops/src/gateway/op-execution-gateway.project-hierarchy.test.ts
//
// Tasker 122, connector parity: ChatGPT/Codex/Claude connectors read projects
// through these serializers, which hid the parent just like in-app chat did.
// The visible set is the connector's GRANTED projects, so a parent or child
// outside the grant is never named or counted (the connector_scope rule).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const HUB = '11111111-1111-4111-8111-111111111111';
const CHILD = '22222222-2222-4222-8222-222222222222';
const SIBLING = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
	ensureActorId: vi.fn(async () => 'actor-1'),
	fetchProjectSummaries: vi.fn(),
	loadProjectStartHereExcerpt: vi.fn(async () => null)
}));

vi.mock('../ontology/ontology-projects.service', () => ({
	ensureActorId: mocks.ensureActorId,
	fetchProjectSummaries: mocks.fetchProjectSummaries
}));

vi.mock('../ontology/start-here.service', () => ({
	loadProjectStartHereExcerpt: mocks.loadProjectStartHereExcerpt
}));

import { getProject, listProjects, searchProjects } from './op-execution-gateway.projects';

function project(id: string, name: string) {
	return {
		id,
		name,
		description: `${name} work`,
		type_key: 'project.generic',
		state_key: 'active',
		updated_at: '2026-10-16T00:00:00.000Z',
		task_count: 0,
		goal_count: 0,
		plan_count: 0,
		document_count: 0,
		access_role: 'owner',
		access_level: 'admin',
		is_shared: false
	};
}

const HIERARCHY_ROWS = [
	{ id: HUB, parent_project_id: null },
	{ id: CHILD, parent_project_id: HUB },
	{ id: SIBLING, parent_project_id: HUB }
];

function admin(hierarchy: { data: unknown; error: unknown } | 'throw') {
	return {
		from: vi.fn((table: string) => {
			if (table !== 'onto_projects') throw new Error(`Unexpected table ${table}`);
			if (hierarchy === 'throw') throw new Error('network down');
			const chain: Record<string, any> = {};
			for (const method of ['select', 'in', 'is']) chain[method] = () => chain;
			chain.then = (resolve: (value: unknown) => unknown) =>
				Promise.resolve(hierarchy).then(resolve);
			return chain;
		}),
		rpc: vi.fn(async () => ({ data: { project: { id: HUB } }, error: null }))
	};
}

function context(hierarchy: { data: unknown; error: unknown } | 'throw', projectIds?: string[]) {
	return {
		admin: admin(hierarchy),
		userId: USER_ID,
		scope: { mode: 'read_only', ...(projectIds ? { project_ids: projectIds } : {}) }
	} as never;
}

const ok = { data: HIERARCHY_ROWS, error: null };

describe('connector project hierarchy', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.fetchProjectSummaries.mockResolvedValue([
			project(HUB, 'Wayne Strategies'),
			project(CHILD, 'Cadre'),
			project(SIBLING, 'Redline')
		]);
	});

	it('lists the parent and the hub count for an unscoped connector', async () => {
		const listed = await listProjects(context(ok), {});
		const byId = new Map(listed.projects.map((entry) => [entry.id, entry]));
		expect(byId.get(CHILD)).toMatchObject({ parent: { id: HUB, name: 'Wayne Strategies' } });
		expect(byId.get(HUB)).toMatchObject({ sub_project_count: 2 });
		expect(byId.get(HUB)).not.toHaveProperty('parent');
	});

	it('never names or counts projects outside the connector grant', async () => {
		const listed = await listProjects(context(ok, [CHILD, SIBLING]), {});
		for (const entry of listed.projects) expect(entry).not.toHaveProperty('parent');
		expect(JSON.stringify(listed.projects)).not.toContain('Wayne Strategies');

		const hubOnly = await listProjects(context(ok, [HUB, CHILD]), {});
		expect(hubOnly.projects.find((entry) => entry.id === HUB)).toMatchObject({
			sub_project_count: 1
		});
	});

	it('adds the parent to search results', async () => {
		const searched = await searchProjects(context(ok), { query: 'cadre' });
		expect(searched.results[0]).toMatchObject({
			id: CHILD,
			parent: { id: HUB, name: 'Wayne Strategies' }
		});
	});

	it('gives get_onto_project_details the readable sub-projects', async () => {
		const result = await getProject(context(ok), { project_id: HUB });
		expect(result.project).toMatchObject({
			id: HUB,
			sub_project_count: 2,
			sub_projects: [
				{ id: CHILD, name: 'Cadre' },
				{ id: SIBLING, name: 'Redline' }
			]
		});
		expect(result.snapshot).toEqual({ project: { id: HUB } });
	});

	it('returns unlabeled projects when the hierarchy read fails', async () => {
		for (const failure of [{ data: null, error: { message: 'boom' } }, 'throw' as const]) {
			const listed = await listProjects(context(failure), {});
			expect(listed.total).toBe(3);
			expect(JSON.stringify(listed.projects)).not.toContain('"parent"');
			const detail = await getProject(context(failure), { project_id: HUB });
			expect(detail.project).not.toHaveProperty('sub_project_count');
		}
	});
});
