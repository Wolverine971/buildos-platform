// apps/worker/src/lib/tts/openrouter.ts
import type { BriefAudioSynthesisResult } from './kokoro';
import { encodeMonoMp3 } from './mp3';

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_TTS_MODEL = 'openai/gpt-audio-mini';
const OPENROUTER_TTS_VOICE = 'alloy';
const OPENROUTER_TTS_FORMAT = 'pcm16' as const;
const OPENROUTER_TTS_SAMPLE_RATE = 24_000;
const DEFAULT_OPENROUTER_TIMEOUT_MS = 60_000;

function getOpenRouterApiKey(): string | null {
	const apiKey =
		process.env.PRIVATE_OPENROUTER_API_KEY?.trim() ||
		process.env.OPENROUTER_API_KEY?.trim() ||
		'';
	return apiKey.length > 0 ? apiKey : null;
}

function getOpenRouterTtsModel(): string | null {
	const model = process.env.OPENROUTER_TTS_MODEL?.trim() || DEFAULT_OPENROUTER_TTS_MODEL;
	return model.length > 0 ? model : null;
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

function pcm16BufferToFloat32Samples(pcm: Buffer): Float32Array {
	if (pcm.length === 0) {
		throw new Error('OpenRouter TTS returned empty audio');
	}

	if (pcm.length % 2 !== 0) {
		throw new Error(`OpenRouter TTS returned invalid pcm16 byte length: ${pcm.length}`);
	}

	const samples = new Float32Array(pcm.length / 2);
	for (let offset = 0; offset < pcm.length; offset += 2) {
		const value = pcm.readInt16LE(offset);
		samples[offset / 2] = value < 0 ? value / 0x8000 : value / 0x7fff;
	}

	return samples;
}

function parseOpenRouterAudioChunk(data: string): {
	audio: Buffer | null;
	model: string | null;
} {
	const parsed = JSON.parse(data) as {
		model?: unknown;
		choices?: Array<{
			delta?: {
				audio?: {
					data?: unknown;
				};
			};
		}>;
	};
	const audioData = parsed.choices?.[0]?.delta?.audio?.data;

	return {
		audio: typeof audioData === 'string' ? Buffer.from(audioData, 'base64') : null,
		model: typeof parsed.model === 'string' ? parsed.model : null
	};
}

async function collectOpenRouterAudioStream(response: Response): Promise<{
	pcm: Buffer;
	model: string | null;
}> {
	if (!response.body) {
		throw new Error('OpenRouter TTS returned an empty response body');
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const audioChunks: Buffer[] = [];
	let buffered = '';
	let resolvedModel: string | null = null;

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;

		buffered += decoder.decode(value, { stream: true });
		const lines = buffered.split(/\r?\n/);
		buffered = lines.pop() || '';

		for (const line of lines) {
			if (!line.startsWith('data:')) continue;
			const data = line.slice(5).trim();
			if (!data || data === '[DONE]') continue;

			const chunk = parseOpenRouterAudioChunk(data);
			resolvedModel ||= chunk.model;
			if (chunk.audio && chunk.audio.length > 0) {
				audioChunks.push(chunk.audio);
			}
		}
	}

	const tail = buffered.trim();
	if (tail.startsWith('data:')) {
		const data = tail.slice(5).trim();
		if (data && data !== '[DONE]') {
			const chunk = parseOpenRouterAudioChunk(data);
			resolvedModel ||= chunk.model;
			if (chunk.audio && chunk.audio.length > 0) {
				audioChunks.push(chunk.audio);
			}
		}
	}

	const pcm = Buffer.concat(audioChunks);
	if (pcm.length === 0) {
		throw new Error('OpenRouter TTS returned no audio chunks');
	}

	return { pcm, model: resolvedModel };
}

export async function synthesizeBriefAudioWithOpenRouter(
	text: string
): Promise<BriefAudioSynthesisResult> {
	const apiKey = getOpenRouterApiKey();
	if (!apiKey) {
		throw new Error('OpenRouter TTS is not configured');
	}
	const model = getOpenRouterTtsModel();
	if (!model) {
		throw new Error('OpenRouter TTS model is not configured');
	}

	const startedAt = Date.now();
	const controller = new AbortController();
	const timeout = setTimeout(() => {
		controller.abort();
	}, DEFAULT_OPENROUTER_TIMEOUT_MS);

	try {
		const body: Record<string, unknown> = {
			model,
			messages: [{ role: 'user', content: text }],
			modalities: ['text', 'audio'],
			audio: {
				voice: OPENROUTER_TTS_VOICE,
				format: OPENROUTER_TTS_FORMAT
			},
			stream: true,
			provider: {
				data_collection: 'deny'
			}
		};

		const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
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

		const streamedAudio = await collectOpenRouterAudioStream(response);
		const samples = pcm16BufferToFloat32Samples(streamedAudio.pcm);
		const audio = await encodeMonoMp3(samples, OPENROUTER_TTS_SAMPLE_RATE);
		const durationMs = Math.round((samples.length / OPENROUTER_TTS_SAMPLE_RATE) * 1000);
		const resolvedModel =
			response.headers.get('x-openrouter-model') || streamedAudio.model || model;

		return {
			mp3: audio,
			durationMs,
			generationMs: Date.now() - startedAt,
			sampleRate: OPENROUTER_TTS_SAMPLE_RATE,
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
