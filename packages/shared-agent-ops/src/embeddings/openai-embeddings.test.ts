// packages/shared-agent-ops/src/embeddings/openai-embeddings.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createOpenAiEmbeddingsClient, OpenAiEmbeddingsError } from './openai-embeddings';

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
