// packages/smart-llm/src/moonshot-client.test.ts
import { describe, expect, it, vi } from 'vitest';
import { LLMRequestCancelledError, LLMRequestTimeoutError } from './errors';
import { MoonshotClient } from './moonshot-client';

function createClient(fetchImpl: typeof fetch) {
	return new MoonshotClient({
		apiKey: 'test-moonshot-key',
		apiUrl: 'https://api.moonshot.ai/v1/chat/completions',
		fetchImpl
	});
}

describe('MoonshotClient.callMoonshot', () => {
	it('classifies a caller abort as cancellation rather than timeout', async () => {
		const controller = new AbortController();
		const abortReason = new Error('Cycle worker lease expired');
		const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			expect(init?.signal).not.toBe(controller.signal);
			controller.abort(abortReason);
			expect(init?.signal?.aborted).toBe(true);
			throw abortReason;
		});
		const client = createClient(fetchMock as unknown as typeof fetch);

		await expect(
			client.callMoonshot({
				model: 'moonshot-v1-32k',
				messages: [{ role: 'user', content: 'Generate the daily brief.' }],
				signal: controller.signal
			})
		).rejects.toEqual(
			expect.objectContaining<Partial<LLMRequestCancelledError>>({
				name: 'LLMRequestCancelledError',
				reason: abortReason.message,
				cause: abortReason
			})
		);
	});

	it('classifies the internal deadline as a typed timeout', async () => {
		const cause = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
		const client = createClient(vi.fn().mockRejectedValue(cause) as unknown as typeof fetch);

		await expect(
			client.callMoonshot({
				model: 'moonshot-v1-32k',
				messages: [{ role: 'user', content: 'Generate the daily brief.' }],
				timeoutMs: 42
			})
		).rejects.toEqual(
			expect.objectContaining<Partial<LLMRequestTimeoutError>>({
				name: 'LLMRequestTimeoutError',
				timeoutMs: 42,
				requestedModel: 'moonshot-v1-32k',
				cause
			})
		);
	});
});
