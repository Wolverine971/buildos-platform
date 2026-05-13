// apps/worker/src/lib/tts/mp3.ts
const MP3_BLOCK_SIZE = 1152;
const DEFAULT_MP3_KBPS = 64;

type Mp3EncoderConstructor = new (
	channels: number,
	sampleRate: number,
	kbps: number
) => {
	encodeBuffer(left: Int16Array, right?: Int16Array): Uint8Array;
	flush(): Uint8Array;
};

type LameJsModule = {
	Mp3Encoder: Mp3EncoderConstructor;
};

let lameJsPromise: Promise<LameJsModule> | null = null;

function loadLameJs(): Promise<LameJsModule> {
	if (!lameJsPromise) {
		const dynamicImport = new Function('specifier', 'return import(specifier)') as (
			specifier: string
		) => Promise<LameJsModule>;
		lameJsPromise = dynamicImport('@breezystack/lamejs');
	}
	return lameJsPromise;
}

function clampSample(sample: number): number {
	if (Number.isNaN(sample)) return 0;
	if (sample > 1) return 1;
	if (sample < -1) return -1;
	return sample;
}

function floatToInt16(samples: Float32Array): Int16Array {
	const pcm = new Int16Array(samples.length);
	for (let i = 0; i < samples.length; i += 1) {
		const sample = clampSample(samples[i] ?? 0);
		pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
	}
	return pcm;
}

export async function encodeMonoMp3(
	samples: Float32Array,
	sampleRate: number,
	kbps: number = DEFAULT_MP3_KBPS
): Promise<Buffer> {
	if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
		throw new Error(`Invalid audio sample rate: ${sampleRate}`);
	}

	if (!samples.length) {
		throw new Error('Cannot encode empty audio');
	}

	const { Mp3Encoder } = await loadLameJs();
	const encoder = new Mp3Encoder(1, Math.round(sampleRate), kbps);
	const pcm = floatToInt16(samples);
	const chunks: Buffer[] = [];

	for (let offset = 0; offset < pcm.length; offset += MP3_BLOCK_SIZE) {
		const frame = encoder.encodeBuffer(pcm.subarray(offset, offset + MP3_BLOCK_SIZE));
		if (frame.length > 0) {
			chunks.push(Buffer.from(frame));
		}
	}

	const flush = encoder.flush();
	if (flush.length > 0) {
		chunks.push(Buffer.from(flush));
	}

	return Buffer.concat(chunks);
}
