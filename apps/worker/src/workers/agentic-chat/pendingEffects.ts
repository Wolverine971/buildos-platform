// apps/worker/src/workers/agentic-chat/pendingEffects.ts
//
// Per-turn set of detached, never-throwing side effects (private observation
// rows and similar telemetry) that were started without being awaited on the
// tool critical path. The executor joins the set once, under a deadline,
// right before the terminal fence so every row still lands inside the turn's
// execution generation (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F50).

export class AgenticChatPendingEffects {
	private readonly pending = new Set<Promise<void>>();

	/** Track an effect promise; rejection is absorbed so the set can never throw. */
	enqueue(promise: PromiseLike<unknown>): void {
		const tracked: Promise<void> = Promise.resolve(promise).then(
			() => undefined,
			() => undefined
		);
		this.pending.add(tracked);
		void tracked.then(() => this.pending.delete(tracked));
	}

	get size(): number {
		return this.pending.size;
	}

	/**
	 * Wait for every effect tracked so far or for `deadlineMs`, whichever comes
	 * first. Returns true when all of them settled in time. Effects enqueued
	 * after the call starts are not joined.
	 */
	async drain(deadlineMs: number): Promise<boolean> {
		if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1) {
			throw new Error('Pending effects drain deadlineMs must be a positive integer');
		}
		const snapshot = [...this.pending];
		if (snapshot.length === 0) return true;
		let timer: NodeJS.Timeout | null = null;
		const deadline = new Promise<'deadline'>((resolve) => {
			timer = setTimeout(() => resolve('deadline'), deadlineMs);
			timer.unref?.();
		});
		try {
			const outcome = await Promise.race([
				Promise.allSettled(snapshot).then(() => 'settled' as const),
				deadline
			]);
			if (outcome !== 'settled') return false;
			for (const tracked of snapshot) this.pending.delete(tracked);
			return true;
		} finally {
			if (timer) clearTimeout(timer);
		}
	}
}

const MAX_PENDING_EFFECT_TURNS = 256;

/**
 * Turn-keyed sets for producers that outlive a turn and never see the
 * executor's own instance: the provider network client is built once per
 * process and streams for every turn, so its detached attempt receipts are
 * filed here by `turnRunId`. The executor drains a turn's set at finalization
 * (which also forgets it); the bound only guards a turn that never finalizes.
 */
export class AgenticChatPendingEffectsRegistry {
	private readonly turns = new Map<string, AgenticChatPendingEffects>();

	/** The turn's set, created on first use. */
	forTurn(turnRunId: string): AgenticChatPendingEffects {
		assertTurnRunId(turnRunId);
		const existing = this.turns.get(turnRunId);
		if (existing) return existing;
		while (this.turns.size >= MAX_PENDING_EFFECT_TURNS) {
			const oldest = this.turns.keys().next().value as string | undefined;
			if (oldest === undefined) break;
			this.turns.delete(oldest);
		}
		const effects = new AgenticChatPendingEffects();
		this.turns.set(turnRunId, effects);
		return effects;
	}

	/** Effects tracked for the turn right now. */
	size(turnRunId: string): number {
		return this.turns.get(turnRunId)?.size ?? 0;
	}

	/**
	 * Join the turn's set under `deadlineMs`, then forget the turn. Returns
	 * true when every effect settled in time; a set that missed the deadline
	 * keeps tracking its stragglers until they settle, but is no longer reachable.
	 */
	async drain(turnRunId: string, deadlineMs: number): Promise<boolean> {
		assertTurnRunId(turnRunId);
		const effects = this.turns.get(turnRunId);
		if (!effects) return true;
		try {
			return await effects.drain(deadlineMs);
		} finally {
			if (this.turns.get(turnRunId) === effects) this.turns.delete(turnRunId);
		}
	}
}

/** Process-wide registry shared by the provider client and the executor. */
export const AGENTIC_CHAT_PENDING_EFFECTS_REGISTRY = new AgenticChatPendingEffectsRegistry();

function assertTurnRunId(value: string): void {
	if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
		throw new Error('Pending effects turn scope must be canonical text');
	}
}
