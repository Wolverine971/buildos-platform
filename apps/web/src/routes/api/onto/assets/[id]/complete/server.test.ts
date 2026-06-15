// apps/web/src/routes/api/onto/assets/[id]/complete/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	ensureAssetAccessMock,
	createAdminSupabaseClientMock,
	storageFromMock,
	storageListMock,
	queueAssetOcrExtractionMock
} = vi.hoisted(() => ({
	ensureAssetAccessMock: vi.fn(),
	createAdminSupabaseClientMock: vi.fn(),
	storageFromMock: vi.fn(),
	storageListMock: vi.fn(),
	queueAssetOcrExtractionMock: vi.fn()
}));

vi.mock('../../shared', () => ({
	ensureAssetAccess: ensureAssetAccessMock
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('$lib/server/asset-ocr-queue.service', () => ({
	queueAssetOcrExtraction: queueAssetOcrExtractionMock
}));

import { POST } from './+server';

const BASE_ASSET = {
	id: 'asset-1',
	project_id: 'project-1',
	storage_bucket: 'onto-assets',
	storage_path: 'projects/project-1/assets/asset-1/original.png'
};

function createUpdateSupabase(updatedAsset: Record<string, unknown>) {
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

function createSessionLocals(supabase: any, userId: string | null = 'user-1') {
	return {
		supabase,
		safeGetSession: vi.fn().mockResolvedValue(userId ? { user: { id: userId } } : null)
	};
}

describe('/api/onto/assets/[id]/complete', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureAssetAccessMock.mockResolvedValue({ asset: BASE_ASSET, actorId: 'actor-1' });
		storageListMock.mockResolvedValue({ data: [{ name: 'original.png' }], error: null });
		storageFromMock.mockReturnValue({ list: storageListMock });
		createAdminSupabaseClientMock.mockReturnValue({
			storage: {
				from: storageFromMock
			}
		});
		queueAssetOcrExtractionMock.mockResolvedValue({ queued: true, jobId: 'job-1' });
	});

	it('returns 401 when unauthenticated', async () => {
		const response = await POST({
			params: { id: 'asset-1' },
			locals: createSessionLocals(createUpdateSupabase(BASE_ASSET), null)
		} as any);

		expect(response.status).toBe(401);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
	});

	it('verifies the uploaded file with admin storage before queueing OCR', async () => {
		const response = await POST({
			params: { id: 'asset-1' },
			locals: createSessionLocals(
				createUpdateSupabase({
					...BASE_ASSET,
					ocr_status: 'pending'
				})
			)
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(storageFromMock).toHaveBeenCalledWith('onto-assets');
		expect(storageListMock).toHaveBeenCalledWith('projects/project-1/assets/asset-1', {
			limit: 1,
			search: 'original.png'
		});
		expect(queueAssetOcrExtractionMock).toHaveBeenCalledWith({
			assetId: 'asset-1',
			projectId: 'project-1',
			userId: 'user-1',
			dedupKey: 'asset-ocr-asset-1'
		});
	});
});
