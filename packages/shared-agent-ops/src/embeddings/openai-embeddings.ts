// packages/shared-agent-ops/src/embeddings/openai-embeddings.ts
//
// Hardened embeddings client for the semantic discovery pipeline (batching +
// retry). Routes only through OpenRouter, whose /api/v1/embeddings endpoint
// serves OpenAI text-embedding-3-small. Every request requires zero data
// retention (tasker 103), which lands on Azure's endpoint with identical
// vectors. There is no direct-OpenAI route: it would bypass ZDR. Dimensions
// are pinned by the model: text-embedding-3-small = 1536, matching
// onto_embeddings.embedding. The canonical stored model name stays
// 'text-embedding-3-small'.

export const ONTO_EMBEDDING_MODEL = 'text-embedding-3-small';
export const ONTO_EMBEDDING_DIMENSIONS = 1536;

export const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';
/** OpenRouter namespaces provider models; the vectors are identical. */
export const OPENROUTER_EMBEDDING_REQUEST_MODEL = `openai/${ONTO_EMBEDDING_MODEL}`;
/**
 * Same policy as OPENROUTER_PRIVATE_PROVIDER in @buildos/smart-llm, which this
 * package does not depend on.
 */
export const OPENROUTER_EMBEDDINGS_PROVIDER = Object.freeze({
	data_collection: 'deny' as const,
	zdr: true as const
});
const MAX_BATCH_SIZE = 96;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 750;

export class OpenAiEmbeddingsError extends Error {
	readonly name = 'OpenAiEmbeddingsError';
	readonly status: number | null;
	readonly retryable: boolean;

	constructor(message: string, options: { status?: number | null; retryable?: boolean } = {}) {
		super(message);
		this.status = options.status ?? null;
		this.retryable = options.retryable ?? false;
	}
}

export type OpenAiEmbeddingsClient = {
	/** Embed a batch of texts, preserving input order. */
	embed(texts: string[], options?: { signal?: AbortSignal }): Promise<number[][]>;
	/** Embed a single text (query-side convenience). */
	embedOne(text: string, options?: { signal?: AbortSignal }): Promise<number[]>;
};

/** Bound injected transports too, and never start work after cancellation. */
function withSignal<T>(signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T> {
	signal?.throwIfAborted();
	if (!signal) return run();
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			cleanup();
			reject(signal.reason);
		};
		const cleanup = () => signal.removeEventListener('abort', onAbort);
		signal.addEventListener('abort', onAbort, { once: true });
		void Promise.resolve()
			.then(() => {
				signal.throwIfAborted();
				return run();
			})
			.then(
				(value) => {
					cleanup();
					resolve(value);
				},
				(error) => {
					cleanup();
					reject(error);
				}
			);
	});
}

type FetchLike = (
	input: string,
	init?: Record<string, unknown>
) => Promise<{
	ok: boolean;
	status: number;
	text(): Promise<string>;
	json(): Promise<unknown>;
}>;

export function createOpenAiEmbeddingsClient(options: {
	apiKey: string;
	fetchImpl?: FetchLike;
	model?: string;
	url?: string;
	/** MRL truncation for models whose native dims exceed the schema's 1536. */
	dimensions?: number;
	sleep?: (ms: number) => Promise<void>;
}): OpenAiEmbeddingsClient {
	const apiKey = options.apiKey.trim();
	if (!apiKey) {
		throw new OpenAiEmbeddingsError('Embeddings require a non-empty API key');
	}
	const fetchImpl: FetchLike = options.fetchImpl ?? (fetch as unknown as FetchLike);
	const model = options.model ?? OPENROUTER_EMBEDDING_REQUEST_MODEL;
	const url = options.url ?? OPENROUTER_EMBEDDINGS_URL;
	const dimensions = options.dimensions;
	async function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			await withSignal(signal, () =>
				options.sleep
					? options.sleep(ms)
					: new Promise<void>((resolve) => {
							timer = setTimeout(resolve, ms);
						})
			);
		} finally {
			if (timer !== undefined) clearTimeout(timer);
		}
	}

	async function requestBatch(texts: string[], signal?: AbortSignal): Promise<number[][]> {
		let lastError: OpenAiEmbeddingsError | null = null;
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
			signal?.throwIfAborted();
			try {
				const response = await withSignal(signal, () =>
					fetchImpl(url, {
						method: 'POST',
						...(signal ? { signal } : {}),
						headers: {
							Authorization: `Bearer ${apiKey}`,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							model,
							input: texts,
							...(dimensions ? { dimensions } : {}),
							provider: OPENROUTER_EMBEDDINGS_PROVIDER
						})
					})
				);
				if (!response.ok) {
					const body = await withSignal(signal, () => response.text()).catch(() => '');
					signal?.throwIfAborted();
					const retryable = response.status === 429 || response.status >= 500;
					lastError = new OpenAiEmbeddingsError(
						`Embeddings request failed: ${response.status} ${body.slice(0, 300)}`,
						{ status: response.status, retryable }
					);
					if (!retryable) throw lastError;
				} else {
					const payload = (await withSignal(signal, () => response.json())) as {
						data?: Array<{ index?: number; embedding?: number[] }>;
					};
					signal?.throwIfAborted();
					const rows = payload.data ?? [];
					if (rows.length !== texts.length) {
						throw new OpenAiEmbeddingsError(
							`Embeddings response returned ${rows.length} rows for ${texts.length} inputs`
						);
					}
					const ordered = new Array<number[]>(texts.length);
					for (const row of rows) {
						const index = typeof row.index === 'number' ? row.index : -1;
						if (index < 0 || index >= texts.length || !Array.isArray(row.embedding)) {
							throw new OpenAiEmbeddingsError(
								'Embeddings response returned a malformed row'
							);
						}
						ordered[index] = row.embedding;
					}
					return ordered;
				}
			} catch (error) {
				// Cancellation is terminal; it must never become a retryable provider error.
				signal?.throwIfAborted();
				if (error instanceof OpenAiEmbeddingsError) {
					lastError = error;
					if (!error.retryable) throw error;
				} else {
					lastError = new OpenAiEmbeddingsError(
						`Embeddings request errored: ${error instanceof Error ? error.message : String(error)}`,
						{ retryable: true }
					);
				}
			}
			if (attempt < MAX_ATTEMPTS) {
				await waitForRetry(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), signal);
			}
		}
		throw lastError ?? new OpenAiEmbeddingsError('Embeddings request failed');
	}

	async function embed(
		texts: string[],
		requestOptions: { signal?: AbortSignal } = {}
	): Promise<number[][]> {
		requestOptions.signal?.throwIfAborted();
		if (texts.length === 0) return [];
		const results: number[][] = [];
		for (let start = 0; start < texts.length; start += MAX_BATCH_SIZE) {
			const batch = texts.slice(start, start + MAX_BATCH_SIZE);
			results.push(...(await requestBatch(batch, requestOptions.signal)));
		}
		return results;
	}

	return {
		embed,
		embedOne: async (text, requestOptions) => {
			const [embedding] = await embed([text], requestOptions);
			if (!embedding) {
				throw new OpenAiEmbeddingsError('Embeddings response returned no rows');
			}
			return embedding;
		}
	};
}

/**
 * Shared host wiring: resolve an embeddings client from an env record
 * (process.env for the worker and scripts, $env/dynamic/private for web).
 * OpenRouter is the only route; an OpenAI key alone is ignored. Returns null
 * without an OpenRouter key so hosts can leave the embeddings port unset
 * (explore_project then reports itself unavailable).
 */
export function createEmbeddingsClientFromEnv(
	env: Record<string, string | undefined>,
	options: { fetchImpl?: FetchLike; sleep?: (ms: number) => Promise<void> } = {}
): OpenAiEmbeddingsClient | null {
	const openRouterKey = env.PRIVATE_OPENROUTER_API_KEY?.trim() || env.OPENROUTER_API_KEY?.trim();
	if (openRouterKey) {
		return createOpenAiEmbeddingsClient({
			...options,
			apiKey: openRouterKey,
			url: OPENROUTER_EMBEDDINGS_URL,
			model: OPENROUTER_EMBEDDING_REQUEST_MODEL
		});
	}
	return null;
}
