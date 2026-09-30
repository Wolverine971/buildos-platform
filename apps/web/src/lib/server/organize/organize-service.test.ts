// apps/web/src/lib/server/organize/organize-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { organizeFixtures } from '$lib/components/organize/organize-fixtures';
import { loadOrganizeSnapshot } from './organize-snapshot';
import { previewOrApplyOrganize, undoOrganize, organizeHistory } from './organize-service';
vi.mock('./organize-snapshot', () => ({
	loadOrganizeSnapshot: vi.fn(),
	OrganizeSnapshotError: class extends Error {}
}));
const request = {
	moves: [
		{
			kind: 'document' as const,
			id: 'brief',
			project_id: 'source',
			destination_project_id: 'dest',
			parent_id: 'shared',
			position: 0
		}
	],
	project_versions: { source: '2026-09-30T12:00:00Z', dest: '2026-09-30T12:00:00Z' }
};
function client(batch: unknown = null) {
	const query: any = {};
	for (const method of ['select', 'eq', 'contains', 'order', 'limit'])
		query[method] = vi.fn(() => query);
	query.maybeSingle = vi.fn(async () => ({ data: batch, error: null }));
	query.then = (resolve: any) =>
		Promise.resolve({ data: batch ?? [], error: null }).then(resolve);
	return {
		rpc: vi.fn(async () => ({
			data: { confirmation_token: 'token', impact: [] },
			error: null
		})),
		from: vi.fn(() => query)
	} as any;
}
beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(loadOrganizeSnapshot).mockImplementation(async (_client, id) => ({
		project: organizeFixtures().find((p) => p.id === id)!,
		related_projects: []
	}));
});
describe('Organize service', () => {
	it('compiles from authorized snapshots and calls only the preview RPC', async () => {
		const admin = client();
		await previewOrApplyOrganize({
			session: client(),
			admin,
			userId: 'user',
			request,
			apply: false
		});
		expect(admin.rpc).toHaveBeenCalledOnce();
		expect(admin.rpc).toHaveBeenCalledWith(
			'onto_organize_preview',
			expect.objectContaining({
				p_user_id: 'user',
				p_plan: expect.objectContaining({ moves: request.moves })
			})
		);
	});
	it('rejects stale project versions before the privileged RPC', async () => {
		const admin = client();
		await expect(
			previewOrApplyOrganize({
				session: client(),
				admin,
				userId: 'user',
				request: { ...request, project_versions: {} },
				apply: false
			})
		).rejects.toThrow('project changed');
		expect(admin.rpc).not.toHaveBeenCalled();
	});
	it('rejects read-only panes before the privileged RPC', async () => {
		vi.mocked(loadOrganizeSnapshot).mockImplementation(async (_client, id) => ({
			project: { ...organizeFixtures().find((p) => p.id === id)!, can_write: false },
			related_projects: []
		}));
		const admin = client();
		await expect(
			previewOrApplyOrganize({
				session: client(),
				admin,
				userId: 'user',
				request,
				apply: false
			})
		).rejects.toMatchObject({ status: 403 });
		expect(admin.rpc).not.toHaveBeenCalled();
	});
	it('passes the exact confirmation token and idempotency key on apply', async () => {
		const admin = client();
		await previewOrApplyOrganize({
			session: client(),
			admin,
			userId: 'user',
			request: { ...request, batch_id: 'batch', confirmation_token: 'token' },
			apply: true
		});
		expect(admin.rpc).toHaveBeenCalledWith(
			'onto_organize_apply_atomic',
			expect.objectContaining({ p_batch_id: 'batch', p_confirmation_token: 'token' })
		);
	});
	it('replays successful requests without requiring the old snapshot to still exist', async () => {
		const admin = client({
			plan: { moves: request.moves, projects: [], trees: [] },
			inverse_of: null
		});
		vi.mocked(loadOrganizeSnapshot).mockRejectedValueOnce(new Error('must not load'));
		await previewOrApplyOrganize({
			session: client(),
			admin,
			userId: 'user',
			request: { ...request, batch_id: 'batch', confirmation_token: 'token' },
			apply: true
		});
		expect(loadOrganizeSnapshot).not.toHaveBeenCalled();
		expect(admin.rpc).toHaveBeenCalledWith(
			'onto_organize_apply_atomic',
			expect.objectContaining({ p_batch_id: 'batch' })
		);
	});
	it('turns a database stale-token failure into a conflict', async () => {
		const admin = client();
		admin.rpc.mockResolvedValue({
			data: null,
			error: { message: 'organize_stale_preview', code: 'P0001' }
		});
		await expect(
			previewOrApplyOrganize({
				session: client(),
				admin,
				userId: 'user',
				request,
				apply: false
			})
		).rejects.toMatchObject({ status: 409 });
	});
	it('reports missing undo targets without exposing another user journal', async () => {
		await expect(
			undoOrganize({
				session: client(),
				admin: client(),
				userId: 'user',
				sourceBatchId: 'other'
			})
		).rejects.toMatchObject({ status: 404 });
	});
	it('filters history when access to the other project has been lost', async () => {
		const session = client();
		session.rpc.mockImplementation(async (_name: string, args: { p_project_id: string }) => ({
			data: args.p_project_id === 'source',
			error: null
		}));
		const admin = client([
			{ id: 'batch', project_ids: ['source', 'dest'], receipt: {}, created_at: 'today' }
		]);
		expect(await organizeHistory(session, admin, 'user', 'source')).toEqual([]);
	});
});
