// apps/worker/tests/openrouterTts.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = ['PRIVATE_OPENROUTER_API_KEY', 'OPENROUTER_API_KEY', 'PUBLIC_APP_URL'] as const;

function clearOpenRouterEnv(): void {
	for (const key of ENV_KEYS) {
		delete process.env[key];
	}
}

async function importOpenRouterTts() {
	vi.resetModules();
	return await import('../src/lib/tts/openrouter');
}

describe('OpenRouter brief audio TTS', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearOpenRouterEnv();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearOpenRouterEnv();
	});

	it('sends brief narration text to OpenRouter speech and returns mp3 bytes', async () => {
		process.env.PRIVATE_OPENROUTER_API_KEY = 'or-test-key';
		process.env.PUBLIC_APP_URL = 'https://buildos.local';

		const audioBytes = new Uint8Array([1, 2, 3, 4]);
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(audioBytes, {
				status: 200,
				headers: {
					'x-openrouter-model': 'openai/gpt-audio-mini'
				}
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const { synthesizeBriefAudioWithOpenRouter } = await importOpenRouterTts();
		const result = await synthesizeBriefAudioWithOpenRouter('Read this brief clearly.');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://openrouter.ai/api/v1/audio/speech');
		expect(init.method).toBe('POST');
		expect(init.headers).toMatchObject({
			Authorization: 'Bearer or-test-key',
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://buildos.local',
			'X-OpenRouter-Title': 'BuildOS Worker'
		});
		expect(JSON.parse(String(init.body))).toEqual({
			model: 'openai/gpt-audio-mini',
			voice: 'alloy',
			input: 'Read this brief clearly.',
			response_format: 'mp3',
			speed: 1
		});
		expect(result.mp3).toEqual(Buffer.from(audioBytes));
		expect(result.model).toBe('openrouter/openai/gpt-audio-mini');
		expect(result.voice).toBe('openrouter:alloy');
		expect(result.durationMs).toBeNull();
	});

	it('requires OpenRouter credentials before making a request', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const { hasOpenRouterTtsCredentials, synthesizeBriefAudioWithOpenRouter } =
			await importOpenRouterTts();

		expect(hasOpenRouterTtsCredentials()).toBe(false);
		await expect(synthesizeBriefAudioWithOpenRouter('hello')).rejects.toThrow(
			'OpenRouter TTS is not configured'
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('surfaces bounded OpenRouter API errors', async () => {
		process.env.PRIVATE_OPENROUTER_API_KEY = 'or-test-key';

		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					error: {
						message:
							'Insufficient credits. Add more using https://openrouter.ai/credits',
						code: 402
					}
				}),
				{ status: 402 }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		const { synthesizeBriefAudioWithOpenRouter } = await importOpenRouterTts();

		await expect(synthesizeBriefAudioWithOpenRouter('hello')).rejects.toThrow(
			'OpenRouter TTS failed (402): Insufficient credits'
		);
	});
});
