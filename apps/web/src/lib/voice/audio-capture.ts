// apps/web/src/lib/voice/audio-capture.ts
//
// Microphone capture for dictation. One stream feeds:
//   - an analyser: the live level meter + pause detection,
//   - a "full" MediaRecorder: the whole recording, saved as a voice note,
//   - rolling "segment" recorders: each cut at a pause becomes a standalone
//     audio file that is transcribed while the user keeps talking.
// A new segment recorder starts before the previous one stops, so the cut
// (which lands in silence) never drops audio.

import {
	DEFAULT_SEGMENT_POLICY,
	MIN_SEGMENT_SPEECH_MS,
	SpeechActivityTracker,
	rmsOf,
	shouldCutSegment,
	type SegmentPolicy
} from './speech-activity';

export type VoiceCaptureErrorCode =
	| 'unsupported'
	| 'insecure'
	| 'permission-denied'
	| 'no-device'
	| 'device-busy'
	| 'interrupted'
	| 'recorder-failed'
	| 'unknown';

const CAPTURE_ERROR_MESSAGES: Record<VoiceCaptureErrorCode, string> = {
	unsupported: "This browser can't record audio.",
	insecure: 'Voice needs a secure (https) connection.',
	'permission-denied':
		"Microphone access is blocked. Allow it in your browser's site settings, then try again.",
	'no-device': 'No microphone found. Connect one and try again.',
	'device-busy': 'Your microphone is busy in another app. Close it and try again.',
	interrupted: 'Microphone disconnected. Kept what you said so far.',
	'recorder-failed': 'Recording stopped unexpectedly. Kept what you said so far.',
	unknown: "Couldn't start the microphone. Try again."
};

export class VoiceCaptureError extends Error {
	readonly code: VoiceCaptureErrorCode;

	constructor(code: VoiceCaptureErrorCode, message = CAPTURE_ERROR_MESSAGES[code]) {
		super(message);
		this.name = 'VoiceCaptureError';
		this.code = code;
	}
}

export function mapGetUserMediaError(error: unknown): VoiceCaptureError {
	const name = error instanceof Error || error instanceof DOMException ? error.name : '';
	switch (name) {
		case 'NotAllowedError':
		case 'PermissionDeniedError':
		case 'SecurityError':
			return new VoiceCaptureError('permission-denied');
		case 'NotFoundError':
		case 'DevicesNotFoundError':
		case 'OverconstrainedError':
			return new VoiceCaptureError('no-device');
		case 'NotReadableError':
		case 'TrackStartError':
		case 'AbortError':
			return new VoiceCaptureError('device-busy');
		default:
			return new VoiceCaptureError('unknown');
	}
}

export interface CapturedSegment {
	index: number;
	blob: Blob;
	startMs: number;
	endMs: number;
	speechMs: number;
	/** False when the analyser heard no speech; such segments skip transcription. */
	hasSpeech: boolean;
}

export interface CaptureResult {
	fullAudio: Blob | null;
	durationMs: number;
}

export interface AudioCaptureEvents {
	/** 0..1, ~20 times a second while recording. */
	onLevel?: (level: number) => void;
	/** Fired synchronously at the moment a segment boundary is chosen. */
	onSegmentCut?: (index: number) => void;
	/** Fired once the segment's audio file is ready. */
	onSegment: (segment: CapturedSegment) => void;
	/** The mic went away mid-recording (unplugged, permission revoked, recorder error). */
	onInterrupted?: (error: VoiceCaptureError) => void;
}

export interface AudioCaptureDeps {
	getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
	MediaRecorder?: typeof MediaRecorder;
	AudioContext?: typeof AudioContext;
	now?: () => number;
	tickMs?: number;
	policy?: SegmentPolicy;
}

const MIME_CANDIDATES = [
	'audio/webm;codecs=opus',
	'audio/webm',
	'audio/mp4',
	'audio/ogg;codecs=opus',
	'audio/ogg'
];
const AUDIO_BITS_PER_SECOND = 48_000;
const RECORDER_STOP_TIMEOUT_MS = 3_000;

export function voiceCaptureSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof navigator !== 'undefined' &&
		typeof navigator.mediaDevices?.getUserMedia === 'function' &&
		typeof window.MediaRecorder === 'function'
	);
}

function pickMimeType(Recorder: typeof MediaRecorder): string | undefined {
	if (typeof Recorder.isTypeSupported !== 'function') return undefined;
	return MIME_CANDIDATES.find((candidate) => {
		try {
			return Recorder.isTypeSupported(candidate);
		} catch {
			return false;
		}
	});
}

interface RunningRecorder {
	recorder: MediaRecorder;
	done: Promise<Blob>;
}

export class AudioCapture {
	#events: AudioCaptureEvents;
	#deps: Required<Omit<AudioCaptureDeps, 'AudioContext'>> & {
		AudioContext?: typeof AudioContext;
	};
	#stream: MediaStream | null = null;
	#context: AudioContext | null = null;
	#analyser: AnalyserNode | null = null;
	#samples: Float32Array<ArrayBuffer> | null = null;
	#tracker = new SpeechActivityTracker();
	#tick: ReturnType<typeof setInterval> | null = null;
	#lastTickAt = 0;
	#startedAt = 0;
	#mimeType: string | undefined;
	#full: RunningRecorder | null = null;
	#segment: RunningRecorder | null = null;
	#segmentIndex = 0;
	#segmentStartedAt = 0;
	/** Segment recorders were running from the start (vs. one full-length transcription). */
	#segmented = false;
	/** Further cuts are possible; false after a failed rotation. */
	#canRotate = false;
	#segmentFlushes: Promise<void>[] = [];
	#state: 'idle' | 'starting' | 'recording' | 'stopped' = 'idle';
	#onTrackEnded = () => {
		if (this.#state !== 'recording') return;
		this.#events.onInterrupted?.(new VoiceCaptureError('interrupted'));
	};

	constructor(events: AudioCaptureEvents, deps: AudioCaptureDeps = {}) {
		this.#events = events;
		this.#deps = {
			getUserMedia:
				deps.getUserMedia ??
				((constraints) => navigator.mediaDevices.getUserMedia(constraints)),
			MediaRecorder: deps.MediaRecorder ?? globalThis.MediaRecorder,
			AudioContext:
				deps.AudioContext ??
				(globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
				(globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext,
			now: deps.now ?? (() => performance.now()),
			tickMs: deps.tickMs ?? 50,
			policy: deps.policy ?? DEFAULT_SEGMENT_POLICY
		};
	}

	get elapsedMs(): number {
		return this.#state === 'recording' ? this.#deps.now() - this.#startedAt : 0;
	}

	/** True when the recording is being cut into segments as the user talks. */
	get segmented(): boolean {
		return this.#segmented;
	}

	async start(): Promise<void> {
		if (this.#state !== 'idle') throw new VoiceCaptureError('unknown');
		if (typeof window !== 'undefined' && window.isSecureContext === false) {
			throw new VoiceCaptureError('insecure');
		}
		if (typeof this.#deps.MediaRecorder !== 'function') {
			throw new VoiceCaptureError('unsupported');
		}
		this.#state = 'starting';

		let stream: MediaStream;
		try {
			stream = await this.#deps.getUserMedia({
				audio: {
					channelCount: 1,
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				}
			});
		} catch (error) {
			this.#state = 'idle';
			throw mapGetUserMediaError(error);
		}
		// Aborted while the permission prompt was open.
		if (this.#state !== 'starting') {
			stream.getTracks().forEach((track) => track.stop());
			throw new VoiceCaptureError('unknown', 'Recording was cancelled.');
		}

		this.#stream = stream;
		stream.getAudioTracks().forEach((track) => track.addEventListener('ended', this.#onTrackEnded));
		this.#mimeType = pickMimeType(this.#deps.MediaRecorder);

		try {
			this.#full = this.#createRecorder();
			this.#full.recorder.start(1_000);
		} catch {
			this.#release();
			this.#state = 'idle';
			throw new VoiceCaptureError('recorder-failed', "Couldn't start recording. Try again.");
		}

		await this.#startAnalyser();
		this.#startedAt = this.#deps.now();
		this.#lastTickAt = this.#startedAt;

		// Segment while talking only when pauses can be detected; otherwise the
		// full recording is transcribed once at the end.
		if (this.#analyser) {
			try {
				this.#segment = this.#createRecorder();
				this.#segment.recorder.start();
				this.#segmentStartedAt = this.#startedAt;
				this.#segmented = true;
				this.#canRotate = true;
			} catch {
				this.#segment = null;
				this.#segmented = false;
				this.#canRotate = false;
			}
		}

		this.#state = 'recording';
		this.#tick = setInterval(() => this.#onTick(), this.#deps.tickMs);
	}

	async stop(): Promise<CaptureResult> {
		if (this.#state === 'starting') {
			this.#state = 'stopped';
			return { fullAudio: null, durationMs: 0 };
		}
		if (this.#state !== 'recording') return { fullAudio: null, durationMs: 0 };
		this.#state = 'stopped';
		this.#clearTick();
		const endedAt = this.#deps.now();
		const durationMs = Math.max(0, endedAt - this.#startedAt);

		if (this.#segment) {
			this.#flushSegment(this.#segment, endedAt);
			this.#segment = null;
		}

		const fullAudio = this.#full ? await this.#stopRecorder(this.#full) : null;
		this.#full = null;

		if (!this.#segmented && fullAudio && fullAudio.size > 0) {
			this.#events.onSegmentCut?.(0);
			this.#events.onSegment({
				index: 0,
				blob: fullAudio,
				startMs: 0,
				endMs: durationMs,
				speechMs: durationMs,
				hasSpeech: true
			});
		}

		await Promise.all(this.#segmentFlushes);
		this.#segmentFlushes = [];
		this.#release();
		return { fullAudio: fullAudio && fullAudio.size > 0 ? fullAudio : null, durationMs };
	}

	/** Stop immediately and discard everything. */
	abort(): void {
		const previous = this.#state;
		this.#state = 'stopped';
		this.#clearTick();
		for (const running of [this.#full, this.#segment]) {
			if (!running) continue;
			running.recorder.ondataavailable = null;
			running.recorder.onstop = null;
			try {
				if (running.recorder.state !== 'inactive') running.recorder.stop();
			} catch {
				// Already inactive.
			}
		}
		this.#full = null;
		this.#segment = null;
		if (previous !== 'idle') this.#release();
	}

	async #startAnalyser(): Promise<void> {
		const Ctor = this.#deps.AudioContext;
		if (!Ctor || !this.#stream) return;
		try {
			const context = new Ctor();
			if (context.state === 'suspended') {
				await context.resume().catch(() => undefined);
			}
			const source = context.createMediaStreamSource(this.#stream);
			const analyser = context.createAnalyser();
			analyser.fftSize = 1024;
			source.connect(analyser);
			this.#context = context;
			this.#analyser = analyser;
			this.#samples = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
		} catch {
			this.#context = null;
			this.#analyser = null;
			this.#samples = null;
		}
	}

	#onTick() {
		if (this.#state !== 'recording') return;
		const now = this.#deps.now();
		const dt = Math.max(0, now - this.#lastTickAt);
		this.#lastTickAt = now;

		if (this.#analyser && this.#samples) {
			this.#analyser.getFloatTimeDomainData(this.#samples);
			const rms = rmsOf(this.#samples);
			this.#tracker.feed(rms, dt);
			this.#events.onLevel?.(this.#tracker.displayLevel(rms));
		}

		if (
			this.#canRotate &&
			this.#segment &&
			shouldCutSegment(
				{ segmentMs: now - this.#segmentStartedAt, silentMs: this.#tracker.silentMs },
				this.#deps.policy
			)
		) {
			this.#rotate(now);
		}
	}

	#rotate(now: number) {
		const previous = this.#segment;
		if (!previous) return;
		let next: RunningRecorder;
		try {
			next = this.#createRecorder();
			next.recorder.start();
		} catch {
			// Keep recording into the current segment; it becomes one long final piece.
			this.#canRotate = false;
			return;
		}
		this.#segment = next;
		this.#flushSegment(previous, now);
		this.#segmentStartedAt = now;
	}

	#flushSegment(running: RunningRecorder, endedAt: number) {
		const index = this.#segmentIndex;
		const startMs = this.#segmentStartedAt - this.#startedAt;
		const endMs = endedAt - this.#startedAt;
		const stats = this.#tracker.resetSegment();
		this.#segmentIndex += 1;
		this.#events.onSegmentCut?.(index);
		const flush = this.#stopRecorder(running).then((blob) => {
			this.#events.onSegment({
				index,
				blob,
				startMs,
				endMs,
				speechMs: stats.speechMs,
				hasSpeech: stats.speechMs >= MIN_SEGMENT_SPEECH_MS
			});
		});
		this.#segmentFlushes.push(flush);
	}

	#createRecorder(): RunningRecorder {
		if (!this.#stream) throw new Error('No microphone stream');
		const options: MediaRecorderOptions = { audioBitsPerSecond: AUDIO_BITS_PER_SECOND };
		if (this.#mimeType) options.mimeType = this.#mimeType;
		const recorder = new this.#deps.MediaRecorder(this.#stream, options);
		const chunks: Blob[] = [];
		const done = new Promise<Blob>((resolve) => {
			const finish = () =>
				resolve(
					new Blob(chunks, {
						type: recorder.mimeType || this.#mimeType || chunks[0]?.type || 'audio/webm'
					})
				);
			recorder.ondataavailable = (event: BlobEvent) => {
				if (event.data && event.data.size > 0) chunks.push(event.data);
			};
			recorder.onstop = finish;
			recorder.onerror = () => {
				if (this.#state === 'recording') {
					this.#events.onInterrupted?.(new VoiceCaptureError('recorder-failed'));
				}
			};
		});
		return { recorder, done };
	}

	#stopRecorder(running: RunningRecorder): Promise<Blob> {
		try {
			if (running.recorder.state !== 'inactive') running.recorder.stop();
		} catch {
			// Fall through to the timeout guard below.
		}
		// onstop can be skipped when a recorder dies with its track; never hang.
		return Promise.race([
			running.done,
			new Promise<Blob>((resolve) =>
				setTimeout(
					() => resolve(new Blob([], { type: this.#mimeType ?? 'audio/webm' })),
					RECORDER_STOP_TIMEOUT_MS
				)
			)
		]);
	}

	#clearTick() {
		if (this.#tick) clearInterval(this.#tick);
		this.#tick = null;
	}

	#release() {
		if (this.#stream) {
			this.#stream.getAudioTracks().forEach((track) => {
				track.removeEventListener('ended', this.#onTrackEnded);
			});
			this.#stream.getTracks().forEach((track) => track.stop());
		}
		this.#stream = null;
		this.#analyser = null;
		this.#samples = null;
		const context = this.#context;
		this.#context = null;
		if (context && context.state !== 'closed') void context.close().catch(() => undefined);
	}
}
