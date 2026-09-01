import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	readerSchema: vi.fn(),
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
const CONFIRMATION_ID = '20000000-0000-4000-8000-000000000001';
const LIBRARY_ID = '30000000-0000-4000-8000-000000000001';
const BOOK_ID = '40000000-0000-4000-8000-000000000001';
const RUN_ID = '50000000-0000-4000-8000-000000000001';
const ADMISSION_ID = '80000000-0000-4000-8000-000000000001';
const IMAGE_IDS = ['60000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002'];
const STEP_IDS = ['70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002'];
const MANIFEST_SHA256 = '0ac30c1f184d8840a100d5fe1731f872e2c9171c85ac9e8b7cc3edcf655458bb';
const VALID_REQUEST = {
	confirmationId: CONFIRMATION_ID,
	libraryId: LIBRARY_ID,
	bookId: BOOK_ID,
	runId: RUN_ID,
	manifestSha256: MANIFEST_SHA256
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
	return new Request('https://build-os.com/api/libri/ocr-batches/confirm', {
		method: 'POST',
		headers,
		body: options.rawBody ?? JSON.stringify(body)
	});
}

async function post(input: Request, userId: string | null = USER_ID): Promise<Response> {
	return POST({
		request: input,
		locals: {
			supabase: { schema: mocks.readerSchema },
			safeGetSession: async () =>
				userId
					? { session: { user: { id: userId } }, user: { id: userId } }
					: { session: null, user: null }
		}
	} as never);
}

describe('POST /api/libri/ocr-batches/confirm', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mocks.order.mockResolvedValue({ data: VALID_MANIFEST, error: null });
		mocks.rpc.mockResolvedValue({
			data: [{ admission_id: ADMISSION_ID, created: true, admission_status: 'confirmed' }],
			error: null
		});

		const manifestQuery = {
			select: mocks.select,
			eq: mocks.eq,
			order: mocks.order
		};
		mocks.select.mockReturnValue(manifestQuery);
		mocks.eq.mockReturnValue(manifestQuery);
		mocks.from.mockReturnValue(manifestQuery);
		mocks.readerSchema.mockReturnValue({ from: mocks.from });
		mocks.schema.mockReturnValue({ rpc: mocks.rpc });
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
		['invalid confirmation UUID', request({ ...VALID_REQUEST, confirmationId: 'not-a-uuid' })],
		['invalid manifest hash', request({ ...VALID_REQUEST, manifestSha256: 'not-a-hash' })],
		['unexpected enqueue field', request({ ...VALID_REQUEST, enqueue: true })],
		['oversized declared body', request(undefined, { contentLength: '1025' })]
	])('rejects %s before using service authority', async (_label, input) => {
		const response = await post(input);

		expect(response.status).toBe(400);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it('records an exact admission without enqueueing transport', async () => {
		const response = await post(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('pragma')).toBe('no-cache');
		expect(mocks.readerSchema).toHaveBeenCalledExactlyOnceWith('libri');
		expect(mocks.schema).toHaveBeenCalledExactlyOnceWith('libri');
		expect(mocks.from).toHaveBeenCalledExactlyOnceWith('ocr_batch_items');
		expect(mocks.eq).toHaveBeenNthCalledWith(1, 'library_id', LIBRARY_ID);
		expect(mocks.eq).toHaveBeenNthCalledWith(2, 'run_id', RUN_ID);
		expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('confirm_explicit_ocr_batch_admission', {
			p_library_id: LIBRARY_ID,
			p_book_id: BOOK_ID,
			p_run_id: RUN_ID,
			p_confirmation_id: CONFIRMATION_ID,
			p_manifest_sha256: MANIFEST_SHA256,
			p_step_ids: STEP_IDS,
			p_image_ids: IMAGE_IDS,
			p_expected_ocr_versions: [1, 2],
			p_image_content_sha256s: ['a'.repeat(64), 'b'.repeat(64)],
			p_requested_by: USER_ID
		});
		expect(body.data).toEqual({
			admissionId: ADMISSION_ID,
			runId: RUN_ID,
			created: true,
			status: 'confirmed',
			manifestSha256: MANIFEST_SHA256,
			transportEnqueued: false
		});
	});

	it('rejects a stale preview before recording an admission', async () => {
		const response = await post(request({ ...VALID_REQUEST, manifestSha256: 'f'.repeat(64) }));

		expect(response.status).toBe(409);
		expect(mocks.rpc).not.toHaveBeenCalled();
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it.each([
		['42501', 403],
		['23505', 409],
		['55000', 409],
		['22023', 400],
		['PGRST202', 503]
	])('maps admission error %s', async (code, status) => {
		mocks.rpc.mockResolvedValue({ data: null, error: { code } });

		const response = await post(request());

		expect(response.status).toBe(status);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it.each([
		['empty manifest', [], 404],
		['missing manifest row', VALID_MANIFEST.slice(0, 1), 409],
		['manifest order mismatch', [VALID_MANIFEST[1], VALID_MANIFEST[0]], 503],
		[
			'duplicate step IDs',
			[VALID_MANIFEST[0], { ...VALID_MANIFEST[1], step_id: STEP_IDS[0] }],
			503
		],
		[
			'invalid content hash',
			[{ ...VALID_MANIFEST[0], image_content_sha256: 'not-a-hash' }, VALID_MANIFEST[1]],
			503
		]
	])('fails closed for %s', async (_label, invalidManifest, expectedStatus) => {
		mocks.order.mockResolvedValue({ data: invalidManifest, error: null });

		const response = await post(request());

		expect(response.status).toBe(expectedStatus);
		expect(mocks.rpc).not.toHaveBeenCalled();
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it.each([
		['no admission row', []],
		[
			'cancelled admission status',
			[{ admission_id: ADMISSION_ID, created: false, admission_status: 'cancelled' }]
		],
		[
			'invalid admission ID',
			[{ admission_id: 'not-a-uuid', created: true, admission_status: 'confirmed' }]
		]
	])('fails closed for %s', async (_label, invalidReceipt) => {
		mocks.rpc.mockResolvedValue({ data: invalidReceipt, error: null });

		const response = await post(request());

		expect(response.status).toBe(503);
	});

	it('reports an already-enqueued replay truthfully', async () => {
		mocks.rpc.mockResolvedValue({
			data: [{ admission_id: ADMISSION_ID, created: false, admission_status: 'enqueued' }],
			error: null
		});

		const response = await post(request());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.transportEnqueued).toBe(true);
	});

	it('fails closed when the manifest lookup errors', async () => {
		mocks.order.mockResolvedValue({ data: null, error: { code: 'PGRST500' } });

		const response = await post(request());

		expect(response.status).toBe(503);
		expect(mocks.rpc).not.toHaveBeenCalled();
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});
});
