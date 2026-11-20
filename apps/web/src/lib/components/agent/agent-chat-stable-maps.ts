// apps/web/src/lib/components/agent/agent-chat-stable-maps.ts
//
// The message list derives several per-turn maps from the whole conversation (step
// settlements, lit phrases, cards placed under a reply). Each derivation builds fresh
// objects, so without this every finished turn would be handed "new" props whenever the
// live turn changed, and would redo its work on every streamed step. Here a rebuilt map
// keeps the previous object for every entry that is equal to it, and the previous map
// itself when nothing changed, so an unchanged turn sees no change at all.

import type { StepSettlements } from './agent-chat-step-outcomes';
import type { PhraseMark } from './agent-chat-phrase-marks';

/**
 * `next`, with each value swapped for the equal value `previous` held under the same key.
 * Returns `previous` itself when the two maps hold equal values under the same keys.
 */
export function reuseEqualEntries<K, V>(
	previous: Map<K, V> | undefined,
	next: Map<K, V>,
	equal: (before: V, after: V) => boolean
): Map<K, V> {
	if (!previous) return next;
	let unchanged = previous.size === next.size;
	for (const [key, value] of next) {
		const before = previous.get(key);
		if (before !== undefined && (before === value || equal(before, value))) {
			next.set(key, before);
		} else {
			unchanged = false;
		}
	}
	return unchanged ? previous : next;
}

export function sameSettlements(before: StepSettlements, after: StepSettlements): boolean {
	const ids = Object.keys(after);
	if (ids.length !== Object.keys(before).length) return false;
	return ids.every(
		(id) => before[id]?.state === after[id]!.state && before[id]?.label === after[id]!.label
	);
}

export function samePhraseMarks(before: readonly PhraseMark[], after: readonly PhraseMark[]) {
	if (before.length !== after.length) return false;
	return after.every((mark, index) => {
		const other = before[index]!;
		return (
			other.id === mark.id &&
			other.start === mark.start &&
			other.end === mark.end &&
			other.action === mark.action &&
			other.label === mark.label &&
			other.state === mark.state &&
			other.ids.length === mark.ids.length &&
			other.ids.every((id, at) => id === mark.ids[at])
		);
	});
}

/**
 * Card placements are equal when they hold the very same card objects. The card extractors
 * return one object per tool-call activity, so a finished turn's cards compare identical.
 */
export function samePlacement<C>(
	before: { cards: readonly C[]; turnActive: boolean },
	after: { cards: readonly C[]; turnActive: boolean }
): boolean {
	return (
		before.turnActive === after.turnActive &&
		before.cards.length === after.cards.length &&
		before.cards.every((card, index) => card === after.cards[index])
	);
}
