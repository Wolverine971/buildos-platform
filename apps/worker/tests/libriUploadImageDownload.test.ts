import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createLibriUploadImageDownloader,
	type LibriUploadDownloadAuthorizer,
	type LibriUploadDownloadGrant
} from '../src/workers/libri/uploadImageDownload';
import { createLibriUploadImageVerifier } from '../src/workers/libri/uploadImageVerifier';
import type { LibriUploadClaim } from '../src/workers/libri/uploadProcessing';

const NOW = Date.parse('2026-09-07T02:00:00Z');
const ORIGIN = 'https://storage.example';
const libraryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const uploadId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const path = `${libraryId}/uploads/${uploadId}/original.png`;
const signedUrl = `${ORIGIN}/storage/v1/object/sign/libri-assets/${path}?token=private-signed-token`;
const grant = (): LibriUploadDownloadGrant => ({
	signedUrl,
	expiresAt: new Date(NOW + 40_000).toISOString()
});
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function claim(bytes: Buffer): LibriUploadClaim {
	return {
		libraryId,
		uploadId,
		objectPath: path,
		bookId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		leaseToken: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
		attempt: 1,
		leaseExpiresAt: new Date(NOW + 90_000).toISOString(),
		declaration: { mimeType: 'image/png', byteSize: bytes.length, sha256: hash(bytes) }
	};
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { resolve, promise };
}
async function picture() {
	return sharp({ create: { width: 4, height: 3, channels: 3, background: 'red' } })
		.png()
		.toBuffer();
}
function harness(
	bytes: Buffer,
	options: {
		deadlineMs?: number;
		verifier?: ReturnType<typeof createLibriUploadImageVerifier>;
		now?: () => number;
	} = {}
) {
	const authorize = vi.fn(async (_input: Parameters<LibriUploadDownloadAuthorizer>[0]) =>
		grant()
	);
	const fetchImpl = vi.fn(
		async (_url: string | URL | Request, _init?: RequestInit) =>
			new Response(new Uint8Array(bytes), {
				headers: { 'Content-Type': 'image/png', 'Content-Length': String(bytes.length) }
			})
	);
	const verifier = options.verifier ?? createLibriUploadImageVerifier();
	const port = createLibriUploadImageDownloader({
		storageOrigin: ORIGIN,
		authorize,
		fetchImpl,
		verifier,
		now: options.now ?? (() => NOW),
		deadlineMs: options.deadlineMs
	});
	const controller = new AbortController();
	return {
		port,
		authorize,
		fetchImpl,
		verifier,
		controller,
		input: { claim: claim(bytes), signal: controller.signal }
	};
}
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('Libri private staging download and verification', () => {
	it('authorizes the complete frozen lease before fetching and fully decoding owned bytes', async () => {
		const bytes = await picture();
		const h = harness(bytes);
		const result = await h.port.downloadAndVerify(h.input);
		expect(result).toMatchObject({
			byteSize: bytes.length,
			sha256: hash(bytes),
			width: 4,
			height: 3
		});
		expect(result.bytes).toEqual(bytes);
		expect(h.authorize).toHaveBeenCalledOnce();
		const call = h.authorize.mock.calls[0];
		expect(call[0].claim).toEqual(h.input.claim);
		expect(Object.isFrozen(call[0].claim)).toBe(true);
		expect(Object.isFrozen(call[0].claim.declaration)).toBe(true);
		expect(h.fetchImpl).toHaveBeenCalledExactlyOnceWith(signedUrl, {
			method: 'GET',
			redirect: 'manual',
			credentials: 'omit',
			cache: 'no-store',
			headers: { Accept: 'image/png', 'Accept-Encoding': 'identity' },
			signal: call[0].signal
		});
		bytes.fill(0);
		expect(hash(result.bytes)).toBe(result.sha256);
		expect(h.port.isBusy()).toBe(false);
	});
	it('ignores caller mutation while authorization is pending', async () => {
		const bytes = await picture();
		const h = harness(bytes);
		const authorization = deferred<LibriUploadDownloadGrant>();
		h.authorize.mockReturnValueOnce(authorization.promise);
		const pending = h.port.downloadAndVerify(h.input);
		h.input.claim.objectPath = 'private/other.png';
		h.input.claim.declaration.sha256 = '0'.repeat(64);
		h.input.claim.attempt = 3;
		authorization.resolve(grant());
		expect((await pending).sha256).toBe(hash(bytes));
		expect(h.fetchImpl.mock.calls[0][0]).toBe(signedUrl);
	});
	it.each([
		{ libraryId: '../public' },
		{ uploadId: 'not-a-uuid' },
		{ leaseToken: '' },
		{ bookId: '' },
		{ objectPath: `${libraryId}/uploads/${uploadId}/original.jpeg` },
		{ attempt: 0 },
		{ attempt: 4 },
		{ attempt: 1.5 },
		{ leaseExpiresAt: 'invalid' },
		{ leaseExpiresAt: new Date(NOW + 2_000).toISOString() },
		{ leaseExpiresAt: new Date(NOW + 93_000).toISOString() },
		{ declaration: { mimeType: 'image/png', byteSize: 26_214_401, sha256: 'a'.repeat(64) } },
		{ declaration: { mimeType: 'image/svg+xml', byteSize: 100, sha256: 'a'.repeat(64) } },
		{ declaration: { mimeType: 'image/png', byteSize: 100, sha256: 'A'.repeat(64) } }
	])(
		'rejects invalid or expired claims before any authority/network call: %j',
		async (override) => {
			const h = harness(Buffer.from('test'));
			Object.assign(h.input.claim, override);
			await expect(h.port.downloadAndVerify(h.input)).rejects.toThrow(
				'Libri upload download failed'
			);
			expect(h.authorize).not.toHaveBeenCalled();
			expect(h.fetchImpl).not.toHaveBeenCalled();
		}
	);
	it.each([
		signedUrl.replace(ORIGIN, 'https://other.example'),
		signedUrl.replace('https:', 'http:'),
		signedUrl.replace('storage.example', 'storage.example.attacker.invalid'),
		signedUrl.replace('storage.example', 'user:secret@storage.example'),
		signedUrl.replace('libri-assets', 'buildos-private'),
		signedUrl.replace(uploadId, 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2'),
		signedUrl.replace('/sign/', '/public/'),
		signedUrl.replace('/original.png', '/other/../original.png'),
		signedUrl.replace('/original.png', '/%6friginal.png'),
		signedUrl + '#secret',
		signedUrl + '&token=second',
		signedUrl + '&download=true',
		signedUrl.replace('token=private-signed-token', 'token='),
		signedUrl.replace('token=private-signed-token', 'apikey=secret')
	])('rejects an unapproved signed URL without fetching it', async (url) => {
		const h = harness(Buffer.from('test'));
		h.authorize.mockResolvedValueOnce({ ...grant(), signedUrl: url });
		await expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'invalid_download_grant'
		});
		expect(h.fetchImpl).not.toHaveBeenCalled();
	});
	it.each([NaN, 0, 2_000, 60_001, 90_001])(
		'rejects invalid grant lifetime %s',
		async (milliseconds) => {
			const h = harness(Buffer.from('test'));
			h.authorize.mockResolvedValueOnce({
				...grant(),
				expiresAt: Number.isNaN(milliseconds)
					? 'invalid'
					: new Date(NOW + milliseconds).toISOString()
			});
			await expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
				code: 'invalid_download_grant'
			});
			expect(h.fetchImpl).not.toHaveBeenCalled();
		}
	);
	it('rejects a grant that outlives the lease even inside its sixty-second cap', async () => {
		const h = harness(Buffer.from('test'));
		h.input.claim.leaseExpiresAt = new Date(NOW + 30_000).toISOString();
		await expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'invalid_download_grant'
		});
		expect(h.fetchImpl).not.toHaveBeenCalled();
	});
	it.each([301, 302, 307, 308, 206, 403, 404, 429, 500])(
		'does not follow redirects or accept HTTP %s',
		async (status) => {
			const h = harness(Buffer.from('test'));
			const cancel = vi.fn(async () => {});
			h.fetchImpl.mockResolvedValueOnce(
				new Response(new ReadableStream({ cancel }), {
					status,
					headers: { Location: 'https://attacker.invalid' }
				})
			);
			await expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
				code: 'download_response_unavailable'
			});
			expect(h.fetchImpl).toHaveBeenCalledOnce();
			expect(cancel).toHaveBeenCalledOnce();
		}
	);
	it.each([
		{ 'Content-Type': 'image/svg+xml' },
		{ 'Content-Type': '' },
		{ 'Content-Encoding': 'gzip' },
		{ 'Content-Range': 'bytes 0-3/4' },
		{ 'Content-Length': '26214401' },
		{ 'Content-Length': '0' },
		{ 'Content-Length': '4.0' },
		{ 'Content-Length': '004' },
		{ 'Content-Length': '5' }
	])('rejects unsafe or inconsistent headers: %j', async (overrides) => {
		const h = harness(Buffer.from('test'));
		const headers = new Headers({ 'Content-Type': 'image/png', 'Content-Length': '4' });
		for (const [key, value] of Object.entries(overrides)) headers.set(key, value);
		h.fetchImpl.mockResolvedValueOnce(new Response('test', { headers }));
		await expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'invalid_download_response'
		});
	});
	it('permits absent content length but still checks actual bytes and digest', async () => {
		const bytes = await picture();
		const h = harness(bytes);
		h.fetchImpl.mockResolvedValueOnce(
			new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/png' } })
		);
		expect((await h.port.downloadAndVerify(h.input)).bytes).toEqual(bytes);
		h.input.claim.declaration.sha256 = '0'.repeat(64);
		await expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'sha256_mismatch',
			retryable: false
		});
	});
	it('rejects corrupt pixels even with a correct declaration and HTTP headers', async () => {
		const bytes = Buffer.from('untrusted invalid pixels');
		const h = harness(bytes);
		await expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'invalid_image_container',
			retryable: false
		});
	});
	it('rejects actual streaming overflow even with a matching declared HTTP length', async () => {
		const h = harness(Buffer.from('test'));
		h.fetchImpl.mockResolvedValueOnce(
			new Response('test plus extra', {
				headers: { 'Content-Type': 'image/png', 'Content-Length': '4' }
			})
		);
		await expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'byte_size_mismatch'
		});
	});
	it('rejects an already aborted caller without authorizing or fetching', async () => {
		const h = harness(Buffer.from('test'));
		h.controller.abort();
		await expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'download_aborted'
		});
		expect(h.authorize).not.toHaveBeenCalled();
	});
	it('rejects an invalid abort signal before authorization', async () => {
		const h = harness(Buffer.from('test'));
		Object.assign(h.input, { signal: null });
		await expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'invalid_download_signal'
		});
		expect(h.authorize).not.toHaveBeenCalled();
	});
	it('does not start a fetch when elapsed time exceeded the deadline before timers ran', async () => {
		let elapsed = 0;
		vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
		const h = harness(Buffer.from('test'), { deadlineMs: 250 });
		h.authorize.mockImplementationOnce(async () => {
			elapsed = 251;
			return grant();
		});
		await expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'download_timeout'
		});
		expect(h.fetchImpl).not.toHaveBeenCalled();
		expect(h.port.isBusy()).toBe(false);
	});
	it('rejects a decoded result that finished after the monotonic deadline but before timer dispatch', async () => {
		const bytes = await picture();
		let elapsed = 0;
		vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
		const verifier = createLibriUploadImageVerifier({
			decoder: async () => {
				elapsed = 251;
				return { mimeType: 'image/png', width: 4, height: 3, channels: 3 };
			}
		});
		const h = harness(bytes, { verifier, deadlineMs: 250 });
		await expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'download_timeout'
		});
	});
	it('rejects successful decoding after a wall-clock jump beyond the capability window', async () => {
		const bytes = await picture();
		let now = NOW;
		const verifier = createLibriUploadImageVerifier({
			decoder: async () => {
				now = NOW + 40_000;
				return { mimeType: 'image/png', width: 4, height: 3, channels: 3 };
			}
		});
		const h = harness(bytes, { verifier, now: () => now });
		await expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'download_lease_expired'
		});
	});
	it('bounds stalled authorization and holds its slot until the ignored cancellation settles', async () => {
		vi.useFakeTimers();
		const h = harness(Buffer.from('test'), { deadlineMs: 250 });
		const blocked = deferred<LibriUploadDownloadGrant>();
		h.authorize.mockReturnValueOnce(blocked.promise);
		const result = expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'download_timeout'
		});
		await vi.advanceTimersByTimeAsync(250);
		await result;
		expect(h.port.isBusy()).toBe(true);
		await expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'download_busy'
		});
		blocked.resolve(grant());
		await vi.advanceTimersByTimeAsync(0);
		expect(h.port.isBusy()).toBe(false);
		expect(h.fetchImpl).not.toHaveBeenCalled();
	});
	it('bounds an ignored fetch abort and cancels its late response without verifying it', async () => {
		vi.useFakeTimers();
		const h = harness(Buffer.from('test'), { deadlineMs: 250 });
		const blocked = deferred<Response>();
		const cancelled = vi.fn(() => new Promise<void>(() => {}));
		h.fetchImpl.mockReturnValueOnce(blocked.promise);
		const result = expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'download_timeout'
		});
		await vi.advanceTimersByTimeAsync(250);
		await result;
		expect(h.port.isBusy()).toBe(true);
		blocked.resolve(new Response(new ReadableStream({ cancel: cancelled })));
		await vi.advanceTimersByTimeAsync(0);
		expect(cancelled).toHaveBeenCalledOnce();
		expect(h.port.isBusy()).toBe(false);
	});
	it('aborts a stalled response body without awaiting uncooperative cancellation', async () => {
		vi.useFakeTimers();
		const h = harness(Buffer.from('test'), { deadlineMs: 250 });
		const cancel = vi.fn(() => new Promise<void>(() => {}));
		h.fetchImpl.mockResolvedValueOnce(
			new Response(new ReadableStream({ cancel }), {
				headers: { 'Content-Type': 'image/png' }
			})
		);
		const result = expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'download_timeout'
		});
		await vi.advanceTimersByTimeAsync(250);
		await result;
		expect(cancel).toHaveBeenCalledOnce();
	});
	it('bounds the total attempt by a near lease deadline', async () => {
		vi.useFakeTimers();
		const h = harness(Buffer.from('test'));
		h.input.claim.leaseExpiresAt = new Date(NOW + 2_100).toISOString();
		h.authorize.mockReturnValueOnce(new Promise(() => {}));
		const result = expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'download_timeout'
		});
		await vi.advanceTimersByTimeAsync(100);
		await result;
	});
	it('tightens the same overall deadline to the grant expiry', async () => {
		vi.useFakeTimers();
		const h = harness(Buffer.from('test'));
		h.authorize.mockResolvedValueOnce({
			...grant(),
			expiresAt: new Date(NOW + 2_100).toISOString()
		});
		h.fetchImpl.mockReturnValueOnce(new Promise(() => {}));
		const result = expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'download_timeout'
		});
		await vi.advanceTimersByTimeAsync(100);
		await result;
	});
	it('retains decoder capacity after cancellation, and never accepts its late result', async () => {
		const bytes = await picture();
		vi.useFakeTimers();
		const decoded = deferred<{
			mimeType: 'image/png';
			width: number;
			height: number;
			channels: number;
		}>();
		const decoder = vi.fn(() => decoded.promise);
		const h = harness(bytes, {
			verifier: createLibriUploadImageVerifier({ decoder }),
			deadlineMs: 250
		});
		const result = expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'download_timeout'
		});
		await vi.advanceTimersByTimeAsync(250);
		await result;
		expect(decoder).toHaveBeenCalledOnce();
		expect(h.port.isBusy()).toBe(true);
		await expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'download_busy'
		});
		decoded.resolve({ mimeType: 'image/png', width: 4, height: 3, channels: 3 });
		await vi.advanceTimersByTimeAsync(0);
		expect(h.port.isBusy()).toBe(false);
		expect(h.authorize).toHaveBeenCalledOnce();
	});
	it('handles caller cancellation during authorization without using the late grant', async () => {
		const h = harness(Buffer.from('test'));
		const blocked = deferred<LibriUploadDownloadGrant>();
		h.authorize.mockReturnValueOnce(blocked.promise);
		const result = expect(h.port.downloadAndVerify(h.input)).rejects.toMatchObject({
			code: 'download_aborted'
		});
		h.controller.abort();
		await result;
		blocked.resolve(grant());
		await blocked.promise;
		expect(h.fetchImpl).not.toHaveBeenCalled();
	});
	it.each(['authorization', 'fetch'])(
		'redacts %s failures, without automatic retry',
		async (step) => {
			const h = harness(Buffer.from('test'));
			const error = new Error('https://secret.example/?token=provider-secret');
			if (step === 'authorization') h.authorize.mockRejectedValueOnce(error);
			else h.fetchImpl.mockRejectedValueOnce(error);
			await expect(h.port.downloadAndVerify(h.input)).rejects.toThrow(
				'Libri upload download failed: download_unavailable'
			);
			expect(h.authorize).toHaveBeenCalledOnce();
			expect(h.fetchImpl).toHaveBeenCalledTimes(step === 'authorization' ? 0 : 1);
		}
	);
	it.each([
		'http://storage.example',
		'https://secret@storage.example',
		'https://storage.example/path',
		'https://storage.example?apikey=secret'
	])('rejects unsafe trusted Storage origin configuration', (storageOrigin) => {
		expect(() =>
			createLibriUploadImageDownloader({
				storageOrigin,
				authorize: vi.fn(),
				verifier: createLibriUploadImageVerifier()
			})
		).toThrow('canonical credential-free HTTPS origin');
	});
});
