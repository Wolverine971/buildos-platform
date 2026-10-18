// apps/worker/src/workers/agentic-chat/turn/pending-read-saves.ts
//
// Read results the model already has while their receipts are still being
// written (chat speed, 2026-10-18). A read in a read-only batch hands its
// result to the next provider pass at once; its ledger row and then its public
// tool_result event are written behind it. In turn c64a1a43 those saves were
// ~0.5 s of the 45 s turn's critical path, and in 8 of 12 calls they took
// longer than the read itself.
//
// The receipts are still owed, in the same order and with the same errors:
// the executor joins this set before anything that relies on them (assistant
// text, a batch that may write, the end of the provider loop) and settles it
// before recovery. A failed save fails the turn with its own error, only
// later, and wins over any error the turn hit after it (synchronously, the
// save would have failed first).

type TrackedSave = { settled: Promise<void> };

export class AgenticChatPendingReadSaves {
	private readonly pending = new Set<TrackedSave>();
	private readonly failures: Array<{ sequenceIndex: number; error: unknown }> = [];

	/**
	 * Tracks one read's receipts: `save` resolves once its ledger row and its
	 * tool_result event are durable. Its rejection is always handled here.
	 */
	track(sequenceIndex: number, save: Promise<void>): void {
		const entry: TrackedSave = {
			settled: save.then(
				() => undefined,
				(error: unknown) => {
					this.failures.push({ sequenceIndex, error });
				}
			)
		};
		this.pending.add(entry);
		void entry.settled.then(() => this.pending.delete(entry));
	}

	get size(): number {
		return this.pending.size;
	}

	/**
	 * Waits for every tracked save, then throws the failure of the earliest
	 * tool call, as a synchronous batch reports rejected calls in provider order.
	 */
	async join(): Promise<void> {
		await this.settle();
		this.throwIfFailed();
	}

	/** Waits for every tracked save and never throws (recovery is already under way). */
	async settle(): Promise<void> {
		while (this.pending.size > 0) {
			await Promise.all([...this.pending].map((entry) => entry.settled));
		}
	}

	/** Throws the earliest tool call's save failure seen so far, without waiting. */
	throwIfFailed(): void {
		const earliest = this.earliestFailure();
		if (earliest) throw earliest.error;
	}

	/** The error a synchronous turn would have failed with: the earliest save failure, else `error`. */
	turnError(error: unknown): unknown {
		return this.earliestFailure()?.error ?? error;
	}

	private earliestFailure(): { sequenceIndex: number; error: unknown } | null {
		if (this.failures.length === 0) return null;
		return this.failures.reduce((first, failure) =>
			failure.sequenceIndex < first.sequenceIndex ? failure : first
		);
	}
}
