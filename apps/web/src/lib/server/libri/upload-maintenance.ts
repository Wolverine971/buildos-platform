// Exact-upload maintenance only. No caller paths, raw SQL, signing, or OCR authority.
import { error, isHttpError, json } from '@sveltejs/kit';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createLibriUploadCleanupExecutor } from './upload-cleanup';

const ORIGIN = 'https://iwifjtlebphefldmwbkh.supabase.co';
const LIBRARY = 'f09948c4-e4e0-581c-8689-7258bea2f501';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEADERS = {
	'Cache-Control': 'private, no-store',
	Vary: 'Authorization',
	'X-Content-Type-Options': 'nosniff'
};
const record = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
type Config = {
	enabled?: boolean;
	url: string;
	serviceKey: string;
	brokerToken?: string;
	fetchImpl?: typeof fetch;
};

async function readJson(
	body: ReadableStream<Uint8Array> | null,
	limit: number,
	signal: AbortSignal
) {
	if (!body) error(400, 'Body required');
	const reader = body.getReader(),
		decoder = new TextDecoder('utf-8', { fatal: true });
	let size = 0,
		chunks = 0,
		text = '';
	const cancel = () => {
		void reader.cancel().catch(() => undefined);
	};
	try {
		signal.addEventListener('abort', cancel, { once: true });
		signal.throwIfAborted();
		while (true) {
			const next = await reader.read();
			signal.throwIfAborted();
			if (next.done) break;
			if (
				!(next.value instanceof Uint8Array) ||
				++chunks > 128 ||
				(size += next.value.byteLength) > limit
			)
				error(413, 'Body limit');
			text += decoder.decode(next.value, { stream: true });
		}
		return JSON.parse(text + decoder.decode()) as unknown;
	} finally {
		signal.removeEventListener('abort', cancel);
		cancel();
		reader.releaseLock();
	}
}

/** One occupied operation per server instance, including after a timeout. SQL still
 * owns cross-instance locking, eligibility, the 27-hour delay, and protected images.
 * Every mutation is explicit; cleanup never implies quota release or permanent absence.
 */
export function createLibriUploadMaintenanceBroker() {
	let busy = false;
	let cleanup: ReturnType<typeof createLibriUploadCleanupExecutor> | undefined;
	return async (request: Request, supplied: Config): Promise<Response> => {
		const config = Object.freeze({ ...supplied });
		const timeout = new AbortController();
		let timer: ReturnType<typeof setTimeout> | undefined;
		let detach = () => {};
		try {
			if (config.enabled !== true) error(404, 'Disabled');
			if (request.method !== 'POST') error(405, 'POST required');
			if (config.url !== ORIGIN || !config.serviceKey) error(503, 'Unavailable');
			const token = config.brokerToken?.trim() ?? '',
				auth = request.headers.get('authorization') ?? '';
			if (!/^[A-Za-z0-9._~+/-]{32,512}={0,2}$/.test(token) || token.length > 512)
				error(503, 'Unavailable');
			if (
				!/^Bearer [A-Za-z0-9._~+/-]{32,512}={0,2}$/.test(auth) ||
				auth.length > 519 ||
				!timingSafeEqual(
					createHash('sha256').update(token).digest(),
					createHash('sha256').update(auth.slice(7)).digest()
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
			if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1024))
				error(413, 'Body limit');
			if (busy || cleanup?.isBusy()) error(429, 'Busy');
			const signal = AbortSignal.any([request.signal, timeout.signal]);
			const deadline = performance.now() + 25_000;
			const check = () => {
				if (performance.now() >= deadline) timeout.abort();
				signal.throwIfAborted();
			};
			timer = setTimeout(() => timeout.abort(), 25_000);
			const interrupted = new Promise<never>((_resolve, reject) => {
				const cancel = () => reject(new Error('Maintenance interrupted'));
				signal.addEventListener('abort', cancel, { once: true });
				detach = () => signal.removeEventListener('abort', cancel);
			});
			const fetchImpl = config.fetchImpl ?? fetch;
			const provider = async (path: string, body?: unknown) => {
				check();
				const response = await fetchImpl(ORIGIN + '/rest/v1/' + path, {
					method: body === undefined ? 'GET' : 'POST',
					redirect: 'error',
					cache: 'no-store',
					signal,
					headers: {
						Authorization: `Bearer ${config.serviceKey}`,
						apikey: config.serviceKey,
						'Content-Type': 'application/json',
						Accept: 'application/json',
						'Accept-Profile': 'libri',
						'Content-Profile': 'libri'
					},
					body: body === undefined ? undefined : JSON.stringify(body)
				});
				try {
					check();
					if (
						response.status !== 200 ||
						response.redirected ||
						response.headers
							.get('content-type')
							?.split(';', 1)[0]
							?.trim()
							.toLowerCase() !== 'application/json'
					)
						error(503, 'Invalid provider');
					const declared = response.headers.get('content-length');
					if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 4096))
						error(503, 'Invalid provider');
					let value: unknown;
					try {
						value = await readJson(response.body, 4096, signal);
					} catch {
						error(503, 'Invalid provider');
					}
					check();
					return value;
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
					input = await readJson(request.body, 1024, signal);
				} catch (cause) {
					if (isHttpError(cause) || signal.aborted) throw cause;
					error(400, 'Invalid JSON');
				}
				if (
					!record(input) ||
					!['retire', 'release_unissued', 'targets', 'cleanup'].includes(
						String(input.action)
					) ||
					input.libraryId !== LIBRARY ||
					!uuid(input.uploadId) ||
					Object.keys(input).length !== (input.action === 'cleanup' ? 5 : 3)
				)
					error(400, 'Invalid request');
				const uploadId = input.uploadId,
					action = String(input.action);
				const args = { p_library_id: LIBRARY, p_upload_id: uploadId };
				if (action === 'retire') {
					const receipt = await provider('rpc/retire_image_upload', args);
					if (receipt === null) return { action, uploadId, status: 'ineligible' };
					if (
						!record(receipt) ||
						receipt.upload_id !== uploadId ||
						receipt.library_id !== LIBRARY ||
						receipt.status !== 'cleanup_pending' ||
						!['expired', 'published'].includes(String(receipt.outcome)) ||
						!Number.isSafeInteger(receipt.target_count) ||
						Number(receipt.target_count) < 1 ||
						Number(receipt.target_count) > 4
					)
						error(503, 'Invalid receipt');
					return { action, uploadId, status: 'retired', outcome: receipt.outcome };
				}
				if (action === 'release_unissued') {
					const released = await provider('rpc/release_unissued_image_upload_slot', args);
					if (typeof released !== 'boolean') error(503, 'Invalid receipt');
					return { action, uploadId, status: released ? 'released' : 'retained' };
				}
				if (action === 'cleanup' && (!uuid(input.targetId) || !uuid(input.leaseToken)))
					error(400, 'Invalid request');
				const query = new URLSearchParams({
					select: 'id,library_id,upload_id',
					library_id: `eq.${LIBRARY}`,
					upload_id: `eq.${uploadId}`,
					limit: '5'
				});
				if (action === 'cleanup') query.set('id', `eq.${input.targetId}`);
				const rows = await provider('image_upload_cleanup_targets?' + query);
				if (
					!Array.isArray(rows) ||
					rows.length > 4 ||
					rows.some(
						(row) =>
							!record(row) ||
							!uuid(row.id) ||
							row.library_id !== LIBRARY ||
							row.upload_id !== uploadId
					) ||
					new Set(rows.map((row) => row.id)).size !== rows.length
				)
					error(503, 'Invalid targets');
				if (action === 'targets')
					return { action, uploadId, targetIds: rows.map((row) => row.id) };
				if (rows.length !== 1 || rows[0]?.id !== input.targetId)
					error(409, 'Target unavailable');
				cleanup = createLibriUploadCleanupExecutor({
					enabled: true,
					url: ORIGIN,
					serviceKey: config.serviceKey,
					fetchImpl
				});
				const result = await cleanup.run({
					libraryId: LIBRARY,
					targetId: String(input.targetId),
					leaseToken: String(input.leaseToken),
					signal
				});
				check();
				return { action, uploadId, ...result };
			})();
			void work.then(
				() => {
					busy = false;
				},
				() => {
					busy = false;
				}
			);
			const result = await Promise.race([work, interrupted]);
			check();
			return json(result, { headers: HEADERS });
		} catch (cause) {
			return json(
				{ error: 'Upload maintenance could not be confirmed' },
				{ status: isHttpError(cause) ? cause.status : 503, headers: HEADERS }
			);
		} finally {
			clearTimeout(timer);
			detach();
			timeout.abort();
		}
	};
}

export const maintainLibriUpload = createLibriUploadMaintenanceBroker();
