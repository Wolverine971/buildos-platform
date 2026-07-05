// apps/worker/src/lib/tts/openrouter.ts
import type { BriefAudioSynthesisResult } from './kokoro';

const OPENROUTER_TTS_URL = 'https://openrouter.ai/api/v1/audio/speech';
const OPENROUTER_TTS_MODEL = 'openai/gpt-audio-mini';
const OPENROUTER_TTS_VOICE = 'alloy';
const OPENROUTER_TTS_FORMAT = 'mp3' as const;
const OPENROUTER_TTS_SPEED = 1;
const DEFAULT_OPENROUTER_TIMEOUT_MS = 60_000;

function getOpenRouterApiKey(): string | null {
	const apiKey =
		process.env.PRIVATE_OPENROUTER_API_KEY?.trim() ||
		process.env.OPENROUTER_API_KEY?.trim() ||
		'';
	return apiKey.length > 0 ? apiKey : null;
}

function getOpenRouterHeaders(apiKey: string): Record<string, string> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${apiKey}`,
		'Content-Type': 'application/json'
	};

	const referer = process.env.PUBLIC_APP_URL;
	if (referer?.trim()) {
		headers['HTTP-Referer'] = referer.trim();
	}

	headers['X-OpenRouter-Title'] = 'BuildOS Worker';

	return headers;
}

function truncateErrorText(text: string): string {
	return text.length > 1000 ? `${text.slice(0, 997)}...` : text;
}

function parseOpenRouterError(errorText: string): string {
	if (!errorText) return 'OpenRouter returned an error';

	try {
		const parsed = JSON.parse(errorText) as {
			error?: { message?: unknown; code?: unknown };
			message?: unknown;
		};
		const message =
			typeof parsed.error?.message === 'string'
				? parsed.error.message
				: typeof parsed.message === 'string'
					? parsed.message
					: errorText;
		const code =
			typeof parsed.error?.code === 'string' || typeof parsed.error?.code === 'number'
				? ` (${parsed.error.code})`
				: '';
		return truncateErrorText(`${message}${code}`);
	} catch {
		return truncateErrorText(errorText);
	}
}

export function hasOpenRouterTtsCredentials(): boolean {
	return getOpenRouterApiKey() !== null;
}

export async function synthesizeBriefAudioWithOpenRouter(
	text: string
): Promise<BriefAudioSynthesisResult> {
	const apiKey = getOpenRouterApiKey();
	if (!apiKey) {
		throw new Error('OpenRouter TTS is not configured');
	}

	const startedAt = Date.now();
	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort();
	}, DEFAULT_OPENROUTER_TIMEOUT_MS);

	try {
		const body: Record<string, unknown> = {
			model: OPENROUTER_TTS_MODEL,
			voice: OPENROUTER_TTS_VOICE,
			input: text,
			response_format: OPENROUTER_TTS_FORMAT
		};

		if (Number.isFinite(OPENROUTER_TTS_SPEED) && OPENROUTER_TTS_SPEED > 0) {
			body.speed = OPENROUTER_TTS_SPEED;
		}

		const response = await fetch(OPENROUTER_TTS_URL, {
			method: 'POST',
			headers: getOpenRouterHeaders(apiKey),
			body: JSON.stringify(body),
			signal: controller.signal
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => '');
			throw new Error(
				`OpenRouter TTS failed (${response.status}): ${parseOpenRouterError(errorText)}`
			);
		}

		const audio = Buffer.from(await response.arrayBuffer());
		if (audio.length === 0) {
			throw new Error('OpenRouter TTS returned empty audio');
		}

		const resolvedModel = response.headers.get('x-openrouter-model') || OPENROUTER_TTS_MODEL;

		return {
			mp3: audio,
			durationMs: null,
			generationMs: Date.now() - startedAt,
			sampleRate: null,
			model: `openrouter/${resolvedModel}`,
			voice: `openrouter:${OPENROUTER_TTS_VOICE}`
		};
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw new Error(`OpenRouter TTS timed out after ${DEFAULT_OPENROUTER_TIMEOUT_MS}ms`);
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}
