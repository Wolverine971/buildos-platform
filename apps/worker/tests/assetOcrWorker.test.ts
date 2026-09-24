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
	extracted_text: null as string | null,
	extracted_text_source: 'ocr',
	extraction_summary: null,
	extraction_metadata: {},
	deleted_at: null
};

function wireAssetTable(
	asset: typeof BASE_ASSET,
	options: {
		// Resolves each update by its payload; defaults to a successful write.
		updateResult?: (payload: Record<string, unknown>) => { data: unknown; error: unknown };
	} = {}
) {
	const updatePayloads: Array<Record<string, unknown>> = [];
	const updateFilters: Array<Array<[string, unknown]>> = [];

	const maybeSingle = vi.fn().mockResolvedValue({ data: asset, error: null });
	const selectEq = vi.fn(() => ({ maybeSingle }));
	const select = vi.fn(() => ({ eq: selectEq }));

	const update = vi.fn((payload: Record<string, unknown>) => {
		updatePayloads.push(payload);
		const filters: Array<[string, unknown]> = [];
		updateFilters.push(filters);
		const result = () =>
			options.updateResult?.(payload) ?? { data: { id: asset?.id }, error: null };
		const builder: any = {
			eq: vi.fn((column: string, value: unknown) => {
				filters.push([column, value]);
				return builder;
			}),
			select: vi.fn(() => builder),
			maybeSingle: vi.fn(async () => result()),
			then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
				Promise.resolve(result()).then(resolve, reject)
		};
		return builder;
	});

	mockSupabase.from.mockImplementation((table: string) => {
		if (table === 'onto_assets') {
			return { select, update };
		}
		throw new Error(`Unexpected table in worker test: ${table}`);
	});

	return { updatePayloads, updateFilters };
}

function stubOcrResponse(output: Record<string, unknown>) {
	const fetchMock = vi.fn().mockResolvedValue({
		ok: true,
		json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] })
	});
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

const OCR_JOB = {
	id: 'job-ocr',
	data: { assetId: 'asset-1', projectId: 'project-1', userId: 'user-1' }
} as any;

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
		process.env.PRIVATE_OPENROUTER_API_KEY = 'test-openrouter-key';
		process.env.OPENAI_API_KEY = '';
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		process.env.PRIVATE_OPENROUTER_API_KEY = '';
	});

	it('sends OCR only to OpenRouter with zero data retention required', async () => {
		wireAssetTable({ ...BASE_ASSET });
		wireSignedUrlSuccess();
		const fetchMock = stubOcrResponse({ extracted_text: 'Hi', summary: 'A sign' });

		const { processAssetOcrJob } = await importWorker();
		await processAssetOcrJob(OCR_JOB);

		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
		expect(init.headers.Authorization).toBe('Bearer test-openrouter-key');
		expect(JSON.parse(init.body)).toMatchObject({
			model: 'openai/gpt-4o-mini',
			provider: { data_collection: 'deny', zdr: true }
		});
	});

	it('never falls back to a direct OpenAI key when OpenRouter is not configured', async () => {
		process.env.PRIVATE_OPENROUTER_API_KEY = '';
		process.env.OPENAI_API_KEY = 'test-openai-key';
		wireAssetTable({ ...BASE_ASSET });
		wireSignedUrlSuccess();
		const fetchMock = stubOcrResponse({ extracted_text: 'Hi', summary: 'A sign' });

		const { processAssetOcrJob } = await importWorker();
		await expect(processAssetOcrJob(OCR_JOB)).rejects.toThrow(
			'Missing PRIVATE_OPENROUTER_API_KEY'
		);
		expect(fetchMock).not.toHaveBeenCalled();
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

	it('completes an image with no readable text instead of retrying the paid call', async () => {
		const { updatePayloads } = wireAssetTable({ ...BASE_ASSET });
		wireSignedUrlSuccess();
		const fetchMock = stubOcrResponse({ extracted_text: '', summary: 'A photo of a sunset' });

		const { processAssetOcrJob } = await importWorker();
		const result = await processAssetOcrJob(OCR_JOB);

		expect(result.ocrStatus).toBe('complete');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(updatePayloads.at(-1)).toMatchObject({
			ocr_status: 'complete',
			extracted_text: '',
			extraction_summary: 'A photo of a sunset'
		});
	});

	it('fails the job when the completion write fails instead of reporting success', async () => {
		const { updatePayloads } = wireAssetTable(
			{ ...BASE_ASSET },
			{
				updateResult: (payload) =>
					payload.ocr_status === 'complete'
						? { data: null, error: { message: 'connection reset' } }
						: { data: { id: 'asset-1' }, error: null }
			}
		);
		wireSignedUrlSuccess();
		stubOcrResponse({ extracted_text: 'Invoice 42', summary: 'An invoice' });

		const { processAssetOcrJob } = await importWorker();

		await expect(processAssetOcrJob(OCR_JOB)).rejects.toThrow('connection reset');
		expect(updatePayloads.at(-1)?.ocr_status).toBe('failed');
	});

	it('does not overwrite text the user saved while OCR was running', async () => {
		const { updatePayloads, updateFilters } = wireAssetTable(
			{ ...BASE_ASSET, ocr_version: 4 },
			{
				// The manual save bumped ocr_version, so the fenced write matches no row.
				updateResult: (payload) =>
					payload.ocr_status === 'complete'
						? { data: null, error: null }
						: { data: { id: 'asset-1' }, error: null }
			}
		);
		wireSignedUrlSuccess();
		stubOcrResponse({ extracted_text: 'Machine text', summary: 'An image' });

		const { processAssetOcrJob } = await importWorker();
		const result = await processAssetOcrJob(OCR_JOB);

		expect(result).toMatchObject({ skipped: true, reason: 'superseded_by_manual_edit' });
		expect(updateFilters.at(-1)).toContainEqual(['ocr_version', 4]);
		expect(updatePayloads.some((payload) => payload.ocr_status === 'failed')).toBe(false);
	});

	it('does not retry when the asset no longer exists', async () => {
		wireAssetTable(null as any);

		const { processAssetOcrJob } = await importWorker();
		const { classifyQueueError } = await import('../src/lib/queueErrors');
		const error = await processAssetOcrJob(OCR_JOB).catch((caught) => caught);

		expect(error?.name).toBe('PermanentQueueError');
		expect(classifyQueueError(error).kind).toBe('permanent');
	});
});
