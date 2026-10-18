// apps/worker/tests/agenticChatWorkerAccessAdapter.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	WorkerAgenticChatToolAccessAdapter,
	WorkerTurnAgenticChatToolAccess
} from '../src/workers/agentic-chat/tools/worker-access-adapter';
import { deferred } from './helpers/deferred';

const ensureActorIdMock = vi.hoisted(() => vi.fn());
const fetchProjectSummariesMock = vi.hoisted(() => vi.fn());

vi.mock('@buildos/shared-agent-ops/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock,
	fetchProjectSummaries: fetchProjectSummariesMock
}));

const USER_ID = '10000000-0000-4000-8000-000000000001';
const ACTOR_ID = '90000000-0000-4000-8000-000000000009';
const PROJECT_ID = '40000000-0000-4000-8000-000000000004';
const ENTITY_ID = '70000000-0000-4000-8000-000000000007';

type TableRow = { data: Record<string, unknown> | null; error?: unknown };

function fakeClient(input: { rpc?: ReturnType<typeof vi.fn>; tables?: Record<string, TableRow> }): {
	rpc: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	queriedTables: string[];
} {
	const queriedTables: string[] = [];
	const rpc = input.rpc ?? vi.fn(async () => ({ data: true, error: null }));
	const from = vi.fn((table: string) => {
		queriedTables.push(table);
		const row = input.tables?.[table] ?? { data: null };
		return {
			select: vi.fn(() => ({
				eq: vi.fn(() => ({
					maybeSingle: vi.fn(async () => ({
						data: row.data,
						error: row.error ?? null
					}))
				}))
			}))
		};
	});
	return { rpc, from, queriedTables };
}

function adapterFor(client: { rpc: unknown; from: unknown }): WorkerAgenticChatToolAccessAdapter {
	return new WorkerAgenticChatToolAccessAdapter({ client: client as never, userId: USER_ID });
}

beforeEach(() => {
	ensureActorIdMock.mockReset();
	ensureActorIdMock.mockResolvedValue(ACTOR_ID);
	fetchProjectSummariesMock.mockReset();
});

describe('WorkerAgenticChatToolAccessAdapter', () => {
	it('resolves the actor once per adapter instance and caches it', async () => {
		const client = fakeClient({});
		const adapter = adapterFor(client);

		await expect(adapter.getActorId()).resolves.toBe(ACTOR_ID);
		await expect(adapter.getActorId()).resolves.toBe(ACTOR_ID);
		await adapter.assertProjectAccess(PROJECT_ID, 'read');

		expect(ensureActorIdMock).toHaveBeenCalledTimes(1);
		expect(ensureActorIdMock).toHaveBeenCalledWith(client, USER_ID);
	});

	it('does not cache a failed actor resolution', async () => {
		ensureActorIdMock
			.mockRejectedValueOnce(new Error('actor rpc down'))
			.mockResolvedValueOnce(ACTOR_ID);
		const adapter = adapterFor(fakeClient({}));

		await expect(adapter.getActorId()).rejects.toThrow('actor rpc down');
		await expect(adapter.getActorId()).resolves.toBe(ACTOR_ID);
		expect(ensureActorIdMock).toHaveBeenCalledTimes(2);
	});

	it('gates project access through the actor-explicit membership RPC', async () => {
		const client = fakeClient({});
		const adapter = adapterFor(client);

		await expect(adapter.assertProjectAccess(PROJECT_ID, 'read')).resolves.toBeUndefined();
		expect(client.rpc).toHaveBeenCalledExactlyOnceWith('actor_has_project_member_access', {
			p_actor_id: ACTOR_ID,
			p_project_id: PROJECT_ID,
			p_required_access: 'read'
		});
	});

	it('throws the web-identical denial message on falsy RPC data', async () => {
		const client = fakeClient({ rpc: vi.fn(async () => ({ data: false, error: null })) });
		const adapter = adapterFor(client);

		await expect(adapter.assertProjectAccess(PROJECT_ID, 'read')).rejects.toThrow(
			'Project not found or access denied'
		);
	});

	it('rethrows the raw membership RPC error', async () => {
		const rpcError = Object.assign(new Error('permission denied'), { code: '42501' });
		const client = fakeClient({ rpc: vi.fn(async () => ({ data: null, error: rpcError })) });
		const adapter = adapterFor(client);

		await expect(adapter.assertProjectAccess(PROJECT_ID, 'write')).rejects.toBe(rpcError);
	});

	it('delegates project summaries to the shared fetch with the resolved actor', async () => {
		const summaries = [{ id: PROJECT_ID, state_key: 'active' }];
		fetchProjectSummariesMock.mockResolvedValue(summaries);
		const client = fakeClient({});
		const adapter = adapterFor(client);

		await expect(adapter.resolveProjectSummaries()).resolves.toBe(summaries);
		expect(fetchProjectSummariesMock).toHaveBeenCalledExactlyOnceWith(client, ACTOR_ID);
	});

	it('resolves entity access project-first', async () => {
		const client = fakeClient({
			tables: { onto_projects: { data: { id: ENTITY_ID } } }
		});
		const adapter = adapterFor(client);

		await expect(adapter.assertEntityAccess(ENTITY_ID, 'read')).resolves.toBeUndefined();
		expect(client.rpc).toHaveBeenCalledExactlyOnceWith('actor_has_project_member_access', {
			p_actor_id: ACTOR_ID,
			p_project_id: ENTITY_ID,
			p_required_access: 'read'
		});
		expect(client.queriedTables).toEqual(['onto_projects']);
	});

	it('walks the entity tables and asserts access on the owning project', async () => {
		const client = fakeClient({
			tables: {
				onto_goals: { data: { project_id: PROJECT_ID } }
			}
		});
		const adapter = adapterFor(client);

		await expect(adapter.assertEntityAccess(ENTITY_ID, 'read')).resolves.toBeUndefined();
		expect(client.rpc).toHaveBeenCalledExactlyOnceWith('actor_has_project_member_access', {
			p_actor_id: ACTOR_ID,
			p_project_id: PROJECT_ID,
			p_required_access: 'read'
		});
		expect(client.queriedTables).toEqual([
			'onto_projects',
			'onto_tasks',
			'onto_plans',
			'onto_goals'
		]);
	});

	it('ALWAYS denies a project-less entity: no created_by escape hatch on the worker', async () => {
		// Web's adapter grants a project-less entity when created_by matches the
		// actor. Under the worker's service-role client that would be fail-open
		// (S3 map correction 2), so even the actor's own row must throw.
		const client = fakeClient({
			tables: {
				onto_tasks: { data: { project_id: null, created_by: ACTOR_ID } }
			}
		});
		const adapter = adapterFor(client);

		await expect(adapter.assertEntityAccess(ENTITY_ID, 'read')).rejects.toThrow(
			'Entity not found or access denied'
		);
		expect(client.rpc).not.toHaveBeenCalled();
	});

	it('denies an entity that no table resolves', async () => {
		const client = fakeClient({});
		const adapter = adapterFor(client);

		await expect(adapter.assertEntityAccess(ENTITY_ID, 'admin')).rejects.toThrow(
			'Entity not found or access denied'
		);
		expect(client.queriedTables).toEqual([
			'onto_projects',
			'onto_tasks',
			'onto_plans',
			'onto_goals',
			'onto_documents',
			'onto_milestones',
			'onto_risks',
			'onto_requirements'
		]);
		expect(client.rpc).not.toHaveBeenCalled();
	});
});

describe('WorkerTurnAgenticChatToolAccess (per-turn membership cache, audit S7)', () => {
	const OTHER_PROJECT_ID = '40000000-0000-4000-8000-0000000000aa';

	function membershipCalls(rpc: ReturnType<typeof vi.fn>) {
		return rpc.mock.calls.filter(([name]) => name === 'actor_has_project_member_access');
	}

	it('runs one membership RPC per project for the reads of a turn', async () => {
		const client = fakeClient({});
		const access = new WorkerTurnAgenticChatToolAccess(adapterFor(client));

		for (let read = 0; read < 5; read += 1) {
			await access.assertProjectAccess(PROJECT_ID, 'read');
		}
		// Project ids compare case-insensitively.
		await access.assertProjectAccess(PROJECT_ID.toUpperCase(), 'read');
		await access.assertProjectAccess(OTHER_PROJECT_ID, 'read');
		expect(membershipCalls(client.rpc)).toHaveLength(2);
	});

	it('lets a higher grant cover lower levels, never the reverse', async () => {
		const client = fakeClient({});
		const access = new WorkerTurnAgenticChatToolAccess(adapterFor(client));

		await access.assertProjectAccess(PROJECT_ID, 'read');
		await access.assertProjectAccess(PROJECT_ID, 'write');
		expect(membershipCalls(client.rpc).map(([, args]) => args.p_required_access)).toEqual([
			'read',
			'write'
		]);
		await access.assertProjectAccess(PROJECT_ID, 'read');
		await access.assertProjectAccess(PROJECT_ID, 'write');
		await access.assertProjectAccess(PROJECT_ID, 'admin');
		expect(membershipCalls(client.rpc).map(([, args]) => args.p_required_access)).toEqual([
			'read',
			'write',
			'admin'
		]);
	});

	it('never caches a denial or an error', async () => {
		const rpc = vi
			.fn()
			.mockResolvedValueOnce({ data: false, error: null })
			.mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } })
			.mockResolvedValueOnce({ data: true, error: null });
		const client = fakeClient({ rpc });
		const access = new WorkerTurnAgenticChatToolAccess(adapterFor(client));

		await expect(access.assertProjectAccess(PROJECT_ID, 'read')).rejects.toThrow(
			'Project not found or access denied'
		);
		await expect(access.assertProjectAccess(PROJECT_ID, 'read')).rejects.toMatchObject({
			message: 'connection reset'
		});
		await expect(access.assertProjectAccess(PROJECT_ID, 'read')).resolves.toBeUndefined();
		await expect(access.assertProjectAccess(PROJECT_ID, 'read')).resolves.toBeUndefined();
		expect(membershipCalls(rpc)).toHaveLength(3);
	});

	it('shares one RPC between concurrent checks of the same project and level', async () => {
		const answer = deferred<{ data: boolean; error: null }>();
		const rpc = vi.fn(() => answer.promise);
		const client = fakeClient({ rpc });
		const access = new WorkerTurnAgenticChatToolAccess(adapterFor(client));

		const checks = [1, 2, 3].map(() => access.assertProjectAccess(PROJECT_ID, 'read'));
		await vi.waitFor(() => expect(membershipCalls(rpc)).toHaveLength(1));
		answer.resolve({ data: true, error: null });
		await expect(Promise.all(checks)).resolves.toEqual([undefined, undefined, undefined]);
		expect(membershipCalls(rpc)).toHaveLength(1);
	});

	it('asks the database for every check while a batch that may write runs, and starts clean after', async () => {
		const client = fakeClient({});
		const access = new WorkerTurnAgenticChatToolAccess(adapterFor(client));

		await access.assertProjectAccess(PROJECT_ID, 'read');
		access.beginToolBatch(true);
		await access.assertProjectAccess(PROJECT_ID, 'read');
		await access.assertProjectAccess(PROJECT_ID, 'read');
		expect(membershipCalls(client.rpc)).toHaveLength(3);

		// The next read-only batch re-checks once, then caches again.
		access.beginToolBatch(false);
		await access.assertProjectAccess(PROJECT_ID, 'read');
		await access.assertProjectAccess(PROJECT_ID, 'read');
		expect(membershipCalls(client.rpc)).toHaveLength(4);

		// Consecutive read-only batches keep the cache.
		access.beginToolBatch(false);
		await access.assertProjectAccess(PROJECT_ID, 'read');
		expect(membershipCalls(client.rpc)).toHaveLength(4);
	});

	it('does not let a check that started before an invalidation populate the cache', async () => {
		const answer = deferred<{ data: boolean; error: null }>();
		const rpc = vi
			.fn()
			.mockImplementationOnce(() => answer.promise)
			.mockResolvedValue({ data: true, error: null });
		const client = fakeClient({ rpc });
		const access = new WorkerTurnAgenticChatToolAccess(adapterFor(client));

		const early = access.assertProjectAccess(PROJECT_ID, 'read');
		await vi.waitFor(() => expect(membershipCalls(rpc)).toHaveLength(1));
		access.invalidate();
		answer.resolve({ data: true, error: null });
		await early;
		await access.assertProjectAccess(PROJECT_ID, 'read');
		expect(membershipCalls(rpc)).toHaveLength(2);
	});

	it('resolves an entity every time but reuses the cached project check behind it', async () => {
		const client = fakeClient({
			tables: { onto_tasks: { data: { project_id: PROJECT_ID } } }
		});
		const access = new WorkerTurnAgenticChatToolAccess(adapterFor(client));

		await access.assertEntityAccess(ENTITY_ID, 'read');
		await access.assertEntityAccess(ENTITY_ID, 'read');
		expect(client.queriedTables.filter((table) => table === 'onto_tasks')).toHaveLength(2);
		expect(membershipCalls(client.rpc)).toHaveLength(1);
	});

	it('still denies a project-less entity through the cache', async () => {
		const client = fakeClient({
			tables: { onto_tasks: { data: { project_id: null } } }
		});
		const access = new WorkerTurnAgenticChatToolAccess(adapterFor(client));
		await expect(access.assertEntityAccess(ENTITY_ID, 'read')).rejects.toThrow(
			'Entity not found or access denied'
		);
		expect(membershipCalls(client.rpc)).toHaveLength(0);
	});
});
