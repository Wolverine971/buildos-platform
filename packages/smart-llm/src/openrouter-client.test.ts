// packages/smart-llm/src/openrouter-client.test.ts
import { describe, expect, it, vi } from 'vitest';
import { LLMRequestCancelledError, LLMRequestTimeoutError } from './errors';
import { OpenRouterClient } from './openrouter-client';

function createClient(fetchImpl: typeof fetch) {
	return new OpenRouterClient({
		apiKey: 'test-openrouter-key',
		apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
		httpReferer: 'https://build-os.com',
		appName: 'BuildOS Transcription',
		fetchImpl
	});
}

describe('OpenRouterClient.callOpenRouter', () => {
	it('preserves the generation id when the response body is lost', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response('not-json', {
				status: 200,
				headers: { 'x-generation-id': 'gen-lost-body' }
			})
		);
		const client = createClient(fetchMock as unknown as typeof fetch);

		await expect(
			client.callOpenRouter({
				model: 'openai/gpt-5-mini',
				messages: [{ role: 'user', content: 'Return JSON.' }]
			})
		).rejects.toMatchObject({
			openrouter: {
				generationId: 'gen-lost-body'
			}
		});
	});

	it('turns a body-read TimeoutError into a typed timeout and preserves the generation id', async () => {
		const cause = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
		const response = {
			ok: true,
			headers: new Headers({ 'x-generation-id': 'gen-timed-out-body' }),
			json: vi.fn().mockRejectedValue(cause)
		} as unknown as Response;
		const client = createClient(vi.fn().mockResolvedValue(response) as unknown as typeof fetch);

		let thrown: unknown;
		try {
			await client.callOpenRouter({
				model: 'openai/gpt-5-mini',
				messages: [{ role: 'user', content: 'Return JSON.' }],
				timeoutMs: 42
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(LLMRequestTimeoutError);
		expect(thrown).toMatchObject({
			timeoutMs: 42,
			requestedModel: 'openai/gpt-5-mini',
			openrouter: { generationId: 'gen-timed-out-body' },
			cause
		});
	});

	it('types a timeout before response headers with a null generation id', async () => {
		const cause = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
		const client = createClient(vi.fn().mockRejectedValue(cause) as unknown as typeof fetch);

		await expect(
			client.callOpenRouter({
				model: 'openai/gpt-5-mini',
				messages: [{ role: 'user', content: 'Return JSON.' }],
				timeoutMs: 42
			})
		).rejects.toMatchObject({
			name: 'LLMRequestTimeoutError',
			openrouter: { generationId: null },
			cause
		});
	});

	it('classifies a caller abort reason as cancellation rather than timeout', async () => {
		const controller = new AbortController();
		const abortReason = new Error('Worker timeout after 600000ms for buildos_project_loop');
		const fetchMock = vi.fn(async () => {
			controller.abort(abortReason);
			throw abortReason;
		});
		const client = createClient(fetchMock as unknown as typeof fetch);

		await expect(
			client.callOpenRouter({
				model: 'openai/gpt-5-mini',
				messages: [{ role: 'user', content: 'Return JSON.' }],
				signal: controller.signal
			})
		).rejects.toEqual(
			expect.objectContaining<Partial<LLMRequestCancelledError>>({
				name: 'LLMRequestCancelledError',
				reason: abortReason.message
			})
		);
	});
});

describe('OpenRouterClient.callOpenRouterTranscription', () => {
	it('uses the dedicated OpenRouter transcription endpoint and request shape', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ text: 'Hello BuildOS' }), {
				status: 200,
				headers: { 'x-generation-id': 'generation-123' }
			})
		);
		const client = createClient(fetchMock as unknown as typeof fetch);

		const result = await client.callOpenRouterTranscription({
			model: 'openai/gpt-4o-mini-transcribe',
			inputAudio: { data: 'base64-audio', format: 'webm' },
			temperature: 0,
			timeoutMs: 30_000,
			provider: { data_collection: 'deny' }
		});

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('https://openrouter.ai/api/v1/audio/transcriptions');
		expect(init.headers).toMatchObject({
			Authorization: 'Bearer test-openrouter-key',
			'Content-Type': 'application/json'
		});
		expect(JSON.parse(init.body)).toEqual({
			model: 'openai/gpt-4o-mini-transcribe',
			input_audio: { data: 'base64-audio', format: 'webm' },
			temperature: 0,
			provider: { data_collection: 'deny' }
		});
		expect(result).toEqual({
			text: 'Hello BuildOS',
			requestId: 'generation-123'
		});
	});

	it('preserves OpenRouter status and request metadata on errors', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ error: { message: 'No credits' } }), {
				status: 402,
				headers: { 'x-generation-id': 'generation-error' }
			})
		);
		const client = createClient(fetchMock as unknown as typeof fetch);

		await expect(
			client.callOpenRouterTranscription({
				model: 'openai/gpt-4o-mini-transcribe',
				inputAudio: { data: 'base64-audio', format: 'webm' },
				timeoutMs: 30_000
			})
		).rejects.toMatchObject({
			status: 402,
			openrouter: {
				httpStatus: 402,
				requestId: 'generation-error'
			}
		});
	});
});
