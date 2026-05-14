// apps/worker/src/workers/briefAudio/briefAudioSynthesis.ts
import type { BriefAudioSynthesisResult } from '../../lib/tts/kokoro';
import { hasOpenAiTtsCredentials, synthesizeBriefAudioWithOpenAI } from '../../lib/tts/openai';
import { synthesizeBriefAudioInChild } from './audioSynthesisProcess';

type BriefAudioProvider = 'openai' | 'kokoro' | 'auto';

const DEFAULT_AUTO_KOKORO_TIMEOUT_MS = 45_000;

function getProvider(): BriefAudioProvider {
	const configured = process.env.BRIEF_AUDIO_TTS_PROVIDER?.trim().toLowerCase();
	if (configured === 'openai' || configured === 'kokoro' || configured === 'auto') {
		return configured;
	}

	return hasOpenAiTtsCredentials() ? 'openai' : 'kokoro';
}

function getAutoKokoroTimeoutMs(): number {
	const configured = Number(process.env.BRIEF_AUDIO_AUTO_KOKORO_TIMEOUT_MS);
	if (Number.isFinite(configured) && configured >= 10_000) {
		return Math.floor(configured);
	}

	return DEFAULT_AUTO_KOKORO_TIMEOUT_MS;
}

export async function synthesizeBriefAudioForWorker(
	text: string,
	timeoutMs: number
): Promise<BriefAudioSynthesisResult> {
	const provider = getProvider();

	if (provider === 'openai') {
		return synthesizeBriefAudioWithOpenAI(text);
	}

	if (provider === 'kokoro') {
		return synthesizeBriefAudioInChild(text, timeoutMs);
	}

	try {
		return await synthesizeBriefAudioInChild(
			text,
			Math.min(timeoutMs, getAutoKokoroTimeoutMs())
		);
	} catch (error) {
		if (!hasOpenAiTtsCredentials()) {
			throw error;
		}

		console.warn(
			'Kokoro brief audio synthesis failed; falling back to OpenAI TTS:',
			error
		);
		return synthesizeBriefAudioWithOpenAI(text);
	}
}
