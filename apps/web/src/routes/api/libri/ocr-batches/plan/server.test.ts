import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	schema: vi.fn(),
	rpc: vi.fn(),
	from: vi.fn(),
	select: vi.fn(),
	eq: vi.fn(),
	order: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

import { POST } from './+server';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const REQUEST_ID = '20000000-0000-4000-8000-000000000001';
const LIBRARY_ID = '30000000-0000-4000-8000-000000000001';
const BOOK_ID = '40000000-0000-4000-8000-000000000001';
const RUN_ID = '50000000-0000-4000-8000-000000000001';
const IMAGE_IDS = ['60000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002'];
const STEP_IDS = ['70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002'];
const VALID_REQUEST = {
	requestId: REQUEST_ID,
	libraryId: LIBRARY_ID,
	bookId: BOOK_ID,
	imageIds: IMAGE_IDS
};
const VALID_MANIFEST = IMAGE_IDS.map((imageId, position) => ({
	step_id: STEP_IDS[position],
	image_id: imageId,
	position,
	expected_ocr_version: position + 1,
	image_content_sha256: position === 0 ? 'a'.repeat(64) : 'b'.repeat(64)
}));

function request(
	body: unknown = VALID_REQUEST,
	options: { rawBody?: string; contentType?: string; contentLength?: string } = {}
): Request {
	const headers = new Headers();
	if (options.contentType !== '') {
		headers.set('Content-Type', options.contentType ?? 'application/json');
	}
	if (options.contentLength) headers.set('Content-Length', options.contentLength);
	return new Request('https://build-os.com/api/libri/ocr-batches/plan', {
		method: 'POST',
		headers,
		body: options.rawBody ?? JSON.stringify(body)
	});
}

async function post(input: Request, userId: string | null = USER_ID): Promise<Response> {
	return POST({
		request: input,
		locals: {
			safeGetSession: async () =>
				userId
					? { session: { user: { id: userId } }, user: { id: userId } }
					: { session: null, user: null }
		}
	} as never);
}

describe('POST /api/libri/ocr-batches/plan', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mocks.rpc.mockResolvedValue({
			data: [{ run_id: RUN_ID, created: true, step_ids: STEP_IDS }],
			error: null
		});
		mocks.order.mockResolvedValue({ data: VALID_MANIFEST, error: null });

		const manifestQuery = {
			select: mocks.select,
			eq: mocks.eq,
			order: mocks.order
		};
		mocks.select.mockReturnValue(manifestQuery);
		mocks.eq.mockReturnValue(manifestQuery);
		mocks.from.mockReturnValue(manifestQuery);
		mocks.schema.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
		mocks.createAdminSupabaseClient.mockReturnValue({ schema: mocks.schema });
	});

	it('rejects an unauthenticated caller before using service authority', async () => {
		const response = await post(request(), null);

		expect(response.status).toBe(401);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it.each([
		['missing JSON content type', request(undefined, { contentType: '' })],
		['malformed JSON', request(undefined, { rawBody: '{' })],
		['invalid request UUID', request({ ...VALID_REQUEST, requestId: 'not-a-uuid' })],
		['empty image list', request({ ...VALID_REQUEST, imageIds: [] })],
		[
			'duplicate image IDs',
			request({ ...VALID_REQUEST, imageIds: [IMAGE_IDS[0], IMAGE_IDS[0]] })
		],
		['unexpected fields', request({ ...VALID_REQUEST, enqueue: true })],
		['oversized declared body', request(undefined, { contentLength: '1025' })]
	])('rejects %s before using service authority', async (_label, input) => {
		const response = await post(input);

		expect(response.status).toBe(400);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it('derives user identity and returns an independently reviewed non-enqueued preview', async () => {
		const response = await post(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('pragma')).toBe('no-cache');
		expect(mocks.schema).toHaveBeenCalledWith('libri');
		expect(mocks.rpc).toHaveBeenCalledWith('plan_explicit_ocr_batch', {
			p_library_id: LIBRARY_ID,
			p_book_id: BOOK_ID,
			p_image_ids: IMAGE_IDS,
			p_idempotency_key: `ocr-batch:user:${USER_ID}:request:${REQUEST_ID}`,
			p_requested_by: USER_ID
		});
		expect(mocks.from).toHaveBeenCalledExactlyOnceWith('ocr_batch_items');
		expect(mocks.eq).toHaveBeenNthCalledWith(1, 'library_id', LIBRARY_ID);
		expect(mocks.eq).toHaveBeenNthCalledWith(2, 'run_id', RUN_ID);
		expect(body.data).toMatchObject({
			runId: RUN_ID,
			created: true,
			batch: {
				libraryId: LIBRARY_ID,
				bookId: BOOK_ID,
				imageCount: 2,
				items: [
					{
						stepId: STEP_IDS[0],
						imageId: IMAGE_IDS[0],
						position: 0,
						expectedOcrVersion: 1
					},
					{
						stepId: STEP_IDS[1],
						imageId: IMAGE_IDS[1],
						position: 1,
						expectedOcrVersion: 2
					}
				]
			},
			limits: {
				maxAttemptsPerImage: 1,
				maxConcurrentImages: 2,
				reservedBudgetMicrousd: 200000,
				maxOutputCharsPerImage: 50000,
				deadlineWindowSeconds: 3600
			},
			transportEnqueued: false
		});
	});

	it.each([
		['42501', 403],
		['23505', 409],
		['22023', 400],
		['PGRST202', 503]
	])('maps planner error %s without reading a manifest', async (code, status) => {
		mocks.rpc.mockResolvedValue({ data: null, error: { code } });

		const response = await post(request());

		expect(response.status).toBe(status);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(mocks.from).not.toHaveBeenCalled();
	});

	it.each([
		['no planner row', []],
		[
			'duplicate step IDs',
			[{ run_id: RUN_ID, created: true, step_ids: [STEP_IDS[0], STEP_IDS[0]] }]
		],
		['missing manifest row', VALID_MANIFEST.slice(0, 1)],
		['manifest order mismatch', [VALID_MANIFEST[1], VALID_MANIFEST[0]]],
		[
			'invalid manifest hash',
			[{ ...VALID_MANIFEST[0], image_content_sha256: 'not-a-hash' }, VALID_MANIFEST[1]]
		]
	])('fails closed for %s', async (label, invalidData) => {
		if (label === 'no planner row' || label === 'duplicate step IDs') {
			mocks.rpc.mockResolvedValue({ data: invalidData, error: null });
		} else {
			mocks.order.mockResolvedValue({ data: invalidData, error: null });
		}

		const response = await post(request());

		expect(response.status).toBe(503);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it('fails closed when the manifest lookup errors', async () => {
		mocks.order.mockResolvedValue({ data: null, error: { code: 'PGRST500' } });

		const response = await post(request());

		expect(response.status).toBe(503);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});
});
