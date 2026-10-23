// apps/web/src/lib/server/agent-call/permission-requests.service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PermissionRequestService } from './permission-requests.service';
const id = '10000000-0000-4000-8000-000000000001';
const ref = { kind: 'key' as const, caller_id: id, token_hash: 'test-hash' };
const input = { kind: 'document', target_id: id, changes: { title: 'After' } };
function fixture(
	options: {
		enabled?: boolean;
		epoch?: number;
		status?: string;
		expired?: boolean;
		read?: boolean;
	} = {}
) {
	const row = {
		id,
		project_id: id,
		epoch: 1,
		status: options.status ?? 'pending',
		expires_at: options.expired ? '2000-01-01' : '2999-01-01',
		receipt: { target_id: id }
	};
	const rpc = vi.fn(async () => ({ data: row, error: null }));
	const from = vi.fn((_table: string) => {
		const b: any = {
			select: () => b,
			eq: () => b,
			maybeSingle: async () => ({
				data: { enabled: options.enabled ?? true, epoch: options.epoch ?? 1 },
				error: null
			})
		};
		return b;
	});
	const service = new PermissionRequestService(
		{ rpc, from },
		ref,
		{ mode: 'read_only', project_ids: options.read === false ? [] : [id] },
		'https://build-os.com'
	);
	return { service, rpc, from };
}
describe('permission retries', () => {
	it('leaves broad legacy updates alone when there is no scoped key', async () => {
		const { service, rpc, from } = fixture();
		from.mockImplementation(() => {
			const b: any = {
				select: () => b,
				eq: () => b,
				maybeSingle: async () => ({ data: null, error: null })
			};
			return b;
		});
		expect(
			await service.replay(
				{
					kind: 'document',
					target_id: id,
					changes: { props: { legacy: true }, update_strategy: 'merge_llm' }
				},
				'legacy-key'
			)
		).toBeNull();
		expect(rpc).not.toHaveBeenCalled();
	});
	it('returns stored receipt before loading or recomputing the target', async () => {
		const { service, from } = fixture({ status: 'applied' });
		const result = await service.submit({ proposal: input, idempotency_key: 'stable' });
		expect(result.status).toBe('applied');
		expect(from.mock.calls.map((c) => c[0])).not.toContain('onto_documents');
	});
	it.each([{ enabled: false }, { epoch: 2 }])(
		'normalizes killed and old epoch pending retries',
		async (options) => {
			const { service } = fixture(options);
			expect(
				(await service.submit({ proposal: input, idempotency_key: 'stable' })).status
			).toBe('canceled');
		}
	);
	it('normalizes expiry and redacts receipts after losing project read access', async () => {
		const { service } = fixture({ expired: true, read: false });
		const r = await service.submit({ proposal: input, idempotency_key: 'stable' });
		expect(r.status).toBe('expired');
		expect('receipt' in r ? r.receipt : undefined).toBeNull();
	});
	it('never passes caller-provided identity or approval fields', async () => {
		const { service, rpc } = fixture();
		await expect(
			service.submit({
				proposal: input,
				idempotency_key: 'key',
				user_id: id,
				decision: 'always'
			})
		).rejects.toThrow();
		expect(rpc).not.toHaveBeenCalled();
	});
});

// Workspace (2026-10-23): get_buildos_permissions tells a connector where loose
// items go, even while edit requests are switched off.
describe('get_buildos_permissions workspace', () => {
	const WS = '20000000-0000-4000-8000-000000000001';
	const USER = '30000000-0000-4000-8000-000000000001';
	function admin(options: { externalAgentAccess?: string } = {}) {
		const rpc = vi.fn(async (fn: string) =>
			fn === 'ensure_workspace_project_for_user'
				? { data: WS, error: null }
				: { data: null, error: { message: `unexpected ${fn}` } }
		);
		const from = vi.fn((table: string) => {
			const b: any = {
				select: () => b,
				eq: () => b,
				is: () => b,
				maybeSingle: async () =>
					table === 'onto_projects'
						? {
								data: {
									external_agent_access: options.externalAgentAccess ?? 'standard'
								},
								error: null
							}
						: { data: { enabled: false, epoch: 1 }, error: null }
			};
			return b;
		});
		return { rpc, from };
	}
	const status = async (
		scope: ConstructorParameters<typeof PermissionRequestService>[2],
		projectScopeMode: 'all_unrestricted' | 'selected',
		client = admin()
	) =>
		(await new PermissionRequestService(client, ref, scope, 'https://build-os.com', {
			userId: USER,
			projectScopeMode
		}).control('get_buildos_permissions', {})) as Record<string, unknown>;

	it('returns the Workspace id when this connection can write to it', async () => {
		const result = await status(
			{ mode: 'read_write', project_ids: [WS], write_project_ids: [WS] },
			'all_unrestricted'
		);
		expect(result.workspace).toMatchObject({ project_id: WS, name: 'Workspace' });
		expect(String((result.workspace as { use: string }).use)).toContain(
			'Never create a project to hold a single item'
		);
		// Edit requests are off: the status still answers, with no capabilities.
		expect(result.scoped_grants).toEqual([]);
		expect(result.capabilities).toEqual([]);
	});

	it('counts a Workspace created by this call as reachable on an all-projects connection', async () => {
		const result = await status(
			{ mode: 'read_write', project_ids: [], write_project_ids: [] },
			'all_unrestricted'
		);
		expect(result.workspace).toMatchObject({ project_id: WS });
	});

	it('withholds the id and points at the grant page on a selected-projects connection', async () => {
		const result = await status(
			{ mode: 'read_write', project_ids: [id], write_project_ids: [id] },
			'selected'
		);
		expect(result.workspace).toMatchObject({
			project_id: null,
			grant_url: `https://build-os.com/profile/agent-keys/${id}/grant?project=${WS}`
		});
	});

	it('respects an owner who restricted agents on the Workspace', async () => {
		const result = await status(
			{ mode: 'read_write', project_ids: [], write_project_ids: [] },
			'all_unrestricted',
			admin({ externalAgentAccess: 'restricted' })
		);
		expect(result.workspace).toMatchObject({ project_id: null });
	});

	it('says nothing about the Workspace to a read-only connection', async () => {
		const result = await status({ mode: 'read_only', project_ids: [WS] }, 'all_unrestricted');
		expect(result).not.toHaveProperty('workspace');
	});
});
