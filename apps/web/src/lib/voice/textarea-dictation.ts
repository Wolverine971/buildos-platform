// apps/web/src/lib/voice/textarea-dictation.ts
//
// Anchors a dictation at the caret of a plain textarea. While the user talks,
// the field shows: text before the caret, confirmed words, draft words, text
// after the caret. On commit, the final transcript replaces the in-progress
// words at that same spot.

import { spliceDictation } from './dictation-text';
import { joinSpoken } from './draft-alignment';

export interface DictationPieces {
	value: string;
	prefix: string;
	confirmed: string;
	separator: string;
	draft: string;
	suffix: string;
}

export class TextareaDictationAnchor {
	#before = '';
	#after = '';
	#lastWritten: string | null = null;

	/** Pin the insertion point. With no selection, dictation appends at the end. */
	begin(value: string, selection: { start: number; end: number } | null): void {
		const clamp = (offset: number) => Math.min(Math.max(offset, 0), value.length);
		const start = selection ? clamp(Math.min(selection.start, selection.end)) : value.length;
		const end = selection ? clamp(Math.max(selection.start, selection.end)) : value.length;
		this.#before = value.slice(0, start);
		this.#after = value.slice(end);
		this.#lastWritten = null;
	}

	/**
	 * If the host replaced the text mid-dictation, keep its text and append
	 * after it. Returns true when the anchor moved.
	 */
	observe(value: string): boolean {
		if (this.#lastWritten === null || value === this.#lastWritten) return false;
		this.#before = value;
		this.#after = '';
		this.#lastWritten = null;
		return true;
	}

	pieces(confirmed: string, draft: string): DictationPieces {
		const confirmedWords = confirmed.trim();
		const draftWords = draft.trim();
		const spoken = joinSpoken([confirmedWords, draftWords]);
		const insertion = spliceDictation(this.#before, spoken, this.#after);
		return {
			value: insertion.value,
			prefix: insertion.value.slice(0, insertion.start),
			confirmed: confirmedWords,
			separator: confirmedWords && draftWords ? ' ' : '',
			draft: draftWords,
			suffix: insertion.value.slice(insertion.end)
		};
	}

	/** Value to show while dictating; remembered so host edits can be detected. */
	write(confirmed: string, draft: string): string {
		const { value } = this.pieces(confirmed, draft);
		this.#lastWritten = value;
		return value;
	}

	/** Final text in place; returns the new value and where the caret belongs. */
	commit(text: string): { value: string; caret: number } {
		const insertion = spliceDictation(this.#before, text, this.#after);
		this.#lastWritten = null;
		return { value: insertion.value, caret: insertion.end };
	}
}
