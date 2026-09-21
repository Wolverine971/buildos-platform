// packages/shared-agent-ops/src/embeddings/openai-embeddings.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	OPENAI_EMBEDDINGS_URL,
	OPENROUTER_EMBEDDINGS_URL,
	createEmbeddingsClientFromEnv,
	createOpenAiEmbeddingsClient,
	OpenAiEmbeddingsError
} from './openai-embeddings';

function okResponse(embeddings: number[][]) {
	return {
		ok: true,
		status: 200,
		text: async () => '',
		json: async () => ({
			data: embeddings.map((embedding, index) => ({ index, embedding }))
		})
	};
}

const noSleep = () => Promise.resolve();
afterEach(() => vi.useRealTimers());

describe('createOpenAiEmbeddingsClient', () => {
	it('rejects an empty api key', () => {
		expect(() => createOpenAiEmbeddingsClient({ apiKey: '  ' })).toThrow(OpenAiEmbeddingsError);
	});

	it('embeds a batch in order', async () => {
		const fetchImpl = vi.fn(async () => okResponse([[1], [2]]));
		const client = createOpenAiEmbeddingsClient({ apiKey: 'k', fetchImpl, sleep: noSleep });
		await expect(client.embed(['a', 'b'])).resolves.toEqual([[1], [2]]);
		const body = JSON.parse((fetchImpl.mock.calls[0]![1] as any).body as string);
		expect(body.model).toBe('text-embedding-3-small');
		expect(body.input).toEqual(['a', 'b']);
	});

	it('retries retryable failures then succeeds', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce({
				ok: false,
				status: 429,
				text: async () => 'rate limited',
				json: async () => ({})
			})
			.mockResolvedValueOnce(okResponse([[7]]));
		const client = createOpenAiEmbeddingsClient({ apiKey: 'k', fetchImpl, sleep: noSleep });
		await expect(client.embedOne('x')).resolves.toEqual([7]);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it('does not retry non-retryable failures', async () => {
		const fetchImpl = vi.fn(async () => ({
			ok: false,
			status: 401,
			text: async () => 'bad key',
			json: async () => ({})
		}));
		const client = createOpenAiEmbeddingsClient({ apiKey: 'k', fetchImpl, sleep: noSleep });
		await expect(client.embed(['x'])).rejects.toMatchObject({ status: 401, retryable: false });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('fails when the row count mismatches the input count', async () => {
		const fetchImpl = vi.fn(async () => okResponse([[1]]));
		const client = createOpenAiEmbeddingsClient({ apiKey: 'k', fetchImpl, sleep: noSleep });
		await expect(client.embed(['a', 'b'])).rejects.toBeInstanceOf(OpenAiEmbeddingsError);
	});

	it('does not start a request when already cancelled', async () => {
		const fetchImpl = vi.fn();
		const reason = new Error('Cancelled');
		const client = createOpenAiEmbeddingsClient({ apiKey: 'k', fetchImpl });
		await expect(client.embedOne('x', { signal: AbortSignal.abort(reason) })).rejects.toBe(
			reason
		);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('passes cancellation to fetch, settles a non-cooperative transport, and never retries', async () => {
		const controller = new AbortController();
		const reason = new Error('Read deadline');
		const fetchImpl = vi.fn((_url, init) => {
			expect(init.signal).toBe(controller.signal);
			controller.abort(reason);
			return new Promise<never>(() => {});
		});
		const sleep = vi.fn(noSleep);
		const client = createOpenAiEmbeddingsClient({ apiKey: 'k', fetchImpl, sleep });
		await expect(client.embedOne('x', { signal: controller.signal })).rejects.toBe(reason);
		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(sleep).not.toHaveBeenCalled();
	});

	it('cancels response-body consumption without retrying', async () => {
		const controller = new AbortController();
		const reason = new Error('Read deadline');
		const fetchImpl = vi.fn(async () => ({
			...okResponse([[1]]),
			json: () => {
				controller.abort(reason);
				return new Promise<never>(() => {});
			}
		}));
		const client = createOpenAiEmbeddingsClient({ apiKey: 'k', fetchImpl });
		await expect(client.embedOne('x', { signal: controller.signal })).rejects.toBe(reason);
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it('clears retry backoff on cancellation without sending the next attempt', async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const reason = new Error('Read deadline');
		const fetchImpl = vi.fn(async () => ({
			ok: false,
			status: 503,
			text: async () => 'busy',
			json: async () => ({})
		}));
		const client = createOpenAiEmbeddingsClient({ apiKey: 'k', fetchImpl });
		const request = client.embedOne('x', { signal: controller.signal });
		const rejected = expect(request).rejects.toBe(reason);
		await vi.advanceTimersByTimeAsync(1);
		expect(vi.getTimerCount()).toBe(1);
		controller.abort(reason);
		await rejected;
		await vi.advanceTimersByTimeAsync(10_000);
		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('does not start another batch after cancellation', async () => {
		const controller = new AbortController();
		const reason = new Error('Cancelled');
		const fetchImpl = vi.fn(async () => ({
			...okResponse(Array.from({ length: 96 }, () => [1])),
			json: async () => {
				controller.abort(reason);
				return {
					data: Array.from({ length: 96 }, (_, index) => ({ index, embedding: [1] }))
				};
			}
		}));
		const client = createOpenAiEmbeddingsClient({ apiKey: 'k', fetchImpl });
		await expect(
			client.embed(
				Array.from({ length: 100 }, () => 'x'),
				{ signal: controller.signal }
			)
		).rejects.toBe(reason);
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it('splits oversized batches across requests', async () => {
		const texts = Array.from({ length: 100 }, (_, index) => `t${index}`);
		const fetchImpl = vi.fn(async (_url: string, init?: Record<string, unknown>) => {
			const body = JSON.parse((init as any).body as string) as { input: string[] };
			return okResponse(body.input.map((_, index) => [index]));
		});
		const client = createOpenAiEmbeddingsClient({ apiKey: 'k', fetchImpl, sleep: noSleep });
		const result = await client.embed(texts);
		expect(result).toHaveLength(100);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});
});

describe('createEmbeddingsClientFromEnv', () => {
	it('routes through OpenRouter with the namespaced model when its key exists', async () => {
		const fetchImpl = vi.fn(async () => okResponse([[1]]));
		const client = createEmbeddingsClientFromEnv(
			{ PRIVATE_OPENROUTER_API_KEY: 'or-key', PRIVATE_OPENAI_API_KEY: 'oa-key' },
			{ fetchImpl, sleep: noSleep }
		);
		await client!.embedOne('x');
		expect(fetchImpl.mock.calls[0]![0]).toBe(OPENROUTER_EMBEDDINGS_URL);
		const body = JSON.parse((fetchImpl.mock.calls[0]![1] as any).body as string);
		expect(body.model).toBe('openai/text-embedding-3-small');
		expect((fetchImpl.mock.calls[0]![1] as any).headers.Authorization).toBe('Bearer or-key');
	});

	it('falls back to direct OpenAI with the bare model name', async () => {
		const fetchImpl = vi.fn(async () => okResponse([[1]]));
		const client = createEmbeddingsClientFromEnv(
			{ PRIVATE_OPENAI_API_KEY: 'oa-key' },
			{ fetchImpl, sleep: noSleep }
		);
		await client!.embedOne('x');
		expect(fetchImpl.mock.calls[0]![0]).toBe(OPENAI_EMBEDDINGS_URL);
		const body = JSON.parse((fetchImpl.mock.calls[0]![1] as any).body as string);
		expect(body.model).toBe('text-embedding-3-small');
	});

	it('returns null when no key is configured', () => {
		expect(createEmbeddingsClientFromEnv({})).toBeNull();
		expect(createEmbeddingsClientFromEnv({ PRIVATE_OPENROUTER_API_KEY: '  ' })).toBeNull();
	});
});
