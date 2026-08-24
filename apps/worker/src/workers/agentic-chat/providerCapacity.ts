// apps/worker/src/workers/agentic-chat/providerCapacity.ts

import { MAX_AGENTIC_CHAT_CONCURRENCY } from './concurrencyBounds';

export type AgenticChatProviderCapacitySnapshotV1 = {
	observedAtMs: number;
	configured: boolean;
	available: boolean;
	activeRequests: number;
	concurrency: number;
	degradedUntilMs: number | null;
};

export type AgenticChatProviderCapacityLeaseV1 = {
	release(): void;
};

export class AgenticChatProviderCapacityError extends Error {
	readonly code = 'provider_capacity_unavailable';

	constructor(message: string) {
		super(message);
		this.name = 'AgenticChatProviderCapacityError';
	}
}

/**
 * Local provider admission gate. This never probes or spends against the
 * provider; it reports configured credentials, in-flight slots, and a bounded
 * degradation latch updated by the real provider adapter.
 */
export class AgenticChatProviderCapacity {
	private activeRequests = 0;
	private readonly degradedUntilByTurn = new Map<string, number>();

	constructor(
		private readonly options: {
			configured: boolean;
			concurrency: number;
			now?: () => number;
		}
	) {
		if (typeof options.configured !== 'boolean') {
			throw new Error('Provider configured state must be boolean');
		}
		if (
			!Number.isSafeInteger(options.concurrency) ||
			options.concurrency < 1 ||
			options.concurrency > MAX_AGENTIC_CHAT_CONCURRENCY
		) {
			throw new Error(
				`Agentic Chat provider concurrency must be between 1 and ${MAX_AGENTIC_CHAT_CONCURRENCY}`
			);
		}
	}

	acquire(turnRunId?: string): AgenticChatProviderCapacityLeaseV1 {
		const snapshot = this.getSnapshot(turnRunId);
		if (!snapshot.available) {
			throw new AgenticChatProviderCapacityError(
				!snapshot.configured
					? 'Agentic Chat provider credentials are not configured'
					: snapshot.degradedUntilMs !== null
						? 'Agentic Chat provider is temporarily degraded'
						: 'Agentic Chat provider concurrency is saturated'
			);
		}
		this.activeRequests += 1;
		let released = false;
		return {
			release: () => {
				if (released) return;
				released = true;
				this.activeRequests = Math.max(0, this.activeRequests - 1);
			}
		};
	}

	markTemporarilyUnavailable(turnRunId: string, cooldownMs: number): void {
		assertTurnRunId(turnRunId);
		if (!Number.isSafeInteger(cooldownMs) || cooldownMs < 1 || cooldownMs > 60_000) {
			throw new Error('Provider cooldown must be between 1ms and 60000ms');
		}
		this.degradedUntilByTurn.set(turnRunId, this.now() + cooldownMs);
	}

	markAvailable(turnRunId: string): void {
		assertTurnRunId(turnRunId);
		this.degradedUntilByTurn.delete(turnRunId);
	}

	getSnapshot(turnRunId?: string): AgenticChatProviderCapacitySnapshotV1 {
		if (turnRunId !== undefined) assertTurnRunId(turnRunId);
		const observedAtMs = this.now();
		for (const [key, degradedUntilMs] of this.degradedUntilByTurn) {
			if (degradedUntilMs <= observedAtMs) this.degradedUntilByTurn.delete(key);
		}
		const degradedUntilMs = turnRunId
			? (this.degradedUntilByTurn.get(turnRunId) ?? null)
			: null;
		return {
			observedAtMs,
			configured: this.options.configured,
			available:
				this.options.configured &&
				degradedUntilMs === null &&
				this.activeRequests < this.options.concurrency,
			activeRequests: this.activeRequests,
			concurrency: this.options.concurrency,
			degradedUntilMs
		};
	}

	private now(): number {
		const value = this.options.now?.() ?? Date.now();
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new Error('Provider capacity clock must return a nonnegative safe integer');
		}
		return value;
	}
}

function assertTurnRunId(value: string): void {
	if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
		throw new Error('Provider capacity turn scope must be canonical text');
	}
}
