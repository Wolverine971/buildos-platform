// Machine-only control plane. Image bytes travel Railway -> private Storage, not through Vercel.
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
type Verified = {
	mimeType: string;
	byteSize: number;
	sha256: string;
	width: number;
	height: number;
	channels: number;
};
type Fence = { libraryId: string; uploadId: string; leaseToken: string; attempt: number };
const object = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const extension = (mime: string) =>
	mime === 'image/jpeg' ? 'jpeg' : mime === 'image/png' ? 'png' : 'webp';
function verified(value: unknown): Verified {
	if (
		!object(value) ||
		Object.keys(value).length !== 6 ||
		!['image/jpeg', 'image/png', 'image/webp'].includes(String(value.mimeType)) ||
		typeof value.sha256 !== 'string' ||
		!/^[0-9a-f]{64}$/.test(value.sha256) ||
		!['byteSize', 'width', 'height', 'channels'].every(
			(k) => Number.isSafeInteger(value[k]) && Number(value[k]) > 0
		) ||
		Number(value.byteSize) > 26214400 ||
		Number(value.width) > 16384 ||
		Number(value.height) > 16384 ||
		Number(value.width) * Number(value.height) > 40000000 ||
		Number(value.channels) > 4
	)
		error(400, 'Invalid verification');
	return {
		mimeType: String(value.mimeType),
		byteSize: Number(value.byteSize),
		sha256: value.sha256,
		width: Number(value.width),
		height: Number(value.height),
		channels: Number(value.channels)
	};
}
function sameVerified(v: unknown, expected: Verified) {
	return (
		object(v) &&
		Object.keys(v).length === 6 &&
		Object.entries(expected).every(([k, value]) => v[k] === value)
	);
}
function prepared(value: unknown, fence: Fence, v: Verified) {
	if (
		!object(value) ||
		!uuid(value.publication_id) ||
		!uuid(value.book_id) ||
		value.library_id !== fence.libraryId ||
		value.upload_id !== fence.uploadId ||
		value.lease_token !== fence.leaseToken ||
		value.attempt !== fence.attempt ||
		value.bucket_id !== BUCKET ||
		value.status !== 'prepared' ||
		!sameVerified(value.verified_metadata, v) ||
		value.object_path !==
			`${LIBRARY}/images/${value.publication_id}/original.${extension(v.mimeType)}`
	)
		error(409, 'Publication unavailable');
	return {
		publication_id: value.publication_id,
		book_id: value.book_id,
		library_id: LIBRARY,
		upload_id: fence.uploadId,
		lease_token: fence.leaseToken,
		attempt: fence.attempt,
		bucket_id: BUCKET,
		object_path: String(value.object_path),
		verified_metadata: v,
		status: 'prepared'
	};
}
function capability(value: unknown, path: string) {
	if (!object(value) || typeof value.url !== 'string' || value.url.length > 4096)
		error(503, 'Invalid capability');
	const url = new URL(ORIGIN + '/storage/v1' + value.url);
	const token = url.searchParams.get('token') ?? '';
	if (
		url.origin !== ORIGIN ||
		url.pathname !== `/storage/v1/object/upload/sign/${BUCKET}/${path}` ||
		url.hash ||
		url.username ||
		url.password ||
		url.searchParams.size !== 1 ||
		!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
	)
		error(503, 'Invalid capability');
	const payload: unknown = JSON.parse(
		Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')
	);
	if (
		!object(payload) ||
		payload.url !== `${BUCKET}/${path}` ||
		payload.upsert !== false ||
		(payload.scope !== undefined && payload.scope !== 'upload') ||
		!Number.isSafeInteger(payload.exp) ||
		Number(payload.exp) * 1000 <= Date.now() + 60000 ||
		Number(payload.exp) * 1000 > Date.now() + 7205000
	)
		error(503, 'Unsafe capability');
	return {
		uploadUrl: url.href,
		capabilityExpiresAt: new Date(Number(payload.exp) * 1000).toISOString()
	};
}
async function consume(
	body: ReadableStream<Uint8Array> | null,
	limit: number,
	chunksLimit: number,
	signal: AbortSignal,
	receive: (chunk: Uint8Array) => void
) {
	if (!body) error(400, 'Body required');
	const reader = body.getReader();
	let count = 0,
		size = 0;
	const cancel = () => {
		void reader.cancel().catch(() => undefined);
	};
	try {
		signal.addEventListener('abort', cancel, { once: true });
		signal.throwIfAborted();
		while (true) {
			const item = await reader.read();
			signal.throwIfAborted();
			if (item.done) break;
			if (!(item.value instanceof Uint8Array) || ++count > chunksLimit)
				error(413, 'Body limit');
			size += item.value.byteLength;
			if (size > limit) error(413, 'Body limit');
			receive(item.value);
		}
		return size;
	} finally {
		signal.removeEventListener('abort', cancel);
		cancel();
		reader.releaseLock();
	}
}
async function readJson(
	body: ReadableStream<Uint8Array> | null,
	limit: number,
	signal: AbortSignal
) {
	const decoder = new TextDecoder('utf-8', { fatal: true });
	let text = '';
	await consume(body, limit, 512, signal, (chunk) => {
		text += decoder.decode(chunk, { stream: true });
	});
	return JSON.parse(text + decoder.decode()) as unknown;
}

/** One instance per server process. No retries, cleanup, queue dispatch, raw caller Storage IDs,
 * service keys in the worker, or open transactions across external I/O. A pending operation
 * retains this instance's capacity after a caller timeout until it really settles.
 */
export function createLibriUploadPublicationBroker() {
	let busy = false;
	return async (request: Request, config: Config): Promise<Response> => {
		const timeout = new AbortController();
		let timer: ReturnType<typeof setTimeout> | undefined;
		let detach = () => {};
		try {
			if (config.enabled !== true) error(404, 'Publication disabled');
			if (request.method !== 'POST') error(405, 'POST required');
			if (config.url !== ORIGIN || !config.serviceKey) error(503, 'Storage unavailable');
			const expected = config.brokerToken?.trim() ?? '',
				authorization = request.headers.get('authorization') ?? '';
			if (!/^[A-Za-z0-9._~+/-]{32,512}={0,2}$/.test(expected) || expected.length > 512)
				error(503, 'Broker unavailable');
			if (
				!/^Bearer [A-Za-z0-9._~+/-]{32,512}={0,2}$/.test(authorization) ||
				authorization.length > 519 ||
				!timingSafeEqual(
					createHash('sha256').update(expected).digest(),
					createHash('sha256').update(authorization.slice(7)).digest()
				)
			)
				error(401, 'Authentication required');
			if (new URL(request.url).search) error(400, 'Query unsupported');
			if (
				request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !==
				'application/json'
			)
				error(415, 'JSON required');
			const length = request.headers.get('content-length');
			if (length !== null && (!/^\d+$/.test(length) || Number(length) > 2048))
				error(413, 'Body limit');
			if (busy) error(429, 'Publication busy');
			const signal = AbortSignal.any([request.signal, timeout.signal]);
			const deadline = performance.now() + 20000;
			let leaseDeadline = Infinity;
			const check = () => {
				if (performance.now() >= deadline || Date.now() >= leaseDeadline) timeout.abort();
				signal.throwIfAborted();
			};
			timer = setTimeout(() => timeout.abort(), 20000);
			const interrupted = new Promise<never>((_resolve, reject) => {
				const cancel = () => reject(new Error('Publication interrupted'));
				signal.addEventListener('abort', cancel, { once: true });
				detach = () => signal.removeEventListener('abort', cancel);
			});
			const fetchImpl = config.fetchImpl ?? fetch;
			const provider = async (path: string, body?: unknown) => {
				check();
				const headers: Record<string, string> = {
					Authorization: `Bearer ${config.serviceKey}`,
					apikey: config.serviceKey,
					Accept: 'application/json',
					'Content-Type': 'application/json'
				};
				if (path.startsWith('/rest/')) {
					headers['Accept-Profile'] = 'libri';
					headers['Content-Profile'] = 'libri';
				}
				if (path.startsWith('/storage/v1/object/upload/sign/'))
					headers['x-upsert'] = 'false';
				const response = await fetchImpl(ORIGIN + path, {
					method: body === undefined ? 'GET' : 'POST',
					headers,
					body: body === undefined ? undefined : JSON.stringify(body),
					redirect: 'error',
					cache: 'no-store',
					signal
				});
				try {
					check();
					if (!response.ok || response.redirected || response.status !== 200)
						error(503, 'Provider unavailable');
					if (
						response.headers
							.get('content-type')
							?.split(';', 1)[0]
							?.trim()
							.toLowerCase() !== 'application/json'
					)
						error(503, 'Provider invalid');
					const result = await readJson(response.body, 16384, signal);
					check();
					return result;
				} finally {
					if (response.body && !response.body.locked)
						void response.body.cancel().catch(() => undefined);
				}
			};
			busy = true;
			const work = (async () => {
				check();
				let input: unknown;
				try {
					input = await readJson(request.body, 2048, signal);
				} catch (cause) {
					if (isHttpError(cause) || signal.aborted) throw cause;
					error(400, 'Invalid JSON');
				}
				if (
					!object(input) ||
					!['prepare', 'finalize'].includes(String(input.action)) ||
					Object.keys(input).length !== (input.action === 'prepare' ? 6 : 7) ||
					input.libraryId !== LIBRARY ||
					!uuid(input.uploadId) ||
					!uuid(input.leaseToken) ||
					!Number.isSafeInteger(input.attempt) ||
					Number(input.attempt) < 1 ||
					Number(input.attempt) > 3 ||
					(input.action === 'finalize' && !uuid(input.publicationId))
				)
					error(400, 'Invalid request');
				const v = verified(input.verified),
					fence: Fence = {
						libraryId: LIBRARY,
						uploadId: input.uploadId,
						leaseToken: input.leaseToken,
						attempt: Number(input.attempt)
					};
				const args = {
					p_library_id: LIBRARY,
					p_upload_id: fence.uploadId,
					p_lease_token: fence.leaseToken,
					p_attempt: fence.attempt
				};
				const rpc = (name: string, body: unknown) => provider('/rest/v1/rpc/' + name, body);
				const authorize = async () => {
					const row = await rpc('authorize_image_upload_download', args);
					if (
						!object(row) ||
						row.library_id !== LIBRARY ||
						row.upload_id !== fence.uploadId ||
						row.lease_token !== fence.leaseToken ||
						row.attempt !== fence.attempt ||
						!uuid(row.book_id) ||
						row.bucket_id !== BUCKET ||
						row.object_path !==
							`${LIBRARY}/uploads/${fence.uploadId}/original.${extension(v.mimeType)}` ||
						row.mime_type !== v.mimeType ||
						row.byte_size !== v.byteSize ||
						row.sha256 !== v.sha256 ||
						typeof row.expires_at !== 'string' ||
						row.expires_at.length > 64
					)
						error(409, 'Lease unavailable');
					const expiry = Date.parse(row.expires_at);
					if (
						!Number.isFinite(expiry) ||
						expiry <= Date.now() + 2000 ||
						expiry > Date.now() + 92000
					)
						error(409, 'Lease unavailable');
					leaseDeadline = Math.min(leaseDeadline, expiry - 2000);
					check();
					clearTimeout(timer);
					timer = setTimeout(
						() => timeout.abort(),
						Math.min(deadline - performance.now(), leaseDeadline - Date.now())
					);
					return { bookId: row.book_id, expiry };
				};
				const complete = async (publicationId: string, objectId: string) => {
					const result = await rpc('finalize_image_upload_publication', {
						...args,
						p_publication_id: publicationId,
						p_storage_object_id: objectId,
						p_verified: v
					});
					if (
						!object(result) ||
						result.publication_id !== publicationId ||
						result.image_id !== publicationId ||
						result.source_id !== publicationId ||
						result.status !== 'published' ||
						typeof result.already_published !== 'boolean'
					)
						error(409, 'Completion unavailable');
					check();
					return json(result, { headers: HEADERS });
				};
				if (input.action === 'finalize') {
					const query = new URLSearchParams({
						select: 'id,status,storage_object_id,verified_metadata',
						id: `eq.${input.publicationId}`,
						library_id: `eq.${LIBRARY}`,
						upload_id: `eq.${fence.uploadId}`,
						lease_token: `eq.${fence.leaseToken}`,
						attempt: `eq.${fence.attempt}`,
						limit: '1'
					});
					const rows = await provider('/rest/v1/image_upload_publications?' + query);
					if (
						!Array.isArray(rows) ||
						rows.length !== 1 ||
						!object(rows[0]) ||
						rows[0].id !== input.publicationId ||
						!sameVerified(rows[0].verified_metadata, v)
					)
						error(409, 'Publication unavailable');
					if (rows[0].status === 'published') {
						if (!uuid(rows[0].storage_object_id)) error(503, 'Invalid stored receipt');
						return complete(String(input.publicationId), rows[0].storage_object_id);
					}
					if (rows[0].status !== 'prepared') error(409, 'Publication unavailable');
				}
				const first = await authorize();
				const publication = prepared(
					await rpc('prepare_image_upload_publication', { ...args, p_verified: v }),
					fence,
					v
				);
				if (publication.book_id !== first.bookId) error(409, 'Identity changed');
				if (input.action === 'prepare') {
					const signed = capability(
						await provider(
							`/storage/v1/object/upload/sign/${BUCKET}/${publication.object_path}`,
							{}
						),
						publication.object_path
					);
					const second = await authorize();
					if (first.bookId !== second.bookId || first.expiry !== second.expiry)
						error(409, 'Authority changed');
					check();
					return json(
						{
							preparation: publication,
							...signed,
							leaseExpiresAt: new Date(first.expiry).toISOString()
						},
						{ headers: HEADERS }
					);
				}
				if (publication.publication_id !== input.publicationId)
					error(409, 'Identity changed');
				const info = async () => {
					const row = await provider(
						`/storage/v1/object/info/${BUCKET}/${publication.object_path}`
					);
					if (
						!object(row) ||
						!uuid(row.id) ||
						row.name !== publication.object_path ||
						row.bucket_id !== BUCKET ||
						typeof row.version !== 'string' ||
						row.version.length < 1 ||
						row.version.length > 200 ||
						row.size !== v.byteSize ||
						row.content_type !== v.mimeType ||
						row.cache_control !== 'max-age=0'
					)
						error(409, 'Stored object unavailable');
					return { id: row.id, version: row.version };
				};
				const before = await info();
				check();
				const response = await fetchImpl(
					`${ORIGIN}/storage/v1/object/authenticated/${BUCKET}/${publication.object_path}`,
					{
						headers: {
							Authorization: `Bearer ${config.serviceKey}`,
							apikey: config.serviceKey,
							'Cache-Control': 'no-cache',
							'Accept-Encoding': 'identity'
						},
						redirect: 'error',
						cache: 'no-store',
						signal
					}
				);
				try {
					check();
					const size = response.headers.get('content-length'),
						encoding = response.headers.get('content-encoding');
					if (
						response.status !== 200 ||
						response.redirected ||
						response.headers.has('content-range') ||
						(encoding !== null && encoding !== 'identity') ||
						response.headers.get('content-type') !== v.mimeType ||
						(size !== null && (!/^\d+$/.test(size) || Number(size) !== v.byteSize))
					)
						error(409, 'Stored bytes unavailable');
					const hash = createHash('sha256');
					const actual = await consume(
						response.body,
						v.byteSize,
						65536,
						signal,
						(chunk) => {
							check();
							hash.update(chunk);
						}
					);
					if (actual !== v.byteSize || hash.digest('hex') !== v.sha256)
						error(409, 'Stored bytes changed');
					check();
				} finally {
					if (response.body && !response.body.locked)
						void response.body.cancel().catch(() => undefined);
				}
				const after = await info();
				if (before.id !== after.id || before.version !== after.version)
					error(409, 'Stored object changed');
				const last = await authorize();
				if (first.bookId !== last.bookId || first.expiry !== last.expiry)
					error(409, 'Authority changed');
				return complete(publication.publication_id, after.id);
			})();
			void work.then(
				() => {
					busy = false;
				},
				() => {
					busy = false;
				}
			);
			return await Promise.race([work, interrupted]);
		} catch (cause) {
			return json(
				{ error: 'Upload publication unavailable' },
				{ status: isHttpError(cause) ? cause.status : 503, headers: HEADERS }
			);
		} finally {
			clearTimeout(timer);
			detach();
			timeout.abort();
		}
	};
}
export const publishLibriUpload = createLibriUploadPublicationBroker();
