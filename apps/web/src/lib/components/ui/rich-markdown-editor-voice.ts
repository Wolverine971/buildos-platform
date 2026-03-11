// apps/web/src/lib/components/ui/rich-markdown-editor-voice.ts
export type InsertedVoiceRange = {
	from: number;
	to: number;
	text: string;
};

export function normalizeVoiceTranscript(text: string): string {
	return text.trim().replace(/\s+/g, ' ');
}

export function preserveInsertedVoiceSpacing(insertedText: string, transcript: string): string {
	const trimmedTranscript = transcript.trim();
	if (!trimmedTranscript) return '';

	const leadingWhitespace = insertedText.match(/^\s+/)?.[0] ?? '';
	const trailingWhitespace = insertedText.match(/\s+$/)?.[0] ?? '';

	return `${leadingWhitespace}${trimmedTranscript}${trailingWhitespace}`;
}

export function canReplaceInsertedVoiceRange(
	value: string,
	range: InsertedVoiceRange | null
): range is InsertedVoiceRange {
	if (!range) return false;
	if (range.from < 0 || range.to < range.from || range.to > value.length) return false;
	return value.slice(range.from, range.to) === range.text;
}
