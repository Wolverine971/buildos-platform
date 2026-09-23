// apps/web/src/lib/components/ui/rich-markdown-editor-voice.ts
import { spliceDictation } from '$lib/voice/dictation-text';

export type DictationRange = {
	from: number;
	to: number;
};

/**
 * Lands dictated text in raw markdown when the editor isn't mounted (Preview
 * mode, or the editor closed mid-transcription). A non-empty range is
 * replaced; with no range the text is appended.
 */
export function spliceDictationIntoMarkdown(
	value: string,
	range: DictationRange | null,
	text: string
): string {
	if (!text.trim()) return value;
	const clamp = (offset: number) => Math.min(Math.max(offset, 0), value.length);
	const from = range ? clamp(Math.min(range.from, range.to)) : value.length;
	const to = range ? clamp(Math.max(range.from, range.to)) : value.length;
	return spliceDictation(value.slice(0, from), text, value.slice(to)).value;
}
