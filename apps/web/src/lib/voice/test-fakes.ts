// apps/web/src/lib/voice/test-fakes.ts
//
// Fakes for component tests: a controllable mic, live draft, and transcriber
// behind the real dictation engine. Use from vi.mock factories:
//
//   vi.mock('$lib/voice/audio-capture', async (orig) =>
//     (await import('$lib/voice/test-fakes')).fakeAudioCaptureModule(await orig()));
//   vi.mock('$lib/voice/live-draft', async (orig) =>
//     (await import('$lib/voice/test-fakes')).fakeLiveDraftModule(await orig()));
//   vi.mock('$lib/voice/transcribe-client', async (orig) =>
//     (await import('$lib/voice/test-fakes')).fakeTranscribeModule(await orig()));

import type { AudioCaptureEvents } from './audio-capture';
import type { LiveDraftEvents } from './live-draft';
import type { TranscriptResult } from './transcribe-client';

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
}

export function deferred<T = void>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

export const voiceFake = {
	captureEvents: null as AudioCaptureEvents | null,
	liveEvents: null as LiveDraftEvents | null,
	/** When set, capture.start waits on it (resolve = mic granted, reject = error). */
	start: null as Deferred<void> | null,
	/** When set, the next transcription waits on it. */
	transcription: null as Deferred<TranscriptResult> | null,
	transcripts: [] as string[],
	reset() {
		this.captureEvents = null;
		this.liveEvents = null;
		this.start = null;
		this.transcription = null;
		this.transcripts = [];
	}
};

export function fakeAudioCaptureModule<T extends object>(actual: T) {
	class FakeCapture {
		elapsedMs = 0;
		constructor(events: AudioCaptureEvents) {
			voiceFake.captureEvents = events;
		}
		start() {
			return voiceFake.start?.promise ?? Promise.resolve();
		}
		async stop() {
			voiceFake.captureEvents?.onSegmentCut?.(0);
			voiceFake.captureEvents?.onSegment({
				index: 0,
				blob: new Blob(['audio'], { type: 'audio/webm' }),
				startMs: 0,
				endMs: 4_000,
				speechMs: 3_000,
				hasSpeech: true
			});
			return { fullAudio: new Blob(['full'], { type: 'audio/webm' }), durationMs: 4_000 };
		}
		abort() {}
	}
	return { ...actual, AudioCapture: FakeCapture, voiceCaptureSupported: () => true };
}

export function fakeLiveDraftModule<T extends object>(actual: T) {
	class FakeLiveDraft {
		supported = true;
		constructor(events: LiveDraftEvents) {
			voiceFake.liveEvents = events;
		}
		start() {
			return true;
		}
		stop() {}
	}
	return { ...actual, LiveDraft: FakeLiveDraft, getRecognitionCtor: () => class {} };
}

export function fakeTranscribeModule<T extends object>(actual: T) {
	return {
		...actual,
		requestTranscript: async (): Promise<TranscriptResult> => {
			if (voiceFake.transcription) return voiceFake.transcription.promise;
			return { text: voiceFake.transcripts.shift() ?? 'Hello there.', model: 'test-model' };
		}
	};
}

/** jsdom has no ResizeObserver; the dictation mirror uses one. */
export function installResizeObserverStub(): void {
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}
