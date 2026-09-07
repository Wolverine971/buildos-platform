import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLibriUploadDownloadAuthorizer } from '../src/workers/libri/uploadDownloadAuthorizer';
import { createLibriUploadImageDownloader } from '../src/workers/libri/uploadImageDownload';
import { createLibriUploadImageVerifier } from '../src/workers/libri/uploadImageVerifier';
import type { LibriUploadClaim } from '../src/workers/libri/uploadProcessing';
import { signLibriUploadDownload } from '../../web/src/lib/server/libri/upload-download-signing';

const NOW = Date.parse('2026-09-07T02:10:00Z');
const origin = 'https://iwifjtlebphefldmwbkh.supabase.co';
const endpoint = 'https://build-os.com/api/internal/libri/uploads/download';
const secret = 'broker-fixture-only-abcdefghijklmnopqrstuvwxyz';
const libraryId = 'f09948c4-e4e0-581c-8689-7258bea2f501',
	uploadId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const path = `${libraryId}/uploads/${uploadId}/original.png`;
const signedUrl = `${origin}/storage/v1/object/sign/libri-assets/${path}?token=opaque`;
const claim = (): LibriUploadClaim => ({
	libraryId,
	uploadId,
	leaseToken: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
	bookId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
	attempt: 1,
	objectPath: path,
	leaseExpiresAt: new Date(NOW + 90_000).toISOString(),
	declaration: { mimeType: 'image/png', byteSize: 1024, sha256: 'a'.repeat(64) }
});
const grant = () => ({ signedUrl, expiresAt: new Date(NOW + 30_000).toISOString() });
function fixture() {
	const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
		Response.json(grant())
	);
	const authorize = createLibriUploadDownloadAuthorizer({
		endpointUrl: endpoint,
		storageOrigin: origin,
		bearerToken: secret,
		fetchImpl
	});
	const controller = new AbortController();
	return {
		fetchImpl,
		authorize,
		controller,
		input: { claim: claim(), signal: controller.signal }
	};
}
beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('Libri worker upload signing client', () => {
	it('sends only the complete fence to the broker, with no service key or caller path', async () => {
		const f = fixture();
		expect(await f.authorize(f.input)).toEqual(grant());
		const [url, init] = f.fetchImpl.mock.calls[0];
		expect(url).toBe(endpoint);
		expect(init).toMatchObject({
			method: 'POST',
			redirect: 'error',
			credentials: 'omit',
			cache: 'no-store'
		});
		expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${secret}`);
		expect(JSON.parse(String(init?.body))).toEqual({
			libraryId,
			uploadId,
			leaseToken: f.input.claim.leaseToken,
			attempt: 1
		});
		expect(f.fetchImpl).toHaveBeenCalledOnce();
	});
	it.each([301, 302, 307, 401, 403, 404, 429, 503])(
		'does not redirect or retry HTTP %s',
		async (status) => {
			const f = fixture();
			f.fetchImpl.mockResolvedValueOnce(
				new Response(null, { status, headers: { Location: 'https://attacker.invalid' } })
			);
			await expect(f.authorize(f.input)).rejects.toMatchObject({
				code: 'download_authorization_unavailable',
				retryable: status === 429 || status >= 500
			});
			expect(f.fetchImpl).toHaveBeenCalledOnce();
		}
	);
	it.each([
		{},
		[],
		null,
		{ ...grant(), extra: 'unsafe' },
		{ ...grant(), signedUrl: signedUrl.replace(origin, 'https://attacker.invalid') },
		{
			...grant(),
			signedUrl: signedUrl.replace(uploadId, 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2')
		},
		{ ...grant(), expiresAt: new Date(NOW + 1000).toISOString() }
	])('refuses untrusted or stale broker receipts', async (data) => {
		const f = fixture();
		f.fetchImpl.mockResolvedValueOnce(Response.json(data));
		await expect(f.authorize(f.input)).rejects.toThrow('Libri upload download failed');
	});
	it('rejects mismatched Content-Length limits and actual oversized bodies', async () => {
		for (const response of [
			new Response('{}', {
				headers: { 'Content-Type': 'application/json', 'Content-Length': '8193' }
			}),
			new Response('x'.repeat(8193), { headers: { 'Content-Type': 'application/json' } })
		]) {
			const f = fixture();
			f.fetchImpl.mockResolvedValueOnce(response);
			await expect(f.authorize(f.input)).rejects.toMatchObject({
				code: 'invalid_download_authorization_response'
			});
		}
	});
	it('bounds a stalled header response and cancels late data', async () => {
		const f = fixture();
		let resolve!: (response: Response) => void;
		f.fetchImpl.mockReturnValueOnce(
			new Promise((done) => {
				resolve = done;
			})
		);
		const result = expect(f.authorize(f.input)).rejects.toMatchObject({
			code: 'download_authorization_timeout'
		});
		await vi.advanceTimersByTimeAsync(5000);
		await result;
		const cancel = vi.fn(() => new Promise<void>(() => {}));
		resolve(new Response(new ReadableStream({ cancel })));
		await vi.advanceTimersByTimeAsync(0);
		expect(cancel).toHaveBeenCalledOnce();
		expect(f.fetchImpl).toHaveBeenCalledOnce();
	});
	it('bounds stalled body reads and does not wait for cancellation promises', async () => {
		const f = fixture();
		const cancel = vi.fn(() => new Promise<void>(() => {}));
		f.fetchImpl.mockResolvedValueOnce(
			new Response(new ReadableStream({ cancel }), {
				headers: { 'Content-Type': 'application/json' }
			})
		);
		const result = expect(f.authorize(f.input)).rejects.toMatchObject({
			code: 'download_authorization_timeout'
		});
		await vi.advanceTimersByTimeAsync(5000);
		await result;
		expect(cancel).toHaveBeenCalledOnce();
	});
	it('rejects endlessly empty response chunks', async () => {
		const f = fixture();
		f.fetchImpl.mockResolvedValueOnce(
			new Response(
				new ReadableStream({
					pull(c) {
						c.enqueue(new Uint8Array());
					}
				}),
				{ headers: { 'Content-Type': 'application/json' } }
			)
		);
		await expect(f.authorize(f.input)).rejects.toMatchObject({
			code: 'invalid_download_authorization_response'
		});
	});
	it('rejects pre-aborted and expired claims before network access', async () => {
		const f = fixture();
		f.controller.abort();
		await expect(f.authorize(f.input)).rejects.toMatchObject({ code: 'download_aborted' });
		f.input.claim.leaseExpiresAt = new Date(NOW).toISOString();
		await expect(f.authorize(f.input)).rejects.toMatchObject({
			code: 'download_lease_expired'
		});
		expect(f.fetchImpl).not.toHaveBeenCalled();
	});
	it('redacts unknown transport failures', async () => {
		const f = fixture();
		f.fetchImpl.mockRejectedValueOnce(new Error('private-broker-secret'));
		await expect(f.authorize(f.input)).rejects.toThrow(
			'Libri upload download failed: download_authorization_unavailable'
		);
	});
	it.each([
		'http://build-os.com/api/internal/libri/uploads/download',
		endpoint + '?token=secret',
		endpoint + '#fragment',
		endpoint.replace('/download', '/sign')
	])('rejects unsafe broker configuration', (endpointUrl) => {
		expect(() =>
			createLibriUploadDownloadAuthorizer({
				endpointUrl,
				storageOrigin: origin,
				bearerToken: secret
			})
		).toThrow('canonical HTTPS');
	});
	it.each(['valid', 'revoked', 'modified_bytes'])(
		'composes server, client and native verifier with credential isolation: %s',
		async (scenario) => {
			const bytes = await sharp({
				create: { width: 4, height: 3, channels: 3, background: 'red' }
			})
				.png()
				.toBuffer();
			const expected = claim();
			expected.declaration = {
				mimeType: 'image/png',
				byteSize: bytes.length,
				sha256: createHash('sha256').update(bytes).digest('hex')
			};
			const token = `header.${Buffer.from(JSON.stringify({ url: `libri-assets/${path}`, exp: NOW / 1000 + 30 })).toString('base64url')}.signature`;
			const url = `${origin}/storage/v1/object/sign/libri-assets/${path}?token=${token}`;
			let authorizationCalls = 0;
			const provider = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
				expect(new Headers(init?.headers).get('Authorization')).toBe(
					'Bearer server-only-key'
				);
				if (String(input).includes('/rpc/')) {
					authorizationCalls++;
					if (scenario === 'revoked' && authorizationCalls === 2)
						return Response.json(null);
					return Response.json({
						library_id: libraryId,
						upload_id: uploadId,
						lease_token: expected.leaseToken,
						attempt: 1,
						book_id: expected.bookId,
						bucket_id: 'libri-assets',
						object_path: path,
						mime_type: 'image/png',
						byte_size: bytes.length,
						sha256: expected.declaration.sha256,
						expires_at: expected.leaseExpiresAt
					});
				}
				return Response.json({
					signedURL: `/object/sign/libri-assets/${path}?token=${token}`
				});
			});
			const broker = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
				signLibriUploadDownload(new Request(input, init), {
					enabled: true,
					url: origin,
					serviceKey: 'server-only-key',
					brokerToken: secret,
					fetchImpl: provider
				})
			);
			const authorize = createLibriUploadDownloadAuthorizer({
				endpointUrl: endpoint,
				storageOrigin: origin,
				bearerToken: secret,
				fetchImpl: broker
			});
			const storage = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
				expect(input).toBe(url);
				expect(new Headers(init?.headers).has('Authorization')).toBe(false);
				expect(new Headers(init?.headers).has('apikey')).toBe(false);
				const actual = scenario === 'modified_bytes' ? Buffer.alloc(bytes.length) : bytes;
				return new Response(new Uint8Array(actual), {
					headers: { 'Content-Type': 'image/png' }
				});
			});
			const download = createLibriUploadImageDownloader({
				storageOrigin: origin,
				authorize,
				verifier: createLibriUploadImageVerifier(),
				fetchImpl: storage,
				now: () => NOW
			});
			const result = download.downloadAndVerify({
				claim: expected,
				signal: new AbortController().signal
			});
			if (scenario === 'valid') expect((await result).bytes).toEqual(bytes);
			else
				await expect(result).rejects.toMatchObject({
					code:
						scenario === 'revoked'
							? 'download_authorization_unavailable'
							: 'sha256_mismatch'
				});
			expect(authorizationCalls).toBe(2);
			expect(broker).toHaveBeenCalledOnce();
			expect(storage).toHaveBeenCalledTimes(scenario === 'revoked' ? 0 : 1);
		}
	);
});
