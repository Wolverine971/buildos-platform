// packages/shared-agent-ops/src/embeddings/openai-embeddings.ts
//
// Hardened OpenAI embeddings client for the semantic discovery pipeline.
// OpenRouter has no embeddings endpoint, so this goes direct to OpenAI with
// PRIVATE_OPENAI_API_KEY (smart-llm's generateEmbedding has neither batching
// nor retry, which the index pipeline needs). Dimensions are pinned by the
// model: text-embedding-3-small = 1536, matching onto_embeddings.embedding.

export const ONTO_EMBEDDING_MODEL = 'text-embedding-3-small';
export const ONTO_EMBEDDING_DIMENSIONS = 1536;

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
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
	sleep?: (ms: number) => Promise<void>;
}): OpenAiEmbeddingsClient {
	const apiKey = options.apiKey.trim();
	if (!apiKey) {
		throw new OpenAiEmbeddingsError('OpenAI embeddings require a non-empty API key');
	}
	const fetchImpl: FetchLike = options.fetchImpl ?? (fetch as unknown as FetchLike);
	const model = options.model ?? ONTO_EMBEDDING_MODEL;
	const sleep =
		options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

	async function requestBatch(texts: string[]): Promise<number[][]> {
		let lastError: OpenAiEmbeddingsError | null = null;
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
			try {
				const response = await fetchImpl(OPENAI_EMBEDDINGS_URL, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${apiKey}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ model, input: texts })
				});
				if (!response.ok) {
					const body = await response.text().catch(() => '');
					const retryable = response.status === 429 || response.status >= 500;
					lastError = new OpenAiEmbeddingsError(
						`OpenAI embeddings request failed: ${response.status} ${body.slice(0, 300)}`,
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
							`OpenAI embeddings returned ${rows.length} rows for ${texts.length} inputs`
						);
					}
					const ordered = new Array<number[]>(texts.length);
					for (const row of rows) {
						const index = typeof row.index === 'number' ? row.index : -1;
						if (index < 0 || index >= texts.length || !Array.isArray(row.embedding)) {
							throw new OpenAiEmbeddingsError(
								'OpenAI embeddings returned a malformed row'
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
						`OpenAI embeddings request errored: ${error instanceof Error ? error.message : String(error)}`,
						{ retryable: true }
					);
				}
			}
			if (attempt < MAX_ATTEMPTS) {
				await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
			}
		}
		throw lastError ?? new OpenAiEmbeddingsError('OpenAI embeddings request failed');
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
				throw new OpenAiEmbeddingsError('OpenAI embeddings returned no rows');
			}
			return embedding;
		}
	};
}
