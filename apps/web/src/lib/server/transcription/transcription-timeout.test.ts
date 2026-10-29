// apps/web/src/lib/server/transcription/transcription-timeout.test.ts
import { describe, expect, it } from 'vitest';
import {
	TRANSCRIPTION_TIMEOUT_CEILING_MS,
	TRANSCRIPTION_TIMEOUT_FLOOR_MS,
	transcriptionTimeoutFor
} from './transcription-timeout';

describe('transcriptionTimeoutFor', () => {
	it('keeps short dictation segments at the 30 s floor', () => {
		expect(transcriptionTimeoutFor(0)).toBe(TRANSCRIPTION_TIMEOUT_FLOOR_MS);
		expect(transcriptionTimeoutFor(Number.NaN)).toBe(TRANSCRIPTION_TIMEOUT_FLOOR_MS);
		// ~10 s of browser webm/opus
		expect(transcriptionTimeoutFor(40_000)).toBeLessThan(
			TRANSCRIPTION_TIMEOUT_FLOOR_MS + 1_000
		);
	});

	it('gives a full phone recording more time, capped under the route deadline', () => {
		const fourMinutes = 4 * 60 * 4_000; // 32 kbps AAC ≈ 4 KB/s
		const tenMinutes = 10 * 60 * 4_000;
		expect(transcriptionTimeoutFor(fourMinutes)).toBeGreaterThan(50_000);
		expect(transcriptionTimeoutFor(tenMinutes)).toBeGreaterThan(80_000);
		expect(transcriptionTimeoutFor(tenMinutes)).toBeLessThanOrEqual(
			TRANSCRIPTION_TIMEOUT_CEILING_MS
		);
		expect(transcriptionTimeoutFor(25 * 1024 * 1024)).toBe(TRANSCRIPTION_TIMEOUT_CEILING_MS);
	});
});
