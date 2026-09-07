import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signLibriUploadDownload } from './upload-download-signing';

const NOW = Date.parse('2026-09-07T02:05:00Z');
const ORIGIN = 'https://iwifjtlebphefldmwbkh.supabase.co';
const LIBRARY = 'f09948c4-e4e0-581c-8689-7258bea2f501';
const uploadId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const leaseToken = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const fence = { libraryId: LIBRARY, uploadId, leaseToken, attempt: 1 };
const path = `${LIBRARY}/uploads/${uploadId}/original.png`;
const secret = 'test-broker-token-abcdefghijklmnopqrstuvwxyz';
const payload = () => ({ url: `libri-assets/${path}`, exp: Math.floor(NOW / 1000) + 30 });
const jwt = (data: unknown) =>
	`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(data)).toString('base64url')}.signature`;
const receipt = () => ({
	library_id: LIBRARY,
	upload_id: uploadId,
	book_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	lease_token: leaseToken,
	attempt: 1,
	bucket_id: 'libri-assets',
	object_path: path,
	mime_type: 'image/png',
	byte_size: 1024,
	sha256: 'a'.repeat(64),
	expires_at: new Date(NOW + 90_000).toISOString()
});
function fixture() {
	let authorizations = 0;
	const options: {
		row?: Record<string, unknown> | null;
		second?: Record<string, unknown> | null;
		signed?: string;
		claims?: unknown;
		rpcStatus?: number;
		signingStatus?: number;
	} = {};
	const calls: { path: string; body: Record<string, unknown>; headers: Headers }[] = [];
	const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(String(input));
		const headers = new Headers(init?.headers);
		const body = JSON.parse(String(init?.body));
		calls.push({ path: url.pathname, body, headers });
		expect(url.origin).toBe(ORIGIN);
		expect(init?.redirect).toBe('error');
		expect(init?.signal).toBeInstanceOf(AbortSignal);
		expect(headers.get('authorization')).toBe('Bearer service-only-fixture');
		expect(headers.get('apikey')).toBe('service-only-fixture');
		if (url.pathname === '/rest/v1/rpc/authorize_image_upload_download') {
			expect(headers.get('content-profile')).toBe('libri');
			expect(body).toEqual({
				p_library_id: LIBRARY,
				p_upload_id: uploadId,
				p_lease_token: leaseToken,
				p_attempt: 1
			});
			authorizations++;
			const row =
				authorizations === 2 && 'second' in options
					? options.second
					: 'row' in options
						? options.row
						: receipt();
			return Response.json(row, { status: options.rpcStatus ?? 200 });
		}
		expect(url.pathname).toBe(`/storage/v1/object/sign/libri-assets/${path}`);
		expect(body).toEqual({ expiresIn: 30 });
		return Response.json(
			{
				signedURL:
					options.signed ??
					`/object/sign/libri-assets/${path}?token=${jwt(options.claims ?? payload())}`
			},
			{ status: options.signingStatus ?? 200 }
		);
	});
	const config = {
		enabled: true,
		url: ORIGIN,
		serviceKey: 'service-only-fixture',
		brokerToken: secret,
		fetchImpl
	};
	const request = (body: unknown = fence, authorization = `Bearer ${secret}`) =>
		new Request('https://build-os.com/api/internal/libri/uploads/download', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: authorization },
			body: JSON.stringify(body)
		});
	return { options, config, fetchImpl, calls, request };
}
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('server-only Libri upload download signing', () => {
	it('checks the full lease twice around one exact-path Storage signature', async () => {
		const f = fixture();
		const result = await signLibriUploadDownload(f.request(), f.config);
		expect(result.status).toBe(200);
		expect(result.headers.get('cache-control')).toBe('private, no-store');
		expect(await result.json()).toEqual({
			signedUrl: `${ORIGIN}/storage/v1/object/sign/libri-assets/${path}?token=${jwt(payload())}`,
			expiresAt: new Date(NOW + 30_000).toISOString()
		});
		expect(f.calls.map((c) => c.path)).toEqual([
			'/rest/v1/rpc/authorize_image_upload_download',
			`/storage/v1/object/sign/libri-assets/${path}`,
			'/rest/v1/rpc/authorize_image_upload_download'
		]);
	});
	it('is default-off before using server authority', async () => {
		const f = fixture();
		expect(
			(await signLibriUploadDownload(f.request(), { ...f.config, enabled: undefined })).status
		).toBe(404);
		expect(f.fetchImpl).not.toHaveBeenCalled();
	});
	it.each(['', 'Bearer wrong', 'Bearer ' + 'x'.repeat(600)])(
		'denies invalid machine credentials',
		async (auth) => {
			const f = fixture();
			expect((await signLibriUploadDownload(f.request(fence, auth), f.config)).status).toBe(
				401
			);
			expect(f.fetchImpl).not.toHaveBeenCalled();
		}
	);
	it.each([
		{ brokerToken: '' },
		{ serviceKey: '' },
		{ url: 'https://another-project.supabase.co' }
	])('fails closed for unsafe server configuration', async (config) => {
		const f = fixture();
		expect(
			(await signLibriUploadDownload(f.request(), { ...f.config, ...config })).status
		).toBe(503);
		expect(f.fetchImpl).not.toHaveBeenCalled();
	});
	it.each([
		{ ...fence, libraryId: uploadId },
		{ ...fence, uploadId: 'bad' },
		{ ...fence, leaseToken: 'bad' },
		{ ...fence, attempt: 0 },
		{ ...fence, attempt: 4 },
		{ ...fence, attempt: '1' },
		{ ...fence, objectPath: 'other/private.png' },
		[],
		null
	])('rejects caller-selected paths or invalid fencing fields', async (body) => {
		const f = fixture();
		expect((await signLibriUploadDownload(f.request(body), f.config)).status).toBe(400);
		expect(f.fetchImpl).not.toHaveBeenCalled();
	});
	it.each([
		null,
		{ ...receipt(), library_id: uploadId },
		{ ...receipt(), lease_token: uploadId },
		{ ...receipt(), attempt: 2 },
		{ ...receipt(), bucket_id: 'public' },
		{ ...receipt(), object_path: 'other/path' },
		{ ...receipt(), mime_type: 'image/svg+xml' },
		{ ...receipt(), byte_size: '1024' },
		{ ...receipt(), sha256: 'bad' },
		{ ...receipt(), expires_at: new Date(NOW + 2_000).toISOString() },
		{ ...receipt(), expires_at: new Date(NOW + 100_000).toISOString() }
	])('refuses invalid/stale DB receipts before signing', async (row) => {
		const f = fixture();
		f.options.row = row;
		expect(
			(await signLibriUploadDownload(f.request(), f.config)).status
		).toBeGreaterThanOrEqual(400);
		expect(f.fetchImpl).toHaveBeenCalledOnce();
	});
	it.each([null, { ...receipt(), sha256: 'b'.repeat(64) }, { ...receipt(), attempt: 2 }])(
		'never discloses a URL after revocation or replacement during signing',
		async (second) => {
			const f = fixture();
			f.options.second = second;
			const result = await signLibriUploadDownload(f.request(), f.config);
			expect(result.status).toBeGreaterThanOrEqual(400);
			expect(await result.json()).toEqual({ error: 'Upload download unavailable' });
			expect(f.fetchImpl).toHaveBeenCalledTimes(3);
		}
	);
	it.each([
		{ ...payload(), url: 'libri-assets/another.png' },
		{ ...payload(), exp: Math.floor(NOW / 1000) + 3600 },
		{ ...payload(), exp: Math.floor(NOW / 1000) + 1 },
		{ ...payload(), exp: '123' },
		{ ...payload(), upsert: true },
		{ ...payload(), scope: 'upload' }
	])('rejects substituted or excessive Storage capability claims', async (claims) => {
		const f = fixture();
		f.options.claims = claims;
		expect((await signLibriUploadDownload(f.request(), f.config)).status).toBe(503);
		expect(f.fetchImpl).toHaveBeenCalledTimes(2);
	});
	it.each([
		`/object/sign/other-bucket/${path}?token=${jwt(payload())}`,
		`/object/sign/libri-assets/${path}?token=${jwt(payload())}&download=true`,
		`/object/sign/libri-assets/${path}?token=${jwt(payload())}#fragment`,
		`/object/public/libri-assets/${path}?token=${jwt(payload())}`,
		`/object/sign/libri-assets/${path}?token=opaque`,
		'https://attacker.invalid/object?token=secret'
	])('rejects malformed or wrong-path Storage URL', async (signed) => {
		const f = fixture();
		f.options.signed = signed;
		expect((await signLibriUploadDownload(f.request(), f.config)).status).toBe(503);
	});
	it('bounds actual request bytes without trusting Content-Length', async () => {
		const f = fixture();
		const result = await signLibriUploadDownload(
			f.request({ ...fence, extra: 'x'.repeat(1024) }),
			f.config
		);
		expect(result.status).toBe(413);
		expect(f.fetchImpl).not.toHaveBeenCalled();
	});
	it.each([400, 401, 429, 503])(
		'redacts provider failures and never retries HTTP %s',
		async (status) => {
			const f = fixture();
			f.options.rpcStatus = status;
			const result = await signLibriUploadDownload(f.request(), f.config);
			expect(result.status).toBe(503);
			expect(await result.text()).not.toContain('service-only');
			expect(f.fetchImpl).toHaveBeenCalledOnce();
		}
	);
	it('never forwards service credentials through redirects', async () => {
		const f = fixture();
		f.fetchImpl.mockResolvedValueOnce(
			new Response(null, { status: 302, headers: { Location: 'https://attacker.invalid' } })
		);
		expect((await signLibriUploadDownload(f.request(), f.config)).status).toBe(503);
		expect(f.fetchImpl).toHaveBeenCalledOnce();
	});
	it('bounds provider response bytes', async () => {
		const f = fixture();
		f.fetchImpl.mockResolvedValueOnce(new Response('x'.repeat(16_385)));
		expect((await signLibriUploadDownload(f.request(), f.config)).status).toBe(503);
		expect(f.fetchImpl).toHaveBeenCalledOnce();
	});
	it('bounds stalled signing and discards a late token', async () => {
		const f = fixture();
		let resolve!: (value: Response) => void;
		f.fetchImpl.mockImplementationOnce(
			() =>
				new Promise((done) => {
					resolve = done;
				})
		);
		const result = signLibriUploadDownload(f.request(), f.config);
		await vi.advanceTimersByTimeAsync(8_000);
		expect((await result).status).toBe(503);
		resolve(Response.json(receipt()));
		await vi.advanceTimersByTimeAsync(0);
		expect(f.fetchImpl).toHaveBeenCalledOnce();
	});
	it('bounds stalled request streams without awaiting cancellation promises', async () => {
		const f = fixture();
		const cancel = vi.fn(() => new Promise<void>(() => {}));
		const request = new Request(f.request(), {
			body: new ReadableStream({ cancel }),
			duplex: 'half'
		} as RequestInit);
		const result = signLibriUploadDownload(request, f.config);
		await vi.advanceTimersByTimeAsync(8_000);
		expect((await result).status).toBe(503);
		expect(cancel).toHaveBeenCalledOnce();
		expect(f.fetchImpl).not.toHaveBeenCalled();
	});
	it('bounds endless empty request chunks without starving timers', async () => {
		const f = fixture();
		const request = new Request(f.request(), {
			body: new ReadableStream({
				pull(c) {
					c.enqueue(new Uint8Array());
				}
			}),
			duplex: 'half'
		} as RequestInit);
		expect((await signLibriUploadDownload(request, f.config)).status).toBe(413);
		expect(f.fetchImpl).not.toHaveBeenCalled();
	});
});
