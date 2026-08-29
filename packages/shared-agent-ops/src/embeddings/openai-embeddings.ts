// packages/shared-agent-ops/src/embeddings/openai-embeddings.ts
//
// Hardened embeddings client for the semantic discovery pipeline (batching +
// retry, which smart-llm's generateEmbedding lacks). Routes through OpenRouter
// by default — its /api/v1/embeddings endpoint serves the same underlying
// OpenAI text-embedding-3-small, so vectors are interchangeable with the
// direct-OpenAI path, which remains the fallback when only an OpenAI key is
// configured. Dimensions are pinned by the model: text-embedding-3-small =
// 1536, matching onto_embeddings.embedding. The canonical stored model name
// stays 'text-embedding-3-small' regardless of route.

export const ONTO_EMBEDDING_MODEL = 'text-embedding-3-small';
export const ONTO_EMBEDDING_DIMENSIONS = 1536;

export const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
export const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';
/** OpenRouter namespaces provider models; the vectors are identical. */
export const OPENROUTER_EMBEDDING_REQUEST_MODEL = `openai/${ONTO_EMBEDDING_MODEL}`;
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
	embed(texts: string[]): Promise<number[][]>;
	/** Embed a single text (query-side convenience). */
	embedOne(text: string): Promise<number[]>;
};

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
	const model = options.model ?? ONTO_EMBEDDING_MODEL;
	const url = options.url ?? OPENAI_EMBEDDINGS_URL;
	const dimensions = options.dimensions;
	const sleep =
		options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

	async function requestBatch(texts: string[]): Promise<number[][]> {
		let lastError: OpenAiEmbeddingsError | null = null;
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
			try {
				const response = await fetchImpl(url, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${apiKey}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(
						dimensions ? { model, input: texts, dimensions } : { model, input: texts }
					)
				});
				if (!response.ok) {
					const body = await response.text().catch(() => '');
					const retryable = response.status === 429 || response.status >= 500;
					lastError = new OpenAiEmbeddingsError(
						`Embeddings request failed: ${response.status} ${body.slice(0, 300)}`,
						{ status: response.status, retryable }
					);
					if (!retryable) throw lastError;
				} else {
					const payload = (await response.json()) as {
						data?: Array<{ index?: number; embedding?: number[] }>;
					};
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
				await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
			}
		}
		throw lastError ?? new OpenAiEmbeddingsError('Embeddings request failed');
	}

	async function embed(texts: string[]): Promise<number[][]> {
		if (texts.length === 0) return [];
		const results: number[][] = [];
		for (let start = 0; start < texts.length; start += MAX_BATCH_SIZE) {
			const batch = texts.slice(start, start + MAX_BATCH_SIZE);
			results.push(...(await requestBatch(batch)));
		}
		return results;
	}

	return {
		embed,
		embedOne: async (text: string) => {
			const [embedding] = await embed([text]);
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
 * OpenRouter is the primary route — one provider, one bill, and the platform's
 * existing key — with direct OpenAI as the fallback when only that key exists.
 * Returns null when neither key is configured so hosts can leave the
 * embeddings port unset (explore_project then reports itself unavailable).
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
	const openAiKey = env.OPENAI_API_KEY?.trim() || env.PRIVATE_OPENAI_API_KEY?.trim();
	if (openAiKey) {
		return createOpenAiEmbeddingsClient({ ...options, apiKey: openAiKey });
	}
	return null;
}
