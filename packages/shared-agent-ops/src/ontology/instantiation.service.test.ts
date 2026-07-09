// packages/shared-agent-ops/src/ontology/instantiation.service.test.ts
//
// Locks the concurrency semantics introduced by speed-audit WP-12
// (2026-07-09): entity inserts run in a bounded parallel pool, identical
// facet payloads validate once, doc-tree placement stays serial, and a
// failed insert still leaves every landed row visible to cleanup.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	autoOrganizeConnections: vi.fn(async (..._args: unknown[]) => {}),
	addDocumentToTree: vi.fn(async (..._args: unknown[]) => {}),
	captureProductEvent: vi.fn(async (..._args: unknown[]) => {}),
	logActivitiesAsync: vi.fn(async (..._args: unknown[]) => {})
}));

vi.mock('./auto-organizer.service', () => ({
	autoOrganizeConnections: mocks.autoOrganizeConnections
}));
vi.mock('./doc-structure.service', () => ({
	addDocumentToTree: mocks.addDocumentToTree
}));
vi.mock('../analytics/posthog', () => ({
	captureProductEvent: mocks.captureProductEvent
}));
vi.mock('../ops/async-activity-logger', () => ({
	logActivitiesAsync: mocks.logActivitiesAsync
}));

import { instantiateProject, OntologyInstantiationError } from './instantiation.service';

type FailRule = (table: string, row: Record<string, unknown>) => string | null;

function createMockClient(options: { failOn?: FailRule } = {}) {
	let idCounter = 0;
	const insertsByTable = new Map<string, Record<string, unknown>[]>();
	const deletes: Array<{ table: string; method: 'in' | 'eq'; column: string; value: unknown }> =
		[];
	const rpcCalls: Array<{ fn: string; args: unknown }> = [];

	const client = {
		rpc: vi.fn(async (fn: string, args?: unknown) => {
			rpcCalls.push({ fn, args });
			if (fn === 'current_actor_id') return { data: 'actor-1', error: null };
			if (fn === 'ensure_actor_for_user') return { data: 'actor-1', error: null };
			if (fn === 'validate_facet_values') return { data: [], error: null };
			return { data: null, error: null };
		}),
		from: vi.fn((table: string) => ({
			insert(payload: unknown) {
				const rows = (
					Array.isArray(payload) ? payload : [payload]
				) as Record<string, unknown>[];
				const failure =
					rows.map((row) => options.failOn?.(table, row) ?? null).find(Boolean) ?? null;
				if (!failure) {
					const list = insertsByTable.get(table) ?? [];
					list.push(...rows);
					insertsByTable.set(table, list);
				}
				const ids = rows.map((row) =>
					typeof row.id === 'string' ? row.id : `${table}-${(idCounter += 1)}`
				);
				return {
					select: () => ({
						single: async () =>
							failure
								? { data: null, error: { message: failure } }
								: { data: { id: ids[0] }, error: null },
						then(resolve: (value: unknown) => void) {
							resolve(
								failure
									? { data: null, error: { message: failure } }
									: { data: ids.map((id) => ({ id })), error: null }
							);
						}
					}),
					then(resolve: (value: unknown) => void) {
						resolve({ error: failure ? { message: failure } : null });
					}
				};
			},
			select: () => ({
				eq: async () => ({ count: insertsByTable.get('onto_edges')?.length ?? 0 })
			}),
			delete: () => ({
				in: async (column: string, value: unknown) => {
					deletes.push({ table, method: 'in', column, value });
					return { error: null };
				},
				eq: async (column: string, value: unknown) => {
					deletes.push({ table, method: 'eq', column, value });
					return { error: null };
				}
			})
		}))
	};

	return { client: client as any, insertsByTable, deletes, rpcCalls };
}

function buildSpec() {
	return {
		project: {
			name: 'Launch Alpha',
			type_key: 'project.business.initiative'
		},
		entities: [
			{ temp_id: 'g1', kind: 'goal' as const, name: 'Beta cohort onboarded' },
			{
				temp_id: 't1',
				kind: 'task' as const,
				title: 'Finish onboarding flow',
				props: { facets: { context: 'startup' } }
			},
			{
				temp_id: 't2',
				kind: 'task' as const,
				title: 'Draft beta invite email',
				props: { facets: { context: 'startup' } }
			},
			{ temp_id: 'd1', kind: 'document' as const, title: 'Channels' }
		],
		relationships: []
	};
}

beforeEach(() => {
	mocks.autoOrganizeConnections.mockClear();
	mocks.addDocumentToTree.mockClear();
	mocks.captureProductEvent.mockClear();
	mocks.logActivitiesAsync.mockClear();
});

describe('instantiateProject', () => {
	it('creates the full graph with pooled inserts and correct counts', async () => {
		const { client, insertsByTable, rpcCalls } = createMockClient();

		const result = await instantiateProject(client, buildSpec(), 'user-1');

		expect(result.project_id).toBeTruthy();
		expect(result.counts).toMatchObject({
			goals: 1,
			tasks: 2,
			// context START HERE document + the spec document
			documents: 2
		});
		expect(insertsByTable.get('onto_projects')).toHaveLength(1);
		expect(insertsByTable.get('onto_goals')).toHaveLength(1);
		expect(insertsByTable.get('onto_tasks')).toHaveLength(2);
		expect(insertsByTable.get('onto_documents')).toHaveLength(2);

		// Identical task facets validate once, not once per task.
		const facetValidations = rpcCalls.filter((call) => call.fn === 'validate_facet_values');
		expect(facetValidations).toHaveLength(1);

		// Every created entity is auto-organized; the doc tree got the context
		// document first, then the spec document.
		expect(mocks.autoOrganizeConnections).toHaveBeenCalledTimes(4);
		expect(mocks.addDocumentToTree).toHaveBeenCalledTimes(2);
		expect(mocks.addDocumentToTree.mock.calls[0]?.[3]).toMatchObject({
			title: expect.stringContaining('START HERE')
		});
		expect(mocks.addDocumentToTree.mock.calls[1]?.[3]).toMatchObject({ title: 'Channels' });

		expect(mocks.captureProductEvent).toHaveBeenCalledTimes(1);
		expect(mocks.captureProductEvent).toHaveBeenCalledWith(
			'user-1',
			'project_created',
			expect.objectContaining({ project_id: result.project_id, task_count: 2 })
		);
		expect(mocks.logActivitiesAsync).toHaveBeenCalledTimes(1);
	});

	it('cleans up every landed row when one concurrent insert fails', async () => {
		const { client, insertsByTable, deletes } = createMockClient({
			failOn: (table, row) =>
				table === 'onto_tasks' && row.title === 'Draft beta invite email' ? 'boom' : null
		});

		await expect(instantiateProject(client, buildSpec(), 'user-1')).rejects.toThrow(
			/Draft beta invite email.*boom/
		);

		// In-flight siblings settled before the throw, so cleanup saw them:
		// the edge sweep covers the goal that landed, and the project row is
		// deleted.
		const goalIds = (insertsByTable.get('onto_goals') ?? []).map(() => true);
		expect(goalIds.length).toBeGreaterThan(0);
		const srcSweep = deletes.find(
			(entry) =>
				entry.table === 'onto_edges' && entry.method === 'in' && entry.column === 'src_id'
		);
		expect(srcSweep).toBeDefined();
		expect((srcSweep?.value as string[]).some((id) => id.startsWith('onto_goals'))).toBe(true);
		expect(
			deletes.some((entry) => entry.table === 'onto_projects' && entry.method === 'eq')
		).toBe(true);
	});

	it('rejects duplicate temp_ids before inserting any entity', async () => {
		const { client, insertsByTable, deletes } = createMockClient();
		const spec = buildSpec();
		spec.entities.push({ temp_id: 'g1', kind: 'goal' as const, name: 'Duplicate goal' });

		await expect(instantiateProject(client, spec, 'user-1')).rejects.toThrow(
			/Duplicate temp_id "g1"/
		);

		expect(insertsByTable.get('onto_goals')).toBeUndefined();
		expect(insertsByTable.get('onto_tasks')).toBeUndefined();
		// The project row (inserted before the check) is rolled back.
		expect(
			deletes.some((entry) => entry.table === 'onto_projects' && entry.method === 'eq')
		).toBe(true);
	});

	it('surfaces OntologyInstantiationError for an invalid spec without touching the DB', async () => {
		const { client, insertsByTable } = createMockClient();

		await expect(
			instantiateProject(client, { project: { name: '', type_key: 'nope' } } as any, 'user-1')
		).rejects.toThrow(OntologyInstantiationError);
		expect(insertsByTable.size).toBe(0);
	});
});
