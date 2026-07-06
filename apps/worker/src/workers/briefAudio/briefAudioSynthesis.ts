// apps/worker/src/workers/briefAudio/briefAudioSynthesis.ts
import type { BriefAudioSynthesisResult } from '../../lib/tts/kokoro';
import {
	hasOpenRouterTtsCredentials,
	synthesizeBriefAudioWithOpenRouter
} from '../../lib/tts/openrouter';
import { synthesizeBriefAudioInChild } from './audioSynthesisProcess';

type BriefAudioProvider = 'openrouter' | 'kokoro';

const MIN_KOKORO_FALLBACK_TIMEOUT_MS = 60_000;

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
	const startedAt = Date.now();
	let openRouterError: unknown;

	if (provider === 'openrouter') {
		try {
			return await synthesizeBriefAudioWithOpenRouter(text);
		} catch (error) {
			openRouterError = error;
			console.warn(
				'OpenRouter brief audio synthesis failed; falling back to Kokoro TTS:',
				error
			);
		}
	}

	const elapsedMs = Date.now() - startedAt;
	const remainingTimeoutMs =
		provider === 'openrouter'
			? Math.max(timeoutMs - elapsedMs, MIN_KOKORO_FALLBACK_TIMEOUT_MS)
			: timeoutMs;

	try {
		return await synthesizeBriefAudioInChild(text, remainingTimeoutMs);
	} catch (fallbackError) {
		if (openRouterError) {
			const openRouterMessage =
				openRouterError instanceof Error
					? openRouterError.message
					: String(openRouterError);
			const fallbackMessage =
				fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
			throw new Error(
				`OpenRouter TTS failed first: ${openRouterMessage}; Kokoro fallback failed: ${fallbackMessage}`
			);
		}
		throw fallbackError;
	}
}
