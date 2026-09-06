import { describe, expect, it } from 'vitest';
import { signLibriUserImages } from './user-image-signing';

const library = 'f09948c4-e4e0-581c-8689-7258bea2f501';
const image = '00000000-0000-4000-8000-000000000001';
const book = '00000000-0000-4000-8000-000000000002';
const token = 'user-token-fixture-not-a-real-jwt';
const path = `${library}/books/${book}/images/${image}/original.webp`;
const row = {
	id: image,
	book_id: book,
	bucket_id: 'libri-assets',
	object_path: path,
	mime_type: 'image/webp'
};
function fixture(
	options: {
		authStatus?: number;
		member?: boolean;
		rows?: unknown[];
		signed?: unknown[];
		imageFailure?: boolean;
	} = {}
) {
	const calls: {
		path: string;
		headers: Headers;
		body: unknown;
		params: URLSearchParams;
		signal: AbortSignal | null | undefined;
	}[] = [];
	const config = {
		url: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
		publicKey: 'sb_publishable_fixture',
		serviceKey: 'service-fixture',
		fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input));
			const headers = new Headers(init?.headers);
			calls.push({
				path: url.pathname,
				headers,
				params: url.searchParams,
				body: init?.body ? JSON.parse(String(init.body)) : null,
				signal: init?.signal
			});
			expect(init?.redirect).toBe('error');
			expect(init?.cache).toBe('no-store');
			if (url.pathname === '/auth/v1/user')
				return Response.json(
					options.authStatus
						? { message: 'private auth details' }
						: { id: 'fixture-user' },
					{ status: options.authStatus ?? 200 }
				);
			if (url.pathname.startsWith('/rest/v1/')) {
				expect(headers.get('authorization')).toBe(`Bearer ${token}`);
				expect(headers.get('accept-profile')).toBe('libri');
				expect(url.searchParams.get('library_id')).toBe(`eq.${library}`);
				if (url.pathname.endsWith('library_members'))
					return Response.json(options.member === false ? [] : [{ role: 'viewer' }]);
				if (options.imageFailure)
					return Response.json({ message: 'private query details' }, { status: 403 });
				return Response.json(options.rows ?? [row]);
			}
			expect(url.pathname).toBe('/storage/v1/object/sign/libri-assets');
			expect(headers.get('authorization')).toBe('Bearer service-fixture');
			return Response.json(
				options.signed ?? [
					{
						path,
						signedURL: `/object/sign/libri-assets/${path}?token=opaque`,
						error: null
					}
				]
			);
		}
	};
	const request = (body: unknown = { imageIds: [image] }, authorization = `Bearer ${token}`) =>
		new Request('https://build-os.com/api/internal/libri/images/sign', {
			method: 'POST',
			headers: { authorization, 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
	return { config, calls, request };
}

describe('user-scoped Libri image signing', () => {
	it('verifies identity and membership, resolves only RLS-visible IDs, then signs exact paths', async () => {
		const f = fixture();
		const response = await signLibriUserImages(f.request(), f.config);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			images: [
				{
					imageId: image,
					url: `${f.config.url}/storage/v1/object/sign/libri-assets/${path}?token=opaque`
				}
			]
		});
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(f.calls.map((call) => call.path)).toEqual([
			'/auth/v1/user',
			'/rest/v1/library_members',
			'/rest/v1/images',
			'/storage/v1/object/sign/libri-assets'
		]);
		expect(f.calls[2]?.params.get('select')).toBe('id,book_id,bucket_id,object_path,mime_type');
		expect(f.calls[2]?.params.get('id')).toBe(`in.(${image})`);
		expect(f.calls[2]?.params.get('limit')).toBe('26');
		expect(f.calls[3]?.body).toEqual({ paths: [path], expiresIn: 300 });
		expect(f.calls.every((call) => call.signal)).toBe(true);
	});
	it('does not accept cookies or the old cover credential as user identity', async () => {
		const f = fixture();
		expect((await signLibriUserImages(f.request(undefined, ''), f.config)).status).toBe(401);
		expect(f.calls).toHaveLength(0);
		const invalid = fixture({ authStatus: 401 });
		expect((await signLibriUserImages(invalid.request(), invalid.config)).status).toBe(401);
		expect(invalid.calls).toHaveLength(1);
	});
	it('denies nonmembers and never uses service authority for missing/foreign images', async () => {
		const f = fixture({ member: false });
		expect((await signLibriUserImages(f.request(), f.config)).status).toBe(403);
		expect(f.calls).toHaveLength(2);
		const empty = fixture({ rows: [] });
		expect(await (await signLibriUserImages(empty.request(), empty.config)).json()).toEqual({
			images: []
		});
		expect(empty.calls).toHaveLength(3);
	});
	it.each([
		{ imageIds: [] },
		{ imageIds: [image, image] },
		{ imageIds: [book], libraryId: library },
		{ imageIds: [image], objectPath: path },
		{ imageIds: ['slug'] },
		{ imageIds: Array(26).fill(image) }
	])('rejects unsafe input before external calls: %j', async (body) => {
		const f = fixture();
		expect((await signLibriUserImages(f.request(body), f.config)).status).toBe(400);
		expect(f.calls).toHaveLength(0);
	});
	it.each([
		{ ...row, bucket_id: 'onto-assets' },
		{ ...row, object_path: path.replace(library, book) },
		{ ...row, object_path: path + '/../../secret' },
		{ ...row, id: book },
		{ ...row, mime_type: 'image/svg+xml' }
	])('refuses unsafe stored paths before signing: %j', async (invalid) => {
		const f = fixture({ rows: [invalid] });
		expect((await signLibriUserImages(f.request(), f.config)).status).toBe(503);
		expect(f.calls).toHaveLength(3);
	});
	it('rejects duplicates, unavailable data, mismatched signature paths, and provider errors', async () => {
		for (const options of [
			{ rows: [row, row] },
			{ imageFailure: true },
			{ signed: [{ path, signedURL: '/object/sign/onto-assets/secret?token=x' }] },
			{
				signed: [
					{ path, signedURL: `/object/sign/libri-assets/${path}?token=x&download=y` }
				]
			},
			{ signed: [{ path, error: 'private provider details' }] }
		]) {
			const f = fixture(options);
			const response = await signLibriUserImages(f.request(), f.config);
			expect(response.status).toBe(503);
			expect(await response.json()).toEqual({ error: 'Private images unavailable' });
		}
	});
	it('bounds actual request bytes even with no Content-Length', async () => {
		const f = fixture();
		const request = new Request('https://build-os.com/api/internal/libri/images/sign', {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: ' '.repeat(8193)
		});
		expect((await signLibriUserImages(request, f.config)).status).toBe(413);
		expect(f.calls).toHaveLength(0);
	});
	it('cancels a stalled request body and releases it without contacting Supabase', async () => {
		const f = fixture();
		const controller = new AbortController();
		let canceled = false;
		const body = new ReadableStream<Uint8Array>({
			cancel() {
				canceled = true;
			}
		});
		const request = new Request('https://build-os.com/api/internal/libri/images/sign', {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body,
			signal: controller.signal,
			duplex: 'half'
		} as RequestInit);
		const response = signLibriUserImages(request, f.config);
		controller.abort();
		expect((await response).status).toBe(503);
		expect(canceled).toBe(true);
		expect(body.locked).toBe(false);
		expect(f.calls).toHaveLength(0);
	});
});
