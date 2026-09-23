// apps/web/src/lib/voice/draft-alignment.ts
//
// Lines up the browser's rough live transcript with the recorded segments,
// so each segment's grey draft words can be swapped for its server
// transcript the moment that segment comes back. Live recognition has no
// timestamps; segments are cut in pauses, so the words finalized shortly
// after a cut belong to the segment that just ended.

export type SlotStatus = 'pending' | 'transcribing' | 'done' | 'empty' | 'failed';

export interface SegmentSlot {
	index: number;
	status: SlotStatus;
	/** Server transcript once done. */
	text: string;
	draftStart: number;
	/** Null until the boundary settles (words spoken before the cut are still finalizing). */
	draftEnd: number | null;
}

export interface ComposedText {
	/** Leading run of server-confirmed text. */
	confirmed: string;
	/** Everything after it: drafts and any confirmed text past an unfinished segment. */
	draft: string;
}

export interface FinalText {
	text: string;
	/** Failed segments that fell back to their live draft. */
	draftFallbacks: number;
	/** Failed segments with no draft to fall back on. */
	lostSegments: number;
}

export function joinSpoken(parts: string[]): string {
	return parts
		.map((part) => part.trim())
		.filter(Boolean)
		.join(' ');
}

export class DraftAligner {
	liveFinal = '';
	liveInterim = '';
	slots: SegmentSlot[] = [];
	#openStart = 0;

	reset(): void {
		this.liveFinal = '';
		this.liveInterim = '';
		this.slots = [];
		this.#openStart = 0;
	}

	setLive(finalText: string, interimText: string): void {
		this.liveFinal = finalText;
		this.liveInterim = interimText;
	}

	/** A segment was cut; its draft runs from the open start until it settles. */
	cut(index: number): void {
		if (this.slots.some((slot) => slot.index === index)) return;
		this.slots.push({
			index,
			status: 'pending',
			text: '',
			draftStart: this.#openStart,
			draftEnd: null
		});
		this.slots.sort((a, b) => a.index - b.index);
	}

	/** Words finalized so far belong to the cut segment; later words to the next. */
	settle(index: number): void {
		const slot = this.slots.find((entry) => entry.index === index);
		if (!slot || slot.draftEnd !== null) return;
		slot.draftEnd = Math.max(slot.draftStart, this.liveFinal.length);
		this.#openStart = Math.max(this.#openStart, slot.draftEnd);
	}

	/** At stop, pending interim words are folded into the final text and every slot settles. */
	settleAll(): void {
		if (this.liveInterim) {
			this.liveFinal = joinSpoken([this.liveFinal, this.liveInterim]);
			this.liveInterim = '';
		}
		for (const slot of this.slots) this.settle(slot.index);
	}

	setStatus(index: number, status: SlotStatus, text = ''): void {
		const slot = this.slots.find((entry) => entry.index === index);
		if (!slot) return;
		slot.status = status;
		if (status === 'done') slot.text = text;
	}

	draftFor(slot: SegmentSlot): string {
		return this.liveFinal.slice(slot.draftStart, slot.draftEnd ?? this.liveFinal.length).trim();
	}

	#openDraft(): string {
		const unsettled = this.slots.some((slot) => slot.draftEnd === null);
		const finalPart = unsettled ? '' : this.liveFinal.slice(this.#openStart);
		return joinSpoken([finalPart, this.liveInterim]);
	}

	compose(): ComposedText {
		const confirmed: string[] = [];
		const draft: string[] = [];
		let inConfirmedRun = true;
		for (const slot of this.slots) {
			if (slot.status === 'empty') continue;
			const piece = slot.status === 'done' ? slot.text : this.draftFor(slot);
			if (inConfirmedRun && slot.status === 'done') {
				confirmed.push(piece);
			} else {
				inConfirmedRun = false;
				draft.push(piece);
			}
		}
		draft.push(this.#openDraft());
		return { confirmed: joinSpoken(confirmed), draft: joinSpoken(draft) };
	}

	final(): FinalText {
		const parts: string[] = [];
		let draftFallbacks = 0;
		let lostSegments = 0;
		for (const slot of this.slots) {
			if (slot.status === 'done') {
				parts.push(slot.text);
			} else if (slot.status !== 'empty') {
				const fallback = this.draftFor(slot);
				if (fallback) {
					parts.push(fallback);
					draftFallbacks += 1;
				} else {
					lostSegments += 1;
				}
			}
		}
		return { text: joinSpoken(parts), draftFallbacks, lostSegments };
	}
}
