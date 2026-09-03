import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	privateEnv: {
		PRIVATE_LIBRI_CATALOG_ASSET_TOKEN: 'catalog-asset-token'
	},
	createAdminSupabaseClient: vi.fn(),
	schema: vi.fn(),
	from: vi.fn(),
	select: vi.fn(),
	eq: vi.fn(),
	in: vi.fn(),
	order: vi.fn(),
	limit: vi.fn(),
	storageFrom: vi.fn(),
	createSignedUrls: vi.fn(),
	queryResult: { data: [] as unknown, error: null as { code?: string } | null }
}));

vi.mock('$env/dynamic/private', () => ({ env: mocks.privateEnv }));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'https://supabase.example' }));
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

import { POST } from './+server';

const BOOK_ID = '0b3ce3cb-9a08-5732-95ca-9557ee44d24a';
const SECOND_BOOK_ID = '0b3ce3cb-9a08-5732-95ca-9557ee44d24b';
const LIBRARY_ID = 'f09948c4-e4e0-581c-8689-7258bea2f501';
const COVER_PATH = `${LIBRARY_ID}/images/cover.webp`;
const SIGNED_URL = `https://supabase.example/storage/v1/object/sign/libri-assets/${COVER_PATH}?token=opaque`;

function request(
	body: unknown = { bookIds: [BOOK_ID] },
	options: {
		authorized?: boolean;
		contentType?: string;
		rawBody?: string;
		contentLength?: string;
	} = {}
): Request {
	const rawBody = options.rawBody ?? JSON.stringify(body);
	const headers = new Headers();
	if (options.contentType !== '')
		headers.set('Content-Type', options.contentType ?? 'application/json');
	if (options.contentLength) headers.set('Content-Length', options.contentLength);
	if (options.authorized !== false) headers.set('Authorization', 'Bearer catalog-asset-token');
	return new Request('https://build-os.com/api/internal/libri/catalog-covers/sign', {
		method: 'POST',
		headers,
		body: rawBody
	});
}

async function post(input: Request): Promise<Response> {
	return POST({ request: input } as never);
}

describe('/api/internal/libri/catalog-covers/sign', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.privateEnv.PRIVATE_LIBRI_CATALOG_ASSET_TOKEN = 'catalog-asset-token';
		mocks.queryResult = { data: [], error: null };

		const query = {
			select: mocks.select,
			eq: mocks.eq,
			in: mocks.in,
			order: mocks.order,
			limit: mocks.limit,
			then: (
				onFulfilled: (value: typeof mocks.queryResult) => unknown,
				onRejected?: (reason: unknown) => unknown
			) => Promise.resolve(mocks.queryResult).then(onFulfilled, onRejected)
		};
		mocks.select.mockReturnValue(query);
		mocks.eq.mockReturnValue(query);
		mocks.in.mockReturnValue(query);
		mocks.order.mockReturnValue(query);
		mocks.limit.mockReturnValue(query);
		mocks.from.mockReturnValue(query);
		mocks.schema.mockReturnValue({ from: mocks.from });
		mocks.createSignedUrls.mockResolvedValue({ data: [], error: null });
		mocks.storageFrom.mockReturnValue({ createSignedUrls: mocks.createSignedUrls });
		mocks.createAdminSupabaseClient.mockReturnValue({
			schema: mocks.schema,
			storage: { from: mocks.storageFrom }
		});
	});

	it('rejects missing or incorrect credentials before database access', async () => {
		let response = await post(request(undefined, { authorized: false }));
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Catalog covers unavailable' });
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();

		mocks.privateEnv.PRIVATE_LIBRI_CATALOG_ASSET_TOKEN = '';
		response = await post(request());
		expect(response.status).toBe(503);
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it.each([
		['missing JSON content type', request(undefined, { contentType: '' })],
		['malformed JSON', request(undefined, { rawBody: '{' })],
		['unexpected field', request({ bookIds: [BOOK_ID], libraryId: LIBRARY_ID })],
		['empty IDs', request({ bookIds: [] })],
		['invalid ID', request({ bookIds: ['not-a-uuid'] })],
		['oversized body', request(undefined, { contentLength: '8193' })]
	])('rejects %s before using service authority', async (_label, input) => {
		const response = await post(input);
		expect(response.status).toBe(400);
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it('looks up only requested covers and returns reviewed batch-signed URLs', async () => {
		mocks.queryResult = {
			data: [
				{
					book_id: BOOK_ID,
					object_path: COVER_PATH,
					mime_type: 'image/webp',
					created_at: '2026-08-29T12:00:00.000Z'
				}
			],
			error: null
		};
		mocks.createSignedUrls.mockResolvedValue({
			data: [{ path: COVER_PATH, signedUrl: SIGNED_URL }],
			error: null
		});

		const response = await post(request({ bookIds: [BOOK_ID, BOOK_ID] }));
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(await response.json()).toEqual({
			covers: [{ bookId: BOOK_ID, url: SIGNED_URL, mimeType: 'image/webp' }]
		});
		expect(mocks.schema).toHaveBeenCalledWith('libri');
		expect(mocks.select).toHaveBeenCalledWith('book_id, object_path, mime_type, created_at');
		expect(mocks.eq).toHaveBeenNthCalledWith(1, 'library_id', LIBRARY_ID);
		expect(mocks.eq).toHaveBeenNthCalledWith(2, 'image_type', 'cover');
		expect(mocks.in).toHaveBeenCalledWith('book_id', [BOOK_ID]);
		expect(mocks.createSignedUrls).toHaveBeenCalledWith([COVER_PATH], 900);
	});

	it('returns an empty set without calling Storage when no cover exists', async () => {
		const response = await post(request());
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ covers: [] });
		expect(mocks.storageFrom).not.toHaveBeenCalled();
	});

	it.each([
		[
			'book outside the request',
			{
				book_id: SECOND_BOOK_ID,
				object_path: COVER_PATH,
				mime_type: 'image/webp',
				created_at: '2026-08-29T12:00:00Z'
			}
		],
		[
			'path outside the library',
			{
				book_id: BOOK_ID,
				object_path: 'another-library/cover.webp',
				mime_type: 'image/webp',
				created_at: '2026-08-29T12:00:00Z'
			}
		],
		[
			'unsupported MIME type',
			{
				book_id: BOOK_ID,
				object_path: COVER_PATH,
				mime_type: 'image/svg+xml',
				created_at: '2026-08-29T12:00:00Z'
			}
		]
	])('fails closed for a %s', async (_label, row) => {
		mocks.queryResult = { data: [row], error: null };
		const response = await post(request());
		expect(response.status).toBe(503);
		expect(mocks.storageFrom).not.toHaveBeenCalled();
	});

	it('fails closed when Storage returns a foreign or incomplete signed URL set', async () => {
		mocks.queryResult = {
			data: [
				{
					book_id: BOOK_ID,
					object_path: COVER_PATH,
					mime_type: 'image/webp',
					created_at: '2026-08-29T12:00:00Z'
				}
			],
			error: null
		};
		mocks.createSignedUrls.mockResolvedValueOnce({
			data: [{ path: COVER_PATH, signedUrl: 'https://attacker.example/cover.webp' }],
			error: null
		});
		let response = await post(request());
		expect(response.status).toBe(503);

		mocks.createSignedUrls.mockResolvedValueOnce({ data: [], error: null });
		response = await post(request());
		expect(response.status).toBe(503);
	});
});
