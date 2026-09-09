// apps/web/src/lib/server/libri/upload-cleanup.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLibriUploadCleanupExecutor } from './upload-cleanup';

const NOW = Date.parse('2026-09-08T19:30:00Z');
const origin = 'https://iwifjtlebphefldmwbkh.supabase.co';
const libraryId = 'f09948c4-e4e0-581c-8689-7258bea2f501';
const targetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const uploadId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const publicationId = '99999999-9999-4999-8999-999999999991';
const leaseToken = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
const storageId = 'ffffffff-ffff-4fff-8fff-fffffffffff1';
const missing = () => Response.json({ code: 'NoSuchKey', statusCode: '404' }, { status: 400 });
function fixture(kind: 'staging' | 'unpublished' = 'staging') {
	const controller = new AbortController();
	const input = { libraryId, targetId, leaseToken, signal: controller.signal };
	const path = `${libraryId}/${kind === 'staging' ? 'uploads' : 'images'}/${kind === 'staging' ? uploadId : publicationId}/original.png`;
	const owned = {
		target_id: targetId,
		library_id: libraryId,
		upload_id: uploadId,
		publication_id: kind === 'staging' ? null : publicationId,
		kind,
		bucket_id: 'libri-assets',
		object_path: path,
		lease_token: leaseToken,
		generation: 1,
		lease_expires_at: new Date(NOW + 60000).toISOString()
	};
	const info = { id: storageId, name: path, bucket_id: 'libri-assets', version: 'one' };
	type Handler = (body: Record<string, unknown> | undefined) => Response | Promise<Response>;
	const overrides: Record<string, Handler> = {};
	const calls: { path: string; method: string; body: Record<string, unknown> | undefined }[] = [];
	let deleted = false;
	const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(String(input));
		expect(url.origin).toBe(origin);
		expect(init?.redirect).toBe('error');
		expect(init?.cache).toBe('no-store');
		expect(new Headers(init?.headers).get('authorization')).toBe('Bearer fixture-service');
		expect(new Headers(init?.headers).get('apikey')).toBe('fixture-service');
		expect(init?.signal).toBeInstanceOf(AbortSignal);
		const method = init?.method ?? 'GET',
			body = init?.body ? JSON.parse(String(init.body)) : undefined;
		calls.push({ path: url.pathname, method, body });
		const op = url.pathname.startsWith('/rest/')
			? url.pathname.split('/').at(-1)!
			: url.pathname.startsWith('/storage/v1/bucket/')
				? 'bucket'
				: method === 'DELETE'
					? 'delete'
					: 'info';
		if (overrides[op]) return overrides[op](body);
		if (op === 'claim_image_upload_cleanup' || op === 'authorize_image_upload_cleanup')
			return Response.json(owned);
		if (op === 'finish_image_upload_cleanup') return Response.json(true);
		if (op === 'bucket') return Response.json({ id: 'libri-assets', public: false });
		if (op === 'info') return deleted ? missing() : Response.json(info);
		if (op === 'delete') {
			deleted = true;
			return Response.json([info]);
		}
		throw new Error('Unexpected provider call');
	});
	const config = { enabled: true, url: origin, serviceKey: 'fixture-service', fetchImpl };
	const executor = createLibriUploadCleanupExecutor(config);
	const run = () => executor.run(input);
	const deletes = () => calls.filter((c) => c.method === 'DELETE');
	const finishes = () =>
		calls
			.filter((c) => c.path.endsWith('/finish_image_upload_cleanup'))
			.map((c) => c.body?.p_outcome);
	return {
		controller,
		input,
		path,
		owned,
		info,
		overrides,
		calls,
		config,
		executor,
		run,
		deletes,
		finishes,
		fetchImpl
	};
}
describe('private Libri cleanup executor', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});
	it.each(['staging', 'unpublished'] as const)(
		'deletes only the exact retired %s object, with a separate absence proof',
		async (kind) => {
			const f = fixture(kind);
			expect(await f.run()).toEqual({
				status: 'absent',
				targetId,
				mayHaveDeletedObject: true
			});
			expect(f.deletes()).toEqual([
				{
					path: '/storage/v1/object/libri-assets',
					method: 'DELETE',
					body: { prefixes: [f.path] }
				}
			]);
			expect(f.finishes()).toEqual(['absent']);
			expect(
				f.calls.map((c) =>
					c.path.includes('/rpc/')
						? c.path.split('/').at(-1)
						: c.method === 'DELETE'
							? 'delete'
							: c.path.includes('/bucket/')
								? 'bucket'
								: 'info'
				)
			).toEqual([
				'claim_image_upload_cleanup',
				'bucket',
				'authorize_image_upload_cleanup',
				'info',
				'authorize_image_upload_cleanup',
				'delete',
				'info',
				'authorize_image_upload_cleanup',
				'finish_image_upload_cleanup'
			]);
			expect(f.executor.isBusy()).toBe(false);
		}
	);
	it.each([undefined, false])('is off unless explicitly enabled (%s)', async (enabled) => {
		const f = fixture();
		await expect(
			createLibriUploadCleanupExecutor({ ...f.config, enabled }).run(f.input)
		).rejects.toThrow('unavailable');
		expect(f.fetchImpl).not.toHaveBeenCalled();
	});
	it.each(['url', 'library', 'target', 'token', 'aborted', 'key'])(
		'rejects invalid initial authority: %s',
		async (mode) => {
			const f = fixture();
			if (mode === 'url') f.config.url = 'https://example.org';
			if (mode === 'library') f.input.libraryId = targetId;
			if (mode === 'target') f.input.targetId = '../../other';
			if (mode === 'token') f.input.leaseToken = 'not-a-token';
			if (mode === 'aborted') f.controller.abort();
			if (mode === 'key') f.config.serviceKey = '';
			await expect(createLibriUploadCleanupExecutor(f.config).run(f.input)).rejects.toThrow(
				'unavailable'
			);
			expect(f.fetchImpl).not.toHaveBeenCalled();
		}
	);
	it('captures trusted configuration before a caller mutates it', async () => {
		const f = fixture();
		f.config.serviceKey = 'changed';
		f.config.url = 'https://example.org';
		expect((await f.run()).status).toBe('absent');
	});
	it('does not contact Storage when the database declines the claim', async () => {
		const f = fixture();
		f.overrides.claim_image_upload_cleanup = () => Response.json(null);
		expect(await f.run()).toEqual({
			status: 'unclaimed',
			targetId,
			mayHaveDeletedObject: false
		});
		expect(f.calls).toHaveLength(1);
	});
	it.each([
		'path',
		'bucket',
		'library',
		'token',
		'extra',
		'generation',
		'expired',
		'long_lease',
		'publication'
	])('rejects malformed claims before Storage: %s', async (mode) => {
		const f = fixture();
		const value: Record<string, unknown> = { ...f.owned };
		if (mode === 'path') value.object_path = f.path.replace('/uploads/', '/images/');
		if (mode === 'bucket') value.bucket_id = 'buildos';
		if (mode === 'library') value.library_id = targetId;
		if (mode === 'token') value.lease_token = targetId;
		if (mode === 'extra') value.secret = 'no';
		if (mode === 'generation') value.generation = 0;
		if (mode === 'expired') value.lease_expires_at = new Date(NOW + 1500).toISOString();
		if (mode === 'long_lease') value.lease_expires_at = new Date(NOW + 63000).toISOString();
		if (mode === 'publication') value.publication_id = publicationId;
		f.overrides.claim_image_upload_cleanup = () => Response.json(value);
		await expect(f.run()).rejects.toThrow('unavailable');
		expect(f.calls).toHaveLength(1);
	});
	it.each([400, 404])('recognizes only strong missing-object proof, HTTP %s', async (status) => {
		const f = fixture();
		f.overrides.info = () =>
			Response.json(
				{ code: 'NoSuchKey', ...(status === 400 ? { statusCode: '404' } : {}) },
				{ status }
			);
		expect((await f.run()).status).toBe('absent');
		expect(f.deletes()).toHaveLength(0);
		expect(f.finishes()).toEqual(['absent']);
	});
	it.each(['public', 'missing', 'outage'])(
		'does not inspect objects without private bucket access: %s',
		async (mode) => {
			const f = fixture();
			f.overrides.bucket = () =>
				mode === 'public'
					? Response.json({ id: 'libri-assets', public: true })
					: Response.json(
							{ code: 'NoSuchBucket' },
							{ status: mode === 'missing' ? 404 : 503 }
						);
			expect((await f.run()).status).toBe('unavailable');
			expect(f.deletes()).toHaveLength(0);
			expect(f.calls.some((c) => c.path.includes('/object/'))).toBe(false);
		}
	);
	it.each([
		'generic_404',
		'generic_400',
		'wrong_status',
		'outage',
		'wrong_object',
		'wrong_bucket',
		'empty_version'
	])('never treats ambiguous metadata as absence: %s', async (mode) => {
		const f = fixture();
		f.overrides.info = () => {
			if (mode.startsWith('generic'))
				return Response.json(
					{ error: 'not_found' },
					{ status: mode === 'generic_404' ? 404 : 400 }
				);
			if (mode === 'wrong_status')
				return Response.json({ code: 'NoSuchKey', statusCode: 403 }, { status: 404 });
			if (mode === 'outage') return Response.json({ code: 'InternalError' }, { status: 503 });
			return Response.json({
				...f.info,
				...(mode === 'wrong_object'
					? { name: 'other' }
					: mode === 'wrong_bucket'
						? { bucket_id: 'other' }
						: { version: '' })
			});
		};
		expect((await f.run()).status).toBe('unavailable');
		expect(f.deletes()).toHaveLength(0);
		expect(f.finishes()).toEqual(['unavailable']);
	});
	it.each(['empty', 'wrong_id', 'wrong_path', 'outage', 'still_present'])(
		'does not trust a failed/inexact delete or surviving object: %s',
		async (mode) => {
			const f = fixture();
			f.overrides.delete = () =>
				mode === 'outage'
					? Response.json({ message: 'secret' }, { status: 500 })
					: Response.json(
							mode === 'empty'
								? []
								: [
										{
											...f.info,
											...(mode === 'wrong_id'
												? { id: targetId }
												: mode === 'wrong_path'
													? { name: 'other' }
													: {})
										}
									]
						);
			expect(await f.run()).toEqual({
				status: 'unavailable',
				targetId,
				mayHaveDeletedObject: true
			});
			expect(f.deletes()).toHaveLength(1);
			expect(f.finishes()).toEqual(['unavailable']);
		}
	);
	it.each([1, 2, 3])(
		'rechecks ownership at boundary %s; a kill never records absence',
		async (killAt) => {
			const f = fixture();
			let calls = 0;
			f.overrides.authorize_image_upload_cleanup = () =>
				Response.json(++calls === killAt ? null : f.owned);
			expect((await f.run()).status).toBe('unavailable');
			expect(f.deletes()).toHaveLength(killAt < 3 ? 0 : 1);
			expect(f.finishes()).toEqual(['unavailable']);
		}
	);
	it('will not switch paths when reauthorization returns a different target', async () => {
		const f = fixture();
		f.overrides.authorize_image_upload_cleanup = () =>
			Response.json({ ...f.owned, generation: 2 });
		expect((await f.run()).status).toBe('unavailable');
		expect(f.deletes()).toHaveLength(0);
	});
	it('reports an unknown outcome when an absence settlement reply is lost', async () => {
		const f = fixture();
		f.overrides.finish_image_upload_cleanup = (body) => {
			if (body?.p_outcome === 'absent') throw new Error('secret provider detail');
			return Response.json(false);
		};
		await expect(f.run()).rejects.toThrow('Libri cleanup outcome unknown');
		expect(f.finishes()).toEqual(['absent', 'unavailable']);
		expect(f.deletes()).toHaveLength(1);
	});
	it.each(['large', 'content_type', 'redirect', 'invalid_utf8', 'bad_json'])(
		'bounds and rejects malformed provider bodies: %s',
		async (mode) => {
			const f = fixture();
			f.overrides.claim_image_upload_cleanup = () => {
				if (mode === 'large') return Response.json({ padding: 'x'.repeat(17000) });
				if (mode === 'content_type') return new Response('null');
				if (mode === 'redirect') {
					const r = Response.json(f.owned);
					Object.defineProperty(r, 'redirected', { value: true });
					return r;
				}
				if (mode === 'invalid_utf8')
					return new Response(new Uint8Array([255]), {
						headers: { 'content-type': 'application/json' }
					});
				return new Response('{', { headers: { 'content-type': 'application/json' } });
			};
			await expect(f.run()).rejects.toThrow('unavailable');
			expect(f.calls).toHaveLength(1);
		}
	);
	it('keeps its busy latch after an aborted uncooperative delete until that call settles', async () => {
		const f = fixture();
		let release!: (response: Response) => void;
		f.overrides.delete = () =>
			new Promise<Response>((resolve) => {
				release = resolve;
			});
		const pending = f.run();
		const rejected = expect(pending).rejects.toThrow('outcome unknown');
		await vi.waitFor(() => expect(f.deletes()).toHaveLength(1));
		f.controller.abort();
		await rejected;
		expect(f.executor.isBusy()).toBe(true);
		await expect(
			f.executor.run({ ...f.input, signal: new AbortController().signal })
		).rejects.toThrow('unavailable');
		release(Response.json([f.info]));
		await vi.waitFor(() => expect(f.executor.isBusy()).toBe(false));
		expect(f.finishes()).toHaveLength(0);
	});
	it('aborts at the operation deadline even when fetch ignores cancellation', async () => {
		const f = fixture();
		let release!: (response: Response) => void;
		f.overrides.claim_image_upload_cleanup = () =>
			new Promise<Response>((resolve) => {
				release = resolve;
			});
		const pending = f.run();
		const rejected = expect(pending).rejects.toThrow('unavailable');
		await vi.advanceTimersByTimeAsync(20001);
		await rejected;
		expect(f.executor.isBusy()).toBe(true);
		release(Response.json(f.owned));
		await vi.waitFor(() => expect(f.executor.isBusy()).toBe(false));
		expect(f.calls).toHaveLength(1);
	});
	it('shortens the deadline to two seconds before a nearly expired lease', async () => {
		const f = fixture();
		f.owned.lease_expires_at = new Date(NOW + 5000).toISOString();
		let release!: (response: Response) => void;
		f.overrides.bucket = () =>
			new Promise<Response>((resolve) => {
				release = resolve;
			});
		const pending = f.run();
		const rejected = expect(pending).rejects.toThrow('unavailable');
		await vi.waitFor(() => expect(release).toBeTypeOf('function'));
		await vi.advanceTimersByTimeAsync(3001);
		await rejected;
		release(Response.json({ id: 'libri-assets', public: false }));
		await vi.waitFor(() => expect(f.executor.isBusy()).toBe(false));
		expect(f.deletes()).toHaveLength(0);
	});
});
