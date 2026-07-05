// apps/worker/tests/briefAudioSynthesis.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasOpenRouterTtsCredentials: vi.fn(),
	synthesizeBriefAudioWithOpenRouter: vi.fn(),
	synthesizeBriefAudioInChild: vi.fn()
}));

vi.mock('../src/lib/tts/openrouter', () => ({
	hasOpenRouterTtsCredentials: mocks.hasOpenRouterTtsCredentials,
	synthesizeBriefAudioWithOpenRouter: mocks.synthesizeBriefAudioWithOpenRouter
}));

vi.mock('../src/workers/briefAudio/audioSynthesisProcess', () => ({
	synthesizeBriefAudioInChild: mocks.synthesizeBriefAudioInChild
}));

const SYNTHESIS_RESULT = {
	mp3: Buffer.from('audio'),
	durationMs: null,
	generationMs: 12,
	sampleRate: null,
	model: 'test-model',
	voice: 'test-voice'
};

async function importBriefAudioSynthesis() {
	vi.resetModules();
	return await import('../src/workers/briefAudio/briefAudioSynthesis');
}

describe('brief audio synthesis provider routing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env.PRIVATE_OPENAI_API_KEY;

		mocks.hasOpenRouterTtsCredentials.mockReturnValue(false);
		mocks.synthesizeBriefAudioWithOpenRouter.mockResolvedValue({
			...SYNTHESIS_RESULT,
			model: 'openrouter/openai/gpt-audio-mini'
		});
		mocks.synthesizeBriefAudioInChild.mockResolvedValue({
			...SYNTHESIS_RESULT,
			model: 'onnx-community/Kokoro-82M-v1.0-ONNX'
		});
	});

	afterEach(() => {
		delete process.env.PRIVATE_OPENAI_API_KEY;
	});

	it('defaults to OpenRouter when OpenRouter credentials are available', async () => {
		mocks.hasOpenRouterTtsCredentials.mockReturnValue(true);

		const { resolveBriefAudioProviderForWorker, synthesizeBriefAudioForWorker } =
			await importBriefAudioSynthesis();
		const result = await synthesizeBriefAudioForWorker('brief text', 120_000);

		expect(resolveBriefAudioProviderForWorker()).toBe('openrouter');
		expect(result.model).toBe('openrouter/openai/gpt-audio-mini');
		expect(mocks.synthesizeBriefAudioWithOpenRouter).toHaveBeenCalledWith('brief text');
		expect(mocks.synthesizeBriefAudioInChild).not.toHaveBeenCalled();
	});

	it('does not default to direct OpenAI when only an OpenAI key exists elsewhere', async () => {
		process.env.PRIVATE_OPENAI_API_KEY = 'openai-test-key';

		const { resolveBriefAudioProviderForWorker, synthesizeBriefAudioForWorker } =
			await importBriefAudioSynthesis();
		const result = await synthesizeBriefAudioForWorker('brief text', 120_000);

		expect(resolveBriefAudioProviderForWorker()).toBe('kokoro');
		expect(result.model).toBe('onnx-community/Kokoro-82M-v1.0-ONNX');
		expect(mocks.synthesizeBriefAudioInChild).toHaveBeenCalledWith('brief text', 120_000);
		expect(mocks.synthesizeBriefAudioWithOpenRouter).not.toHaveBeenCalled();
	});

	it('tries OpenRouter before local Kokoro', async () => {
		mocks.hasOpenRouterTtsCredentials.mockReturnValue(true);

		const { synthesizeBriefAudioForWorker } = await importBriefAudioSynthesis();
		await synthesizeBriefAudioForWorker('brief text', 120_000);

		expect(mocks.synthesizeBriefAudioWithOpenRouter).toHaveBeenCalledWith('brief text');
		expect(mocks.synthesizeBriefAudioInChild).not.toHaveBeenCalled();
	});

	it('falls back to bounded-time Kokoro when OpenRouter synthesis fails', async () => {
		mocks.hasOpenRouterTtsCredentials.mockReturnValue(true);
		mocks.synthesizeBriefAudioWithOpenRouter.mockRejectedValueOnce(
			new Error('OpenRouter unavailable')
		);

		const { synthesizeBriefAudioForWorker } = await importBriefAudioSynthesis();
		const result = await synthesizeBriefAudioForWorker('brief text', 120_000);

		expect(result.model).toBe('onnx-community/Kokoro-82M-v1.0-ONNX');
		expect(mocks.synthesizeBriefAudioWithOpenRouter).toHaveBeenCalledWith('brief text');
		expect(mocks.synthesizeBriefAudioInChild).toHaveBeenCalledWith('brief text', 45_000);
	});
});
