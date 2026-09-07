import {
	type LibriUploadDownloadAuthorizer,
	LibriUploadDownloadError,
	type LibriUploadDownloadGrant,
	reviewLibriUploadDownloadGrant
} from './uploadImageDownload';

const PATH = '/api/internal/libri/uploads/download';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fail = (code: string, retryable = false): never => {
	throw new LibriUploadDownloadError(code, retryable);
};

/** Trusted configuration only: never take endpoint/token/origin from a job.
 * Compose with the shared downloader. No automatic retries or service key.
 */
export function createLibriUploadDownloadAuthorizer(options: {
	endpointUrl: string;
	storageOrigin: string;
	bearerToken: string;
	fetchImpl?: typeof fetch;
}): LibriUploadDownloadAuthorizer {
	let endpoint: URL, origin: URL;
	try {
		endpoint = new URL(options.endpointUrl);
		origin = new URL(options.storageOrigin);
		for (const url of [endpoint, origin])
			if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
				throw new Error();
		if (
			endpoint.pathname !== PATH ||
			endpoint.href !== options.endpointUrl ||
			origin.origin !== options.storageOrigin
		)
			throw new Error();
	} catch {
		throw new Error(
			'Libri download broker requires canonical HTTPS endpoint and Storage origin'
		);
	}
	const token = typeof options.bearerToken === 'string' ? options.bearerToken.trim() : '';
	if (!/^[A-Za-z0-9._~+/-]{32,512}={0,2}$/.test(token) || token.length > 512)
		throw new Error('Invalid Libri download broker credential');
	const fetchImpl = options.fetchImpl ?? fetch;
	return async ({ claim, signal: caller }) => {
		if (
			!(caller instanceof AbortSignal) ||
			!claim ||
			![claim.libraryId, claim.uploadId, claim.leaseToken].every(
				(id) => typeof id === 'string' && UUID.test(id)
			) ||
			!Number.isSafeInteger(claim.attempt) ||
			claim.attempt < 1 ||
			claim.attempt > 3
		)
			fail('invalid_download_authorization_input');
		const target = Object.freeze({ ...claim });
		const body = JSON.stringify({
			libraryId: claim.libraryId,
			uploadId: claim.uploadId,
			leaseToken: claim.leaseToken,
			attempt: claim.attempt
		});
		const remaining = Date.parse(claim.leaseExpiresAt) - Date.now() - 2000;
		if (!Number.isFinite(remaining) || remaining <= 0) fail('download_lease_expired');
		const timeout = new AbortController(),
			signal = AbortSignal.any([caller, timeout.signal]);
		const budget = Math.min(5000, remaining),
			deadline = performance.now() + budget;
		const timer = setTimeout(() => timeout.abort(), budget);
		const check = () => {
			if (performance.now() >= deadline) timeout.abort();
			if (signal.aborted)
				fail(caller.aborted ? 'download_aborted' : 'download_authorization_timeout', true);
		};
		let cancel: () => void = () => {};
		const interrupted = new Promise<never>((_resolve, reject) => {
			cancel = () =>
				reject(
					new LibriUploadDownloadError(
						caller.aborted ? 'download_aborted' : 'download_authorization_timeout',
						true
					)
				);
			signal.addEventListener('abort', cancel, { once: true });
		});
		const work = async () => {
			check();
			const response = await fetchImpl(endpoint.href, {
				method: 'POST',
				redirect: 'error',
				credentials: 'omit',
				cache: 'no-store',
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/json',
					'Content-Type': 'application/json'
				},
				body,
				signal
			});
			try {
				check();
				if (response.status !== 200 || response.redirected)
					fail(
						'download_authorization_unavailable',
						response.status === 429 || response.status >= 500
					);
				if (
					response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !==
					'application/json'
				)
					fail('invalid_download_authorization_response');
				const length = response.headers.get('content-length');
				if (length !== null && (!/^\d+$/.test(length) || Number(length) > 8192))
					fail('invalid_download_authorization_response');
				const payload: unknown = JSON.parse(await boundedText(response.body, signal));
				check();
				if (
					!payload ||
					typeof payload !== 'object' ||
					Array.isArray(payload) ||
					Object.keys(payload).length !== 2 ||
					!Object.hasOwn(payload, 'signedUrl') ||
					!Object.hasOwn(payload, 'expiresAt')
				)
					fail('invalid_download_authorization_response');
				const approved = reviewLibriUploadDownloadGrant(
					payload as LibriUploadDownloadGrant,
					target,
					origin.origin,
					Date.now()
				);
				return {
					signedUrl: approved.signedUrl,
					expiresAt: new Date(approved.expiresAt).toISOString()
				};
			} finally {
				if (response.body && !response.body.locked)
					void response.body.cancel().catch(() => undefined);
			}
		};
		try {
			return await Promise.race([work(), interrupted]);
		} catch (cause) {
			if (cause instanceof LibriUploadDownloadError) throw cause;
			return fail('download_authorization_unavailable', true);
		} finally {
			clearTimeout(timer);
			signal.removeEventListener('abort', cancel);
			timeout.abort();
		}
	};
}

async function boundedText(body: ReadableStream<Uint8Array> | null, signal: AbortSignal) {
	if (!body) return fail('invalid_download_authorization_response');
	const reader = body.getReader(),
		decoder = new TextDecoder('utf-8', { fatal: true });
	const cancel = () => {
		void reader.cancel().catch(() => undefined);
	};
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
			if (++chunks > 512 || !(next.value instanceof Uint8Array))
				fail('invalid_download_authorization_response');
			size += next.value.byteLength;
			if (size > 8192) fail('invalid_download_authorization_response');
			text += decoder.decode(next.value, { stream: true });
		}
		return text + decoder.decode();
	} finally {
		signal.removeEventListener('abort', cancel);
		cancel();
		reader.releaseLock();
	}
}
