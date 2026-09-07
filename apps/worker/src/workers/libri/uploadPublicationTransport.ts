// Trusted configuration only. Small broker requests; exact verified bytes go directly to Storage.
import { type LibriPublicationPorts, createLibriUploadPublisher } from './uploadPublication';

const ORIGIN = 'https://iwifjtlebphefldmwbkh.supabase.co';
const PATH = '/api/internal/libri/uploads/publish';
const object = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);
const fail = (): never => {
	throw new Error('Publication transport unavailable');
};
async function read(response: Response, signal: AbortSignal) {
	if (
		response.status !== 200 ||
		response.redirected ||
		!response.body ||
		response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !==
			'application/json'
	)
		fail();
	const length = response.headers.get('content-length');
	if (length !== null && (!/^\d+$/.test(length) || Number(length) > 16384)) fail();
	const reader = response.body!.getReader(),
		decoder = new TextDecoder('utf-8', { fatal: true });
	let text = '',
		size = 0,
		chunks = 0;
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
			if (!(next.value instanceof Uint8Array) || ++chunks > 512) fail();
			size += next.value.byteLength;
			if (size > 16384) fail();
			text += decoder.decode(next.value, { stream: true });
		}
		return JSON.parse(text + decoder.decode()) as unknown;
	} finally {
		signal.removeEventListener('abort', cancel);
		cancel();
		reader.releaseLock();
	}
}
function capability(value: unknown, leaseExpiresAt: string) {
	if (
		!object(value) ||
		Object.keys(value).length !== 4 ||
		!object(value.preparation) ||
		typeof value.uploadUrl !== 'string' ||
		value.uploadUrl.length > 4096 ||
		typeof value.capabilityExpiresAt !== 'string' ||
		value.capabilityExpiresAt.length > 64 ||
		typeof value.leaseExpiresAt !== 'string' ||
		Date.parse(value.leaseExpiresAt) !== Date.parse(leaseExpiresAt)
	)
		return fail();
	const url = new URL(value.uploadUrl),
		token = url.searchParams.get('token') ?? '';
	if (
		url.origin !== ORIGIN ||
		url.href !== value.uploadUrl ||
		url.username ||
		url.password ||
		url.hash ||
		url.searchParams.size !== 1 ||
		url.pathname !==
			`/storage/v1/object/upload/sign/libri-assets/${value.preparation.object_path}` ||
		!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
	)
		return fail();
	const payload: unknown = JSON.parse(
		Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')
	);
	const expiry = Date.parse(value.capabilityExpiresAt);
	if (
		!object(payload) ||
		payload.url !== `libri-assets/${value.preparation.object_path}` ||
		payload.upsert !== false ||
		(payload.scope !== undefined && payload.scope !== 'upload') ||
		!Number.isSafeInteger(payload.exp) ||
		Number(payload.exp) * 1000 !== expiry ||
		expiry <= Date.now() + 60000 ||
		expiry > Date.now() + 7205000
	)
		return fail();
	return {
		preparation: value.preparation,
		url: url.href,
		expiresAt: Math.min(expiry, Date.parse(leaseExpiresAt) - 2000)
	};
}
/** No service credential, retry, SQL attestation or cleanup authority. The server obtains
 * the Storage ID independently, hashes the stored bytes and rechecks the lease before commit.
 * Construct once per dedicated worker process; the coordinator supplies timeout/capacity control.
 */
export function createLibriUploadPublicationTransport(options: {
	endpointUrl: string;
	bearerToken: string;
	fetchImpl?: typeof fetch;
}) {
	const endpoint = new URL(options.endpointUrl),
		token = options.bearerToken.trim();
	if (
		endpoint.protocol !== 'https:' ||
		endpoint.username ||
		endpoint.password ||
		endpoint.hash ||
		endpoint.search ||
		endpoint.pathname !== PATH ||
		endpoint.href !== options.endpointUrl ||
		!/^[A-Za-z0-9._~+/-]{32,512}={0,2}$/.test(token) ||
		token.length > 512
	)
		throw new Error('Invalid publication broker configuration');
	const fetchImpl = options.fetchImpl ?? fetch;
	let grant: ReturnType<typeof capability> | undefined;
	const fetchJson = async (url: string, init: RequestInit, signal: AbortSignal) => {
		signal.throwIfAborted();
		const response = await fetchImpl(url, {
			...init,
			redirect: 'error',
			credentials: 'omit',
			cache: 'no-store',
			signal
		});
		try {
			signal.throwIfAborted();
			return await read(response, signal);
		} finally {
			if (response.body && !response.body.locked)
				void response.body.cancel().catch(() => undefined);
		}
	};
	const broker = (body: unknown, signal: AbortSignal) =>
		fetchJson(
			endpoint.href,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify(body)
			},
			signal
		);
	const fence = (claim: Parameters<LibriPublicationPorts['prepare']>[0]['claim']) => ({
		libraryId: claim.libraryId,
		uploadId: claim.uploadId,
		leaseToken: claim.leaseToken,
		attempt: claim.attempt
	});
	return createLibriUploadPublisher({
		prepare: async ({ claim, verified, signal }) => {
			grant = undefined;
			const value = await broker({ action: 'prepare', ...fence(claim), verified }, signal);
			grant = capability(value, claim.leaseExpiresAt);
			return grant.preparation;
		},
		createObject: async ({ publication, bytes, verified, upsert, signal }) => {
			const owned = grant;
			grant = undefined; // single use even on a failed/unknown upload
			if (
				!owned ||
				upsert !== false ||
				owned.preparation.publication_id !== publication.publicationId ||
				owned.preparation.object_path !== publication.objectPath ||
				Date.now() >= owned.expiresAt
			)
				return fail();
			// No machine Authorization/apikey header ever travels to this signed Storage URL.
			const result = await fetchJson(
				owned.url,
				{
					method: 'PUT',
					headers: {
						'Content-Type': verified.mimeType,
						'Cache-Control': 'max-age=0',
						'x-upsert': 'false'
					},
					body: new Uint8Array(bytes)
				},
				signal
			);
			if (
				Date.now() >= owned.expiresAt ||
				!object(result) ||
				result.Key !== `libri-assets/${publication.objectPath}`
			)
				return fail();
			return { objectPath: publication.objectPath };
		},
		finalize: ({ claim, publicationId, verified, signal }) =>
			broker({ action: 'finalize', ...fence(claim), publicationId, verified }, signal)
	});
}
