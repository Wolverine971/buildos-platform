// apps/worker/src/workers/agentic-chat/providerCapacity.ts

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
	private degradedUntilMs: number | null = null;

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
		if (!Number.isSafeInteger(options.concurrency) || options.concurrency !== 1) {
			throw new Error('Phase 3 provider concurrency must remain 1 until the load-smoke gate');
		}
	}

	acquire(): AgenticChatProviderCapacityLeaseV1 {
		const snapshot = this.getSnapshot();
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

	markTemporarilyUnavailable(cooldownMs: number): void {
		if (!Number.isSafeInteger(cooldownMs) || cooldownMs < 1 || cooldownMs > 60_000) {
			throw new Error('Provider cooldown must be between 1ms and 60000ms');
		}
		this.degradedUntilMs = this.now() + cooldownMs;
	}

	markAvailable(): void {
		this.degradedUntilMs = null;
	}

	getSnapshot(): AgenticChatProviderCapacitySnapshotV1 {
		const observedAtMs = this.now();
		if (this.degradedUntilMs !== null && this.degradedUntilMs <= observedAtMs) {
			this.degradedUntilMs = null;
		}
		return {
			observedAtMs,
			configured: this.options.configured,
			available:
				this.options.configured &&
				this.degradedUntilMs === null &&
				this.activeRequests < this.options.concurrency,
			activeRequests: this.activeRequests,
			concurrency: this.options.concurrency,
			degradedUntilMs: this.degradedUntilMs
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
