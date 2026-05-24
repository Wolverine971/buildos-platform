export const LIVE_TRANSCRIPT_PREVIEW_CHAR_LIMIT = 300;

export function getLiveTranscriptPreview(
	transcript: string,
	maxCharacters = LIVE_TRANSCRIPT_PREVIEW_CHAR_LIMIT
): string {
	const normalizedTranscript = transcript.trim();

	if (!normalizedTranscript || maxCharacters <= 0) {
		return '';
	}

	if (normalizedTranscript.length <= maxCharacters) {
		return normalizedTranscript;
	}

	return `...${normalizedTranscript.slice(-maxCharacters).trimStart()}`;
}
