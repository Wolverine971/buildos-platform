// Machine credential only. No direct database, Storage, signing, or automatic retry.
const PATH = '/api/internal/libri/uploads/maintain';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const record = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
type Scope = { libraryId: string; uploadId: string };
export type LibriUploadMaintenanceCommand = Scope &
	(
		| { action: 'retire' | 'release_unissued' | 'targets' }
		| { action: 'cleanup'; targetId: string; leaseToken: string }
	);
export type LibriUploadMaintenanceReceipt = { uploadId: string } & (
	| { action: 'retire'; status: 'ineligible' }
	| { action: 'retire'; status: 'retired'; outcome: 'expired' | 'published' }
	| { action: 'release_unissued'; status: 'released' | 'retained' }
	| { action: 'targets'; targetIds: string[] }
	| {
			action: 'cleanup';
			targetId: string;
			status: 'unclaimed' | 'absent' | 'unavailable';
			mayHaveDeletedObject: boolean;
	  }
);
const fail = (): never => {
	throw new Error('Libri maintenance outcome unknown');
};

export function createLibriUploadMaintenanceTransport(options: {
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
		endpoint.search ||
		endpoint.hash ||
		endpoint.pathname !== PATH ||
		endpoint.href !== options.endpointUrl ||
		!/^[A-Za-z0-9._~+/-]{32,512}={0,2}$/.test(token) ||
		token.length > 512
	)
		throw new Error('Invalid maintenance broker configuration');
	const fetchImpl = options.fetchImpl ?? fetch;
	let busy = false;
	return {
		isBusy: () => busy,
		async request(
			input: LibriUploadMaintenanceCommand,
			caller: AbortSignal
		): Promise<LibriUploadMaintenanceReceipt> {
			if (
				busy ||
				!(caller instanceof AbortSignal) ||
				caller.aborted ||
				!input ||
				!uuid(input.libraryId) ||
				!uuid(input.uploadId) ||
				!['retire', 'release_unissued', 'targets', 'cleanup'].includes(input.action) ||
				Object.keys(input).length !== (input.action === 'cleanup' ? 5 : 3) ||
				(input.action === 'cleanup' && (!uuid(input.targetId) || !uuid(input.leaseToken)))
			)
				return fail();
			const command = Object.freeze({ ...input }),
				timeout = new AbortController();
			const signal = AbortSignal.any([caller, timeout.signal]),
				deadline = performance.now() + 25_000;
			const check = () => {
				if (performance.now() >= deadline) timeout.abort();
				signal.throwIfAborted();
			};
			const timer = setTimeout(() => timeout.abort(), 25_000);
			let detach = () => {};
			const interrupted = new Promise<never>((_resolve, reject) => {
				const cancel = () => reject(new Error('Libri maintenance outcome unknown'));
				signal.addEventListener('abort', cancel, { once: true });
				detach = () => signal.removeEventListener('abort', cancel);
			});
			busy = true;
			const work = (async (): Promise<LibriUploadMaintenanceReceipt> => {
				check();
				const response = await fetchImpl(endpoint.href, {
					method: 'POST',
					redirect: 'error',
					credentials: 'omit',
					cache: 'no-store',
					signal,
					headers: {
						Authorization: `Bearer ${token}`,
						Accept: 'application/json',
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(command)
				});
				try {
					check();
					if (
						response.status !== 200 ||
						response.redirected ||
						!response.body ||
						response.headers
							.get('content-type')
							?.split(';', 1)[0]
							?.trim()
							.toLowerCase() !== 'application/json'
					)
						return fail();
					const length = response.headers.get('content-length');
					if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1024))
						return fail();
					const reader = response.body.getReader(),
						decoder = new TextDecoder('utf-8', { fatal: true });
					const cancel = () => {
						void reader.cancel().catch(() => undefined);
					};
					let size = 0,
						chunks = 0,
						text = '';
					try {
						signal.addEventListener('abort', cancel, { once: true });
						check();
						while (true) {
							const next = await reader.read();
							check();
							if (next.done) break;
							if (
								!(next.value instanceof Uint8Array) ||
								++chunks > 128 ||
								(size += next.value.byteLength) > 1024
							)
								return fail();
							text += decoder.decode(next.value, { stream: true });
						}
					} finally {
						signal.removeEventListener('abort', cancel);
						cancel();
						reader.releaseLock();
					}
					const result: unknown = JSON.parse(text + decoder.decode());
					if (
						!record(result) ||
						result.action !== command.action ||
						result.uploadId !== command.uploadId
					)
						return fail();
					const count = Object.keys(result).length;
					if (command.action === 'retire') {
						if (result.status === 'ineligible' && count === 3)
							return {
								action: 'retire',
								uploadId: command.uploadId,
								status: 'ineligible'
							};
						if (
							result.status === 'retired' &&
							count === 4 &&
							(result.outcome === 'expired' || result.outcome === 'published')
						)
							return {
								action: 'retire',
								uploadId: command.uploadId,
								status: 'retired',
								outcome: result.outcome
							};
					} else if (command.action === 'release_unissued') {
						if (
							count === 3 &&
							(result.status === 'released' || result.status === 'retained')
						)
							return {
								action: 'release_unissued',
								uploadId: command.uploadId,
								status: result.status
							};
					} else if (command.action === 'targets') {
						if (
							count === 3 &&
							Array.isArray(result.targetIds) &&
							result.targetIds.length <= 4 &&
							result.targetIds.every(uuid) &&
							new Set(result.targetIds).size === result.targetIds.length
						)
							return {
								action: 'targets',
								uploadId: command.uploadId,
								targetIds: [...result.targetIds]
							};
					} else if (
						command.action === 'cleanup' &&
						count === 5 &&
						result.targetId === command.targetId &&
						(result.status === 'absent' ||
							result.status === 'unclaimed' ||
							result.status === 'unavailable') &&
						typeof result.mayHaveDeletedObject === 'boolean' &&
						!(result.status === 'unclaimed' && result.mayHaveDeletedObject)
					) {
						return {
							action: 'cleanup',
							uploadId: command.uploadId,
							targetId: command.targetId,
							status: result.status,
							mayHaveDeletedObject: result.mayHaveDeletedObject
						};
					}
					return fail();
				} finally {
					if (response.body && !response.body.locked)
						void response.body.cancel().catch(() => undefined);
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
				return fail();
			} finally {
				clearTimeout(timer);
				detach();
				timeout.abort();
			}
		}
	};
}
