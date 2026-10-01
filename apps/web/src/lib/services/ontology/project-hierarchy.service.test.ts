// apps/web/src/lib/services/ontology/project-hierarchy.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	ProjectHierarchyError,
	getProjectFamily,
	hierarchyErrorApiCode,
	loadParentCandidateFacts,
	loadVisibleParentIds,
	setProjectParent,
	toProjectHierarchyError,
	tryGetProjectFamily
} from './project-hierarchy.service';

function rpcClient(result: { data?: unknown; error?: unknown }) {
	const rpc = vi
		.fn()
		.mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
	return { client: { rpc } as never, rpc };
}

describe('toProjectHierarchyError', () => {
	it('maps the RPC identifiers to statuses and plain messages', () => {
		const cases: Array<[string, number, string]> = [
			['project_parent_access_denied', 403, 'project_parent_access_denied'],
			['project_parent_admin_required', 403, 'project_parent_admin_required'],
			['project_parent_is_a_child', 409, 'project_parent_is_a_child'],
			['project_has_children', 409, 'project_has_children'],
			['project_parent_self', 409, 'project_parent_self'],
			['project_parent_not_found', 404, 'project_parent_not_found']
		];
		for (const [message, status, apiCode] of cases) {
			const mapped = toProjectHierarchyError({ message });
			expect(mapped.status).toBe(status);
			expect(hierarchyErrorApiCode(mapped)).toBe(apiCode);
			expect(mapped.message).not.toContain('_');
		}
	});

	it('explains the parent-admin rule without revealing an unreadable parent', () => {
		const adminRequired = toProjectHierarchyError({
			code: '42501',
			message: 'project_parent_admin_required'
		});
		expect(adminRequired).toMatchObject({ code: 'parent_admin_required', status: 403 });
		expect(adminRequired.message).toBe(
			'Only an admin of the parent project can nest projects under it.'
		);
		const denied = toProjectHierarchyError({ message: 'project_parent_access_denied' });
		expect(denied).toMatchObject({ code: 'access_denied', status: 403 });
		expect(denied.message).not.toMatch(/parent project/i);
	});

	it('falls back to a generic 500 for unknown errors', () => {
		const mapped = toProjectHierarchyError(new Error('connection reset'));
		expect(mapped).toBeInstanceOf(ProjectHierarchyError);
		expect(mapped.status).toBe(500);
	});
});

describe('getProjectFamily / tryGetProjectFamily', () => {
	it('returns the parsed family', async () => {
		const { client, rpc } = rpcClient({
			data: {
				project_id: 'p1',
				parent: null,
				shelf: [],
				children: [],
				own_shared_folder_document_id: null,
				child_count: 0
			}
		});
		await expect(getProjectFamily(client, 'p1')).resolves.toMatchObject({ project_id: 'p1' });
		expect(rpc).toHaveBeenCalledWith('onto_project_family_v1', { p_project_id: 'p1' });
	});

	it('tryGetProjectFamily returns null instead of throwing', async () => {
		const { client } = rpcClient({ error: { message: 'project_family_access_denied' } });
		await expect(getProjectFamily(client, 'p1')).rejects.toMatchObject({ status: 403 });
		await expect(tryGetProjectFamily(client, 'p1')).resolves.toBeNull();
	});
});

describe('setProjectParent', () => {
	it('passes null through to clear the parent', async () => {
		const { client, rpc } = rpcClient({
			data: {
				project_id: 'child',
				parent_project_id: null,
				previous_parent_project_id: 'hub',
				shared_folder_document_id: null
			}
		});
		await expect(setProjectParent(client, 'child', null)).resolves.toEqual({
			project_id: 'child',
			parent_project_id: null,
			previous_parent_project_id: 'hub',
			shared_folder_document_id: null
		});
		expect(rpc).toHaveBeenCalledWith('onto_project_set_parent_atomic', {
			p_project_id: 'child',
			p_parent_project_id: null
		});
	});

	it('leaves detach permission to the RPC and maps its admin rule', async () => {
		const { client, rpc } = rpcClient({
			error: { code: '42501', message: 'project_parent_admin_required' }
		});
		await expect(setProjectParent(client, 'child', 'hub')).rejects.toMatchObject({
			code: 'parent_admin_required',
			status: 403
		});
		// One call, straight to the RPC: no role lookups that could block a parent admin.
		expect(rpc).toHaveBeenCalledOnce();
		expect((client as { from?: unknown }).from).toBeUndefined();
	});

	it('throws the mapped error', async () => {
		const { client } = rpcClient({ error: { message: 'project_has_children' } });
		await expect(setProjectParent(client, 'hub', 'other')).rejects.toMatchObject({
			code: 'has_children',
			status: 409
		});
	});
});

describe('loadVisibleParentIds', () => {
	function tableClient(rows: unknown, error: unknown = null) {
		const chain = {
			select: vi.fn(() => chain),
			in: vi.fn(() => chain),
			not: vi.fn(() => Promise.resolve({ data: rows, error }))
		};
		return { from: vi.fn(() => chain) } as never;
	}

	it('keeps only parents that are in the visible set', async () => {
		const parents = await loadVisibleParentIds(
			tableClient([
				{ id: 'a', parent_project_id: 'hub' },
				{ id: 'b', parent_project_id: 'hidden-hub' }
			]),
			['a', 'b', 'hub']
		);
		expect([...parents]).toEqual([['a', 'hub']]);
	});

	it('fails open to no parents', async () => {
		const parents = await loadVisibleParentIds(
			tableClient(null, { message: 'column does not exist' }),
			['a']
		);
		expect(parents.size).toBe(0);
		expect((await loadVisibleParentIds(tableClient([]), [])).size).toBe(0);
	});
});

describe('loadParentCandidateFacts', () => {
	type Row = Record<string, unknown>;
	/** Tables as RLS returns them to this viewer; filters are applied, not ignored. */
	function tablesClient(tables: Record<string, Row[]>) {
		const from = vi.fn((table: string) => {
			let rows = [...(tables[table] ?? [])];
			const query: any = {
				select: vi.fn(() => query),
				in: vi.fn((column: string, values: unknown[]) => {
					rows = rows.filter((row) => values.includes(row[column]));
					return query;
				}),
				eq: vi.fn((column: string, value: unknown) => {
					rows = rows.filter((row) => row[column] === value);
					return query;
				}),
				is: vi.fn((column: string, value: unknown) => {
					rows = rows.filter((row) => (row[column] ?? null) === value);
					return query;
				}),
				then: (resolve: any, reject: any) =>
					Promise.resolve({ data: rows, error: null }).then(resolve, reject)
			};
			return query;
		});
		return { client: { from } as never, from };
	}

	const project = (id: string, extra: Row = {}): Row => ({
		id,
		name: id,
		parent_project_id: null,
		created_by: 'someone-else',
		deleted_at: null,
		...extra
	});

	it('names visible parents, flags hubs, and reports the viewer access level', async () => {
		const { client, from } = tablesClient({
			onto_projects: [
				project('hub', { name: 'Wayne Strategies', created_by: 'me' }),
				project('redline', { parent_project_id: 'hub' }),
				project('cadre'),
				// Its parent is outside what this viewer can open: never named or revealed.
				project('client-of-hidden', { parent_project_id: 'hidden-hub' }),
				project('nested-elsewhere', { parent_project_id: 'other-hub' }),
				project('other-hub', { name: 'Other hub' })
			],
			onto_project_members: [
				{ actor_id: 'me', project_id: 'redline', access: 'admin', removed_at: null },
				{ actor_id: 'me', project_id: 'cadre', access: 'write', removed_at: null },
				{
					actor_id: 'me',
					project_id: 'client-of-hidden',
					access: 'admin',
					removed_at: null
				},
				{
					actor_id: 'me',
					project_id: 'nested-elsewhere',
					access: 'admin',
					removed_at: null
				},
				{ actor_id: 'me', project_id: 'other-hub', access: 'read', removed_at: null },
				{ actor_id: 'you', project_id: 'cadre', access: 'admin', removed_at: null }
			]
		});
		const facts = await loadParentCandidateFacts(client, 'me', [
			{ id: 'hub', name: 'Wayne Strategies' },
			{ id: 'redline', name: 'Redline' },
			{ id: 'cadre', name: 'The Cadre' },
			{ id: 'client-of-hidden', name: 'Client' },
			{ id: 'nested-elsewhere', name: 'Nested' }
		]);
		expect(facts.get('hub')).toEqual({
			parent_project_id: null,
			parent_project_name: null,
			has_children: true,
			access_level: 'admin'
		});
		expect(facts.get('redline')).toMatchObject({
			parent_project_id: 'hub',
			parent_project_name: 'Wayne Strategies',
			access_level: 'admin'
		});
		expect(facts.get('cadre')).toMatchObject({ access_level: 'write', has_children: false });
		expect(facts.get('client-of-hidden')).toMatchObject({
			parent_project_id: null,
			parent_project_name: null
		});
		// A visible parent outside the list costs one more lookup, for its name only.
		expect(facts.get('nested-elsewhere')).toMatchObject({
			parent_project_id: 'other-hub',
			parent_project_name: 'Other hub'
		});
		expect(from).toHaveBeenCalledTimes(4);
	});

	it('fails open to no facts', async () => {
		const failing = {
			from: vi.fn(() => {
				const query: any = {};
				for (const method of ['select', 'in', 'eq', 'is']) query[method] = () => query;
				query.then = (resolve: any) =>
					Promise.resolve({ data: null, error: { message: 'boom' } }).then(resolve);
				return query;
			})
		} as never;
		expect((await loadParentCandidateFacts(failing, 'me', [{ id: 'a', name: 'A' }])).size).toBe(
			0
		);
		expect((await loadParentCandidateFacts(failing, 'me', [])).size).toBe(0);
	});
});
