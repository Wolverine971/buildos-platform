import { describe, expect, it, vi } from 'vitest';
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
