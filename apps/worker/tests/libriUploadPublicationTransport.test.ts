import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLibriUploadPublicationTransport } from '../src/workers/libri/uploadPublicationTransport';
import type { LibriUploadClaim } from '../src/workers/libri/uploadProcessing';
import type { LibriVerifiedUploadImage } from '../src/workers/libri/uploadImageVerifier';
const NOW = Date.parse('2026-09-07T15:00:00Z');
const origin = 'https://iwifjtlebphefldmwbkh.supabase.co',
	endpointUrl = 'https://build-os.com/api/internal/libri/uploads/publish';
const publicationId = '99999999-9999-4999-8999-999999999991',
	libraryId = 'f09948c4-e4e0-581c-8689-7258bea2f501';
const token = 'machine-token-fixture-abcdefghijklmnopqrstuvwxyz';
const jwt = (value: unknown) =>
	Buffer.from('{}').toString('base64url') +
	'.' +
	Buffer.from(JSON.stringify(value)).toString('base64url') +
	'.signature';
function fixture() {
	const bytes = Buffer.from('native-verified-owned-image');
	const verified: LibriVerifiedUploadImage = {
		bytes,
		mimeType: 'image/png',
		byteSize: bytes.length,
		sha256: createHash('sha256').update(bytes).digest('hex'),
		width: 3,
		height: 3,
		channels: 3
	};
	const claim: LibriUploadClaim = {
		libraryId,
		uploadId: 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
		bookId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		leaseToken: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
		attempt: 1,
		leaseExpiresAt: new Date(NOW + 90000).toISOString(),
		objectPath: 'unused-by-publication',
		declaration: {
			mimeType: verified.mimeType,
			byteSize: bytes.length,
			sha256: verified.sha256
		}
	};
	const { bytes: _bytes, ...metadata } = verified;
	const path = `${libraryId}/images/${publicationId}/original.png`;
	const preparation = {
		publication_id: publicationId,
		library_id: libraryId,
		upload_id: claim.uploadId,
		book_id: claim.bookId,
		lease_token: claim.leaseToken,
		attempt: 1,
		bucket_id: 'libri-assets',
		object_path: path,
		verified_metadata: metadata,
		status: 'prepared'
	};
	const capabilityClaims = { url: 'libri-assets/' + path, upsert: false, exp: NOW / 1000 + 7200 };
	const capability = () => ({
		preparation,
		uploadUrl: `${origin}/storage/v1/object/upload/sign/libri-assets/${path}?token=${jwt(capabilityClaims)}`,
		capabilityExpiresAt: new Date(NOW + 7200000).toISOString(),
		leaseExpiresAt: claim.leaseExpiresAt
	});
	const options: {
		capability?: unknown;
		putStatus?: number;
		putResult?: unknown;
		putPending?: boolean;
		prepareResponse?: () => Response;
		finalResult?: unknown;
	} = {};
	const completed = {
		publication_id: publicationId,
		image_id: publicationId,
		source_id: publicationId,
		status: 'published',
		already_published: false
	};
	const calls: string[] = [];
	const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input),
			headers = new Headers(init?.headers);
		expect(init?.redirect).toBe('error');
		expect(init?.credentials).toBe('omit');
		if (url === endpointUrl) {
			expect(headers.get('authorization')).toBe('Bearer ' + token);
			expect(headers.has('apikey')).toBe(false);
			const body = JSON.parse(String(init?.body));
			calls.push(body.action);
			expect(body).not.toHaveProperty('storageObjectId');
			expect(body).not.toHaveProperty('bytes');
			expect(body.verified).toEqual(metadata);
			if (body.action === 'prepare')
				return (
					options.prepareResponse?.() ?? Response.json(options.capability ?? capability())
				);
			expect(body.action).toBe('finalize');
			expect(body.publicationId).toBe(publicationId);
			return Response.json(options.finalResult ?? completed);
		}
		calls.push('put');
		expect(url).toBe(capability().uploadUrl);
		expect(init?.method).toBe('PUT');
		expect(headers.has('authorization')).toBe(false);
		expect(headers.has('apikey')).toBe(false);
		expect(headers.get('x-upsert')).toBe('false');
		expect(headers.get('cache-control')).toBe('max-age=0');
		expect(headers.get('content-type')).toBe('image/png');
		expect(Buffer.from(init!.body as Uint8Array)).toEqual(bytes);
		if (options.putPending) return new Promise<Response>(() => {});
		return Response.json(options.putResult ?? { Key: 'libri-assets/' + path }, {
			status: options.putStatus ?? 200
		});
	});
	const transport = createLibriUploadPublicationTransport({
		endpointUrl,
		bearerToken: token,
		fetchImpl
	});
	const controller = new AbortController();
	return {
		transport,
		input: { claim, verified, signal: controller.signal },
		controller,
		options,
		capability,
		capabilityClaims,
		calls,
		fetchImpl,
		path,
		completed
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
describe('Libri direct Storage publication transport', () => {
	it('uploads exact bytes without forwarding the machine secret and lets the server own Storage identity', async () => {
		const f = fixture();
		expect(await f.transport.publish(f.input)).toEqual({
			publicationId,
			imageId: publicationId,
			sourceId: publicationId,
			alreadyPublished: false
		});
		expect(f.calls).toEqual(['prepare', 'put', 'finalize']);
	});
	it.each([
		'origin',
		'path',
		'upsert',
		'scope',
		'expiry',
		'lease',
		'preparation',
		'extra_fields',
		'wrong_metadata'
	])('refuses retargeted capability %s before Storage I/O', async (mode) => {
		const f = fixture();
		if (mode === 'upsert') f.capabilityClaims.upsert = true;
		if (mode === 'scope') Object.assign(f.capabilityClaims, { scope: 'download' });
		if (mode === 'expiry') f.capabilityClaims.exp = NOW / 1000 - 1;
		const cap = structuredClone(f.capability());
		if (mode === 'origin')
			cap.uploadUrl = cap.uploadUrl.replace(origin, 'https://attacker.example');
		if (mode === 'path') cap.uploadUrl = cap.uploadUrl.replace('/images/', '/uploads/');
		if (mode === 'lease') cap.leaseExpiresAt = new Date(NOW + 80000).toISOString();
		if (mode === 'preparation') cap.preparation.book_id = 'wrong';
		if (mode === 'extra_fields') Object.assign(cap, { serviceKey: 'must-not-accept' });
		if (mode === 'wrong_metadata') cap.preparation.verified_metadata.width = 30;
		f.options.capability = cap;
		await expect(f.transport.publish(f.input)).rejects.toMatchObject({
			mayHaveWrittenObject: false
		});
		expect(f.calls).toEqual(['prepare']);
	});
	it.each([400, 409, 429, 500])(
		'does not finalize or retry a failed/conflicting PUT: %s',
		async (status) => {
			const f = fixture();
			f.options.putStatus = status;
			await expect(f.transport.publish(f.input)).rejects.toMatchObject({
				code: 'publication_outcome_unknown',
				mayHaveWrittenObject: true
			});
			expect(f.calls).toEqual(['prepare', 'put']);
		}
	);
	it.each([{}, { Key: 'other/object' }, { storageObjectId: publicationId }])(
		'refuses an unverified upload receipt: %j',
		async (receipt) => {
			const f = fixture();
			f.options.putResult = receipt;
			await expect(f.transport.publish(f.input)).rejects.toMatchObject({
				mayHaveWrittenObject: true
			});
			expect(f.calls).toEqual(['prepare', 'put']);
		}
	);
	it.each(['redirect', 'oversized', 'content_type', 'invalid_json'])(
		'rejects unsafe broker response: %s',
		async (mode) => {
			const f = fixture();
			f.options.prepareResponse = () =>
				mode === 'redirect'
					? new Response(null, {
							status: 302,
							headers: { location: 'https://attacker.example' }
						})
					: mode === 'oversized'
						? new Response('x'.repeat(16385), {
								headers: { 'content-type': 'application/json' }
							})
						: mode === 'content_type'
							? new Response('{}', { headers: { 'content-type': 'text/html' } })
							: new Response('invalid', {
									headers: { 'content-type': 'application/json' }
								});
			await expect(f.transport.publish(f.input)).rejects.toMatchObject({
				mayHaveWrittenObject: false
			});
			expect(f.calls).toEqual(['prepare']);
		}
	);
	it('retains capacity after a timed-out PUT and never attempts completion', async () => {
		const f = fixture();
		f.options.putPending = true;
		const result = f.transport.publish(f.input);
		const assertion = expect(result).rejects.toMatchObject({
			code: 'publication_timeout',
			mayHaveWrittenObject: true
		});
		await vi.advanceTimersByTimeAsync(30001);
		await assertion;
		expect(f.transport.isBusy()).toBe(true);
		expect(f.calls).toEqual(['prepare', 'put']);
	});
	it('cancels without beginning a new upload', async () => {
		const f = fixture();
		f.controller.abort();
		await expect(f.transport.publish(f.input)).rejects.toMatchObject({
			mayHaveWrittenObject: false
		});
		expect(f.calls).toEqual([]);
	});
	it('does not accept a completion for another image', async () => {
		const f = fixture();
		f.options.finalResult = { ...f.completed, image_id: f.input.claim.bookId };
		await expect(f.transport.publish(f.input)).rejects.toMatchObject({
			code: 'publication_outcome_unknown',
			mayHaveWrittenObject: true
		});
	});
});
