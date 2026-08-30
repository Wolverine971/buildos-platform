import { describe, expect, it, vi } from 'vitest';
import {
	LibriOcrProviderError,
	createOpenRouterLibriOcrProvider,
	type LibriOcrProviderRequest
} from '../src/workers/libri/ocrProvider';

const MODEL = 'openai/gpt-4o-mini';

describe('Libri OCR provider boundary', () => {
	it('sends one bounded OpenRouter vision request and normalizes usage', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
			jsonResponse({
				model: MODEL,
				choices: [
					{
						message: {
							content: JSON.stringify({
								extracted_text: '  Chapter One  ',
								summary: '  A chapter page.  ',
								confidence: 0.97,
								language: 'en'
							})
						}
					}
				],
				usage: { prompt_tokens: 120, completion_tokens: 30, cost: 0.0001234 }
			})
		);
		const provider = createOpenRouterLibriOcrProvider({
			apiKey: 'libri-provider-key',
			allowedModels: [MODEL],
			fetchImpl,
			httpReferer: 'https://build-os.com',
			appName: 'Libri worker'
		});

		await expect(provider.execute(request())).resolves.toEqual({
			extractedText: 'Chapter One',
			summary: 'A chapter page.',
			confidence: 0.97,
			language: 'en',
			provider: 'openrouter',
			model: MODEL,
			promptTokens: 120,
			completionTokens: 30,
			estimatedCostMicrousd: 124
		});
		expect(fetchImpl).toHaveBeenCalledOnce();
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
		expect(init).toMatchObject({
			method: 'POST',
			headers: {
				Authorization: 'Bearer libri-provider-key',
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://build-os.com',
				'X-Title': 'Libri worker'
			}
		});
		const body = JSON.parse(String(init?.body));
		expect(body).toMatchObject({
			model: MODEL,
			temperature: 0,
			max_tokens: 800,
			response_format: { type: 'json_object' }
		});
		expect(body.messages[1].content[1]).toEqual({
			type: 'image_url',
			image_url: { url: 'https://signed.example.com/libri/image.jpg?token=short-lived' }
		});
	});

	it('classifies bounded provider HTTP failures without exposing response bodies', async () => {
		for (const [status, retryable] of [
			[429, true],
			[503, true],
			[401, false]
		] as const) {
			const provider = createOpenRouterLibriOcrProvider({
				apiKey: 'key',
				allowedModels: [MODEL],
				fetchImpl: vi
					.fn<typeof fetch>()
					.mockResolvedValue(
						jsonResponse({ error: { message: 'secret provider body' } }, status)
					)
			});
			const error = await provider.execute(request()).catch((reason) => reason);
			expect(error).toBeInstanceOf(LibriOcrProviderError);
			expect(error).toMatchObject({
				code: `provider_http_${status}`,
				retryable,
				httpStatus: status
			});
			expect(String(error.message)).not.toContain('secret provider body');
		}
		const nonJsonProvider = createOpenRouterLibriOcrProvider({
			apiKey: 'key',
			allowedModels: [MODEL],
			fetchImpl: vi
				.fn<typeof fetch>()
				.mockResolvedValue(new Response('gateway secret', { status: 503 }))
		});
		await expect(nonJsonProvider.execute(request())).rejects.toMatchObject({
			code: 'provider_http_503',
			retryable: true,
			httpStatus: 503
		});
	});

	it('rejects untrusted URLs, MIME types, models, and output bounds before fetch', async () => {
		const fetchImpl = vi.fn<typeof fetch>();
		const provider = createOpenRouterLibriOcrProvider({
			apiKey: 'key',
			allowedModels: [MODEL],
			fetchImpl
		});
		await expect(
			provider.execute(request({ imageUrl: 'http://signed.example.com/image.jpg' }))
		).rejects.toThrow('credential-free HTTPS');
		await expect(
			provider.execute(request({ imageUrl: 'https://user:secret@example.com/image.jpg' }))
		).rejects.toThrow('credential-free HTTPS');
		await expect(
			provider.execute(request({ mimeType: 'image/gif' as 'image/jpeg' }))
		).rejects.toThrow('MIME type');
		await expect(
			provider.execute(request({ model: 'anthropic/claude-sonnet' }))
		).rejects.toThrow('allowlist');
		await expect(provider.execute(request({ maxOutputTokens: 4_097 }))).rejects.toThrow(
			'maxOutputTokens'
		);
		await expect(provider.execute(request({ maxOutputChars: 100_001 }))).rejects.toThrow(
			'maxOutputChars'
		);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('fails closed on unsupported fields, empty text, over-limit output, and invalid usage', async () => {
		const outputs: unknown[] = [
			{
				choices: [
					{
						message: {
							content: JSON.stringify({
								extracted_text: 'text',
								summary: 'summary',
								markdown: 'unexpected'
							})
						}
					}
				],
				usage: { prompt_tokens: 1, completion_tokens: 1 }
			},
			responsePayload({ extracted_text: '', summary: 'summary' }),
			responsePayload({ extracted_text: 'too long', summary: 'summary' }),
			{
				...responsePayload({ extracted_text: 'text', summary: 'summary' }),
				usage: { prompt_tokens: -1, completion_tokens: 1 }
			}
		];
		const requests = [request(), request(), request({ maxOutputChars: 4 }), request()];

		for (let index = 0; index < outputs.length; index += 1) {
			const provider = createOpenRouterLibriOcrProvider({
				apiKey: 'key',
				allowedModels: [MODEL],
				fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(outputs[index]))
			});
			await expect(provider.execute(requests[index])).rejects.toMatchObject({
				code: 'provider_response_invalid',
				retryable: true
			});
		}
	});

	it('rejects a provider response that silently switches models', async () => {
		const provider = createOpenRouterLibriOcrProvider({
			apiKey: 'key',
			allowedModels: [MODEL],
			fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
				jsonResponse({
					...responsePayload({ extracted_text: 'text', summary: 'summary' }),
					model: 'openai/different-model'
				})
			)
		});
		await expect(provider.execute(request())).rejects.toMatchObject({
			code: 'provider_response_invalid',
			retryable: true
		});

		const missingModelProvider = createOpenRouterLibriOcrProvider({
			apiKey: 'key',
			allowedModels: [MODEL],
			fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
				jsonResponse({
					...responsePayload({ extracted_text: 'text', summary: 'summary' }),
					model: undefined
				})
			)
		});
		await expect(missingModelProvider.execute(request())).rejects.toMatchObject({
			code: 'provider_response_invalid',
			retryable: true
		});
	});

	it('classifies aborted and network requests as bounded transient failures', async () => {
		const aborted = new AbortController();
		aborted.abort();
		const neverCalled = vi.fn<typeof fetch>();
		const abortedProvider = createOpenRouterLibriOcrProvider({
			apiKey: 'key',
			allowedModels: [MODEL],
			fetchImpl: neverCalled
		});
		await expect(
			abortedProvider.execute(request({ signal: aborted.signal }))
		).rejects.toMatchObject({ code: 'provider_aborted', retryable: true });
		expect(neverCalled).not.toHaveBeenCalled();

		const networkProvider = createOpenRouterLibriOcrProvider({
			apiKey: 'key',
			allowedModels: [MODEL],
			fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(new Error('socket secret'))
		});
		const networkError = await networkProvider.execute(request()).catch((reason) => reason);
		expect(networkError).toMatchObject({ code: 'provider_network_error', retryable: true });
		expect(String(networkError.message)).not.toContain('socket secret');
	});
});

function request(overrides: Partial<LibriOcrProviderRequest> = {}): LibriOcrProviderRequest {
	return {
		imageUrl: 'https://signed.example.com/libri/image.jpg?token=short-lived',
		mimeType: 'image/jpeg',
		model: MODEL,
		maxOutputTokens: 800,
		maxOutputChars: 100_000,
		signal: new AbortController().signal,
		...overrides
	};
}

function responsePayload(output: Record<string, unknown>): Record<string, unknown> {
	return {
		model: MODEL,
		choices: [{ message: { content: JSON.stringify(output) } }],
		usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 }
	};
}

function jsonResponse(payload: unknown, status: number = 200): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}
