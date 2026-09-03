import { json } from '@sveltejs/kit';
import { createHash, timingSafeEqual } from 'crypto';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { RequestHandler } from './$types';

const LIBRARY_ID = 'f09948c4-e4e0-581c-8689-7258bea2f501';
const EXPECTED_BUCKET = 'libri-assets';
const MAX_BOOK_IDS = 100;
const MAX_COVER_ROWS = 1_000;
const MAX_REQUEST_BYTES = 8 * 1024;
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PRIVATE_RESPONSE_HEADERS = {
	'Cache-Control': 'private, no-store',
	Pragma: 'no-cache',
	'X-Content-Type-Options': 'nosniff'
} as const;

type CoverRow = {
	book_id: unknown;
	object_path: unknown;
	mime_type: unknown;
	created_at: unknown;
};

type QueryResult = {
	data: unknown;
	error: { code?: string } | null;
};

type CoverQuery = PromiseLike<QueryResult> & {
	select(columns: string): CoverQuery;
	eq(column: string, value: string): CoverQuery;
	in(column: string, values: string[]): CoverQuery;
	order(column: string, options: { ascending: boolean }): CoverQuery;
	limit(value: number): CoverQuery;
};

type LibriCoverClient = {
	from(table: 'images'): CoverQuery;
};

function unavailable(status: 400 | 401 | 404 | 503): Response {
	return json(
		{ error: 'Catalog covers unavailable' },
		{ status, headers: PRIVATE_RESPONSE_HEADERS }
	);
}

function authenticate(request: Request): 'valid' | 'invalid' | 'unconfigured' {
	const expectedToken = env.PRIVATE_LIBRI_CATALOG_ASSET_TOKEN?.trim();
	if (!expectedToken) return 'unconfigured';

	const authorization = request.headers.get('authorization') ?? '';
	const providedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
	const expectedDigest = createHash('sha256').update(expectedToken).digest();
	const providedDigest = createHash('sha256').update(providedToken).digest();
	return timingSafeEqual(expectedDigest, providedDigest) ? 'valid' : 'invalid';
}

async function parseBookIds(request: Request): Promise<string[] | null> {
	const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
	if (contentType !== 'application/json') return null;

	const declaredLength = request.headers.get('content-length');
	if (declaredLength !== null) {
		if (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_REQUEST_BYTES)
			return null;
	}

	let text: string;
	try {
		text = await request.text();
	} catch {
		return null;
	}
	if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) return null;

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return null;
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
	const record = body as Record<string, unknown>;
	if (Object.keys(record).length !== 1 || !Array.isArray(record.bookIds)) return null;
	if (record.bookIds.length === 0 || record.bookIds.length > MAX_BOOK_IDS) return null;
	if (
		!record.bookIds.every(
			(value): value is string => typeof value === 'string' && UUID_PATTERN.test(value)
		)
	) {
		return null;
	}
	return [...new Set(record.bookIds.map((value) => value.toLowerCase()))];
}

function isSafeObjectPath(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0 || value.length > 1_024) return false;
	if (
		!value.startsWith(`${LIBRARY_ID}/`) ||
		value.startsWith('/') ||
		/[\\\u0000-\u001f\u007f]/.test(value)
	) {
		return false;
	}
	return value
		.split('/')
		.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function isApprovedSignedUrl(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0 || value.length > 4_096) return false;
	try {
		const signedUrl = new URL(value);
		const supabaseUrl = new URL(PUBLIC_SUPABASE_URL);
		const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(supabaseUrl.hostname);
		const allowedProtocol =
			signedUrl.protocol === 'https:' || (isLoopback && signedUrl.protocol === 'http:');
		return (
			allowedProtocol &&
			signedUrl.origin === supabaseUrl.origin &&
			!signedUrl.username &&
			!signedUrl.password
		);
	} catch {
		return false;
	}
}

function reviewRows(
	data: unknown,
	requestedBookIds: ReadonlySet<string>
): Array<{
	bookId: string;
	objectPath: string;
	mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}> | null {
	if (!Array.isArray(data) || data.length > MAX_COVER_ROWS) return null;
	const covers = new Map<
		string,
		{ bookId: string; objectPath: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }
	>();
	for (const rawRow of data) {
		if (!rawRow || typeof rawRow !== 'object' || Array.isArray(rawRow)) return null;
		const row = rawRow as CoverRow;
		if (typeof row.book_id !== 'string' || !requestedBookIds.has(row.book_id.toLowerCase()))
			return null;
		if (!isSafeObjectPath(row.object_path)) return null;
		if (typeof row.mime_type !== 'string' || !ALLOWED_MIME_TYPES.has(row.mime_type))
			return null;
		if (typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at)))
			return null;
		const bookId = row.book_id.toLowerCase();
		if (!covers.has(bookId)) {
			covers.set(bookId, {
				bookId,
				objectPath: row.object_path,
				mimeType: row.mime_type as 'image/jpeg' | 'image/png' | 'image/webp'
			});
		}
	}
	return [...covers.values()];
}

export const POST: RequestHandler = async ({ request }) => {
	const authentication = authenticate(request);
	if (authentication === 'unconfigured') return unavailable(503);
	if (authentication === 'invalid') return unavailable(401);

	const bookIds = await parseBookIds(request);
	if (!bookIds) return unavailable(400);

	try {
		const supabase = createAdminSupabaseClient();
		const libri = supabase.schema('libri') as unknown as LibriCoverClient;
		const queried = await libri
			.from('images')
			.select('book_id, object_path, mime_type, created_at')
			.eq('library_id', LIBRARY_ID)
			.eq('image_type', 'cover')
			.in('book_id', bookIds)
			.order('book_id', { ascending: true })
			.order('created_at', { ascending: true })
			.limit(MAX_COVER_ROWS + 1);
		if (queried.error) {
			console.error('[LibriCatalogCovers] Cover lookup failed', {
				code: queried.error.code ?? 'unknown'
			});
			return unavailable(503);
		}

		const covers = reviewRows(queried.data, new Set(bookIds));
		if (!covers) return unavailable(503);
		if (covers.length === 0) return json({ covers: [] }, { headers: PRIVATE_RESPONSE_HEADERS });

		const signed = await supabase.storage.from(EXPECTED_BUCKET).createSignedUrls(
			covers.map((cover) => cover.objectPath),
			SIGNED_URL_TTL_SECONDS
		);
		if (signed.error || !Array.isArray(signed.data) || signed.data.length !== covers.length) {
			console.error('[LibriCatalogCovers] Batch signing failed', {
				code: signed.error?.name ?? 'invalid_response'
			});
			return unavailable(503);
		}

		const urls = new Map<string, string>();
		for (const signedRow of signed.data) {
			if (!isSafeObjectPath(signedRow.path) || !isApprovedSignedUrl(signedRow.signedUrl))
				return unavailable(503);
			urls.set(signedRow.path, signedRow.signedUrl);
		}
		if (urls.size !== covers.length) return unavailable(503);

		const responseCovers = covers.map((cover) => {
			const url = urls.get(cover.objectPath);
			if (!url) throw new Error('Missing signed catalog cover URL');
			return { bookId: cover.bookId, url, mimeType: cover.mimeType };
		});

		return json(
			{
				covers: responseCovers
			},
			{ headers: PRIVATE_RESPONSE_HEADERS }
		);
	} catch {
		console.error('[LibriCatalogCovers] Cover signing failed');
		return unavailable(503);
	}
};
