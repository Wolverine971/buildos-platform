// apps/web/src/lib/server/transcription/transcription-timeout.ts
//
// How long one transcription attempt may run. Browser dictation sends short segments and
// keeps the 30 s floor. The iPhone app uploads a whole recording (up to 10 minutes of
// ~32 kbps AAC, about 2.4 MB) in one request, and the provider needs longer for that.
// Bytes stand in for audio length because the route never decodes the file.

export const TRANSCRIPTION_TIMEOUT_FLOOR_MS = 30_000;
/** Leaves room inside the route's 100 s deadline and 120 s maxDuration. */
export const TRANSCRIPTION_TIMEOUT_CEILING_MS = 95_000;
const EXTRA_MS_PER_MB = 25_000;
const MB = 1024 * 1024;

export function transcriptionTimeoutFor(bytes: number): number {
	if (!Number.isFinite(bytes) || bytes <= 0) return TRANSCRIPTION_TIMEOUT_FLOOR_MS;
	const scaled = TRANSCRIPTION_TIMEOUT_FLOOR_MS + Math.ceil((bytes / MB) * EXTRA_MS_PER_MB);
	return Math.min(TRANSCRIPTION_TIMEOUT_CEILING_MS, scaled);
}
