// apps/web/src/lib/components/ui/live-transcript-preview.test.ts
import { describe, expect, it } from 'vitest';
import {
	LIVE_TRANSCRIPT_PREVIEW_CHAR_LIMIT,
	getLiveTranscriptPreview
} from './live-transcript-preview';

describe('getLiveTranscriptPreview', () => {
	it('returns the full transcript when it fits inside the preview limit', () => {
		expect(getLiveTranscriptPreview('  short live transcript  ')).toBe('short live transcript');
	});

	it('returns the trailing text when the transcript exceeds the preview limit', () => {
		const firstChunk = 'first words should disappear ';
		const middleChunk = 'middle '.repeat(60);
		const lastChunk = 'last words should stay visible';
		const transcript = `${firstChunk}${middleChunk}${lastChunk}`;

		expect(getLiveTranscriptPreview(transcript)).toBe(
			`...${transcript.slice(-LIVE_TRANSCRIPT_PREVIEW_CHAR_LIMIT)}`
		);
		expect(getLiveTranscriptPreview(transcript)).toContain(lastChunk);
		expect(getLiveTranscriptPreview(transcript)).not.toContain(firstChunk);
	});

	it('does not show the beginning of a long transcript', () => {
		const transcript = `first words should disappear ${'middle '.repeat(60)}last words`;

		const preview = getLiveTranscriptPreview(transcript, 40);

		expect(preview).toMatch(/^\.\.\./);
		expect(preview).toContain('last words');
		expect(preview).not.toContain('first words');
	});
});
