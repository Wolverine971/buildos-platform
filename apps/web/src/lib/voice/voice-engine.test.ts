// apps/web/src/lib/voice/voice-engine.test.ts
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SEGMENT_POLICY, SpeechActivityTracker, shouldCutSegment } from './speech-activity';
import { TranscriptionQueue, type SegmentOutcome } from './transcription-queue';
import { TranscriptionRequestError, requestTranscript } from './transcribe-client';
import { DraftAligner } from './draft-alignment';
import { spliceDictation } from './dictation-text';
import { LiveDraft, appendFinalChunk } from './live-draft';
import { TextareaDictationAnchor } from './textarea-dictation';

describe('shouldCutSegment', () => {
	it('never cuts before the minimum, even in silence', () => {
		expect(shouldCutSegment({ segmentMs: 5_000, silentMs: 3_000 })).toBe(false);
	});

	it('cuts at a pause once past the minimum', () => {
		expect(shouldCutSegment({ segmentMs: 9_000, silentMs: 400 })).toBe(false);
		expect(shouldCutSegment({ segmentMs: 9_000, silentMs: 600 })).toBe(true);
	});

	it('accepts shorter pauses late in a segment and always cuts at the cap', () => {
		expect(shouldCutSegment({ segmentMs: 21_000, silentMs: 300 })).toBe(true);
		expect(
			shouldCutSegment({ segmentMs: DEFAULT_SEGMENT_POLICY.maxSegmentMs, silentMs: 0 })
		).toBe(true);
	});
});

describe('SpeechActivityTracker', () => {
	it('keeps detecting speech through a long monologue with no pauses', () => {
		const tracker = new SpeechActivityTracker();
		for (let i = 0; i < 40; i++) tracker.feed(0.004, 50); // room tone
		for (let i = 0; i < 1_200; i++) tracker.feed(0.05, 50); // 60s of talking
		expect(tracker.isSpeech).toBe(true);
		expect(tracker.segmentSpeechMs).toBeGreaterThan(55_000);
	});

	it('tracks silence after speech and resets per segment', () => {
		const tracker = new SpeechActivityTracker();
		for (let i = 0; i < 20; i++) tracker.feed(0.06, 50);
		for (let i = 0; i < 12; i++) tracker.feed(0.002, 50);
		expect(tracker.silentMs).toBe(600);
		expect(tracker.resetSegment().speechMs).toBe(1_000);
		expect(tracker.segmentSpeechMs).toBe(0);
	});
});

function blob(label = 'a') {
	return new Blob([label], { type: 'audio/webm' });
}

describe('TranscriptionQueue', () => {
	const noSleep = () => Promise.resolve();

	it('skips segments with no speech without a request', async () => {
		const transcribe = vi.fn();
		const outcomes: SegmentOutcome[] = [];
		const queue = new TranscriptionQueue({
			transcribe,
			contextFor: () => '',
			onOutcome: (o) => outcomes.push(o)
		});
		queue.push({ index: 0, blob: blob(), durationMs: 9_000, hasSpeech: false });
		await queue.settled();
		expect(transcribe).not.toHaveBeenCalled();
		expect(outcomes).toEqual([{ index: 0, status: 'empty' }]);
	});

	it('retries transient failures, then succeeds', async () => {
		let calls = 0;
		const outcomes: SegmentOutcome[] = [];
		const queue = new TranscriptionQueue({
			transcribe: async () => {
				calls += 1;
				if (calls < 3) throw new TranscriptionRequestError('busy', { retryable: true, status: 503 });
				return { text: 'hello there', model: 'm' };
			},
			contextFor: () => '',
			onOutcome: (o) => outcomes.push(o),
			sleep: noSleep
		});
		queue.push({ index: 0, blob: blob(), durationMs: 9_000, hasSpeech: true });
		await queue.settled();
		expect(calls).toBe(3);
		expect(outcomes).toEqual([{ index: 0, status: 'done', text: 'hello there', model: 'm' }]);
	});

	it('does not retry a permanent failure', async () => {
		const transcribe = vi.fn(async () => {
			throw new TranscriptionRequestError('bad audio', { retryable: false, status: 400 });
		});
		const outcomes: SegmentOutcome[] = [];
		const queue = new TranscriptionQueue({
			transcribe,
			contextFor: () => '',
			onOutcome: (o) => outcomes.push(o),
			sleep: noSleep
		});
		queue.push({ index: 0, blob: blob(), durationMs: 9_000, hasSpeech: true });
		await queue.settled();
		expect(transcribe).toHaveBeenCalledTimes(1);
		expect(outcomes[0]?.status).toBe('failed');
	});

	it('runs at most two at once and passes per-segment context', async () => {
		let running = 0;
		let peak = 0;
		const contexts: string[] = [];
		const queue = new TranscriptionQueue({
			transcribe: async (segment, { context }) => {
				contexts.push(context);
				running += 1;
				peak = Math.max(peak, running);
				await new Promise((resolve) => setTimeout(resolve, 5));
				running -= 1;
				return { text: `t${segment.index}`, model: null };
			},
			contextFor: (index) => `ctx${index}`,
			onOutcome: () => undefined
		});
		for (let index = 0; index < 5; index++) {
			queue.push({ index, blob: blob(), durationMs: 9_000, hasSpeech: true });
		}
		await queue.settled();
		expect(peak).toBe(2);
		expect(contexts.sort()).toEqual(['ctx0', 'ctx1', 'ctx2', 'ctx3', 'ctx4']);
	});
});

describe('requestTranscript', () => {
	function respond(status: number, body: unknown) {
		return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
	}

	it('returns an empty transcript as empty text, not an error', async () => {
		const result = await requestTranscript(blob(), {
			timeoutMs: 1_000,
			fetchImpl: respond(200, { success: true, data: { transcript: '' } })
		});
		expect(result.text).toBe('');
	});

	it('classifies 429 as retryable and 400 as permanent', async () => {
		await expect(
			requestTranscript(blob(), {
				timeoutMs: 1_000,
				fetchImpl: respond(429, { error: 'slow down', details: { retryAfter: 3 } })
			})
		).rejects.toMatchObject({ retryable: true, status: 429, retryAfterMs: 3_000 });
		await expect(
			requestTranscript(blob(), { timeoutMs: 1_000, fetchImpl: respond(400, { error: 'nope' }) })
		).rejects.toMatchObject({ retryable: false, status: 400, message: 'nope' });
	});

	it('sends vocabulary and context with the audio', async () => {
		const fetchImpl = respond(200, { success: true, data: { transcript: 'ok' } });
		await requestTranscript(blob(), {
			timeoutMs: 1_000,
			vocabulary: 'Samos, Marcus',
			context: 'the bid desk',
			fetchImpl
		});
		const body = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
			?.body as FormData;
		expect(body.get('vocabularyTerms')).toBe('Samos, Marcus');
		expect(body.get('context')).toBe('the bid desk');
		expect(body.get('allowEmpty')).toBe('true');
	});
});

describe('DraftAligner', () => {
	it('swaps a segment draft for its server text and keeps later drafts grey', () => {
		const aligner = new DraftAligner();
		aligner.setLive('so the bid desk needs', 'a follow');
		aligner.cut(0);
		aligner.setLive('so the bid desk needs a follow up', '');
		aligner.settle(0);
		aligner.setLive('so the bid desk needs a follow up with Marcus', 'about');

		expect(aligner.compose()).toEqual({
			confirmed: '',
			draft: 'so the bid desk needs a follow up with Marcus about'
		});

		aligner.setStatus(0, 'done', 'So the bid desk needs a follow-up.');
		expect(aligner.compose()).toEqual({
			confirmed: 'So the bid desk needs a follow-up.',
			draft: 'with Marcus about'
		});
	});

	it('hides the open draft until the last cut settles (no duplicated words)', () => {
		const aligner = new DraftAligner();
		aligner.setLive('first thought', '');
		aligner.cut(0);
		aligner.setLive('first thought done', 'next');
		expect(aligner.compose().draft).toBe('first thought done next');
	});

	it('falls back to the draft for a failed segment and counts losses', () => {
		const aligner = new DraftAligner();
		aligner.setLive('alpha beta', '');
		aligner.cut(0);
		aligner.settle(0);
		aligner.cut(1);
		aligner.settleAll();
		aligner.setStatus(0, 'failed');
		aligner.setStatus(1, 'failed');
		expect(aligner.final()).toEqual({ text: 'alpha beta', draftFallbacks: 1, lostSegments: 1 });
	});
});

describe('spliceDictation', () => {
	it('adds natural spacing around dictated words', () => {
		expect(spliceDictation('Hello', 'world', '').value).toBe('Hello world');
		expect(spliceDictation('Hello ', 'world', '').value).toBe('Hello world');
		expect(spliceDictation('Start', 'middle', 'end').value).toBe('Start middle end');
		expect(spliceDictation('Done', ', really', '').value).toBe('Done, really');
		expect(spliceDictation('', 'fresh', '').value).toBe('fresh');
	});

	it('reports where the caret belongs', () => {
		const insertion = spliceDictation('A', 'b c', 'D');
		expect(insertion.value.slice(insertion.start, insertion.end)).toBe('b c');
	});
});

describe('TextareaDictationAnchor', () => {
	it('dictates at the caret and commits in place', () => {
		const anchor = new TextareaDictationAnchor();
		anchor.begin('Call Marcus today', { start: 12, end: 12 });
		expect(anchor.write('about Samos', 'and the bid')).toBe(
			'Call Marcus about Samos and the bid today'
		);
		expect(anchor.commit('about Samos and the bid.')).toEqual({
			value: 'Call Marcus about Samos and the bid. today',
			caret: 36
		});
	});

	it('appends after text the host replaced mid-dictation', () => {
		const anchor = new TextareaDictationAnchor();
		anchor.begin('draft', null);
		anchor.write('', 'words');
		expect(anchor.observe('')).toBe(true);
		expect(anchor.write('', 'words')).toBe('words');
	});
});

describe('LiveDraft', () => {
	class FakeRecognition {
		static instances: FakeRecognition[] = [];
		continuous = false;
		interimResults = false;
		lang = '';
		onresult: ((event: any) => void) | null = null;
		onerror: ((event: any) => void) | null = null;
		onend: (() => void) | null = null;
		start = vi.fn();
		abort = vi.fn();
		constructor() {
			FakeRecognition.instances.push(this);
		}
		emit(transcript: string, isFinal: boolean) {
			const result = Object.assign([{ transcript }], { isFinal });
			this.onresult?.({ resultIndex: 0, results: [result] });
		}
	}

	it('keeps restarting across many pauses (live preview never freezes)', () => {
		vi.useFakeTimers();
		FakeRecognition.instances = [];
		const changes: string[] = [];
		const draft = new LiveDraft(
			{ onChange: ({ finalText }) => changes.push(finalText) },
			FakeRecognition as any
		);
		draft.start();
		for (let pause = 0; pause < 5; pause++) {
			const current = FakeRecognition.instances.at(-1)!;
			current.emit(`part${pause}`, true);
			current.onend?.();
			vi.advanceTimersByTime(200);
		}
		expect(FakeRecognition.instances.length).toBe(6);
		expect(draft.finalText).toBe('part0 part1 part2 part3 part4');
		draft.stop();
		vi.useRealTimers();
	});

	it('gives up quietly when the browser refuses recognition', () => {
		FakeRecognition.instances = [];
		const onUnavailable = vi.fn();
		const draft = new LiveDraft({ onChange: () => undefined, onUnavailable }, FakeRecognition as any);
		draft.start();
		FakeRecognition.instances[0]!.onerror?.({ error: 'not-allowed' });
		expect(onUnavailable).toHaveBeenCalledWith('not-allowed');
	});

	it('treats cumulative Android finals as replacements', () => {
		let state = { text: '', lastChunk: '' };
		state = appendFinalChunk(state, 'hello');
		state = appendFinalChunk(state, 'hello world');
		state = appendFinalChunk(state, 'next');
		expect(state.text).toBe('hello world next');
	});
});
