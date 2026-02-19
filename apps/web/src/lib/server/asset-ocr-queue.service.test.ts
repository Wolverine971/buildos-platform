// apps/web/src/lib/server/asset-ocr-queue.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

import { queueAssetOcrExtraction } from './asset-ocr-queue.service';

describe('queueAssetOcrExtraction', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('enqueues extract_onto_asset_ocr jobs with expected metadata', async () => {
		const rpcMock = vi.fn().mockResolvedValue({ data: 'job-123', error: null });
		createAdminSupabaseClientMock.mockReturnValue({ rpc: rpcMock });

		const result = await queueAssetOcrExtraction({
			assetId: 'asset-1',
			projectId: 'project-1',
			userId: 'user-1'
		});

		expect(result).toEqual({ queued: true, jobId: 'job-123' });
		expect(rpcMock).toHaveBeenCalledWith(
			'add_queue_job',
			expect.objectContaining({
				p_user_id: 'user-1',
				p_job_type: 'extract_onto_asset_ocr',
				p_dedup_key: 'asset-ocr-asset-1'
			})
		);
	});

	it('returns queue errors without throwing', async () => {
		const rpcMock = vi.fn().mockResolvedValue({
			data: null,
			error: { message: 'queue unavailable' }
		});
		createAdminSupabaseClientMock.mockReturnValue({ rpc: rpcMock });

		const result = await queueAssetOcrExtraction({
			assetId: 'asset-1',
			projectId: 'project-1',
			userId: 'user-1'
		});

		expect(result.queued).toBe(false);
		expect(result.reason).toContain('queue unavailable');
	});
});
