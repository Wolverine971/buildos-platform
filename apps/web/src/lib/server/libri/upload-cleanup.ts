// apps/web/src/lib/server/libri/upload-cleanup.ts
// Trusted server composition only. No route, automatic consumer or worker service key.
const ORIGIN = 'https://iwifjtlebphefldmwbkh.supabase.co';
const LIBRARY = 'f09948c4-e4e0-581c-8689-7258bea2f501';
const BUCKET = 'libri-assets';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const record = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const fail = (): never => {
	throw new Error('Libri cleanup unavailable');
};
type Input = { libraryId: string; targetId: string; leaseToken: string; signal: AbortSignal };
type Config = { enabled?: boolean; url: string; serviceKey: string; fetchImpl?: typeof fetch };
export type LibriCleanupResult = {
	status: 'unclaimed' | 'absent' | 'unavailable';
	targetId: string;
	mayHaveDeletedObject: boolean;
};

async function jsonBody(response: Response, signal: AbortSignal) {
	if (
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
				++chunks > 512 ||
				(size += next.value.byteLength) > 16384
			)
				fail();
			text += decoder.decode(next.value, { stream: true });
		}
		return JSON.parse(text + decoder.decode()) as unknown;
	} finally {
		signal.removeEventListener('abort', cancel);
		cancel();
		reader.releaseLock();
	}
}
function claim(value: unknown, input: Pick<Input, 'libraryId' | 'targetId' | 'leaseToken'>) {
	if (
		!record(value) ||
		Object.keys(value).length !== 10 ||
		value.target_id !== input.targetId ||
		value.library_id !== LIBRARY ||
		value.lease_token !== input.leaseToken ||
		!uuid(value.upload_id) ||
		value.bucket_id !== BUCKET ||
		!Number.isSafeInteger(value.generation) ||
		Number(value.generation) < 1 ||
		Number(value.generation) > 1000000 ||
		typeof value.lease_expires_at !== 'string' ||
		value.lease_expires_at.length > 64 ||
		typeof value.object_path !== 'string'
	)
		return fail();
	const owner =
		value.kind === 'staging' && value.publication_id === null
			? value.upload_id
			: value.kind === 'unpublished' && uuid(value.publication_id)
				? value.publication_id
				: null;
	const prefix = value.kind === 'staging' ? 'uploads' : 'images';
	if (
		!owner ||
		!['jpeg', 'png', 'webp'].some(
			(ext) => value.object_path === `${LIBRARY}/${prefix}/${owner}/original.${ext}`
		)
	)
		return fail();
	const expiry = Date.parse(value.lease_expires_at);
	if (!Number.isFinite(expiry) || expiry <= Date.now() + 2000 || expiry > Date.now() + 62000)
		return fail();
	return Object.freeze({
		targetId: input.targetId,
		uploadId: value.upload_id,
		publicationId: value.publication_id,
		kind: value.kind,
		path: value.object_path,
		generation: Number(value.generation),
		expiry
	});
}

/** One target and one deletion maximum per invocation. Default-off at two boundaries:
 * caller configuration AND the database cleanup switch. Failures never release quota,
 * erase tombstones or retry a delete. SQL receives absence only after independent INFO.
 */
export function createLibriUploadCleanupExecutor(config: Config) {
	config = Object.freeze({ ...config });
	let busy = false;
	return {
		isBusy: () => busy,
		async run(input: Input): Promise<LibriCleanupResult> {
			if (
				busy ||
				config.enabled !== true ||
				config.url !== ORIGIN ||
				!config.serviceKey ||
				input.libraryId !== LIBRARY ||
				!uuid(input.targetId) ||
				!uuid(input.leaseToken) ||
				!(input.signal instanceof AbortSignal) ||
				input.signal.aborted
			)
				fail();
			const identity = Object.freeze({
				libraryId: LIBRARY,
				targetId: input.targetId,
				leaseToken: input.leaseToken
			});
			const fetchImpl = config.fetchImpl ?? fetch,
				timeout = new AbortController(),
				signal = AbortSignal.any([input.signal, timeout.signal]);
			const deadline = performance.now() + 20000;
			let leaseDeadline = Infinity,
				mayHaveDeletedObject = false;
			let timer = setTimeout(() => timeout.abort(), 20000);
			const check = () => {
				if (performance.now() >= deadline || Date.now() >= leaseDeadline) timeout.abort();
				signal.throwIfAborted();
			};
			const api = async (path: string, method = 'GET', body?: unknown) => {
				check();
				const response = await fetchImpl(ORIGIN + path, {
					method,
					headers: {
						Authorization: `Bearer ${config.serviceKey}`,
						apikey: config.serviceKey,
						'Content-Type': 'application/json',
						Accept: 'application/json',
						'Accept-Profile': 'libri',
						'Content-Profile': 'libri',
						'Cache-Control': 'no-cache'
					},
					body: body === undefined ? undefined : JSON.stringify(body),
					redirect: 'error',
					cache: 'no-store',
					signal
				});
				try {
					check();
					const value = await jsonBody(response, signal);
					check();
					return { status: response.status, value };
				} finally {
					if (response.body && !response.body.locked)
						void response.body.cancel().catch(() => undefined);
				}
			};
			const rpc = async (name: string, args: unknown) => {
				const r = await api('/rest/v1/rpc/' + name, 'POST', args);
				if (r.status !== 200) fail();
				return r.value;
			};
			const base = {
				p_library_id: LIBRARY,
				p_target_id: identity.targetId,
				p_lease_token: identity.leaseToken
			};
			let rejectInterrupted = () => {};
			const interrupted = new Promise<never>((_resolve, reject) => {
				rejectInterrupted = () => reject(new Error('Libri cleanup interrupted'));
				signal.addEventListener('abort', rejectInterrupted, { once: true });
			});
			busy = true;
			const work = (async () => {
				const value = await rpc('claim_image_upload_cleanup', base);
				if (value === null)
					return {
						status: 'unclaimed' as const,
						targetId: identity.targetId,
						mayHaveDeletedObject
					};
				const owned = claim(value, identity);
				leaseDeadline = owned.expiry - 2000;
				check();
				clearTimeout(timer);
				timer = setTimeout(
					() => timeout.abort(),
					Math.min(deadline - performance.now(), leaseDeadline - Date.now())
				);
				const fence = { ...base, p_generation: owned.generation };
				const authorize = async () => {
					const current = claim(
						await rpc('authorize_image_upload_cleanup', fence),
						identity
					);
					if (JSON.stringify(current) !== JSON.stringify(owned)) fail();
					check();
				};
				const finish = async (outcome: 'absent' | 'unavailable') => {
					if (
						(await rpc('finish_image_upload_cleanup', {
							...fence,
							p_outcome: outcome
						})) !== true
					)
						fail();
					return { status: outcome, targetId: identity.targetId, mayHaveDeletedObject };
				};
				try {
					// Missing-object responses can conceal authorization failures. Independently
					// prove this service credential can inspect the exact private bucket first.
					const bucket = await api('/storage/v1/bucket/' + BUCKET);
					if (
						bucket.status !== 200 ||
						!record(bucket.value) ||
						bucket.value.id !== BUCKET ||
						bucket.value.public !== false
					)
						fail();
					const info = async () => {
						const r = await api(`/storage/v1/object/info/${BUCKET}/${owned.path}`);
						if (
							(r.status === 404 || r.status === 400) &&
							record(r.value) &&
							r.value.code === 'NoSuchKey' &&
							(r.value.statusCode === undefined
								? r.status === 404
								: String(r.value.statusCode) === '404')
						)
							return null;
						if (
							r.status !== 200 ||
							!record(r.value) ||
							!uuid(r.value.id) ||
							r.value.name !== owned.path ||
							r.value.bucket_id !== BUCKET ||
							typeof r.value.version !== 'string' ||
							r.value.version.length < 1 ||
							r.value.version.length > 200
						)
							return fail();
						return { id: r.value.id, version: r.value.version };
					};
					await authorize();
					const before = await info();
					if (before) {
						await authorize();
						mayHaveDeletedObject = true; // includes unknown provider completion after abort
						const removed = await api('/storage/v1/object/' + BUCKET, 'DELETE', {
							prefixes: [owned.path]
						});
						// Empty/bad/mismatched receipts cannot justify a success. Even an exact
						// receipt still requires the separate post-delete missing-object check.
						if (
							removed.status !== 200 ||
							!Array.isArray(removed.value) ||
							removed.value.length !== 1 ||
							!record(removed.value[0]) ||
							removed.value[0].id !== before.id ||
							removed.value[0].name !== owned.path ||
							removed.value[0].bucket_id !== BUCKET
						)
							fail();
						if ((await info()) !== null) fail();
					}
					await authorize();
					return await finish('absent');
				} catch {
					check();
					// A failed provider call gets a ten-minute DB backoff, never an absence receipt.
					// If even settlement is uncertain, leave the lease to expire for reconciliation.
					return await finish('unavailable');
				}
			})();
			void work.then(
				() => {
					busy = false;
				},
				() => {
					busy = false;
				}
			);
			try {
				return await Promise.race([work, interrupted]);
			} catch {
				throw new Error(
					mayHaveDeletedObject
						? 'Libri cleanup outcome unknown'
						: 'Libri cleanup unavailable'
				);
			} finally {
				clearTimeout(timer);
				signal.removeEventListener('abort', rejectInterrupted);
				timeout.abort();
			}
		}
	};
}
