// apps/web/src/routes/api/onto/assets/[id]/links/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureAssetAccessMock, ensureEntityInProjectMock, isEntityKindMock } = vi.hoisted(() => ({
	ensureAssetAccessMock: vi.fn(),
	ensureEntityInProjectMock: vi.fn(),
	isEntityKindMock: vi.fn(() => true)
}));

vi.mock('../../shared', () => ({
	ensureAssetAccess: ensureAssetAccessMock,
	ensureEntityInProject: ensureEntityInProjectMock,
	isEntityKind: isEntityKindMock
}));

import { DELETE, POST } from './+server';

const BASE_ASSET = {
	id: 'asset-1',
	project_id: 'project-1'
};

function createSessionLocals(supabase: any, userId: string | null = 'user-1') {
	return {
		supabase,
		safeGetSession: vi.fn().mockResolvedValue(userId ? { user: { id: userId } } : null)
	};
}

function createLinkSupabase() {
	const single = vi.fn().mockResolvedValue({
		data: {
			id: 'link-1',
			asset_id: 'asset-1',
			entity_kind: 'task',
			entity_id: 'task-1',
			role: 'attachment'
		},
		error: null
	});
	const select = vi.fn(() => ({ single }));
	const upsert = vi.fn(() => ({ select }));

	return {
		from: vi.fn((table: string) => {
			if (table === 'onto_asset_links') return { upsert };
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

function createUnlinkSupabase() {
	const deleteResult = { data: null, error: null };
	const deleteChain: any = {
		eq: vi.fn(() => deleteChain),
		then: (onFulfilled: any, onRejected: any) =>
			Promise.resolve(deleteResult).then(onFulfilled, onRejected)
	};
	const del = vi.fn(() => deleteChain);

	return {
		from: vi.fn((table: string) => {
			if (table === 'onto_asset_links') return { delete: del };
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

describe('/api/onto/assets/[id]/links', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureAssetAccessMock.mockResolvedValue({ asset: BASE_ASSET, actorId: 'actor-1' });
		ensureEntityInProjectMock.mockResolvedValue({ ok: true });
		isEntityKindMock.mockReturnValue(true);
	});

	it('POST returns 401 when unauthenticated', async () => {
		const request = new Request('http://localhost/api/onto/assets/asset-1/links', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ entity_kind: 'task', entity_id: 'task-1', role: 'attachment' })
		});

		const response = await POST({
			params: { id: 'asset-1' },
			request,
			locals: createSessionLocals(createLinkSupabase(), null)
		} as any);

		expect(response.status).toBe(401);
	});

	it('POST links an asset to an entity', async () => {
		const request = new Request('http://localhost/api/onto/assets/asset-1/links', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				entity_kind: 'task',
				entity_id: 'task-1',
				role: 'attachment'
			})
		});

		const response = await POST({
			params: { id: 'asset-1' },
			request,
			locals: createSessionLocals(createLinkSupabase())
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.link.id).toBe('link-1');
		expect(ensureAssetAccessMock).toHaveBeenCalledWith(
			expect.anything(),
			'asset-1',
			'user-1',
			'write'
		);
		expect(ensureEntityInProjectMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				projectId: 'project-1',
				entityKind: 'task',
				entityId: 'task-1'
			})
		);
	});

	it('DELETE unlinks an asset from an entity', async () => {
		const response = await DELETE({
			params: { id: 'asset-1' },
			url: new URL(
				'http://localhost/api/onto/assets/asset-1/links?entity_kind=task&entity_id=task-1&role=attachment'
			),
			locals: createSessionLocals(createUnlinkSupabase())
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.unlinked).toBe(true);
		expect(ensureAssetAccessMock).toHaveBeenCalledWith(
			expect.anything(),
			'asset-1',
			'user-1',
			'write'
		);
	});

	it('POST rejects invalid role before DB writes', async () => {
		const request = new Request('http://localhost/api/onto/assets/asset-1/links', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ entity_kind: 'task', entity_id: 'task-1', role: 'invalid' })
		});

		const response = await POST({
			params: { id: 'asset-1' },
			request,
			locals: createSessionLocals(createLinkSupabase())
		} as any);

		expect(response.status).toBe(400);
		expect(ensureAssetAccessMock).not.toHaveBeenCalled();
	});

	it('DELETE returns access-control error from ensureAssetAccess', async () => {
		ensureAssetAccessMock.mockResolvedValueOnce({
			error: new Response(JSON.stringify({ success: false }), { status: 403 })
		});

		const response = await DELETE({
			params: { id: 'asset-1' },
			url: new URL(
				'http://localhost/api/onto/assets/asset-1/links?entity_kind=task&entity_id=task-1'
			),
			locals: createSessionLocals(createUnlinkSupabase())
		} as any);

		expect(response.status).toBe(403);
	});
});
