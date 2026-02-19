// apps/web/src/routes/api/onto/assets/[id]/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureAssetAccessMock, createAdminSupabaseClientMock } = vi.hoisted(() => ({
	ensureAssetAccessMock: vi.fn(),
	createAdminSupabaseClientMock: vi.fn()
}));

vi.mock('../shared', () => ({
	ensureAssetAccess: ensureAssetAccessMock
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

import { DELETE, GET, PATCH } from './+server';

const BASE_ASSET = {
	id: 'asset-1',
	project_id: 'project-1',
	storage_bucket: 'onto-assets',
	storage_path: 'projects/project-1/assets/asset-1/original.png',
	caption: 'Site photo',
	alt_text: 'Site',
	extracted_text: 'Original OCR text',
	extraction_summary: 'Summary',
	extracted_text_source: 'ocr',
	ocr_status: 'complete',
	created_at: '2026-02-19T00:00:00.000Z'
};

function createSessionLocals(supabase: any, userId: string | null = 'user-1') {
	return {
		supabase,
		safeGetSession: vi.fn().mockResolvedValue(userId ? { user: { id: userId } } : null)
	};
}

function createGetSupabase(links: any[]) {
	const order = vi.fn().mockResolvedValue({ data: links, error: null });
	const eq = vi.fn(() => ({ order }));
	const select = vi.fn(() => ({ eq }));
	return {
		from: vi.fn((table: string) => {
			if (table === 'onto_asset_links') return { select };
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

function createPatchSupabase(updatedAsset: Record<string, unknown>) {
	const single = vi.fn().mockResolvedValue({ data: updatedAsset, error: null });
	const select = vi.fn(() => ({ single }));
	const eq = vi.fn(() => ({ select }));
	const update = vi.fn(() => ({ eq }));
	return {
		from: vi.fn((table: string) => {
			if (table === 'onto_assets') return { update };
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

function createDeleteSupabase() {
	const deleteLinksEq = vi.fn().mockResolvedValue({ data: null, error: null });
	const deleteLinks = vi.fn(() => ({ eq: deleteLinksEq }));

	const softDeleteEq = vi.fn().mockResolvedValue({ data: null, error: null });
	const softDeleteUpdate = vi.fn(() => ({ eq: softDeleteEq }));

	return {
		from: vi.fn((table: string) => {
			if (table === 'onto_assets') return { update: softDeleteUpdate };
			if (table === 'onto_asset_links') return { delete: deleteLinks };
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

describe('/api/onto/assets/[id]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureAssetAccessMock.mockResolvedValue({ asset: BASE_ASSET, actorId: 'actor-1' });
		createAdminSupabaseClientMock.mockReturnValue({
			storage: {
				from: vi.fn(() => ({
					remove: vi.fn().mockResolvedValue({ data: null, error: null })
				}))
			}
		});
	});

	it('GET returns 401 when unauthenticated', async () => {
		const response = await GET({
			params: { id: 'asset-1' },
			locals: createSessionLocals(createGetSupabase([]), null)
		} as any);

		expect(response.status).toBe(401);
	});

	it('GET returns asset and links', async () => {
		const response = await GET({
			params: { id: 'asset-1' },
			locals: createSessionLocals(
				createGetSupabase([
					{ id: 'link-1', asset_id: 'asset-1', entity_kind: 'task', entity_id: 'task-1' }
				])
			)
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.asset.id).toBe('asset-1');
		expect(payload.data.links).toHaveLength(1);
		expect(ensureAssetAccessMock).toHaveBeenCalledWith(
			expect.anything(),
			'asset-1',
			'user-1',
			'read'
		);
	});

	it('PATCH updates asset metadata', async () => {
		const request = new Request('http://localhost/api/onto/assets/asset-1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ caption: 'Updated caption', alt_text: 'Updated alt text' })
		});

		const response = await PATCH({
			params: { id: 'asset-1' },
			request,
			locals: createSessionLocals(
				createPatchSupabase({
					...BASE_ASSET,
					caption: 'Updated caption',
					alt_text: 'Updated alt text'
				})
			)
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.asset.caption).toBe('Updated caption');
		expect(ensureAssetAccessMock).toHaveBeenCalledWith(
			expect.anything(),
			'asset-1',
			'user-1',
			'write'
		);
	});

	it('DELETE soft-deletes the row and removes storage object', async () => {
		const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
		const storageFromMock = vi.fn(() => ({ remove: removeMock }));
		createAdminSupabaseClientMock.mockReturnValue({
			storage: {
				from: storageFromMock
			}
		});

		const response = await DELETE({
			params: { id: 'asset-1' },
			locals: createSessionLocals(createDeleteSupabase())
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.deleted).toBe(true);
		expect(storageFromMock).toHaveBeenCalledWith('onto-assets');
		expect(removeMock).toHaveBeenCalledWith(['projects/project-1/assets/asset-1/original.png']);
	});

	it('PATCH returns access-control error from ensureAssetAccess', async () => {
		ensureAssetAccessMock.mockResolvedValueOnce({
			error: new Response(JSON.stringify({ success: false }), { status: 403 })
		});

		const request = new Request('http://localhost/api/onto/assets/asset-1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ caption: 'Nope' })
		});

		const response = await PATCH({
			params: { id: 'asset-1' },
			request,
			locals: createSessionLocals(createPatchSupabase(BASE_ASSET))
		} as any);

		expect(response.status).toBe(403);
	});
});
