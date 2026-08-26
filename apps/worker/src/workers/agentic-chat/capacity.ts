// apps/worker/src/workers/agentic-chat/capacity.ts

import type { QueueCapacitySnapshot } from '../../lib/supabaseQueue';
import type { AgenticChatConsumerRuntimeHealth } from './consumerRuntime';
import type { AgenticChatProviderCapacitySnapshotV1 } from './providerCapacity';
import type { AgenticChatPublisherWorkerSnapshotV1 } from './streamPublisher';
import { MAX_AGENTIC_CHAT_CONCURRENCY } from './concurrencyBounds';

const MAX_PROVIDER_SNAPSHOT_AGE_MS = 15_000;

type QueueAgeQueryError = { message: string };
type QueueAgeQueryResult = PromiseLike<{
	data: unknown;
	error: QueueAgeQueryError | null;
}>;

export type AgenticChatQueueAgeQuery = QueueAgeQueryResult & {
	eq(column: string, value: unknown): AgenticChatQueueAgeQuery;
	lte(column: string, value: unknown): AgenticChatQueueAgeQuery;
	order(
		column: string,
		options?: { ascending?: boolean; nullsFirst?: boolean }
	): AgenticChatQueueAgeQuery;
	limit(value: number): AgenticChatQueueAgeQuery;
	maybeSingle(): QueueAgeQueryResult;
};

export type AgenticChatQueueAgeClient = {
	from(table: 'queue_jobs'): {
		select(columns: string): AgenticChatQueueAgeQuery;
	};
};

export type AgenticChatReadyQueueAgePortV1 = {
	observeOldestReadyJobAgeMs(nowMs: number): Promise<number>;
};

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

export class SupabaseAgenticChatReadyQueueAgeAdapter implements AgenticChatReadyQueueAgePortV1 {
	constructor(private readonly client: AgenticChatQueueAgeClient) {}

	async observeOldestReadyJobAgeMs(nowMs: number): Promise<number> {
		validateTimestampMs(nowMs, 'queue observation time');
		const nowIso = new Date(nowMs).toISOString();
		const { data, error } = await this.client
			.from('queue_jobs')
			.select('scheduled_for')
			.eq('job_type', 'agentic_chat_turn')
			.eq('status', 'pending')
			.lte('scheduled_for', nowIso)
			.order('scheduled_for', { ascending: true, nullsFirst: false })
			.limit(1)
			.maybeSingle();
		if (error) throw new Error(`Agentic Chat queue age query failed: ${error.message}`);
		if (data === null) return 0;
		if (!isRecord(data) || typeof data.scheduled_for !== 'string') {
			throw new Error('Agentic Chat queue age query returned an invalid row');
		}
		const scheduledForMs = Date.parse(data.scheduled_for);
		if (!Number.isFinite(scheduledForMs) || scheduledForMs > nowMs) {
			throw new Error('Agentic Chat queue age query returned an invalid ready timestamp');
		}
		return nowMs - scheduledForMs;
	}
}

export class AgenticChatWorkerCapacityCollector {
	constructor(
		private readonly ports: {
			runtime: { getHealth(): AgenticChatConsumerRuntimeHealth };
			queue: { getCapacitySnapshot(): QueueCapacitySnapshot };
			queueAge: AgenticChatReadyQueueAgePortV1;
			provider: { getSnapshot(): AgenticChatProviderCapacitySnapshotV1 };
			publisher: { getWorkerSnapshot(): AgenticChatPublisherWorkerSnapshotV1 };
			now?: () => number;
		}
	) {}

	/** Missing or malformed dependencies return null so the operational projection stays closed. */
	async collect(): Promise<AgenticChatWorkerCapacityEvidenceV1 | null> {
		try {
			const runtime = this.ports.runtime.getHealth();
			const queue = this.ports.queue.getCapacitySnapshot();
			if (
				!runtime.healthy ||
				runtime.state !== 'running' ||
				!queue.acceptingWork ||
				queue.draining ||
				!Number.isSafeInteger(queue.concurrency) ||
				queue.concurrency < 1 ||
				queue.concurrency > MAX_AGENTIC_CHAT_CONCURRENCY ||
				queue.activeJobs < 0 ||
				queue.availableSlots < 0 ||
				queue.activeJobs + queue.availableSlots !== queue.concurrency
			) {
				return null;
			}

			const provider = this.ports.provider.getSnapshot();
			const publisher = this.ports.publisher.getWorkerSnapshot();
			// Anchor the aggregate observation after taking the synchronous local
			// snapshots. Provider capacity reads the same wall clock; taking
			// this timestamp first made a legitimate snapshot from the next millisecond
			// look like future evidence and intermittently closed the HTTP projection.
			const nowMs = this.ports.now?.() ?? Date.now();
			validateTimestampMs(nowMs, 'capacity observation time');
			if (
				!validProviderSnapshot(provider, queue.concurrency) ||
				nowMs - provider.observedAtMs < 0 ||
				nowMs - provider.observedAtMs > MAX_PROVIDER_SNAPSHOT_AGE_MS
			) {
				return null;
			}
			if (!validPublisherSnapshot(publisher)) return null;
			const oldestReadyJobAgeMs = await this.ports.queueAge.observeOldestReadyJobAgeMs(nowMs);
			if (!Number.isFinite(oldestReadyJobAgeMs) || oldestReadyJobAgeMs < 0) return null;

			return {
				observedAtMs: nowMs,
				queue: { oldestReadyJobAgeMs },
				provider: { available: provider.available },
				publisher: {
					healthy:
						publisher.accepting &&
						!publisher.stopping &&
						publisher.pressure === 'normal',
					pendingBytes: publisher.pendingBytes
				}
			};
		} catch {
			return null;
		}
	}
}

function validProviderSnapshot(
	value: AgenticChatProviderCapacitySnapshotV1,
	expectedConcurrency: number
): boolean {
	return (
		Number.isSafeInteger(value.observedAtMs) &&
		value.observedAtMs >= 0 &&
		typeof value.configured === 'boolean' &&
		typeof value.available === 'boolean' &&
		Number.isSafeInteger(value.activeRequests) &&
		value.activeRequests >= 0 &&
		value.activeRequests <= expectedConcurrency &&
		value.concurrency === expectedConcurrency &&
		(value.degradedUntilMs === null ||
			(Number.isSafeInteger(value.degradedUntilMs) && value.degradedUntilMs >= 0)) &&
		value.available ===
			(value.configured &&
				value.activeRequests < value.concurrency &&
				value.degradedUntilMs === null)
	);
}

function validPublisherSnapshot(value: AgenticChatPublisherWorkerSnapshotV1): boolean {
	return (
		Number.isSafeInteger(value.registeredTurns) &&
		value.registeredTurns >= 0 &&
		Number.isSafeInteger(value.pendingBytes) &&
		value.pendingBytes >= 0 &&
		Number.isSafeInteger(value.pendingEvents) &&
		value.pendingEvents >= 0 &&
		Number.isSafeInteger(value.softByteLimit) &&
		value.softByteLimit >= 0 &&
		Number.isSafeInteger(value.hardByteLimit) &&
		value.hardByteLimit >= value.softByteLimit &&
		Number.isSafeInteger(value.softEventLimit) &&
		value.softEventLimit >= 0 &&
		Number.isSafeInteger(value.hardEventLimit) &&
		value.hardEventLimit >= value.softEventLimit &&
		value.pendingBytes <= value.hardByteLimit &&
		value.pendingEvents <= value.hardEventLimit &&
		(value.pressure === 'normal' || value.pressure === 'soft_limit') &&
		typeof value.accepting === 'boolean' &&
		typeof value.stopping === 'boolean'
	);
}

function validateTimestampMs(value: number, label: string): void {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${label} must be a nonnegative safe integer`);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
