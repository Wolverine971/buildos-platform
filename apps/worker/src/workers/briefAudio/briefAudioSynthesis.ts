// apps/worker/src/workers/briefAudio/briefAudioSynthesis.ts
import type { BriefAudioSynthesisResult } from '../../lib/tts/kokoro';
import {
	hasOpenRouterTtsCredentials,
	synthesizeBriefAudioWithOpenRouter
} from '../../lib/tts/openrouter';
import { synthesizeBriefAudioInChild } from './audioSynthesisProcess';

type BriefAudioProvider = 'openrouter' | 'kokoro';

const KOKORO_FALLBACK_TIMEOUT_MS = 45_000;

function getProvider(): BriefAudioProvider {
	return hasOpenRouterTtsCredentials() ? 'openrouter' : 'kokoro';
}

export function resolveBriefAudioProviderForWorker(): BriefAudioProvider {
	return getProvider();
}

export async function synthesizeBriefAudioForWorker(
	text: string,
	timeoutMs: number
): Promise<BriefAudioSynthesisResult> {
	const provider = getProvider();

	if (provider === 'openrouter') {
		try {
			return await synthesizeBriefAudioWithOpenRouter(text);
		} catch (error) {
			console.warn(
				'OpenRouter brief audio synthesis failed; falling back to Kokoro TTS:',
				error
			);
		}
	}

	const kokoroTimeoutMs =
		provider === 'openrouter' ? Math.min(timeoutMs, KOKORO_FALLBACK_TIMEOUT_MS) : timeoutMs;
	return synthesizeBriefAudioInChild(text, kokoroTimeoutMs);
}
