// apps/worker/tests/assetOcrWorker.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSupabase = {
	from: vi.fn(),
	storage: {
		from: vi.fn()
	}
};

const logWorkerErrorMock = vi.fn();

vi.mock('../src/lib/supabase', () => ({
	supabase: mockSupabase
}));

vi.mock('../src/lib/errorLogger', () => ({
	logWorkerError: logWorkerErrorMock
}));

const BASE_ASSET = {
	id: 'asset-1',
	project_id: 'project-1',
	storage_bucket: 'onto-assets',
	storage_path: 'projects/project-1/assets/asset-1/original.png',
	content_type: 'image/png',
	ocr_status: 'pending',
	ocr_version: 1,
	extracted_text: null,
	extracted_text_source: 'ocr',
	extraction_summary: null,
	extraction_metadata: {},
	deleted_at: null
};

function wireAssetTable(asset: typeof BASE_ASSET) {
	const updatePayloads: Array<Record<string, unknown>> = [];

	const maybeSingle = vi.fn().mockResolvedValue({ data: asset, error: null });
	const selectEq = vi.fn(() => ({ maybeSingle }));
	const select = vi.fn(() => ({ eq: selectEq }));

	const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
	const update = vi.fn((payload: Record<string, unknown>) => {
		updatePayloads.push(payload);
		return { eq: updateEq };
	});

	mockSupabase.from.mockImplementation((table: string) => {
		if (table === 'onto_assets') {
			return { select, update };
		}
		throw new Error(`Unexpected table in worker test: ${table}`);
	});

	return { updatePayloads };
}

function wireSignedUrlSuccess() {
	const createSignedUrl = vi.fn().mockResolvedValue({
		data: { signedUrl: 'https://signed.example/image.png' },
		error: null
	});
	mockSupabase.storage.from.mockReturnValue({ createSignedUrl });
	return { createSignedUrl };
}

async function importWorker() {
	vi.resetModules();
	return await import('../src/workers/assets/assetOcrWorker');
}

describe('asset OCR worker', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.OPENAI_API_KEY = 'test-openai-key';
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('processes OCR successfully and persists complete status', async () => {
		const { updatePayloads } = wireAssetTable({ ...BASE_ASSET });
		const { createSignedUrl } = wireSignedUrlSuccess();

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [
					{
						message: {
							content: JSON.stringify({
								extracted_text: 'Permit #1142 - Foundation inspection approved',
								summary: 'Inspection approval screenshot',
								confidence: 0.94,
								language: 'en'
							})
						}
					}
				]
			})
		});
		vi.stubGlobal('fetch', fetchMock);

		const { processAssetOcrJob } = await importWorker();
		const result = await processAssetOcrJob({
			id: 'job-1',
			data: {
				assetId: 'asset-1',
				projectId: 'project-1',
				userId: 'user-1'
			}
		} as any);

		expect(result.success).toBe(true);
		expect(result.ocrStatus).toBe('complete');
		expect(createSignedUrl).toHaveBeenCalledWith(
			'projects/project-1/assets/asset-1/original.png',
			900
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(updatePayloads.some((payload) => payload.ocr_status === 'processing')).toBe(true);
		expect(
			updatePayloads.some(
				(payload) =>
					payload.ocr_status === 'complete' &&
					typeof payload.extracted_text === 'string' &&
					payload.extracted_text_source === 'ocr'
			)
		).toBe(true);
		expect(logWorkerErrorMock).not.toHaveBeenCalled();
	});

	it('marks OCR job as failed and logs worker error on model failure', async () => {
		const { updatePayloads } = wireAssetTable({ ...BASE_ASSET });
		wireSignedUrlSuccess();

		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: async () => ({
				error: { message: 'Model overloaded' }
			})
		});
		vi.stubGlobal('fetch', fetchMock);

		const { processAssetOcrJob } = await importWorker();

		await expect(
			processAssetOcrJob({
				id: 'job-2',
				data: {
					assetId: 'asset-1',
					projectId: 'project-1',
					userId: 'user-1'
				}
			} as any)
		).rejects.toThrow('Model overloaded');

		expect(
			updatePayloads.some(
				(payload) =>
					payload.ocr_status === 'failed' &&
					typeof payload.ocr_error === 'string' &&
					String(payload.ocr_error).includes('Model overloaded')
			)
		).toBe(true);
		expect(logWorkerErrorMock).toHaveBeenCalledTimes(1);
	});

	it('preserves manual OCR text unless forceOverwrite is true', async () => {
		const manualAsset = {
			...BASE_ASSET,
			extracted_text: 'Manual corrected text',
			extracted_text_source: 'manual'
		};
		const { updatePayloads } = wireAssetTable(manualAsset);

		const { processAssetOcrJob } = await importWorker();
		const result = await processAssetOcrJob({
			id: 'job-3',
			data: {
				assetId: 'asset-1',
				projectId: 'project-1',
				userId: 'user-1',
				forceOverwrite: false
			}
		} as any);

		expect(result.success).toBe(true);
		expect(result.skipped).toBe(true);
		expect(result.reason).toBe('manual_preserved');
		expect(updatePayloads).toHaveLength(1);
		expect(updatePayloads[0].ocr_status).toBe('complete');
		expect(mockSupabase.storage.from).not.toHaveBeenCalled();
	});
});
