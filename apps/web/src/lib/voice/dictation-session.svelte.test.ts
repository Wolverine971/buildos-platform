// apps/web/src/lib/voice/dictation-session.svelte.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AudioCaptureEvents, CaptureResult } from './audio-capture';
import { VoiceCaptureError } from './audio-capture';
import type { LiveDraftEvents } from './live-draft';
import { TranscriptionRequestError } from './transcribe-client';
import { VoiceDictation, type DictationResult } from './dictation-session.svelte';

function audio(label: string) {
	return new Blob([label], { type: 'audio/webm' });
}

function harness(
	options: {
		transcribe?: (blob: Blob) => Promise<{ text: string; model: string | null }>;
		startError?: Error;
	} = {}
) {
	let captureEvents!: AudioCaptureEvents;
	let liveEvents!: LiveDraftEvents;
	const commits: DictationResult[] = [];
	const audios: Blob[] = [];
	const capture = {
		elapsedMs: 0,
		start: vi.fn(async () => {
			if (options.startError) throw options.startError;
		}),
		stop: vi.fn(async (): Promise<CaptureResult> => {
			captureEvents.onSegmentCut?.(1);
			captureEvents.onSegment({
				index: 1,
				blob: audio('tail'),
				startMs: 10_000,
				endMs: 12_000,
				speechMs: 1_500,
				hasSpeech: true
			});
			return { fullAudio: audio('full'), durationMs: 12_000 };
		}),
		abort: vi.fn()
	};
	const transcribe = vi.fn(
		async (blob: Blob) =>
			(await options.transcribe?.(blob)) ?? {
				text: (await blob.text()) === 'tail' ? 'And the tail.' : 'First part.',
				model: 'openai/gpt-transcribe'
			}
	);
	const dictation = new VoiceDictation({
		supported: true,
		settleDelayMs: 0,
		createCapture: (events) => {
			captureEvents = events;
			return capture;
		},
		createLiveDraft: (events) => {
			liveEvents = events;
			return { supported: true, start: () => true, stop: () => undefined };
		},
		transcribe: (blob) => transcribe(blob),
		onAudio: ({ audio }) => audios.push(audio),
		onCommit: (result) => commits.push(result)
	});
	return {
		dictation,
		capture,
		transcribe,
		commits,
		audios,
		get captureEvents() {
			return captureEvents;
		},
		get liveEvents() {
			return liveEvents;
		}
	};
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('VoiceDictation', () => {
	it('shows draft words, confirms finished segments while talking, and commits server text', async () => {
		const h = harness();
		expect(await h.dictation.start()).toBe(true);
		expect(h.dictation.phase).toBe('recording');

		h.liveEvents.onChange({ finalText: 'first part', interimText: '' });
		expect(h.dictation.draftText).toBe('first part');

		h.captureEvents.onSegmentCut?.(0);
		h.captureEvents.onSegment({
			index: 0,
			blob: audio('first'),
			startMs: 0,
			endMs: 10_000,
			speechMs: 8_000,
			hasSpeech: true
		});
		await tick();
		await tick();
		h.liveEvents.onChange({ finalText: 'first part and the tale', interimText: '' });
		expect(h.dictation.confirmedText).toBe('First part.');
		expect(h.dictation.draftText).toBe('and the tale');

		const result = await h.dictation.stop();
		expect(result?.text).toBe('First part. And the tail.');
		expect(result?.transcriptionSource).toBe('audio');
		expect(h.commits).toHaveLength(1);
		expect(h.audios).toHaveLength(1);
		expect(h.dictation.phase).toBe('idle');
		expect(h.dictation.error).toBeNull();
	});

	it('holds for Retry when a segment fails with no draft, then recovers', async () => {
		let failing = true;
		const h = harness({
			transcribe: async () => {
				if (failing)
					throw new TranscriptionRequestError('down', { retryable: false, status: 400 });
				return { text: 'Recovered.', model: null };
			}
		});
		await h.dictation.start();
		const pending = await h.dictation.stop();
		expect(pending).toBeNull();
		expect(h.dictation.needsAttention).toBe(true);
		expect(h.dictation.phase).toBe('finishing');
		expect(h.commits).toHaveLength(0);

		failing = false;
		const result = await h.dictation.retry();
		expect(result?.text).toBe('Recovered.');
		expect(h.dictation.needsAttention).toBe(false);
		expect(h.dictation.phase).toBe('idle');
	});

	it('uses the live draft when server transcription fails and says so', async () => {
		const h = harness({
			transcribe: async () => {
				throw new TranscriptionRequestError('down', { retryable: false, status: 400 });
			}
		});
		await h.dictation.start();
		h.liveEvents.onChange({ finalText: 'rough words', interimText: '' });
		const result = await h.dictation.stop();
		expect(result?.text).toBe('rough words');
		expect(result?.transcriptionSource).toBe('live');
		expect(h.dictation.error?.code).toBe('draft-fallback');
	});

	it('reports a blocked mic without getting stuck', async () => {
		const h = harness({ startError: new VoiceCaptureError('permission-denied') });
		expect(await h.dictation.start()).toBe(false);
		expect(h.dictation.phase).toBe('idle');
		expect(h.dictation.error?.code).toBe('permission-denied');
	});

	it('finishes with what it has when the mic disconnects', async () => {
		const h = harness();
		await h.dictation.start();
		h.captureEvents.onInterrupted?.(new VoiceCaptureError('interrupted'));
		await vi.waitFor(() => expect(h.dictation.phase).toBe('idle'));
		expect(h.commits[0]?.text).toBe('And the tail.');
		expect(h.dictation.error?.code).toBe('interrupted');
	});

	it('starting a second dictation finishes the first', async () => {
		const first = harness();
		const second = harness();
		await first.dictation.start();
		await second.dictation.start();
		expect(first.dictation.phase).toBe('idle');
		expect(first.commits).toHaveLength(1);
		expect(second.dictation.phase).toBe('recording');
		second.dictation.cancel();
	});
});
