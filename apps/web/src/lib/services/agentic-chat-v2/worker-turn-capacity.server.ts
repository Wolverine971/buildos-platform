// apps/web/src/lib/services/agentic-chat-v2/worker-turn-capacity.server.ts
export const AGENTIC_CHAT_WORKER_CAPACITY_RETRY_AFTER_SECONDS = 2;

const MAX_EVIDENCE_AGE_MS = 15_000;
const MAX_QUEUE_AGE_MS = 30_000;
const MAX_PUBLISHER_PENDING_BYTES = 8 * 1024 * 1024;

export type AgenticChatWorkerCapacityEvidenceV1 = {
	observedAtMs: number;
	queue: {
		oldestReadyJobAgeMs: number;
	};
	provider: {
		available: boolean;
	};
	publisher: {
		healthy: boolean;
		pendingBytes: number;
	};
};

export type AgenticChatWorkerCapacityDecisionV1 = {
	available: boolean;
	retryAfterSeconds: number;
	reason:
		| 'open'
		| 'missing_evidence'
		| 'stale_evidence'
		| 'queue_pressure'
		| 'provider_pressure'
		| 'publisher_pressure';
};

/**
 * Testable web-side pressure boundary. Every required signal must be present,
 * fresh, finite, and within its bound; missing or malformed evidence closes
 * admission. Database running/queued hard caps remain authoritative in the
 * atomic RPC.
 */
export function evaluateAgenticChatWorkerCapacity(
	evidence: AgenticChatWorkerCapacityEvidenceV1 | null | undefined,
	nowMs = Date.now()
): AgenticChatWorkerCapacityDecisionV1 {
	const closed = (
		reason: Exclude<AgenticChatWorkerCapacityDecisionV1['reason'], 'open'>
	): AgenticChatWorkerCapacityDecisionV1 => ({
		available: false,
		retryAfterSeconds: AGENTIC_CHAT_WORKER_CAPACITY_RETRY_AFTER_SECONDS,
		reason
	});

	if (!isEvidenceShapeValid(evidence) || !Number.isSafeInteger(nowMs) || nowMs < 0) {
		return closed('missing_evidence');
	}
	const evidenceAgeMs = nowMs - evidence.observedAtMs;
	if (evidenceAgeMs < 0 || evidenceAgeMs > MAX_EVIDENCE_AGE_MS) {
		return closed('stale_evidence');
	}
	if (evidence.queue.oldestReadyJobAgeMs > MAX_QUEUE_AGE_MS) {
		return closed('queue_pressure');
	}
	if (!evidence.provider.available) return closed('provider_pressure');
	if (
		!evidence.publisher.healthy ||
		evidence.publisher.pendingBytes > MAX_PUBLISHER_PENDING_BYTES
	) {
		return closed('publisher_pressure');
	}
	return {
		available: true,
		retryAfterSeconds: AGENTIC_CHAT_WORKER_CAPACITY_RETRY_AFTER_SECONDS,
		reason: 'open'
	};
}

/**
 * Production evidence collection is intentionally not wired in Slice 4.
 * Keeping this explicit default closed makes the new route inert even when a
 * direct worker lease is issued for a fixture. The later consumer assembly can
 * supply live queue/provider/publisher observations without changing the
 * admission contract.
 */
export async function observeAgenticChatWorkerCapacity(): Promise<AgenticChatWorkerCapacityDecisionV1> {
	return evaluateAgenticChatWorkerCapacity(null);
}

function isEvidenceShapeValid(
	value: AgenticChatWorkerCapacityEvidenceV1 | null | undefined
): value is AgenticChatWorkerCapacityEvidenceV1 {
	return Boolean(
		value &&
			isNonnegativeSafeInteger(value.observedAtMs) &&
			value.queue &&
			isNonnegativeFiniteNumber(value.queue.oldestReadyJobAgeMs) &&
			value.provider &&
			typeof value.provider.available === 'boolean' &&
			value.publisher &&
			typeof value.publisher.healthy === 'boolean' &&
			isNonnegativeFiniteNumber(value.publisher.pendingBytes)
	);
}

function isNonnegativeSafeInteger(value: unknown): boolean {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isNonnegativeFiniteNumber(value: unknown): boolean {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
