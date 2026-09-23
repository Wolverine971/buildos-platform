// apps/web/src/lib/voice/speech-activity.ts
//
// Pure speech-activity tracking over microphone RMS levels. It drives two
// things: the level meter the user sees while talking, and where a long
// recording is cut into segments so each piece can be transcribed while the
// user keeps talking. Cuts land in pauses so words are never split.

export interface SegmentPolicy {
	/** Never cut a segment shorter than this. */
	minSegmentMs: number;
	/** Always cut at this length, even mid-speech. */
	maxSegmentMs: number;
	/** Quiet time needed to cut once the segment is past `minSegmentMs`. */
	silenceToCutMs: number;
	/** Past `lateAfterMs`, accept a shorter pause so the hard cap is rarely hit. */
	lateSilenceToCutMs: number;
	lateAfterMs: number;
}

export const DEFAULT_SEGMENT_POLICY: SegmentPolicy = {
	minSegmentMs: 8_000,
	maxSegmentMs: 28_000,
	silenceToCutMs: 550,
	lateSilenceToCutMs: 250,
	lateAfterMs: 20_000
};

/** RMS below this is never treated as speech, whatever the noise floor. */
const MIN_SPEECH_RMS = 0.012;
const SPEECH_OVER_FLOOR = 2.2;
const INITIAL_NOISE_FLOOR = 0.006;
/** Short blips (a click, a cough) under this are not "speech" for gating. */
export const MIN_SEGMENT_SPEECH_MS = 180;

export class SpeechActivityTracker {
	noiseFloor = INITIAL_NOISE_FLOOR;
	/** Consecutive quiet time, ms. */
	silentMs = 0;
	/** Speech time inside the current segment, ms. */
	segmentSpeechMs = 0;
	/** Loudest RMS inside the current segment. */
	segmentPeak = 0;
	isSpeech = false;

	get threshold(): number {
		return Math.max(MIN_SPEECH_RMS, this.noiseFloor * SPEECH_OVER_FLOOR);
	}

	feed(rms: number, dtMs: number): void {
		const level = Number.isFinite(rms) && rms > 0 ? rms : 0;
		// Floor falls quickly toward quiet. It rises only from non-speech levels
		// (a noisier room), barely at all during speech, so a long monologue
		// with few pauses never talks its own threshold out of reach.
		if (level < this.noiseFloor) {
			this.noiseFloor = this.noiseFloor * 0.8 + level * 0.2;
		} else if (level <= this.threshold) {
			this.noiseFloor += (level - this.noiseFloor) * 0.02;
		} else {
			this.noiseFloor += (level - this.noiseFloor) * 0.0002;
		}
		this.noiseFloor = Math.max(this.noiseFloor, 0.0005);

		this.isSpeech = level > this.threshold;
		if (this.isSpeech) {
			this.silentMs = 0;
			this.segmentSpeechMs += dtMs;
		} else {
			this.silentMs += dtMs;
		}
		if (level > this.segmentPeak) this.segmentPeak = level;
	}

	/** Called when a segment is cut; returns that segment's speech stats. */
	resetSegment(): { speechMs: number; peak: number } {
		const stats = { speechMs: this.segmentSpeechMs, peak: this.segmentPeak };
		this.segmentSpeechMs = 0;
		this.segmentPeak = 0;
		return stats;
	}

	/** 0..1 value for the level meter, relative to the room's noise floor. */
	displayLevel(rms: number): number {
		const above = Math.max(0, rms - this.noiseFloor * 0.6);
		return Math.min(1, Math.sqrt(above) * 2.6);
	}
}

export function shouldCutSegment(
	state: { segmentMs: number; silentMs: number },
	policy: SegmentPolicy = DEFAULT_SEGMENT_POLICY
): boolean {
	if (state.segmentMs >= policy.maxSegmentMs) return true;
	if (state.segmentMs < policy.minSegmentMs) return false;
	const needed =
		state.segmentMs >= policy.lateAfterMs ? policy.lateSilenceToCutMs : policy.silenceToCutMs;
	return state.silentMs >= needed;
}

/** Root-mean-square of a time-domain buffer (-1..1 floats). */
export function rmsOf(samples: Float32Array): number {
	if (samples.length === 0) return 0;
	let sum = 0;
	for (let i = 0; i < samples.length; i++) {
		const s = samples[i] ?? 0;
		sum += s * s;
	}
	return Math.sqrt(sum / samples.length);
}
