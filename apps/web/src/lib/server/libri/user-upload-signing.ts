// Staging capabilities only. User RLS/RPCs authorize the intent; service authority
// may sign its one immutable Storage path, never read or write domain tables.
import { createClient } from '@supabase/supabase-js';
import { error, isHttpError, json } from '@sveltejs/kit';

const LIBRARY = 'f09948c4-e4e0-581c-8689-7258bea2f501';
const ORIGIN = 'https://iwifjtlebphefldmwbkh.supabase.co';
const BUCKET = 'libri-assets';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpeg',
	'image/png': 'png',
	'image/webp': 'webp'
};
const HEADERS = {
	'Cache-Control': 'private, no-store',
	Vary: 'Authorization',
	'X-Content-Type-Options': 'nosniff'
};
const PROJECTION =
	'id,library_id,book_id,requested_by,idempotency_key,file_metadata,object_path,status,created_at,signing_deadline,expires_at,submitted_at';
type Config = {
	enabled?: boolean;
	url: string;
	publicKey: string;
	serviceKey: string;
	fetchImpl?: typeof fetch;
};
type Intent = {
	id: string;
	library_id: string;
	book_id: string;
	requested_by: string;
	idempotency_key: string;
	file_metadata: Record<string, unknown>;
	object_path: string;
	status: string;
	created_at: string;
	signing_deadline: string;
	expires_at: string;
	submitted_at: null;
};
const object = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);

async function boundedText(
	body: ReadableStream<Uint8Array> | null,
	max: number,
	signal: AbortSignal
) {
	if (!body) error(400, 'JSON body required');
	const reader = body.getReader();
	const cancel = () => {
		void reader.cancel().catch(() => undefined);
	};
	let size = 0,
		text = '';
	const decoder = new TextDecoder('utf-8', { fatal: true });
	try {
		signal.throwIfAborted();
		signal.addEventListener('abort', cancel, { once: true });
		while (true) {
			const next = await reader.read();
			signal.throwIfAborted();
			if (next.done) break;
			size += next.value.byteLength;
			if (size > max) error(413, 'Body too large');
			text += decoder.decode(next.value, { stream: true });
		}
		return text + decoder.decode();
	} finally {
		signal.removeEventListener('abort', cancel);
		cancel();
		reader.releaseLock();
	}
}

function validateIntent(value: unknown, id: string, user: string): Intent {
	if (!object(value) || !object(value.file_metadata)) error(503, 'Invalid upload reservation');
	const file = value.file_metadata;
	if (
		value.id !== id ||
		value.library_id !== LIBRARY ||
		value.requested_by !== user ||
		typeof value.book_id !== 'string' ||
		!UUID.test(value.book_id) ||
		typeof value.idempotency_key !== 'string' ||
		!/^[A-Za-z0-9_-]{16,128}$/.test(value.idempotency_key) ||
		typeof file.mimeType !== 'string' ||
		!Object.hasOwn(EXTENSIONS, file.mimeType) ||
		typeof file.byteSize !== 'number' ||
		!Number.isInteger(file.byteSize) ||
		file.byteSize < 1 ||
		file.byteSize > 26214400 ||
		typeof file.sha256 !== 'string' ||
		!/^[0-9a-f]{64}$/.test(file.sha256) ||
		value.object_path !== `${LIBRARY}/uploads/${id}/original.${EXTENSIONS[file.mimeType]}`
	)
		error(503, 'Invalid upload reservation');
	const dates = [value.created_at, value.signing_deadline, value.expires_at];
	if (dates.some((date) => typeof date !== 'string' || !Number.isFinite(Date.parse(date))))
		error(503, 'Invalid reservation dates');
	const created = Date.parse(value.created_at as string);
	const signing = Date.parse(value.signing_deadline as string);
	const expires = Date.parse(value.expires_at as string);
	if (
		signing - created !== 600_000 ||
		expires - created !== 8_100_000 ||
		created > Date.now() + 5000
	)
		error(503, 'Invalid reservation window');
	// Leave request/clock margin before the DB's ten-minute signing deadline.
	if (value.status !== 'reserved' || value.submitted_at !== null || signing - Date.now() < 30_000)
		error(409, 'Upload is no longer signable');
	return value as Intent;
}

function sameIntent(first: Intent, next: Intent) {
	const canonical = (file: Record<string, unknown>) =>
		JSON.stringify(Object.entries(file).sort(([a], [b]) => a.localeCompare(b)));
	return (
		[
			'id',
			'library_id',
			'book_id',
			'requested_by',
			'idempotency_key',
			'object_path',
			'created_at',
			'signing_deadline',
			'expires_at'
		].every((key) => first[key as keyof Intent] === next[key as keyof Intent]) &&
		canonical(first.file_metadata) === canonical(next.file_metadata)
	);
}

function validateCapability(data: unknown, intent: Intent) {
	if (
		!object(data) ||
		data.path !== intent.object_path ||
		typeof data.signedUrl !== 'string' ||
		data.signedUrl.length > 8192 ||
		typeof data.token !== 'string' ||
		data.token.length > 6144 ||
		!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.token)
	)
		error(503, 'Invalid upload capability');
	const url = new URL(data.signedUrl);
	if (
		url.origin !== ORIGIN ||
		url.pathname !== `/storage/v1/object/upload/sign/${BUCKET}/${intent.object_path}` ||
		url.username ||
		url.password ||
		url.hash ||
		url.searchParams.size !== 1 ||
		url.searchParams.get('token') !== data.token
	)
		error(503, 'Invalid upload capability');
	// This is a consistency/lifetime check on a response received directly from
	// trusted Storage over HTTPS, NOT independent JWT signature verification.
	const encodedPayload = data.token.split('.')[1];
	if (!encodedPayload) error(503, 'Invalid upload token');
	const payload: unknown = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
	if (
		!object(payload) ||
		payload.url !== `${BUCKET}/${intent.object_path}` ||
		payload.upsert !== false ||
		(payload.scope !== undefined && payload.scope !== 'upload') ||
		typeof payload.exp !== 'number' ||
		!Number.isSafeInteger(payload.exp)
	)
		error(503, 'Invalid upload token');
	const expiry = payload.exp * 1000;
	if (
		expiry <= Date.now() + 60_000 ||
		expiry > Date.now() + 7_205_000 ||
		expiry > Date.parse(intent.expires_at) - 60_000
	)
		error(503, 'Unsafe upload token lifetime');
	return { uploadId: intent.id, uploadUrl: url.href, expiresAt: new Date(expiry).toISOString() };
}

export async function signLibriUserUpload(request: Request, config: Config): Promise<Response> {
	try {
		if (config.enabled !== true) error(404, 'Uploads are not enabled');
		if (request.method !== 'POST') error(405, 'POST required');
		if (config.url !== ORIGIN) error(503, 'Upload storage is not configured');
		const auth = request.headers.get('authorization');
		if (!auth || !/^Bearer [A-Za-z0-9._-]{20,8192}$/.test(auth))
			error(401, 'User token required');
		if (new URL(request.url).search) error(400, 'Query parameters are not supported');
		if (
			request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
			'application/json'
		)
			error(415, 'JSON required');
		const length = request.headers.get('content-length');
		if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1024))
			error(413, 'Body too large');
		const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
		let input: unknown;
		try {
			input = JSON.parse(await boundedText(request.body, 1024, signal));
		} catch (cause) {
			if (isHttpError(cause) || signal.aborted) throw cause;
			error(400, 'Invalid JSON');
		}
		if (
			!object(input) ||
			Object.keys(input).length !== 1 ||
			typeof input.uploadId !== 'string' ||
			!UUID.test(input.uploadId)
		)
			error(400, 'Upload UUID required');
		const id = input.uploadId;
		const fetchImpl: typeof fetch = async (input, init) => {
			const response = await (config.fetchImpl ?? fetch)(input, {
				...init,
				redirect: 'error',
				cache: 'no-store',
				signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])])
			});
			try {
				const body = await boundedText(response.body, 65_536, signal);
				return new Response(body, { status: response.status, headers: response.headers });
			} catch {
				error(503, 'Upload provider unavailable');
			}
		};
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
		if (!user.data.user || !UUID.test(user.data.user.id)) error(401, 'User token required');
		const userId = user.data.user.id;
		const member = await client
			.schema('libri')
			.from('library_members')
			.select('role')
			.eq('library_id', LIBRARY)
			.eq('user_id', userId)
			.maybeSingle();
		if (member.error) error(503, 'Membership unavailable');
		if (!member.data || !['owner', 'editor'].includes(member.data.role))
			error(403, 'Library editor required');
		const lookup = await client
			.schema('libri')
			.from('image_upload_intents')
			.select(PROJECTION)
			.eq('library_id', LIBRARY)
			.eq('requested_by', userId)
			.eq('id', id)
			.maybeSingle();
		if (lookup.error) error(503, 'Upload lookup unavailable');
		if (!lookup.data) error(404, 'Upload unavailable');
		const intent = validateIntent(lookup.data, id, userId);
		const reauthorize = async () => {
			// Exact idempotent replay checks fresh membership and the private DB switch,
			// without a service-role domain read or a new reservation/capability window.
			const replay = await client
				.schema('libri')
				.rpc('reserve_image_upload', {
					p_library_id: LIBRARY,
					p_book_id: intent.book_id,
					p_idempotency_key: intent.idempotency_key,
					p_file: intent.file_metadata
				})
				.single();
			if (replay.error)
				error(
					replay.error.code === '42501' ? 403 : replay.error.code === '22023' ? 409 : 503,
					'Upload authorization unavailable'
				);
			if (!sameIntent(intent, validateIntent(replay.data, id, userId)))
				error(503, 'Upload reservation changed');
		};
		await reauthorize();
		signal.throwIfAborted();
		const storage = createClient(config.url, config.serviceKey, {
			auth: authOptions,
			global: { fetch: fetchImpl }
		}).storage.from(BUCKET);
		const signed = await storage.createSignedUploadUrl(intent.object_path, { upsert: false });
		if (signed.error) error(503, 'Upload signing unavailable');
		const result = validateCapability(signed.data, intent);
		// Do not deliver a token if revocation, submission or disabling was observed
		// during signing. Previously issued bearer tokens cannot be revoked this way.
		await reauthorize();
		signal.throwIfAborted();
		return json(result, { headers: HEADERS });
	} catch (cause) {
		return json(
			{ error: 'Private upload signing unavailable' },
			{ status: isHttpError(cause) ? cause.status : 503, headers: HEADERS }
		);
	}
}
