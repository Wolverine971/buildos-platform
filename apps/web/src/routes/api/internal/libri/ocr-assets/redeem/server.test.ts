import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	privateEnv: {
		PRIVATE_LIBRI_ASSET_BROKER_TOKEN: 'libri-broker-token'
	},
	createAdminSupabaseClient: vi.fn(),
	schema: vi.fn(),
	rpc: vi.fn(),
	storageFrom: vi.fn(),
	createSignedUrl: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({
	env: mocks.privateEnv
}));

vi.mock('$env/static/public', () => ({
	PUBLIC_SUPABASE_URL: 'https://supabase.example'
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));

import { POST } from './+server';

const GRANT_ID = '10000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-08-31T16:00:00.000Z');
const VALID_GRANT = {
	bucket_id: 'libri-assets',
	object_path: 'libraries/library-1/images/image-1.webp',
	mime_type: 'image/webp',
	expires_at: '2026-08-31T16:00:42.900Z'
};
const SIGNED_URL =
	'https://supabase.example/storage/v1/object/sign/libri-assets/libraries/library-1/images/image-1.webp?token=opaque';

function request(
	body: unknown = { grantId: GRANT_ID },
	options: {
		contentType?: string;
		rawBody?: string;
		contentLength?: string;
		authorized?: boolean;
	} = {}
): Request {
	const rawBody = options.rawBody ?? JSON.stringify(body);
	const headers = new Headers();
	if (options.contentType !== '') {
		headers.set('Content-Type', options.contentType ?? 'application/json');
	}
	if (options.contentLength) headers.set('Content-Length', options.contentLength);
	if (options.authorized !== false) {
		headers.set('Authorization', 'Bearer libri-broker-token');
	}
	return new Request('https://build-os.com/api/internal/libri/ocr-assets/redeem', {
		method: 'POST',
		headers,
		body: rawBody
	});
}

async function post(input: Request): Promise<Response> {
	return POST({ request: input } as never);
}

describe('/api/internal/libri/ocr-assets/redeem', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		vi.clearAllMocks();
		mocks.privateEnv.PRIVATE_LIBRI_ASSET_BROKER_TOKEN = 'libri-broker-token';

		mocks.rpc.mockResolvedValue({ data: [VALID_GRANT], error: null });
		mocks.schema.mockReturnValue({ rpc: mocks.rpc });
		mocks.createSignedUrl.mockResolvedValue({
			data: { signedUrl: SIGNED_URL },
			error: null
		});
		mocks.storageFrom.mockReturnValue({ createSignedUrl: mocks.createSignedUrl });
		mocks.createAdminSupabaseClient.mockReturnValue({
			schema: mocks.schema,
			storage: { from: mocks.storageFrom }
		});
	});

	it('rejects callers without the dedicated broker token before reading the grant', async () => {
		const response = await post(request(undefined, { authorized: false }));

		expect(response.status).toBe(401);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(await response.json()).toEqual({ error: 'Asset grant unavailable' });
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it('fails closed before database access when the broker token is not configured', async () => {
		mocks.privateEnv.PRIVATE_LIBRI_ASSET_BROKER_TOKEN = '';

		const response = await post(request());

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'Asset grant unavailable' });
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it.each([
		['missing JSON content type', request(undefined, { contentType: '' })],
		['malformed JSON', request(undefined, { rawBody: '{' })],
		['invalid UUID', request({ grantId: 'not-a-uuid' })],
		['unexpected fields', request({ grantId: GRANT_ID, objectPath: 'private/secret.png' })],
		['oversized declared body', request(undefined, { contentLength: '257' })]
	])('rejects %s before using service authority', async (_label, input) => {
		const response = await post(input);

		expect(response.status).toBe(400);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(await response.json()).toEqual({ error: 'Asset grant unavailable' });
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it('consumes the capability and returns only a reviewed signed URL and MIME type', async () => {
		const response = await post(request());

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('pragma')).toBe('no-cache');
		expect(await response.json()).toEqual({ signedUrl: SIGNED_URL, mimeType: 'image/webp' });
		expect(mocks.schema).toHaveBeenCalledWith('libri');
		expect(mocks.rpc).toHaveBeenCalledWith('consume_ocr_asset_grant', {
			p_grant_id: GRANT_ID
		});
		expect(mocks.storageFrom).toHaveBeenCalledWith('libri-assets');
		expect(mocks.createSignedUrl).toHaveBeenCalledWith(VALID_GRANT.object_path, 40);
	});

	it('caps the signed URL at 60 seconds even if the database returns a later expiry', async () => {
		mocks.rpc.mockResolvedValue({
			data: [{ ...VALID_GRANT, expires_at: '2026-08-31T16:02:00.000Z' }],
			error: null
		});

		const response = await post(request());

		expect(response.status).toBe(200);
		expect(mocks.createSignedUrl).toHaveBeenCalledWith(VALID_GRANT.object_path, 60);
	});

	it.each([
		['no row', []],
		['multiple rows', [VALID_GRANT, VALID_GRANT]],
		['wrong bucket', [{ ...VALID_GRANT, bucket_id: 'onto-assets' }]],
		['unsupported MIME type', [{ ...VALID_GRANT, mime_type: 'image/svg+xml' }]],
		['unsafe object path', [{ ...VALID_GRANT, object_path: '../private.png' }]],
		['expired grant', [{ ...VALID_GRANT, expires_at: '2026-08-31T16:00:04.999Z' }]]
	])('fails closed for %s', async (_label, data) => {
		mocks.rpc.mockResolvedValue({ data, error: null });

		const response = await post(request());

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'Asset grant unavailable' });
		expect(mocks.storageFrom).not.toHaveBeenCalled();
	});

	it('uses one generic unavailable response for database failures', async () => {
		mocks.rpc.mockResolvedValue({
			data: null,
			error: { code: 'PGRST202', message: 'details' }
		});

		const response = await post(request());

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'Asset grant unavailable' });
		expect(mocks.storageFrom).not.toHaveBeenCalled();
	});

	it('fails closed when signing fails or returns a URL outside the Supabase origin', async () => {
		mocks.createSignedUrl.mockResolvedValueOnce({
			data: null,
			error: { name: 'StorageError' }
		});

		let response = await post(request());
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'Asset grant unavailable' });

		mocks.createSignedUrl.mockResolvedValueOnce({
			data: { signedUrl: 'https://attacker.example/private.png' },
			error: null
		});
		response = await post(request());
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'Asset grant unavailable' });
	});

	it('does not sign a second URL when the one-time grant is replayed', async () => {
		mocks.rpc
			.mockResolvedValueOnce({ data: [VALID_GRANT], error: null })
			.mockResolvedValueOnce({ data: [], error: null });

		const first = await post(request());
		const replay = await post(request());

		expect(first.status).toBe(200);
		expect(replay.status).toBe(404);
		expect(mocks.createSignedUrl).toHaveBeenCalledOnce();
	});
});
