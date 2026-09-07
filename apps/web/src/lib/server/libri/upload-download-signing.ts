// Machine-only staging download broker. No domain writes or worker service key.
import { createClient } from '@supabase/supabase-js';
import { error, isHttpError, json } from '@sveltejs/kit';
import { createHash, timingSafeEqual } from 'node:crypto';

const ORIGIN = 'https://iwifjtlebphefldmwbkh.supabase.co';
const LIBRARY = 'f09948c4-e4e0-581c-8689-7258bea2f501';
const BUCKET = 'libri-assets';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEADERS = {
	'Cache-Control': 'private, no-store',
	Pragma: 'no-cache',
	Vary: 'Authorization',
	'X-Content-Type-Options': 'nosniff'
};
type Config = {
	enabled?: boolean;
	url: string;
	serviceKey: string;
	brokerToken?: string;
	fetchImpl?: typeof fetch;
};
type Fence = { libraryId: string; uploadId: string; leaseToken: string; attempt: number };
const object = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);

async function boundedText(
	body: ReadableStream<Uint8Array> | null,
	max: number,
	signal: AbortSignal
) {
	if (!body) error(400, 'Body required');
	const reader = body.getReader();
	const cancel = () => {
		void reader.cancel().catch(() => undefined);
	};
	const decoder = new TextDecoder('utf-8', { fatal: true });
	let text = '',
		size = 0,
		chunks = 0;
	try {
		signal.addEventListener('abort', cancel, { once: true });
		signal.throwIfAborted();
		while (true) {
			const next = await reader.read();
			signal.throwIfAborted();
			if (next.done) break;
			if (++chunks > 512 || !(next.value instanceof Uint8Array)) error(413, 'Body limit');
			size += next.value.byteLength;
			if (size > max) error(413, 'Body limit');
			text += decoder.decode(next.value, { stream: true });
		}
		return text + decoder.decode();
	} finally {
		signal.removeEventListener('abort', cancel);
		cancel();
		reader.releaseLock();
	}
}

function reviewReceipt(value: unknown, fence: Fence) {
	if (!object(value)) error(404, 'Upload unavailable');
	const mime = value.mime_type;
	const extension =
		mime === 'image/jpeg'
			? 'jpeg'
			: mime === 'image/png'
				? 'png'
				: mime === 'image/webp'
					? 'webp'
					: null;
	if (
		!extension ||
		value.library_id !== fence.libraryId ||
		value.upload_id !== fence.uploadId ||
		value.lease_token !== fence.leaseToken ||
		value.attempt !== fence.attempt ||
		typeof value.book_id !== 'string' ||
		!UUID.test(value.book_id) ||
		value.bucket_id !== BUCKET ||
		value.object_path !==
			`${fence.libraryId}/uploads/${fence.uploadId}/original.${extension}` ||
		!Number.isSafeInteger(value.byte_size) ||
		Number(value.byte_size) < 1 ||
		Number(value.byte_size) > 26_214_400 ||
		typeof value.sha256 !== 'string' ||
		!/^[0-9a-f]{64}$/.test(value.sha256) ||
		typeof value.expires_at !== 'string' ||
		value.expires_at.length > 64
	)
		error(503, 'Invalid authorization');
	const expiresAt = Date.parse(value.expires_at);
	if (
		!Number.isFinite(expiresAt) ||
		expiresAt <= Date.now() + 7_000 ||
		expiresAt > Date.now() + 92_000
	)
		error(409, 'Lease unavailable');
	return {
		bookId: value.book_id,
		objectPath: String(value.object_path),
		mimeType: String(mime),
		byteSize: Number(value.byte_size),
		sha256: value.sha256,
		expiresAt
	};
}

function reviewSignedUrl(value: unknown, receipt: ReturnType<typeof reviewReceipt>) {
	if (typeof value !== 'string' || value.length > 4096) error(503, 'Invalid capability');
	const url = new URL(value);
	const token = url.searchParams.get('token') ?? '';
	if (
		url.origin !== ORIGIN ||
		url.href !== value ||
		url.username ||
		url.password ||
		url.hash ||
		url.pathname !== `/storage/v1/object/sign/${BUCKET}/${receipt.objectPath}` ||
		url.searchParams.size !== 1 ||
		token.length > 3500 ||
		!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
	)
		error(503, 'Invalid capability');
	// Consistency/lifetime checks on a trusted HTTPS Storage response, not independent
	// signature verification and never the source of database authorization.
	const encodedPayload = token.split('.')[1];
	if (!encodedPayload) error(503, 'Invalid capability');
	const payload: unknown = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
	if (
		!object(payload) ||
		payload.url !== `${BUCKET}/${receipt.objectPath}` ||
		!Number.isSafeInteger(payload.exp) ||
		payload.upsert !== undefined ||
		(payload.scope !== undefined && payload.scope !== 'download')
	)
		error(503, 'Invalid capability');
	const expiresAt = Number(payload.exp) * 1000;
	if (
		expiresAt <= Date.now() + 2_000 ||
		expiresAt > Date.now() + 32_000 ||
		expiresAt > receipt.expiresAt - 2_000
	)
		error(503, 'Unsafe capability lifetime');
	return { signedUrl: url.href, expiresAt: new Date(expiresAt).toISOString() };
}

export async function signLibriUploadDownload(request: Request, config: Config): Promise<Response> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let cancel: (() => void) | undefined;
	let signal: AbortSignal | undefined;
	const controller = new AbortController();
	try {
		if (config.enabled !== true) error(404, 'Downloads disabled');
		if (request.method !== 'POST') error(405, 'POST required');
		if (config.url !== ORIGIN || !config.serviceKey) error(503, 'Storage unavailable');
		const expected = config.brokerToken?.trim();
		if (
			!expected ||
			!/^[A-Za-z0-9._~+/-]{32,512}={0,2}$/.test(expected) ||
			expected.length > 512
		)
			error(503, 'Broker unavailable');
		const authorization = request.headers.get('authorization') ?? '';
		if (
			!/^Bearer [A-Za-z0-9._~+/-]{32,512}={0,2}$/.test(authorization) ||
			authorization.length > 519 ||
			!timingSafeEqual(
				createHash('sha256').update(authorization.slice(7)).digest(),
				createHash('sha256').update(expected).digest()
			)
		)
			error(401, 'Broker authentication required');
		if (new URL(request.url).search) error(400, 'Query not supported');
		if (
			request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !==
			'application/json'
		)
			error(415, 'JSON required');
		const length = request.headers.get('content-length');
		if (length !== null && (!/^\d+$/.test(length) || Number(length) > 512))
			error(413, 'Body limit');
		const attemptSignal = AbortSignal.any([request.signal, controller.signal]);
		signal = attemptSignal;
		const deadlineAt = performance.now() + 8_000;
		timer = setTimeout(() => controller.abort(), 8_000);
		const check = () => {
			if (performance.now() >= deadlineAt) controller.abort();
			attemptSignal.throwIfAborted();
		};
		const interrupted = new Promise<never>((_resolve, reject) => {
			cancel = () => reject(new Error('Signing interrupted'));
			attemptSignal.addEventListener('abort', cancel, { once: true });
		});
		const work = async () => {
			check();
			let input: unknown;
			try {
				input = JSON.parse(await boundedText(request.body, 512, attemptSignal));
			} catch (cause) {
				if (isHttpError(cause) || attemptSignal.aborted) throw cause;
				error(400, 'Invalid JSON');
			}
			if (
				!object(input) ||
				Object.keys(input).length !== 4 ||
				input.libraryId !== LIBRARY ||
				typeof input.uploadId !== 'string' ||
				!UUID.test(input.uploadId) ||
				typeof input.leaseToken !== 'string' ||
				!UUID.test(input.leaseToken) ||
				!Number.isSafeInteger(input.attempt) ||
				Number(input.attempt) < 1 ||
				Number(input.attempt) > 3
			)
				error(400, 'Invalid fence');
			const fence: Fence = {
				libraryId: LIBRARY,
				uploadId: input.uploadId,
				leaseToken: input.leaseToken,
				attempt: Number(input.attempt)
			};
			const fetchImpl: typeof fetch = async (url, init) => {
				check();
				const response = await (config.fetchImpl ?? fetch)(url, {
					...init,
					redirect: 'error',
					cache: 'no-store',
					signal: attemptSignal
				});
				try {
					check();
					if (response.redirected || (response.status >= 300 && response.status < 400))
						error(503, 'Unexpected redirect');
					const text = await boundedText(response.body, 16_384, attemptSignal);
					check();
					return new Response(text, {
						status: response.status,
						headers: response.headers
					});
				} catch {
					if (response.body && !response.body.locked)
						void response.body.cancel().catch(() => undefined);
					error(503, 'Provider unavailable');
				}
			};
			const client = createClient(ORIGIN, config.serviceKey, {
				auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
				global: { fetch: fetchImpl }
			});
			const authorize = async () => {
				check();
				const result = await client.schema('libri').rpc('authorize_image_upload_download', {
					p_library_id: fence.libraryId,
					p_upload_id: fence.uploadId,
					p_lease_token: fence.leaseToken,
					p_attempt: fence.attempt
				});
				check();
				if (result.error) error(503, 'Authorization unavailable');
				return reviewReceipt(result.data, fence);
			};
			const first = await authorize();
			const ttl = Math.min(30, Math.floor((first.expiresAt - Date.now() - 5_000) / 1000));
			if (ttl < 5) error(409, 'Lease unavailable');
			check();
			const signed = await client.storage.from(BUCKET).createSignedUrl(first.objectPath, ttl);
			check();
			if (signed.error) error(503, 'Signing unavailable');
			reviewSignedUrl(signed.data?.signedUrl, first);
			// Release DB locks before Storage I/O. Recheck before disclosure instead of
			// pretending the first transaction can authorize indefinitely.
			const second = await authorize();
			if (JSON.stringify(first) !== JSON.stringify(second))
				error(409, 'Authorization changed');
			check();
			return json(reviewSignedUrl(signed.data?.signedUrl, second), { headers: HEADERS });
		};
		return await Promise.race([work(), interrupted]);
	} catch (cause) {
		return json(
			{ error: 'Upload download unavailable' },
			{ status: isHttpError(cause) ? cause.status : 503, headers: HEADERS }
		);
	} finally {
		clearTimeout(timer);
		if (signal && cancel) signal.removeEventListener('abort', cancel);
		controller.abort();
	}
}
