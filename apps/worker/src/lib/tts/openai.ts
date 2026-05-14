// apps/worker/src/lib/tts/openai.ts
import type { BriefAudioSynthesisResult } from './kokoro';

const OPENAI_TTS_URL =
	process.env.BRIEF_AUDIO_OPENAI_TTS_URL || 'https://api.openai.com/v1/audio/speech';
const OPENAI_TTS_MODEL = process.env.BRIEF_AUDIO_OPENAI_MODEL || 'gpt-4o-mini-tts';
const OPENAI_TTS_VOICE = process.env.BRIEF_AUDIO_OPENAI_VOICE || 'onyx';
const OPENAI_TTS_FORMAT = process.env.BRIEF_AUDIO_OPENAI_FORMAT || 'mp3';
const OPENAI_TTS_INSTRUCTIONS =
	process.env.BRIEF_AUDIO_OPENAI_INSTRUCTIONS ||
	'Narrate this daily brief clearly, calmly, and conversationally.';
const DEFAULT_OPENAI_TIMEOUT_MS = 60_000;

function getOpenAiApiKey(): string | null {
	const apiKey =
		process.env.OPENAI_API_KEY?.trim() || process.env.PRIVATE_OPENAI_API_KEY?.trim() || '';
	return apiKey.length > 0 ? apiKey : null;
}

function getOpenAiTimeoutMs(): number {
	const configured = Number(process.env.BRIEF_AUDIO_OPENAI_TIMEOUT_MS);
	if (Number.isFinite(configured) && configured >= 10_000) {
		return Math.floor(configured);
	}
	return DEFAULT_OPENAI_TIMEOUT_MS;
}

function truncateErrorText(text: string): string {
	return text.length > 1000 ? `${text.slice(0, 997)}...` : text;
}

export function hasOpenAiTtsCredentials(): boolean {
	return getOpenAiApiKey() !== null;
}

export async function synthesizeBriefAudioWithOpenAI(
	text: string
): Promise<BriefAudioSynthesisResult> {
	const apiKey = getOpenAiApiKey();
	if (!apiKey) {
		throw new Error('OpenAI TTS is not configured');
	}

	const startedAt = Date.now();
	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort();
	}, getOpenAiTimeoutMs());

	try {
		const response = await fetch(OPENAI_TTS_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: OPENAI_TTS_MODEL,
				voice: OPENAI_TTS_VOICE,
				input: text,
				response_format: OPENAI_TTS_FORMAT,
				instructions: OPENAI_TTS_INSTRUCTIONS
			}),
			signal: controller.signal
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => '');
			throw new Error(
				`OpenAI TTS failed (${response.status}): ${
					errorText ? truncateErrorText(errorText) : response.statusText
				}`
			);
		}

		const audio = Buffer.from(await response.arrayBuffer());
		if (audio.length === 0) {
			throw new Error('OpenAI TTS returned empty audio');
		}

		return {
			mp3: audio,
			durationMs: null,
			generationMs: Date.now() - startedAt,
			sampleRate: null,
			model: `openai/${OPENAI_TTS_MODEL}`,
			voice: `openai:${OPENAI_TTS_VOICE}`
		};
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw new Error(`OpenAI TTS timed out after ${getOpenAiTimeoutMs()}ms`);
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}
