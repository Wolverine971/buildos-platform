// apps/worker/src/types/kokoro-js.d.ts
declare module 'kokoro-js' {
	export class KokoroTTS {
		static from_pretrained(
			modelId: string,
			options?: {
				dtype?: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';
				device?: 'wasm' | 'webgpu' | 'cpu' | null;
				progress_callback?: unknown;
			}
		): Promise<KokoroTTS>;

		readonly voices: Record<string, unknown>;

		stream(
			text: string,
			options?: {
				voice?: string;
				speed?: number;
				split_pattern?: RegExp;
			}
		): AsyncGenerator<
			{
				text: string;
				phonemes: string;
				audio: {
					audio?: Float32Array | number[];
					sampling_rate?: number;
					sampleRate?: number;
				};
			},
			void,
			void
		>;
	}
}
