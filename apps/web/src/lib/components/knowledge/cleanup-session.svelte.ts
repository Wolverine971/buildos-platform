// apps/web/src/lib/components/knowledge/cleanup-session.svelte.ts
//
// One pass through the Clean up queue on /knowledge: which card is up, what happened to the
// ones before it, and the Undo.
//
// Every answer leaves the screen at once and is saved a few seconds later (or as soon as the
// next answer is given, or when Clean up closes), so the last one can always be taken back
// before anything is written. Saves run one at a time in the order they were given: "merge
// Murtech, Inc into this" must land before "remove this". A save that fails puts its card back
// and says why.
//
// The queue comes in batches. More are fetched before the current batch runs out, leaving out
// what was skipped and the answer still waiting to be saved.

import type {
	KnowledgeCleanupEntry,
	KnowledgeCleanupQueue,
	KnowledgeCleanupSimilar,
	KnowledgeSource
} from './knowledge-client';

export type CleanupVerb = 'removed' | 'kept' | 'merged' | 'person' | 'part';

/** How long the last answer waits before it is saved. */
export const CLEANUP_UNDO_MS = 6000;
/** Fetch the next batch when this few cards are left ahead. */
const REFILL_AT = 8;
/** The most ids one request may leave out (the endpoint's limit). */
const SKIP_MAX = 500;

export interface CleanupApi {
	queue(params: {
		source: KnowledgeSource | null;
		skip: string[];
	}): Promise<KnowledgeCleanupQueue>;
	remove(id: string): Promise<unknown>;
	keep(id: string): Promise<unknown>;
	person(id: string): Promise<unknown>;
	merge(keep: string, merge: string): Promise<unknown>;
	partOf(id: string, parentId: string): Promise<unknown>;
}

export interface CleanupOther {
	id: string;
	name: string;
	/** Tasks and docs that name it, and people attached, when known: the fuller entry survives. */
	records?: number;
	people?: number;
}

interface Pending {
	entry: KnowledgeCleanupEntry;
	verb: CleanupVerb;
	/** What the Undo strip says: "Removed “Desk”". */
	label: string;
	/** True when the card left the queue; a merge into the card keeps it up. */
	leaves: boolean;
	/** Another entry this answer folds away (a merge that keeps the card). */
	foldedAway: string | null;
	commit: () => Promise<unknown>;
	timer: ReturnType<typeof setTimeout>;
}

/** In a merge, the entry with more behind it survives: records first, then people. */
export function mergeSurvivor(card: KnowledgeCleanupEntry, other: CleanupOther): 'card' | 'other' {
	const cardRecords = card.tasks + card.documents;
	const otherRecords = other.records ?? 0;
	if (cardRecords !== otherRecords) return cardRecords > otherRecords ? 'card' : 'other';
	const otherPeople = other.people ?? 0;
	if (card.people !== otherPeople) return card.people > otherPeople ? 'card' : 'other';
	// Nothing tells them apart: the shorter name is usually the one people say.
	return card.name.length <= other.name.length ? 'card' : 'other';
}

export class CleanupSession {
	entries = $state.raw<KnowledgeCleanupEntry[]>([]);
	source = $state<KnowledgeSource | null>(null);
	bySource = $state.raw<Partial<Record<KnowledgeSource, number>>>({});
	loading = $state(false);
	/** The first load failed: nothing to show. */
	error = $state<string | null>(null);
	/** The last fetch brought nothing new: what's on screen is all there is. */
	exhausted = $state(false);
	/** Cards that left the queue this session, the one still waiting to be saved included. */
	done = $state.raw<ReadonlyMap<string, CleanupVerb>>(new Map());
	/** Entries folded into another by a merge: gone from the queue and from suggestions. */
	foldedAway = $state.raw<ReadonlySet<string>>(new Set());
	skipped = $state.raw<readonly string[]>([]);
	pending = $state.raw<Pending | null>(null);
	/** A save that failed, in words for the user. The component shows it and clears it. */
	failure = $state<string | null>(null);

	#remainingAtFetch = $state(0);
	#handledSinceFetch = $state(0);
	#chain: Promise<unknown> = Promise.resolve();
	#seq = 0;
	readonly #api: CleanupApi;

	constructor(api: CleanupApi) {
		this.#api = api;
	}

	readonly #skippedSet = $derived(new Set(this.skipped));

	/** Cards still to answer, in order. */
	readonly ahead = $derived(
		this.entries.filter(
			(entry) =>
				!this.done.has(entry.id) &&
				!this.foldedAway.has(entry.id) &&
				!this.#skippedSet.has(entry.id)
		)
	);
	readonly current = $derived<KnowledgeCleanupEntry | null>(this.ahead[0] ?? null);

	/** How many are left to answer, skipped ones aside. */
	readonly left = $derived(
		Math.max(this.#remainingAtFetch - this.#handledSinceFetch, this.ahead.length)
	);

	readonly tally = $derived.by(() => {
		const counts: Record<CleanupVerb, number> = {
			removed: 0,
			kept: 0,
			merged: 0,
			person: 0,
			part: 0
		};
		for (const verb of this.done.values()) counts[verb] += 1;
		// A merge that kept its card isn't in `done`.
		counts.merged += this.foldedAway.size;
		return counts;
	});

	/** The card's look-alikes that are still there. */
	similarFor(entry: KnowledgeCleanupEntry): KnowledgeCleanupSimilar[] {
		return entry.similar.filter((other) => {
			const verb = this.done.get(other.id);
			return (
				!this.foldedAway.has(other.id) &&
				verb !== 'removed' &&
				verb !== 'merged' &&
				verb !== 'person'
			);
		});
	}

	// ---------------------------------------------------------------------
	// Loading

	async start(source: KnowledgeSource | null = null): Promise<void> {
		await this.flush();
		const seq = ++this.#seq;
		this.source = source;
		this.entries = [];
		this.skipped = [];
		this.exhausted = false;
		this.error = null;
		this.loading = true;
		try {
			const result = await this.#api.queue({ source, skip: [] });
			if (seq !== this.#seq) return;
			this.#take(result, []);
		} catch (error) {
			if (seq === this.#seq)
				this.error = error instanceof Error ? error.message : 'Could not load';
		} finally {
			if (seq === this.#seq) this.loading = false;
		}
	}

	/** Go through the skipped ones again (they are still in `entries`, in their old order). */
	revisitSkipped(): void {
		this.skipped = [];
	}

	#take(result: KnowledgeCleanupQueue, held: string[]) {
		const known = new Set(this.entries.map((entry) => entry.id));
		const fresh = result.entries.filter((entry) => !known.has(entry.id));
		this.entries = [...this.entries, ...fresh];
		this.bySource = result.by_source;
		this.exhausted = fresh.length === 0;
		// The count leaves out what this request held back; the pending answer still counts
		// until it is saved, so Undo puts the number right again.
		this.#remainingAtFetch = result.remaining + held.length;
		this.#handledSinceFetch = held.length;
	}

	async #refill(): Promise<void> {
		if (this.loading || this.exhausted || this.error) return;
		if (this.ahead.length > REFILL_AT) return;
		const seq = this.#seq;
		this.loading = true;
		try {
			// Answers already on their way land first, so the server leaves them out itself.
			await this.#chain;
			const held = this.pending
				? [
						...(this.pending.leaves ? [this.pending.entry.id] : []),
						...(this.pending.foldedAway ? [this.pending.foldedAway] : [])
					]
				: [];
			const skip = [...this.skipped.slice(-(SKIP_MAX - held.length)), ...held];
			const result = await this.#api.queue({ source: this.source, skip });
			if (seq !== this.#seq) return;
			this.#take(result, held);
		} catch {
			// The cards already here still work; the next answer tries again.
		} finally {
			if (seq === this.#seq) this.loading = false;
		}
	}

	// ---------------------------------------------------------------------
	// Answers

	remove(): void {
		const entry = this.current;
		if (!entry) return;
		this.#answer(entry, 'removed', `Removed “${entry.name}”`, () => this.#api.remove(entry.id));
	}

	keep(): void {
		const entry = this.current;
		if (!entry) return;
		this.#answer(entry, 'kept', `Kept “${entry.name}”`, () => this.#api.keep(entry.id));
	}

	isPerson(): void {
		const entry = this.current;
		if (!entry) return;
		this.#answer(entry, 'person', `“${entry.name}” is now a person`, () =>
			this.#api.person(entry.id)
		);
	}

	/**
	 * "Same company": the fuller entry survives (or `survivor`, when the caller knows better). A
	 * merge into the card keeps the card up.
	 */
	mergeWith(other: CleanupOther, survivor?: 'card' | 'other'): void {
		const entry = this.current;
		if (!entry || other.id === entry.id) return;
		if ((survivor ?? mergeSurvivor(entry, other)) === 'other') {
			this.#answer(entry, 'merged', `Merged “${entry.name}” into “${other.name}”`, () =>
				this.#api.merge(other.id, entry.id)
			);
			return;
		}
		this.#answer(
			entry,
			'merged',
			`Merged “${other.name}” into “${entry.name}”`,
			() => this.#api.merge(entry.id, other.id),
			other.id
		);
	}

	/** "Part of": the card stays its own entry, filed under `parent`, and counts as kept. */
	partOf(parent: CleanupOther): void {
		const entry = this.current;
		if (!entry || parent.id === entry.id) return;
		this.#answer(entry, 'part', `Filed “${entry.name}” under “${parent.name}”`, () =>
			this.#api.partOf(entry.id, parent.id)
		);
	}

	#answer(
		entry: KnowledgeCleanupEntry,
		verb: CleanupVerb,
		label: string,
		commit: () => Promise<unknown>,
		foldedAway: string | null = null
	): void {
		// The answer before this one is now final.
		this.#settle();
		const leaves = foldedAway === null;
		if (leaves) this.done = new Map(this.done).set(entry.id, verb);
		else this.foldedAway = new Set(this.foldedAway).add(foldedAway);
		this.#handledSinceFetch += 1;
		this.pending = {
			entry,
			verb,
			label,
			leaves,
			foldedAway,
			commit,
			timer: setTimeout(() => this.#settle(), CLEANUP_UNDO_MS)
		};
		void this.#refill();
	}

	/** Take back the last answer, if it hasn't been saved yet. */
	undo(): boolean {
		const pending = this.pending;
		if (!pending) return false;
		clearTimeout(pending.timer);
		this.pending = null;
		this.#rollback(pending);
		return true;
	}

	#rollback(pending: Pending) {
		if (pending.leaves) {
			const next = new Map(this.done);
			next.delete(pending.entry.id);
			this.done = next;
		} else if (pending.foldedAway) {
			const next = new Set(this.foldedAway);
			next.delete(pending.foldedAway);
			this.foldedAway = next;
		}
		this.#handledSinceFetch = Math.max(0, this.#handledSinceFetch - 1);
	}

	/** Save the waiting answer now, after the ones before it. */
	#settle(): void {
		const pending = this.pending;
		if (!pending) return;
		clearTimeout(pending.timer);
		this.pending = null;
		this.#chain = this.#chain.then(() =>
			pending.commit().catch((error: unknown) => {
				this.#rollback(pending);
				this.failure = `“${pending.entry.name}” is back in the queue. ${
					error instanceof Error ? error.message : 'That could not be saved.'
				}`;
			})
		);
	}

	/** Save everything still waiting (Clean up is closing, or the source is changing). */
	flush(): Promise<unknown> {
		this.#settle();
		return this.#chain;
	}

	// ---------------------------------------------------------------------
	// Moving through the queue

	skip(): void {
		const entry = this.current;
		if (!entry) return;
		this.skipped = [...this.skipped, entry.id];
		void this.#refill();
	}

	/** Back to the card skipped last. */
	back(): boolean {
		if (!this.skipped.length) return false;
		this.skipped = this.skipped.slice(0, -1);
		return true;
	}

	/** A detail changed on a card without answering it (a person was attached). */
	patch(id: string, change: Partial<KnowledgeCleanupEntry>): void {
		this.entries = this.entries.map((entry) =>
			entry.id === id ? { ...entry, ...change } : entry
		);
	}
}
