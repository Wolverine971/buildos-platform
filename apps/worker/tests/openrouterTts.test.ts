// apps/worker/tests/openrouterTts.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	encodeMonoMp3: vi.fn()
}));

vi.mock('../src/lib/tts/mp3', () => ({
	encodeMonoMp3: mocks.encodeMonoMp3
}));

const ENV_KEYS = [
	'PRIVATE_OPENROUTER_API_KEY',
	'OPENROUTER_API_KEY',
	'OPENROUTER_TTS_MODEL',
	'PUBLIC_APP_URL'
] as const;

function clearOpenRouterEnv(): void {
	for (const key of ENV_KEYS) {
		delete process.env[key];
	}
}

async function importOpenRouterTts() {
	vi.resetModules();
	return await import('../src/lib/tts/openrouter');
}

function buildStreamResponse(events: unknown[], init?: ResponseInit): Response {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream({
			start(controller) {
				for (const event of events) {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
				}
				controller.enqueue(encoder.encode('data: [DONE]\n\n'));
				controller.close();
			}
		}),
		init
	);
}

describe('OpenRouter brief audio TTS', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearOpenRouterEnv();
		mocks.encodeMonoMp3.mockResolvedValue(Buffer.from('mp3-audio'));
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		clearOpenRouterEnv();
	});

	it('streams brief narration text through OpenRouter chat completions and returns mp3 bytes', async () => {
		process.env.PRIVATE_OPENROUTER_API_KEY = 'or-test-key';
		process.env.OPENROUTER_TTS_MODEL = 'openai/gpt-audio-mini';
		process.env.PUBLIC_APP_URL = 'https://buildos.local';

		const pcm = Buffer.alloc(4);
		pcm.writeInt16LE(0, 0);
		pcm.writeInt16LE(32767, 2);
		const fetchMock = vi.fn().mockResolvedValue(
			buildStreamResponse(
				[
					{
						model: 'openai/gpt-audio-mini',
						choices: [
							{
								delta: {
									audio: {
										data: pcm.toString('base64')
									}
								}
							}
						]
					}
				],
				{
					status: 200,
					headers: {
						'x-openrouter-model': 'openai/gpt-audio-mini'
					}
				}
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		const { synthesizeBriefAudioWithOpenRouter } = await importOpenRouterTts();
		const result = await synthesizeBriefAudioWithOpenRouter('Read this brief clearly.');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
		expect(init.method).toBe('POST');
		expect(init.headers).toMatchObject({
			Authorization: 'Bearer or-test-key',
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://buildos.local',
			'X-OpenRouter-Title': 'BuildOS Worker'
		});
		expect(JSON.parse(String(init.body))).toEqual({
			model: 'openai/gpt-audio-mini',
			messages: [{ role: 'user', content: 'Read this brief clearly.' }],
			provider: { data_collection: 'deny' },
			modalities: ['text', 'audio'],
			audio: {
				voice: 'alloy',
				format: 'pcm16'
			},
			stream: true
		});
		expect(mocks.encodeMonoMp3).toHaveBeenCalledTimes(1);
		const [samples, sampleRate] = mocks.encodeMonoMp3.mock.calls[0] as [Float32Array, number];
		expect(samples).toBeInstanceOf(Float32Array);
		expect(Array.from(samples)).toEqual([0, 1]);
		expect(sampleRate).toBe(24_000);
		expect(result.mp3).toEqual(Buffer.from('mp3-audio'));
		expect(result.model).toBe('openrouter/openai/gpt-audio-mini');
		expect(result.voice).toBe('openrouter:alloy');
		expect(result.sampleRate).toBe(24_000);
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

	it('defaults to OpenAI gpt-audio-mini when no explicit OpenRouter speech model is set', async () => {
		process.env.PRIVATE_OPENROUTER_API_KEY = 'or-test-key';
		const pcm = Buffer.alloc(2);
		pcm.writeInt16LE(0, 0);
		const fetchMock = vi.fn().mockResolvedValue(
			buildStreamResponse([
				{
					model: 'openai/gpt-audio-mini',
					choices: [{ delta: { audio: { data: pcm.toString('base64') } } }]
				}
			])
		);
		vi.stubGlobal('fetch', fetchMock);

		const { hasOpenRouterTtsCredentials, synthesizeBriefAudioWithOpenRouter } =
			await importOpenRouterTts();

		expect(hasOpenRouterTtsCredentials()).toBe(true);
		await synthesizeBriefAudioWithOpenRouter('hello');
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(String(init.body)).model).toBe('openai/gpt-audio-mini');
	});

	it('surfaces bounded OpenRouter API errors', async () => {
		process.env.PRIVATE_OPENROUTER_API_KEY = 'or-test-key';
		process.env.OPENROUTER_TTS_MODEL = 'openai/gpt-audio-mini';

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
