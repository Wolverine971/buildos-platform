import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLibriUploadPublicationBroker } from './upload-publication';

const NOW = Date.parse('2026-09-07T15:00:00Z');
const origin = 'https://iwifjtlebphefldmwbkh.supabase.co';
const libraryId = 'f09948c4-e4e0-581c-8689-7258bea2f501',
	uploadId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
	leaseToken = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const publicationId = '99999999-9999-4999-8999-999999999991',
	storageId = 'ffffffff-ffff-4fff-8fff-fffffffffff1',
	bookId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const fence = { libraryId, uploadId, leaseToken, attempt: 1 };
const path = `${libraryId}/images/${publicationId}/original.png`;
const bytes = Buffer.from('trusted-native-verified-fixture');
const v = {
	mimeType: 'image/png',
	byteSize: bytes.length,
	sha256: createHash('sha256').update(bytes).digest('hex'),
	width: 3,
	height: 3,
	channels: 3
};
const token = 'machine-only-fixture-token-abcdefghijklmnopqrstuvwxyz';
const jwt = (payload: unknown) =>
	Buffer.from('{"alg":"HS256"}').toString('base64url') +
	'.' +
	Buffer.from(JSON.stringify(payload)).toString('base64url') +
	'.signature';
function fixture() {
	const broker = createLibriUploadPublicationBroker();
	const auth = {
		library_id: libraryId,
		upload_id: uploadId,
		book_id: bookId,
		lease_token: leaseToken,
		attempt: 1,
		bucket_id: 'libri-assets',
		object_path: `${libraryId}/uploads/${uploadId}/original.png`,
		mime_type: v.mimeType,
		byte_size: v.byteSize,
		sha256: v.sha256,
		expires_at: new Date(NOW + 90000).toISOString()
	};
	const preparation = {
		publication_id: publicationId,
		library_id: libraryId,
		upload_id: uploadId,
		book_id: bookId,
		lease_token: leaseToken,
		attempt: 1,
		bucket_id: 'libri-assets',
		object_path: path,
		verified_metadata: v,
		status: 'prepared'
	};
	const row = {
		id: publicationId,
		status: 'prepared',
		storage_object_id: storageId,
		verified_metadata: v
	};
	const info = {
		id: storageId,
		name: path,
		bucket_id: 'libri-assets',
		version: 'one',
		size: v.byteSize,
		content_type: v.mimeType,
		cache_control: 'max-age=0'
	};
	const options: {
		lastAuth?: unknown;
		claims?: unknown;
		preparation?: unknown;
		bytes?: Buffer;
		lastInfo?: unknown;
		streamResponse?: () => Response;
		pending?: string;
		providerStatus?: number;
	} = {};
	let authorizations = 0,
		infos = 0;
	const calls: { path: string; body: Record<string, unknown> | undefined }[] = [];
	const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(String(input)),
			headers = new Headers(init?.headers);
		expect(url.origin).toBe(origin);
		expect(init?.redirect).toBe('error');
		expect(init?.signal).toBeInstanceOf(AbortSignal);
		expect(headers.get('authorization')).toBe('Bearer service-fixture');
		expect(headers.get('apikey')).toBe('service-fixture');
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		calls.push({ path: url.pathname, body });
		if (options.pending === url.pathname) return new Promise<Response>(() => {});
		if (options.providerStatus)
			return Response.json({ secret: 'DO NOT LEAK' }, { status: options.providerStatus });
		if (url.pathname.startsWith('/rest/')) expect(headers.get('accept-profile')).toBe('libri');
		if (url.pathname.endsWith('/authorize_image_upload_download')) {
			authorizations++;
			return Response.json(
				authorizations > 1 && 'lastAuth' in options ? options.lastAuth : auth
			);
		}
		if (url.pathname.endsWith('/prepare_image_upload_publication'))
			return Response.json('preparation' in options ? options.preparation : preparation);
		if (url.pathname.startsWith('/storage/v1/object/upload/sign/')) {
			expect(headers.get('x-upsert')).toBe('false');
			expect(body).toEqual({});
			return Response.json({
				url: `/object/upload/sign/libri-assets/${path}?token=${jwt(options.claims ?? { url: `libri-assets/${path}`, upsert: false, exp: NOW / 1000 + 7200 })}`
			});
		}
		if (url.pathname === '/rest/v1/image_upload_publications') {
			expect(url.searchParams.get('id')).toBe('eq.' + publicationId);
			expect(url.searchParams.get('lease_token')).toBe('eq.' + leaseToken);
			return Response.json([row]);
		}
		if (url.pathname.startsWith('/storage/v1/object/info/')) {
			infos++;
			return Response.json(infos > 1 && 'lastInfo' in options ? options.lastInfo : info);
		}
		if (url.pathname.startsWith('/storage/v1/object/authenticated/'))
			return (
				options.streamResponse?.() ??
				new Response(new Uint8Array(options.bytes ?? bytes), {
					headers: { 'content-type': 'image/png' }
				})
			);
		if (url.pathname.endsWith('/finalize_image_upload_publication')) {
			expect(body).toEqual({
				p_library_id: libraryId,
				p_upload_id: uploadId,
				p_lease_token: leaseToken,
				p_attempt: 1,
				p_verified: v,
				p_publication_id: publicationId,
				p_storage_object_id: storageId
			});
			return Response.json({
				publication_id: publicationId,
				image_id: publicationId,
				source_id: publicationId,
				status: 'published',
				already_published: row.status === 'published'
			});
		}
		throw Error('Unexpected fixture endpoint');
	});
	const config = {
		enabled: true,
		url: origin,
		serviceKey: 'service-fixture',
		brokerToken: token,
		fetchImpl
	};
	const request = (action = 'prepare', extra: Record<string, unknown> = {}) =>
		new Request('https://build-os.com/api/internal/libri/uploads/publish', {
			method: 'POST',
			headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action,
				...fence,
				verified: v,
				...(action === 'finalize' ? { publicationId } : {}),
				...extra
			})
		});
	return { broker, config, options, auth, preparation, row, info, calls, fetchImpl, request };
}
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});
describe('Libri publication server control plane', () => {
	it('prepares one create-only capability and reauthorizes before disclosure', async () => {
		const f = fixture(),
			r = await f.broker(f.request(), f.config);
		expect(r.status).toBe(200);
		const result = await r.json();
		expect(result.preparation).toEqual(f.preparation);
		expect(result.leaseExpiresAt).toBe(f.auth.expires_at);
		expect(r.headers.get('cache-control')).toBe('private, no-store');
		expect(f.calls.map((c) => c.path)).toEqual([
			'/rest/v1/rpc/authorize_image_upload_download',
			'/rest/v1/rpc/prepare_image_upload_publication',
			`/storage/v1/object/upload/sign/libri-assets/${path}`,
			'/rest/v1/rpc/authorize_image_upload_download'
		]);
	});
	it.each([
		'disabled',
		'unauthenticated',
		'extra_object_id',
		'wrong_library',
		'wrong_metadata',
		'wrong_action',
		'query',
		'too_large'
	])('refuses %s before any provider call', async (mode) => {
		const f = fixture();
		let req = f.request();
		if (mode === 'disabled') f.config.enabled = false;
		if (mode === 'unauthenticated') req.headers.delete('authorization');
		if (mode === 'extra_object_id') req = f.request('finalize', { storageObjectId: storageId });
		if (mode === 'wrong_library') req = f.request('prepare', { libraryId: storageId });
		if (mode === 'wrong_metadata')
			req = f.request('prepare', { verified: { ...v, width: 40000000 } });
		if (mode === 'wrong_action') req = f.request('delete');
		if (mode === 'query') req = new Request(req.url + '?path=other', req);
		if (mode === 'too_large') req.headers.set('content-length', '2049');
		expect((await f.broker(req, f.config)).status).toBeGreaterThanOrEqual(400);
		expect(f.fetchImpl).not.toHaveBeenCalled();
	});
	it.each([
		{ upsert: true },
		{ url: 'libri-assets/elsewhere' },
		{ exp: NOW / 1000 - 1 },
		{ exp: NOW / 1000 + 8000 },
		{ scope: 'download' }
	])('refuses unsafe signed capability %j', async (override) => {
		const f = fixture();
		f.options.claims = {
			url: `libri-assets/${path}`,
			upsert: false,
			exp: NOW / 1000 + 7200,
			...override
		};
		expect((await f.broker(f.request(), f.config)).status).toBe(503);
	});
	it('does not disclose a capability after revocation', async () => {
		const f = fixture();
		f.options.lastAuth = null;
		const r = await f.broker(f.request(), f.config);
		expect(r.status).toBe(409);
		expect(JSON.stringify(await r.json())).not.toContain('token=');
	});
	it('streams and hashes the exact object, rechecks identity/authority, then finalizes', async () => {
		const f = fixture(),
			r = await f.broker(f.request('finalize'), f.config);
		expect(r.status).toBe(200);
		expect((await r.json()).image_id).toBe(publicationId);
		expect(
			f.calls.filter((c) => c.path.endsWith('/finalize_image_upload_publication'))
		).toHaveLength(1);
		expect(f.calls.filter((c) => c.path.includes('/object/info/'))).toHaveLength(2);
	});
	it.each([
		'hash',
		'short',
		'oversized',
		'content_type',
		'partial',
		'encoding',
		'object_replaced',
		'version_changed',
		'cache',
		'revoked',
		'wrong_publication'
	])('never finalizes unsafe stored data: %s', async (mode) => {
		const f = fixture();
		if (mode === 'hash') f.options.bytes = Buffer.alloc(bytes.length);
		if (mode === 'short') f.options.bytes = bytes.subarray(1);
		if (mode === 'oversized') f.options.bytes = Buffer.concat([bytes, bytes]);
		if (mode === 'content_type')
			f.options.streamResponse = () =>
				new Response(bytes, { headers: { 'content-type': 'text/plain' } });
		if (mode === 'partial')
			f.options.streamResponse = () =>
				new Response(bytes, { status: 206, headers: { 'content-type': 'image/png' } });
		if (mode === 'encoding')
			f.options.streamResponse = () =>
				new Response(bytes, {
					headers: { 'content-type': 'image/png', 'content-encoding': 'gzip' }
				});
		if (mode === 'object_replaced') f.options.lastInfo = { ...f.info, id: bookId };
		if (mode === 'version_changed') f.options.lastInfo = { ...f.info, version: 'two' };
		if (mode === 'cache') f.info.cache_control = 'max-age=3600';
		if (mode === 'revoked') f.options.lastAuth = null;
		if (mode === 'wrong_publication')
			f.options.preparation = { ...f.preparation, publication_id: bookId };
		expect((await f.broker(f.request('finalize'), f.config)).status).toBeGreaterThanOrEqual(
			400
		);
		expect(f.calls.some((c) => c.path.endsWith('/finalize_image_upload_publication'))).toBe(
			false
		);
	});
	it('acknowledges a committed exact receipt without issuing another capability or downloading bytes', async () => {
		const f = fixture();
		f.row.status = 'published';
		const r = await f.broker(f.request('finalize'), f.config);
		expect(r.status).toBe(200);
		expect((await r.json()).already_published).toBe(true);
		expect(f.calls).toHaveLength(2);
		expect(f.calls.every((c) => c.path.startsWith('/rest/'))).toBe(true);
	});
	it('redacts provider failures', async () => {
		const f = fixture();
		f.options.providerStatus = 500;
		const r = await f.broker(f.request(), f.config);
		expect(r.status).toBe(503);
		expect(await r.json()).toEqual({ error: 'Upload publication unavailable' });
	});
	it('times out stalled external I/O, retains capacity, and cannot advance to signing', async () => {
		const f = fixture();
		f.options.pending = '/rest/v1/rpc/authorize_image_upload_download';
		const result = f.broker(f.request(), f.config);
		await vi.advanceTimersByTimeAsync(20001);
		expect((await result).status).toBe(503);
		expect((await f.broker(f.request(), f.config)).status).toBe(429);
		expect(f.calls).toHaveLength(1);
	});
	it('shortens the active network timeout to the lease deadline', async () => {
		const f = fixture();
		f.auth.expires_at = new Date(NOW + 5000).toISOString();
		f.options.pending = '/rest/v1/rpc/prepare_image_upload_publication';
		const result = f.broker(f.request(), f.config);
		await vi.advanceTimersByTimeAsync(3001);
		expect((await result).status).toBe(503);
		expect(f.calls.map((call) => call.path)).toEqual([
			'/rest/v1/rpc/authorize_image_upload_download',
			'/rest/v1/rpc/prepare_image_upload_publication'
		]);
	});
});
