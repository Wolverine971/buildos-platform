// apps/worker/src/lib/tts/kokoro.ts
import { KokoroTTS } from 'kokoro-js';
import { encodeMonoMp3 } from './mp3';

type RawAudioLike = {
	audio?: Float32Array | number[];
	sampling_rate?: number;
	sampleRate?: number;
};

export interface BriefAudioSynthesisResult {
	mp3: Buffer;
	durationMs: number | null;
	generationMs: number;
	sampleRate: number | null;
	model: string;
	voice: string;
}

const KOKORO_MODEL_ID =
	process.env.BRIEF_AUDIO_KOKORO_MODEL || 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_VOICE = process.env.BRIEF_AUDIO_KOKORO_VOICE || 'am_onyx';
const KOKORO_SPEED = Number(process.env.BRIEF_AUDIO_KOKORO_SPEED || '1');
const KOKORO_SPLIT_PATTERN = /(?<=[.!?])\s+/u;

let ttsPromise: Promise<KokoroTTS> | null = null;

function getTts(): Promise<KokoroTTS> {
	if (!ttsPromise) {
		const promise = KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
			dtype: 'q8',
			device: 'cpu'
		});
		ttsPromise = promise;
	}
	return ttsPromise;
}

function normalizeRawAudio(rawAudio: RawAudioLike): { samples: Float32Array; sampleRate: number } {
	const audio = rawAudio.audio;
	if (!audio) {
		throw new Error('Kokoro returned audio without samples');
	}

	const samples = audio instanceof Float32Array ? audio : Float32Array.from(audio);
	const sampleRate = rawAudio.sampling_rate ?? rawAudio.sampleRate;
	if (!sampleRate) {
		throw new Error('Kokoro returned audio without a sample rate');
	}

	return { samples, sampleRate };
}

function concatSamples(chunks: Float32Array[]): Float32Array {
	const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
	const output = new Float32Array(length);
	let offset = 0;

	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.length;
	}

	return output;
}

export async function synthesizeBriefAudio(text: string): Promise<BriefAudioSynthesisResult> {
	const startedAt = Date.now();
	const tts = await getTts();
	const voices = tts.voices as Record<string, unknown>;

	if (!voices[KOKORO_VOICE]) {
		throw new Error(`Unknown Kokoro voice: ${KOKORO_VOICE}`);
	}

	const sampleChunks: Float32Array[] = [];
	let sampleRate: number | null = null;

	for await (const chunk of tts.stream(text, {
		voice: KOKORO_VOICE,
		speed: Number.isFinite(KOKORO_SPEED) && KOKORO_SPEED > 0 ? KOKORO_SPEED : 1,
		split_pattern: KOKORO_SPLIT_PATTERN
	})) {
		const normalized = normalizeRawAudio(chunk.audio as RawAudioLike);
		if (sampleRate === null) {
			sampleRate = normalized.sampleRate;
		} else if (sampleRate !== normalized.sampleRate) {
			throw new Error(
				`Kokoro returned inconsistent sample rates: ${sampleRate} and ${normalized.sampleRate}`
			);
		}
		sampleChunks.push(normalized.samples);
	}

	if (sampleRate === null || sampleChunks.length === 0) {
		throw new Error('Kokoro returned no audio');
	}

	const samples = concatSamples(sampleChunks);
	const durationMs = Math.round((samples.length / sampleRate) * 1000);
	const mp3 = await encodeMonoMp3(samples, sampleRate);

	return {
		mp3,
		durationMs,
		generationMs: Date.now() - startedAt,
		sampleRate,
		model: KOKORO_MODEL_ID,
		voice: KOKORO_VOICE
	};
}
