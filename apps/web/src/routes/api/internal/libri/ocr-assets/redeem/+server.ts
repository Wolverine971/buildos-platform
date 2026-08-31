import { json } from '@sveltejs/kit';
import { createHash, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { RequestHandler } from './$types';

const EXPECTED_BUCKET = 'libri-assets';
const MAX_REQUEST_BYTES = 256;
const MAX_SIGNED_URL_TTL_SECONDS = 60;
const MIN_SIGNED_URL_TTL_SECONDS = 5;
const SIGNED_URL_EXPIRY_SAFETY_SECONDS = 2;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PRIVATE_RESPONSE_HEADERS = {
	'Cache-Control': 'private, no-store',
	Pragma: 'no-cache',
	'X-Content-Type-Options': 'nosniff'
} as const;

const requestSchema = z
	.object({
		grantId: z.string().uuid()
	})
	.strict();

type GrantRow = {
	bucket_id: unknown;
	object_path: unknown;
	mime_type: unknown;
	expires_at: unknown;
};

type GrantRpcResult = {
	data: unknown;
	error: { code?: string } | null;
};

type LibriGrantRpcClient = {
	rpc(
		functionName: 'consume_ocr_asset_grant',
		args: { p_grant_id: string }
	): PromiseLike<GrantRpcResult>;
};

type ReviewedGrant = {
	bucketId: typeof EXPECTED_BUCKET;
	objectPath: string;
	mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
	ttlSeconds: number;
};

function unavailable(status: 400 | 401 | 404 | 503): Response {
	return json(
		{ error: 'Asset grant unavailable' },
		{ status, headers: PRIVATE_RESPONSE_HEADERS }
	);
}

function brokerAuthentication(request: Request): 'valid' | 'invalid' | 'unconfigured' {
	const expectedToken = env.PRIVATE_LIBRI_ASSET_BROKER_TOKEN?.trim();
	if (!expectedToken) return 'unconfigured';

	const authorization = request.headers.get('authorization') ?? '';
	const providedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
	const expectedDigest = createHash('sha256').update(expectedToken).digest();
	const providedDigest = createHash('sha256').update(providedToken).digest();
	return timingSafeEqual(expectedDigest, providedDigest) ? 'valid' : 'invalid';
}

async function parseGrantId(request: Request): Promise<string | null> {
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

	const parsed = requestSchema.safeParse(body);
	return parsed.success ? parsed.data.grantId : null;
}

function isSafeObjectPath(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0 || value.length > 1024) return false;
	if (value.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(value)) return false;
	return value
		.split('/')
		.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function reviewGrant(data: unknown, nowMs: number): ReviewedGrant | null {
	if (!Array.isArray(data) || data.length !== 1) return null;

	const row = data[0] as GrantRow | null;
	if (!row || typeof row !== 'object') return null;
	if (row.bucket_id !== EXPECTED_BUCKET || !isSafeObjectPath(row.object_path)) return null;
	if (typeof row.mime_type !== 'string' || !ALLOWED_MIME_TYPES.has(row.mime_type)) return null;
	if (typeof row.expires_at !== 'string') return null;

	const expiresAtMs = Date.parse(row.expires_at);
	if (!Number.isFinite(expiresAtMs)) return null;
	const ttlSeconds = Math.min(
		MAX_SIGNED_URL_TTL_SECONDS,
		Math.floor((expiresAtMs - nowMs) / 1000) - SIGNED_URL_EXPIRY_SAFETY_SECONDS
	);
	if (ttlSeconds < MIN_SIGNED_URL_TTL_SECONDS) return null;

	return {
		bucketId: EXPECTED_BUCKET,
		objectPath: row.object_path,
		mimeType: row.mime_type as ReviewedGrant['mimeType'],
		ttlSeconds
	};
}

function isApprovedSignedUrl(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	try {
		const signedUrl = new URL(value);
		const supabaseUrl = new URL(PUBLIC_SUPABASE_URL);
		const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(supabaseUrl.hostname);
		const allowedProtocol =
			signedUrl.protocol === 'https:' || (isLoopback && signedUrl.protocol === 'http:');
		return allowedProtocol && signedUrl.origin === supabaseUrl.origin;
	} catch {
		return false;
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const authentication = brokerAuthentication(request);
	if (authentication === 'unconfigured') return unavailable(503);
	if (authentication === 'invalid') return unavailable(401);

	const grantId = await parseGrantId(request);
	if (!grantId) return unavailable(400);

	try {
		const supabase = createAdminSupabaseClient();
		// Generated types currently omit custom-schema routines. Keep this cast scoped to the
		// exact deployed RPC contract; the returned row is independently reviewed below.
		const libri = supabase.schema('libri') as unknown as LibriGrantRpcClient;
		const consumed = await libri.rpc('consume_ocr_asset_grant', { p_grant_id: grantId });

		if (consumed.error) {
			console.error('[LibriOcrAssetBroker] Grant consumption failed', {
				code: consumed.error.code ?? 'unknown'
			});
			return unavailable(503);
		}

		const grant = reviewGrant(consumed.data, Date.now());
		if (!grant) return unavailable(404);

		const signed = await supabase.storage
			.from(grant.bucketId)
			.createSignedUrl(grant.objectPath, grant.ttlSeconds);
		if (signed.error || !isApprovedSignedUrl(signed.data?.signedUrl)) {
			console.error('[LibriOcrAssetBroker] Signed URL creation failed', {
				code: signed.error?.name ?? 'invalid_response'
			});
			return unavailable(503);
		}

		return json(
			{ signedUrl: signed.data.signedUrl, mimeType: grant.mimeType },
			{ headers: PRIVATE_RESPONSE_HEADERS }
		);
	} catch {
		console.error('[LibriOcrAssetBroker] Asset grant redemption failed');
		return unavailable(503);
	}
};
