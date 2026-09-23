// apps/web/src/lib/voice/dictation-text.ts
//
// Splices dictated words into existing text at the insertion point with
// natural spacing, the way native dictation does.

const NO_SPACE_BEFORE = /^[,.;:!?)\]}%'’”]/;

export interface Insertion {
	value: string;
	/** Offset where the dictated words begin. */
	start: number;
	/** Offset just after the dictated words (where the caret belongs). */
	end: number;
}

export function spliceDictation(before: string, spoken: string, after: string): Insertion {
	const words = spoken.trim();
	if (!words) {
		return { value: before + after, start: before.length, end: before.length };
	}
	const leading =
		before.length === 0 || /\s$/.test(before) || NO_SPACE_BEFORE.test(words) ? '' : ' ';
	const trailing =
		after.length === 0 || /^\s/.test(after) || NO_SPACE_BEFORE.test(after) ? '' : ' ';
	const start = before.length + leading.length;
	const end = start + words.length;
	return { value: before + leading + words + trailing + after, start, end };
}
