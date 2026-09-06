// Server-only capability broker. The user-scoped client resolves paths under RLS;
// service authority is used only to sign those reviewed, canonical image paths.
import { createClient } from '@supabase/supabase-js';
import { error, isHttpError, json } from '@sveltejs/kit';

const LIBRARY_ID = 'f09948c4-e4e0-581c-8689-7258bea2f501';
const BUCKET = 'libri-assets';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME_EXTENSIONS: Record<string, string[]> = {
	'image/jpeg': ['jpg', 'jpeg'],
	'image/png': ['png'],
	'image/webp': ['webp']
};
const HEADERS = {
	'Cache-Control': 'private, no-store',
	Vary: 'Authorization',
	'X-Content-Type-Options': 'nosniff'
};
type Config = { url: string; publicKey: string; serviceKey: string; fetchImpl?: typeof fetch };

async function readIds(request: Request, signal: AbortSignal) {
	if (
		request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
		'application/json'
	)
		error(415, 'JSON required');
	const length = request.headers.get('content-length');
	if (length !== null && (!/^\d+$/.test(length) || Number(length) > 8192))
		error(413, 'Body too large');
	if (!request.body) error(400, 'Image IDs required');
	const reader = request.body.getReader();
	const cancel = () => {
		void reader.cancel().catch(() => undefined);
	};
	let text = '',
		size = 0;
	const decoder = new TextDecoder('utf-8', { fatal: true });
	try {
		signal.throwIfAborted();
		signal.addEventListener('abort', cancel, { once: true });
		while (true) {
			const { done, value } = await reader.read();
			signal.throwIfAborted();
			if (done) break;
			size += value.byteLength;
			if (size > 8192) error(413, 'Body too large');
			text += decoder.decode(value, { stream: true });
		}
		text += decoder.decode();
	} finally {
		signal.removeEventListener('abort', cancel);
		cancel();
		reader.releaseLock();
	}
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		error(400, 'Invalid JSON');
	}
	const ids: unknown = body?.imageIds;
	if (
		!body ||
		typeof body !== 'object' ||
		Object.keys(body).length !== 1 ||
		!Array.isArray(ids) ||
		ids.length < 1 ||
		ids.length > 25 ||
		ids.some((id) => typeof id !== 'string' || !UUID.test(id)) ||
		new Set(ids.map((id) => id.toLowerCase())).size !== ids.length
	)
		error(400, 'Provide 1–25 unique image UUIDs');
	return (ids as string[]).map((id) => id.toLowerCase());
}

export async function signLibriUserImages(request: Request, config: Config): Promise<Response> {
	try {
		const auth = request.headers.get('authorization');
		if (!auth || !/^Bearer [A-Za-z0-9._-]{20,8192}$/.test(auth))
			error(401, 'Supabase user token required');
		if (new URL(request.url).search) error(400, 'Query parameters are not supported');
		const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
		const imageIds = await readIds(request, signal);
		const fetchImpl: typeof fetch = (input, init) =>
			(config.fetchImpl ?? fetch)(input, {
				...init,
				redirect: 'error',
				cache: 'no-store',
				signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])])
			});
		const authOptions = {
			persistSession: false,
			autoRefreshToken: false,
			detectSessionInUrl: false
		};
		const client = createClient(config.url, config.publicKey, {
			auth: authOptions,
			global: { fetch: fetchImpl, headers: { Authorization: auth } }
		});
		const user = await client.auth.getUser(auth.slice(7));
		if (user.error)
			error(
				user.error.status && user.error.status < 500 && user.error.status !== 429
					? 401
					: 503,
				'Authentication unavailable'
			);
		if (!user.data.user) error(401, 'Supabase user token required');
		const membership = await client
			.schema('libri')
			.from('library_members')
			.select('role')
			.eq('library_id', LIBRARY_ID)
			.eq('user_id', user.data.user.id)
			.maybeSingle();
		if (membership.error) error(503, 'Membership unavailable');
		if (!membership.data || !['owner', 'editor', 'viewer'].includes(membership.data.role))
			error(403, 'Library access required');
		const result = await client
			.schema('libri')
			.from('images')
			.select('id,book_id,bucket_id,object_path,mime_type')
			.eq('library_id', LIBRARY_ID)
			.in('id', imageIds)
			.order('id')
			.limit(26);
		if (result.error || !Array.isArray(result.data) || result.data.length > imageIds.length)
			error(503, 'Image lookup unavailable');
		const seen = new Set<string>();
		const images = result.data.map((row) => {
			if (
				!row ||
				typeof row.id !== 'string' ||
				!imageIds.includes(row.id) ||
				seen.has(row.id) ||
				typeof row.book_id !== 'string' ||
				!UUID.test(row.book_id) ||
				row.bucket_id !== BUCKET ||
				!(MIME_EXTENSIONS[row.mime_type] ?? []).some(
					(ext) =>
						row.object_path ===
						`${LIBRARY_ID}/books/${row.book_id}/images/${row.id}/original.${ext}`
				)
			)
				error(503, 'Invalid stored image');
			seen.add(row.id);
			return { id: row.id as string, path: row.object_path as string };
		});
		if (!images.length) return json({ images: [] }, { headers: HEADERS });
		// No service-role domain query, user mutation, upload, or caller-controlled path.
		const storage = createClient(config.url, config.serviceKey, {
			auth: authOptions,
			global: { fetch: fetchImpl }
		}).storage.from(BUCKET);
		const signed = await storage.createSignedUrls(
			images.map((image) => image.path),
			300
		);
		if (signed.error || !Array.isArray(signed.data) || signed.data.length !== images.length)
			error(503, 'Image signing unavailable');
		const urls = new Map<string, string>();
		for (const row of signed.data) {
			if (
				!row.path ||
				row.error ||
				!row.signedUrl ||
				urls.has(row.path) ||
				!images.some((image) => image.path === row.path)
			)
				error(503, 'Invalid signed image');
			const url = new URL(row.signedUrl);
			if (
				url.origin !== new URL(config.url).origin ||
				url.pathname !== `/storage/v1/object/sign/${BUCKET}/${row.path}` ||
				url.username ||
				url.password ||
				url.hash ||
				url.searchParams.size !== 1 ||
				!url.searchParams.get('token')
			)
				error(503, 'Invalid signed image');
			urls.set(row.path, url.href);
		}
		return json(
			{ images: images.map((image) => ({ imageId: image.id, url: urls.get(image.path)! })) },
			{ headers: HEADERS }
		);
	} catch (cause) {
		// No raw provider error or credential logging; client-visible errors are deliberately generic.
		return json(
			{ error: 'Private images unavailable' },
			{ status: isHttpError(cause) ? cause.status : 503, headers: HEADERS }
		);
	}
}
