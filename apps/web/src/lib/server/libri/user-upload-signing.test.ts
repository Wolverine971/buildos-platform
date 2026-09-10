import { describe, expect, it, vi } from 'vitest';
import { signLibriUserUpload } from './user-upload-signing';

const library = 'f09948c4-e4e0-581c-8689-7258bea2f501';
const upload = '00000000-0000-4000-8000-000000000001';
const book = '00000000-0000-4000-8000-000000000002';
const owner = '00000000-0000-4000-8000-000000000003';
const other = '00000000-0000-4000-8000-000000000004';
const token = 'fixture-user-token-not-a-real-jwt';
const origin = 'https://iwifjtlebphefldmwbkh.supabase.co';
const path = `${library}/uploads/${upload}/original.webp`;
const jwt = (payload: Record<string, unknown>) =>
	`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixtureSignature`;
function fixture(
	options: {
		enabled?: boolean;
		role?: string | null;
		authStatus?: number;
		row?: Record<string, unknown> | null;
		replayCode?: string;
		finalReplayCode?: string;
		replayRow?: Record<string, unknown>;
		finalReplayRow?: Record<string, unknown>;
		claims?: Record<string, unknown>;
		signedUrl?: string;
		storageStatus?: number;
		beginCode?: string;
		beginReceipt?: Record<string, unknown> | null;
		observeResult?: unknown;
		providerBody?: (phase: string) => Response | undefined;
	} = {}
) {
	const created = Date.now() - 60_000;
	const intent = {
		id: upload,
		library_id: library,
		book_id: book,
		requested_by: owner,
		idempotency_key: 'upload-fixture-001',
		file_metadata: {
			filename: 'photo.webp',
			mimeType: 'image/webp',
			byteSize: 1200,
			sha256: 'a'.repeat(64),
			imageType: 'page'
		},
		object_path: path,
		status: 'reserved',
		submitted_at: null,
		created_at: new Date(created).toISOString(),
		signing_deadline: new Date(created + 600_000).toISOString(),
		expires_at: new Date(created + 8_100_000).toISOString(),
		...(options.row ?? {})
	};
	const claims = {
		url: `libri-assets/${path}`,
		upsert: false,
		scope: 'upload',
		exp: Math.floor(Date.now() / 1000) + 7200,
		...options.claims
	};
	const signedUrl =
		options.signedUrl ??
		`${origin}/storage/v1/object/upload/sign/libri-assets/${path}?token=${jwt(claims)}`;
	const calls: {
		path: string;
		params: URLSearchParams;
		headers: Headers;
		body: unknown;
		phase: string;
	}[] = [];
	let replays = 0,
		attempted = false;
	const config = {
		enabled: options.enabled ?? true,
		url: origin,
		publicKey: 'sb_publishable_fixture',
		serviceKey: 'private-service-fixture',
		fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input));
			expect(url.origin).toBe(origin);
			expect(init?.redirect).toBe('error');
			expect(init?.cache).toBe('no-store');
			expect(init?.signal).toBeTruthy();
			const headers = new Headers(init?.headers);
			const phase = url.pathname.endsWith('/begin_image_upload_issuance')
				? 'begin'
				: url.pathname.endsWith('/observe_image_upload_issuance')
					? 'observe'
					: url.pathname === '/auth/v1/user'
						? 'auth'
						: url.pathname.endsWith('/library_members')
							? 'member'
							: url.pathname.endsWith('/image_upload_intents')
								? 'lookup'
								: url.pathname.includes('/rpc/')
									? 'replay'
									: 'storage';
			calls.push({
				path: url.pathname,
				params: url.searchParams,
				headers,
				body: init?.body ? JSON.parse(String(init.body)) : null,
				phase
			});
			const beginGranted = phase === 'begin' && !attempted;
			if (phase === 'begin') attempted = true;
			const override = options.providerBody?.(phase);
			if (override) return override;
			if (phase === 'begin' || phase === 'observe') {
				expect(headers.get('authorization')).toBe('Bearer private-service-fixture');
				expect(headers.get('content-profile')).toBe('libri');
				const body = JSON.parse(String(init?.body));
				expect(body.p_library_id).toBe(library);
				expect(body.p_upload_id).toBe(upload);
				expect(body.p_request_id).toMatch(/^[0-9a-f-]{36}$/);
				if (phase === 'observe') return Response.json(options.observeResult ?? true);
				expect(body.p_requested_by).toBe(owner);
				if (options.beginCode)
					return Response.json({ code: options.beginCode }, { status: 500 });
				if (!beginGranted || options.beginReceipt === null) return Response.json(null);
				// Match the RPC's single clock_timestamp() sample. Separate reads can
				// create a 10,001ms mock window, correctly rejected by the real signer.
				const attemptedAt = Date.now();
				return Response.json({
					upload_id: upload,
					library_id: library,
					request_id: body.p_request_id,
					object_path: path,
					attempted_at: new Date(attemptedAt).toISOString(),
					sign_before: new Date(attemptedAt + 10_000).toISOString(),
					reservation_expires_at: intent.expires_at,
					...options.beginReceipt
				});
			}
			if (phase === 'auth')
				return Response.json(
					options.authStatus
						? { message: 'private authentication diagnostic' }
						: { id: owner },
					{ status: options.authStatus ?? 200 }
				);
			if (phase !== 'storage') {
				expect(headers.get('authorization')).toBe(`Bearer ${token}`);
				expect(headers.get('apikey')).toBe('sb_publishable_fixture');
				expect(headers.get(phase === 'replay' ? 'content-profile' : 'accept-profile')).toBe(
					'libri'
				);
				if (phase === 'member')
					return Response.json(
						options.role === null ? [] : [{ role: options.role ?? 'editor' }]
					);
				if (phase === 'lookup') return Response.json(options.row === null ? [] : [intent]);
				expect(url.pathname).toBe('/rest/v1/rpc/reserve_image_upload');
				replays++;
				const code = replays === 1 ? options.replayCode : options.finalReplayCode;
				if (code)
					return Response.json({ code, message: 'private SQL details' }, { status: 403 });
				return Response.json(
					replays === 1
						? (options.replayRow ?? intent)
						: (options.finalReplayRow ?? intent)
				);
			}
			expect(headers.get('authorization')).toBe('Bearer private-service-fixture');
			expect(headers.get('x-upsert')).not.toBe('true');
			expect(url.pathname).toBe(`/storage/v1/object/upload/sign/libri-assets/${path}`);
			return Response.json(
				options.storageStatus
					? { message: 'private storage diagnostic' }
					: { url: signedUrl.slice(origin.length + '/storage/v1'.length) },
				{ status: options.storageStatus ?? 200 }
			);
		}
	};
	const request = (body: unknown = { uploadId: upload }, extra: RequestInit = {}) =>
		new Request('https://build-os.com/api/internal/libri/uploads/sign', {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify(body),
			...extra
		});
	return { config, request, calls, intent, signedUrl, claims };
}

describe('private Libri upload signer', () => {
	it('constructs the mock database window from one clock sample', async () => {
		// A controlled offset makes mixing the native Date constructor with a
		// separate Date.now() read fail deterministically, not only at a tick boundary.
		const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
		try {
			const f = fixture();
			expect((await signLibriUserUpload(f.request(), f.config)).status).toBe(200);
		} finally {
			now.mockRestore();
		}
	});
	it('defaults off without authentication, database, or Storage calls', async () => {
		const f = fixture({ enabled: false });
		const response = await signLibriUserUpload(f.request(), f.config);
		expect(response.status).toBe(404);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(f.calls).toHaveLength(0);
		delete (f.config as { enabled?: boolean }).enabled;
		expect((await signLibriUserUpload(f.request(), f.config)).status).toBe(404);
	});
	it('commits one attempt and its observation around signing, retaining both user authorization checks', async () => {
		const f = fixture();
		const response = await signLibriUserUpload(f.request(), f.config);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			uploadId: upload,
			uploadUrl: f.signedUrl,
			expiresAt: new Date(f.claims.exp * 1000).toISOString()
		});
		expect(response.headers.get('vary')).toBe('Authorization');
		expect(f.calls.map((c) => c.phase)).toEqual([
			'auth',
			'member',
			'lookup',
			'replay',
			'begin',
			'storage',
			'observe',
			'replay'
		]);
		expect(f.calls[2]?.params.get('library_id')).toBe(`eq.${library}`);
		expect(f.calls[2]?.params.get('requested_by')).toBe(`eq.${owner}`);
		expect(f.calls[2]?.params.get('id')).toBe(`eq.${upload}`);
		for (const call of f.calls.filter((c) => c.phase === 'replay'))
			expect(call.body).toEqual({
				p_library_id: library,
				p_book_id: book,
				p_idempotency_key: f.intent.idempotency_key,
				p_file: f.intent.file_metadata
			});
		expect(
			f.calls
				.filter((c) => c.headers.get('authorization') === 'Bearer private-service-fixture')
				.map((c) => c.phase)
		).toEqual(['begin', 'storage', 'observe']);
		const begin = f.calls.find((c) => c.phase === 'begin')!.body as Record<string, unknown>;
		expect(f.calls.find((c) => c.phase === 'observe')!.body).toEqual({
			p_library_id: library,
			p_upload_id: upload,
			p_request_id: begin.p_request_id,
			p_token_expires_at: new Date(f.claims.exp * 1000).toISOString()
		});
	});
	it.each([
		null,
		{ object_path: path + '/wrong' },
		{ request_id: other },
		{ library_id: other },
		{ upload_id: other },
		{ attempted_at: 'bad' },
		{ sign_before: 'bad' },
		{ sign_before: new Date(Date.now() - 1000).toISOString() },
		{ sign_before: new Date(Date.now() + 60_000).toISOString() },
		{ reservation_expires_at: 'bad' }
	])(
		'refuses missing or inconsistent issuance receipts before Storage: %j',
		async (beginReceipt) => {
			const f = fixture({ beginReceipt });
			expect((await signLibriUserUpload(f.request(), f.config)).status).toBe(
				beginReceipt === null ? 409 : 503
			);
			expect(f.calls.some((c) => c.phase === 'storage')).toBe(false);
		}
	);
	it('does not sign after a failed or lost begin response, including retries', async () => {
		const failed = fixture({ beginCode: 'XX000' });
		expect((await signLibriUserUpload(failed.request(), failed.config)).status).toBe(503);
		expect(failed.calls.some((c) => c.phase === 'storage')).toBe(false);
		let lost = true;
		const f = fixture({
			providerBody: (phase) => {
				if (phase === 'begin' && lost) {
					lost = false;
					throw Error('lost committed begin');
				}
				return undefined;
			}
		});
		expect((await signLibriUserUpload(f.request(), f.config)).status).toBe(503);
		expect((await signLibriUserUpload(f.request(), f.config)).status).toBe(409);
		expect(f.calls.some((c) => c.phase === 'storage')).toBe(false);
	});
	it.each(['storage_failure', 'bad_token', 'lost_observation', 'observation_refused', 'success'])(
		'never resigns after the first attempt: %s',
		async (scenario) => {
			const f = fixture({
				storageStatus: scenario === 'storage_failure' ? 500 : undefined,
				claims: scenario === 'bad_token' ? { upsert: true } : undefined,
				observeResult: scenario === 'observation_refused' ? false : undefined,
				providerBody: (phase) => {
					if (phase === 'observe' && scenario === 'lost_observation')
						throw Error('lost committed receipt');
					return undefined;
				}
			});
			const first = await signLibriUserUpload(f.request(), f.config);
			expect(first.status).toBe(scenario === 'success' ? 200 : 503);
			if (scenario !== 'success')
				expect(await first.text()).not.toMatch(/token=|fixtureSignature/);
			expect((await signLibriUserUpload(f.request(), f.config)).status).toBe(409);
			expect(f.calls.filter((c) => c.phase === 'storage')).toHaveLength(1);
		}
	);
	it.each([null, 'viewer', 'admin'])(
		'denies membership role %s before intent lookup',
		async (role) => {
			const f = fixture({ role });
			expect((await signLibriUserUpload(f.request(), f.config)).status).toBe(403);
			expect(f.calls.map((c) => c.phase)).toEqual(['auth', 'member']);
		}
	);
	it('allows owners and rejects invalid tokens without falling back to cookies', async () => {
		const f = fixture({ role: 'owner' });
		expect((await signLibriUserUpload(f.request(), f.config)).status).toBe(200);
		const denied = fixture({ authStatus: 401 });
		expect((await signLibriUserUpload(denied.request(), denied.config)).status).toBe(401);
		expect(denied.calls).toHaveLength(1);
		const missing = fixture();
		expect(
			(
				await signLibriUserUpload(
					missing.request(undefined, { headers: { cookie: 'some=other-user' } }),
					missing.config
				)
			).status
		).toBe(401);
		expect(missing.calls).toHaveLength(0);
	});
	it.each([
		{},
		[],
		null,
		{ uploadId: 'slug' },
		{ uploadId: upload, libraryId: library },
		{ uploadId: upload, objectPath: path },
		{ uploadId: [upload] }
	])('rejects unsafe request %j', async (body) => {
		const f = fixture();
		expect((await signLibriUserUpload(f.request(body), f.config)).status).toBe(400);
		expect(f.calls).toHaveLength(0);
	});
	it('bounds body bytes even without a length header and rejects query/config overrides', async () => {
		const f = fixture();
		expect(
			(
				await signLibriUserUpload(
					f.request({ uploadId: upload, padding: 'x'.repeat(1025) }),
					f.config
				)
			).status
		).toBe(413);
		const query = new Request(f.request().url + '?bucket=elsewhere', f.request());
		expect((await signLibriUserUpload(query, f.config)).status).toBe(400);
		expect(
			(await signLibriUserUpload(f.request(), { ...f.config, url: 'https://elsewhere.test' }))
				.status
		).toBe(503);
		expect(f.calls).toHaveLength(0);
	});
	it('keeps missing and foreign-requester intents unavailable without privileged fallback', async () => {
		const f = fixture({ row: null });
		expect((await signLibriUserUpload(f.request(), f.config)).status).toBe(404);
		expect(f.calls).toHaveLength(3);
	});
	it.each([
		{ id: other },
		{ library_id: other },
		{ requested_by: other },
		{ book_id: '../book' },
		{ object_path: `${library}/books/${book}/images/${upload}/original.webp` },
		{ object_path: path + '/../../replace' },
		{ status: 'awaiting_verification' },
		{ status: 'cleanup_pending' },
		{ submitted_at: new Date().toISOString() },
		{ signing_deadline: 'invalid' },
		{ expires_at: new Date(Date.now() + 90_000_000).toISOString() },
		{ file_metadata: { mimeType: 'image/svg+xml' } }
	])('rejects invalid stored intent before RPC/signing: %j', async (row) => {
		const f = fixture({ row });
		expect((await signLibriUserUpload(f.request(), f.config)).status).toBeGreaterThanOrEqual(
			400
		);
		expect(f.calls).toHaveLength(3);
	});
	it('does not renew an old signing window', async () => {
		const created = Date.now() - 590_000;
		const f = fixture({
			row: {
				created_at: new Date(created).toISOString(),
				signing_deadline: new Date(created + 600_000).toISOString(),
				expires_at: new Date(created + 8_100_000).toISOString()
			}
		});
		expect((await signLibriUserUpload(f.request(), f.config)).status).toBe(409);
		expect(f.calls).toHaveLength(3);
	});
	it.each(['42501', '22023', '53000'])(
		'does not sign after RPC denial %s',
		async (replayCode) => {
			const f = fixture({ replayCode });
			expect((await signLibriUserUpload(f.request(), f.config)).status).toBe(
				replayCode === '42501' ? 403 : replayCode === '22023' ? 409 : 503
			);
			expect(f.calls.map((c) => c.phase)).not.toContain('storage');
		}
	);
	it('does not deliver a token when the switch/membership is revoked while Storage signs', async () => {
		const f = fixture({ finalReplayCode: '42501' });
		const response = await signLibriUserUpload(f.request(), f.config);
		expect(response.status).toBe(403);
		expect(await response.text()).not.toContain('token=');
		expect(f.calls.filter((c) => c.phase === 'storage')).toHaveLength(1);
	});
	it('rejects immutable metadata or intent changes across authorization checks', async () => {
		const base = fixture();
		for (const replayRow of [
			{ ...base.intent, book_id: other },
			{
				...base.intent,
				file_metadata: { ...base.intent.file_metadata, filename: 'different.webp' }
			}
		]) {
			const f = fixture({ replayRow });
			expect((await signLibriUserUpload(f.request(), f.config)).status).toBe(503);
			expect(f.calls.map((c) => c.phase)).not.toContain('storage');
		}
		const during = fixture({
			finalReplayRow: {
				...base.intent,
				status: 'awaiting_verification',
				submitted_at: new Date().toISOString()
			}
		});
		expect((await signLibriUserUpload(during.request(), during.config)).status).toBe(409);
	});
	it.each([
		{ upsert: true },
		{ upsert: undefined },
		{ url: `libri-assets/${library}/other` },
		{ scope: 'download' },
		{ exp: 0 },
		{ exp: 'tomorrow' },
		{ exp: Math.floor(Date.now() / 1000) + 8000 }
	])('rejects unsafe provider token payload %j', async (claims) => {
		const f = fixture({ claims });
		const response = await signLibriUserUpload(f.request(), f.config);
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain('token=');
	});
	it.each([
		'https://evil.test/upload?token=x',
		`${origin}/storage/v1/object/sign/libri-assets/${path}?token=a.b.c`,
		`${origin}/storage/v1/object/upload/sign/libri-assets/${path}?token=a.b.c&upsert=true`
	])('rejects unsafe Storage URLs %s', async (signedUrl) => {
		const f = fixture({ signedUrl });
		expect((await signLibriUserUpload(f.request(), f.config)).status).toBe(503);
	});
	it('bounds provider responses and redacts failures', async () => {
		const huge = fixture({
			providerBody: (phase) =>
				phase === 'lookup' ? new Response('x'.repeat(65_537)) : undefined
		});
		expect((await signLibriUserUpload(huge.request(), huge.config)).status).toBe(503);
		const unavailable = fixture({ storageStatus: 500 });
		const response = await signLibriUserUpload(unavailable.request(), unavailable.config);
		expect(response.status).toBe(503);
		expect(await response.text()).not.toMatch(
			/diagnostic|service-fixture|fixture-user-token|token=/
		);
	});
	it('cancels a stalled request body without starting external work', async () => {
		const abort = new AbortController();
		let cancelled = false;
		const f = fixture();
		const request = f.request(undefined, {
			body: new ReadableStream({
				cancel() {
					cancelled = true;
				}
			}),
			signal: abort.signal,
			duplex: 'half'
		} as RequestInit);
		const pending = signLibriUserUpload(request, f.config);
		abort.abort();
		expect((await pending).status).toBe(503);
		expect(cancelled).toBe(true);
		expect(f.calls).toHaveLength(0);
	});
	it('cancels a stalled provider response and never signs after disconnect', async () => {
		const abort = new AbortController();
		let cancelled = false;
		const f = fixture({
			providerBody: (phase) => {
				if (phase !== 'lookup') return;
				queueMicrotask(() => abort.abort());
				return new Response(
					new ReadableStream({
						cancel() {
							cancelled = true;
						}
					})
				);
			}
		});
		const response = await signLibriUserUpload(
			f.request(undefined, { signal: abort.signal }),
			f.config
		);
		expect(response.status).toBe(503);
		expect(cancelled).toBe(true);
		expect(f.calls.map((c) => c.phase)).not.toContain('storage');
	});
});
