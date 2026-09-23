// apps/web/src/lib/voice/dictation-session.svelte.ts
//
// One dictation, start to finish, as reactive state every voice surface
// renders from. While the user talks, `confirmedText` grows with server
// transcripts of finished segments and `draftText` carries the browser's
// rough live words after them. Stopping only has to wait for the last short
// segment, so the final text lands in about the same time regardless of how
// long the user talked.

import {
	AudioCapture,
	VoiceCaptureError,
	voiceCaptureSupported,
	type AudioCaptureEvents,
	type CaptureResult,
	type CapturedSegment
} from './audio-capture';
import { DraftAligner, joinSpoken } from './draft-alignment';
import { LiveDraft, getRecognitionCtor, type LiveDraftEvents } from './live-draft';
import { requestTranscript } from './transcribe-client';
import {
	TranscriptionQueue,
	type QueuedSegment,
	type SegmentOutcome
} from './transcription-queue';

export type DictationPhase = 'idle' | 'starting' | 'recording' | 'finishing';

export interface DictationError {
	code: string;
	message: string;
	/** A Retry action can re-run transcription on the audio already recorded. */
	retryable: boolean;
}

export interface DictationResult {
	text: string;
	audio: Blob | null;
	durationSeconds: number;
	transcriptionSource: 'audio' | 'live' | 'none';
	transcriptionModel: string | null;
	/** Segments that could not be server-transcribed. */
	failedSegments: number;
}

export interface DictationAudio {
	audio: Blob;
	durationSeconds: number;
}

interface CaptureLike {
	start(): Promise<void>;
	stop(): Promise<CaptureResult>;
	abort(): void;
	readonly elapsedMs: number;
}

interface LiveDraftLike {
	readonly supported: boolean;
	start(): boolean;
	stop(): void;
}

export interface VoiceDictationOptions {
	/** Names and terms the model should expect (project names, people). Read per request. */
	vocabulary?: () => string;
	endpoint?: string | (() => string);
	/** The whole recording, as soon as capture stops (for saving as a voice note). */
	onAudio?: (audio: DictationAudio) => void;
	/** Final text, once every segment has settled. */
	onCommit?: (result: DictationResult) => void;
	createCapture?: (events: AudioCaptureEvents) => CaptureLike;
	createLiveDraft?: (events: LiveDraftEvents) => LiveDraftLike;
	transcribe?: typeof requestTranscript;
	settleDelayMs?: number;
	supported?: boolean;
}

export const LEVEL_BARS = 28;
const SETTLE_DELAY_MS = 700;
const CONTEXT_CHARS = 240;
const CLOCK_MS = 200;

function zeros(): number[] {
	return new Array(LEVEL_BARS).fill(0);
}

function transcriptionTimeoutMs(durationMs: number): number {
	return Math.min(110_000, Math.max(20_000, 15_000 + durationMs * 0.6));
}

function tailWords(text: string, maxChars: number): string {
	const trimmed = text.trim();
	if (trimmed.length <= maxChars) return trimmed;
	const tail = trimmed.slice(-maxChars);
	const firstSpace = tail.indexOf(' ');
	return firstSpace > 0 ? tail.slice(firstSpace + 1) : tail;
}

export function toDictationError(error: unknown): DictationError {
	if (error instanceof VoiceCaptureError) {
		return { code: error.code, message: error.message, retryable: false };
	}
	return {
		code: 'unknown',
		message: error instanceof Error && error.message ? error.message : 'Voice capture failed.',
		retryable: false
	};
}

export function formatDictationDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** At most one dictation captures at a time; starting another finishes the first. */
const activeDictations = new Set<VoiceDictation>();

export class VoiceDictation {
	phase = $state<DictationPhase>('idle');
	elapsedMs = $state(0);
	levels = $state<number[]>(zeros());
	confirmedText = $state('');
	draftText = $state('');
	pendingSegments = $state(0);
	error = $state<DictationError | null>(null);
	liveDraftActive = $state(false);
	/** Some audio couldn't be transcribed; waiting on Retry or Keep. */
	needsAttention = $state(false);

	readonly supported: boolean;
	readonly liveDraftSupported: boolean;

	#options: VoiceDictationOptions;
	#runId = 0;
	#capture: CaptureLike | null = null;
	#live: LiveDraftLike | null = null;
	#queue: TranscriptionQueue | null = null;
	#aligner = new DraftAligner();
	#segments = new Map<number, QueuedSegment>();
	#model: string | null = null;
	#lastFailure: string | null = null;
	#captureResult: CaptureResult | null = null;
	#clock: ReturnType<typeof setInterval> | null = null;
	#settleTimers = new Set<ReturnType<typeof setTimeout>>();
	#finishing: Promise<DictationResult | null> | null = null;

	constructor(options: VoiceDictationOptions = {}) {
		this.#options = options;
		this.supported = options.supported ?? voiceCaptureSupported();
		this.liveDraftSupported = options.createLiveDraft ? true : getRecognitionCtor() !== null;
	}

	get isCapturing(): boolean {
		return this.phase === 'starting' || this.phase === 'recording';
	}

	get isBusy(): boolean {
		return this.phase !== 'idle';
	}

	/** Everything heard so far, confirmed then draft. */
	get text(): string {
		return joinSpoken([this.confirmedText, this.draftText]);
	}

	async start(): Promise<boolean> {
		if (this.phase !== 'idle' || !this.supported) return false;
		for (const other of activeDictations) {
			if (other !== this && other.isCapturing) await other.stop();
		}
		if (this.phase !== 'idle') return false;

		const runId = ++this.#runId;
		activeDictations.add(this);
		this.#resetRun();
		this.phase = 'starting';

		this.#queue = new TranscriptionQueue({
			transcribe: (segment, { context, signal }) =>
				(this.#options.transcribe ?? requestTranscript)(segment.blob, {
					endpoint:
						typeof this.#options.endpoint === 'function'
							? this.#options.endpoint()
							: this.#options.endpoint,
					vocabulary: this.#options.vocabulary?.() ?? '',
					context,
					signal,
					timeoutMs: transcriptionTimeoutMs(segment.durationMs)
				}),
			contextFor: (index) => this.#contextFor(index),
			onStart: (index) => {
				if (runId !== this.#runId) return;
				this.#aligner.setStatus(index, 'transcribing');
			},
			onOutcome: (outcome) => this.#onOutcome(runId, outcome)
		});

		const capture = (this.#options.createCapture ?? ((events) => new AudioCapture(events)))({
			onLevel: (level) => this.#onLevel(runId, level),
			onSegmentCut: (index) => this.#onSegmentCut(runId, index),
			onSegment: (segment) => this.#onSegment(runId, segment),
			onInterrupted: (error) => {
				if (runId !== this.#runId || this.phase !== 'recording') return;
				this.error = toDictationError(error);
				void this.stop();
			}
		});
		this.#capture = capture;

		try {
			await capture.start();
		} catch (error) {
			if (runId !== this.#runId) return false;
			this.#capture = null;
			this.#queue = null;
			this.phase = 'idle';
			this.error = toDictationError(error);
			activeDictations.delete(this);
			return false;
		}
		if (runId !== this.#runId || this.phase !== 'starting') {
			capture.abort();
			return false;
		}

		this.phase = 'recording';
		const live = (this.#options.createLiveDraft ?? ((events) => new LiveDraft(events)))({
			onChange: ({ finalText, interimText }) => {
				if (runId !== this.#runId || this.phase !== 'recording') return;
				this.#aligner.setLive(finalText, interimText);
				this.#render();
			},
			onUnavailable: () => {
				if (runId === this.#runId) this.liveDraftActive = false;
			}
		});
		this.#live = live;
		this.liveDraftActive = live.supported ? live.start() : false;
		this.#clock = setInterval(() => {
			if (runId === this.#runId && this.phase === 'recording' && this.#capture) {
				this.elapsedMs = this.#capture.elapsedMs;
			}
		}, CLOCK_MS);
		return true;
	}

	/** Stop listening and resolve with the final text (null if cancelled or held for retry). */
	stop(): Promise<DictationResult | null> {
		if (this.phase === 'starting') {
			this.cancel();
			return Promise.resolve(null);
		}
		if (this.phase === 'finishing') return this.#finishing ?? Promise.resolve(null);
		if (this.phase !== 'recording') return Promise.resolve(null);
		this.phase = 'finishing';
		this.#finishing = this.#finish(this.#runId);
		return this.#finishing;
	}

	/** Discard the recording in progress. */
	cancel(): void {
		this.#runId += 1;
		this.#stopListening();
		this.#capture?.abort();
		this.#capture = null;
		this.#queue?.abort();
		this.#queue = null;
		this.#finishing = null;
		this.#resetRun();
		this.phase = 'idle';
		activeDictations.delete(this);
	}

	/** Re-run transcription for the segments that failed, using the recorded audio. */
	async retry(): Promise<DictationResult | null> {
		if (!this.needsAttention || !this.#queue) return null;
		const runId = this.#runId;
		this.needsAttention = false;
		this.error = null;
		this.#lastFailure = null;
		for (const slot of this.#aligner.slots) {
			if (slot.status !== 'failed') continue;
			const segment = this.#segments.get(slot.index);
			if (!segment) continue;
			this.#aligner.setStatus(slot.index, 'pending');
			this.#queue.push(segment);
		}
		this.#render();
		await this.#queue.settled();
		if (runId !== this.#runId) return null;
		return this.#complete(runId, false);
	}

	/** Keep whatever was transcribed and drop the parts that failed. */
	keepPartial(): DictationResult | null {
		if (!this.needsAttention) return null;
		return this.#complete(this.#runId, true);
	}

	dismissError(): void {
		if (!this.needsAttention) this.error = null;
	}

	/** Component teardown: a recording in progress is finished, not thrown away. */
	destroy(): void {
		if (this.phase === 'starting') this.cancel();
		else if (this.phase === 'recording') void this.stop();
		else if (this.needsAttention) this.keepPartial();
	}

	#resetRun() {
		this.#aligner.reset();
		this.#segments.clear();
		this.#model = null;
		this.#lastFailure = null;
		this.#captureResult = null;
		this.confirmedText = '';
		this.draftText = '';
		this.pendingSegments = 0;
		this.elapsedMs = 0;
		this.levels = zeros();
		this.error = null;
		this.needsAttention = false;
		this.liveDraftActive = false;
	}

	#stopListening() {
		if (this.#clock) clearInterval(this.#clock);
		this.#clock = null;
		this.#settleTimers.forEach((timer) => clearTimeout(timer));
		this.#settleTimers.clear();
		this.#live?.stop();
		this.#live = null;
		this.liveDraftActive = false;
	}

	async #finish(runId: number): Promise<DictationResult | null> {
		const capture = this.#capture;
		this.#stopListening();
		if (!capture) return this.#complete(runId, true);

		let captureResult: CaptureResult;
		try {
			captureResult = await capture.stop();
		} catch {
			captureResult = { fullAudio: null, durationMs: this.elapsedMs };
		}
		if (runId !== this.#runId) return null;
		this.#capture = null;
		this.#captureResult = captureResult;
		this.elapsedMs = captureResult.durationMs;
		this.levels = zeros();
		this.#aligner.settleAll();
		this.#render();
		if (captureResult.fullAudio) {
			try {
				this.#options.onAudio?.({
					audio: captureResult.fullAudio,
					durationSeconds: Math.round(captureResult.durationMs / 1000)
				});
			} catch {
				// Saving audio is best-effort; never block the transcript on it.
			}
		}

		await this.#queue?.settled();
		if (runId !== this.#runId) return null;
		return this.#complete(runId, false);
	}

	#complete(runId: number, acceptLoss: boolean): DictationResult | null {
		if (runId !== this.#runId) return null;
		const final = this.#aligner.final();
		if (final.lostSegments > 0 && !acceptLoss) {
			this.needsAttention = true;
			this.error = {
				code: 'transcription-failed',
				message: this.#lastFailure ?? "Couldn't transcribe part of this recording.",
				retryable: true
			};
			this.#render();
			return null;
		}

		const doneCount = this.#aligner.slots.filter((slot) => slot.status === 'done').length;
		const failedSegments = final.draftFallbacks + final.lostSegments;
		const result: DictationResult = {
			text: final.text,
			audio: this.#captureResult?.fullAudio ?? null,
			durationSeconds: Math.round((this.#captureResult?.durationMs ?? this.elapsedMs) / 1000),
			transcriptionSource: doneCount > 0 ? 'audio' : final.text ? 'live' : 'none',
			transcriptionModel: this.#model,
			failedSegments
		};

		this.needsAttention = false;
		if (final.draftFallbacks > 0) {
			this.error = {
				code: 'draft-fallback',
				message: 'Part of this used the quick draft. The audio is saved in Voice notes.',
				retryable: false
			};
		} else if (!result.text && !this.error) {
			this.error = {
				code: 'no-speech',
				message: "Didn't catch anything. Check your mic and try again.",
				retryable: false
			};
		} else if (final.lostSegments === 0 && this.error?.code === 'transcription-failed') {
			this.error = null;
		}

		this.#options.onCommit?.(result);
		this.confirmedText = '';
		this.draftText = '';
		this.pendingSegments = 0;
		this.#finishing = null;
		this.phase = 'idle';
		activeDictations.delete(this);
		return result;
	}

	#onLevel(runId: number, level: number) {
		if (runId !== this.#runId || this.phase !== 'recording') return;
		const previous = this.levels[this.levels.length - 1] ?? 0;
		// Quick attack, gentle release so the meter reads as a voice, not noise.
		const shown = level >= previous ? level : Math.max(level, previous * 0.72);
		this.levels = [...this.levels.slice(1), shown];
	}

	#onSegmentCut(runId: number, index: number) {
		if (runId !== this.#runId) return;
		this.#aligner.cut(index);
		if (this.phase !== 'recording') return;
		const timer = setTimeout(() => {
			this.#settleTimers.delete(timer);
			if (runId !== this.#runId) return;
			this.#aligner.settle(index);
			this.#render();
		}, this.#options.settleDelayMs ?? SETTLE_DELAY_MS);
		this.#settleTimers.add(timer);
	}

	#onSegment(runId: number, segment: CapturedSegment) {
		if (runId !== this.#runId || !this.#queue) return;
		const slot = this.#aligner.slots.find((entry) => entry.index === segment.index);
		// A quiet speaker can sit under the level gate; trust recognized words too.
		const heardWords = slot
			? Boolean(
					this.#aligner.liveFinal.slice(slot.draftStart).trim() ||
						this.#aligner.liveInterim
				)
			: false;
		const queued: QueuedSegment = {
			index: segment.index,
			blob: segment.blob,
			durationMs: Math.max(0, segment.endMs - segment.startMs),
			hasSpeech: segment.hasSpeech || heardWords
		};
		this.#segments.set(segment.index, queued);
		this.#queue.push(queued);
		this.#render();
	}

	#onOutcome(runId: number, outcome: SegmentOutcome) {
		if (runId !== this.#runId) return;
		if (outcome.status === 'done') {
			this.#aligner.setStatus(outcome.index, 'done', outcome.text);
			this.#model = outcome.model ?? this.#model;
		} else if (outcome.status === 'empty') {
			this.#aligner.setStatus(outcome.index, 'empty');
		} else {
			this.#aligner.setStatus(outcome.index, 'failed');
			this.#lastFailure =
				outcome.error.status === 429
					? 'Transcription is busy right now. Wait a moment, then retry.'
					: outcome.error.message;
		}
		this.#render();
	}

	#contextFor(index: number): string {
		const previous = this.#aligner.slots.find((slot) => slot.index === index - 1);
		if (!previous) return '';
		const text = previous.status === 'done' ? previous.text : this.#aligner.draftFor(previous);
		return tailWords(text, CONTEXT_CHARS);
	}

	#render() {
		const { confirmed, draft } = this.#aligner.compose();
		this.confirmedText = confirmed;
		this.draftText = draft;
		this.pendingSegments = this.#aligner.slots.filter(
			(slot) => slot.status === 'pending' || slot.status === 'transcribing'
		).length;
	}
}
