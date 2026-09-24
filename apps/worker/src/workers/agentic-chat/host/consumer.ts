// apps/worker/src/workers/agentic-chat/host/consumer.ts

import {
	AGENTIC_CHAT_TURN_LEASE_POLICY_V1,
	type AgenticChatTurnJobV1
} from '@buildos/shared-types';
import { type ProcessingJob, SupabaseQueue } from '../../../lib/supabaseQueue';
import { MAX_QUEUE_DRAIN_TIMEOUT_MS } from '../../../config/shutdownBudget';
import { MAX_AGENTIC_CHAT_CONCURRENCY } from '../shared/concurrency-bounds';
import { validateAgenticChatTurnLeaseTimingV1 } from '../turn/turn-lease';

export { MAX_AGENTIC_CHAT_CONCURRENCY };

/**
 * Queue cadence plus the worker side of turn leases
 * (docs/architecture/AGENTIC_CHAT_TURN_LEASES_2026-09-23.md). The database owns
 * when a turn counts as dead; these values must keep the worker ahead of it,
 * which `validateAgenticChatConsumerConfig` enforces.
 */
export const DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG = {
	concurrency: 1,
	pollIntervalMs: 1_000,
	/** Safety cadence while the private wake subscription is healthy. */
	idlePollIntervalMs: 5_000,
	/** Hard cap on one turn, unchanged by leases. */
	workerTimeoutMs: 360_000,
	drainTimeoutMs: MAX_QUEUE_DRAIN_TIMEOUT_MS,
	leaseRenewIntervalMs: AGENTIC_CHAT_TURN_LEASE_POLICY_V1.renewIntervalMs,
	leaseSelfFenceAfterMs: AGENTIC_CHAT_TURN_LEASE_POLICY_V1.selfFenceAfterMs,
	recoverySweepIntervalMs: AGENTIC_CHAT_TURN_LEASE_POLICY_V1.recoverySweepIntervalMs
} as const;

export type AgenticChatConsumerConfig = {
	[key in keyof typeof DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG]: number;
};

export type AgenticChatTurnExecutorPort = {
	execute(job: ProcessingJob<AgenticChatTurnJobV1>): Promise<unknown>;
};

export type AgenticChatConsumer = {
	/** Dedicated queue instance. The factory never starts it. */
	queue: SupabaseQueue;
	config: AgenticChatConsumerConfig;
	/** Low-latency hint; durable safety polling covers missed notifications. */
	wake(): Promise<void>;
};

export type AgenticChatConsumerOptions = {
	config?: Partial<AgenticChatConsumerConfig>;
};

/**
 * Construct the dedicated logical chat pool without starting it.
 *
 * The caller must inject a reviewed real executor and explicitly start the
 * returned queue. Keeping construction separate from startup prevents this
 * production boundary from silently substituting a fixture executor or
 * registering chat work on the general queue.
 */
export function createAgenticChatConsumer(
	executor: AgenticChatTurnExecutorPort,
	options: AgenticChatConsumerOptions
): AgenticChatConsumer {
	const resolved = {
		...DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG,
		...options.config
	};
	validateAgenticChatConsumerConfig(resolved);
	validateAgenticChatDrainTimeout(resolved.drainTimeoutMs);

	const queue = new SupabaseQueue({
		batchSize: resolved.concurrency,
		pollInterval: resolved.pollIntervalMs,
		wakeAwarePolling: { idleIntervalMs: resolved.idlePollIntervalMs, jitterMs: 250 },
		// Only sets the queue-row heartbeat (every 60 s). Chat recovery reads that
		// heartbeat solely for rows without a lease; generic recovery stays off.
		stalledTimeout: AGENTIC_CHAT_TURN_LEASE_POLICY_V1.unleasedExpiredAfterMs,
		drainTimeout: resolved.drainTimeoutMs,
		genericStalledRecovery: false
	});
	queue.process<AgenticChatTurnJobV1>('agentic_chat_turn', (job) => executor.execute(job), {
		queueLifecycle: 'processor_managed',
		workerTimeoutMs: resolved.workerTimeoutMs
	});

	const registered = queue.getRegisteredJobTypes();
	if (registered.length !== 1 || registered[0] !== 'agentic_chat_turn') {
		throw new Error('Agentic Chat consumer registration is not isolated');
	}

	return {
		queue,
		config: resolved,
		wake: () => queue.wake()
	};
}

export function validateAgenticChatConsumerConfig(config: AgenticChatConsumerConfig): void {
	for (const [name, value] of Object.entries(config)) {
		if (!Number.isSafeInteger(value) || value < 1) {
			throw new Error(`${name} must be a positive safe integer`);
		}
	}
	if (config.concurrency > MAX_AGENTIC_CHAT_CONCURRENCY) {
		throw new Error(
			`Agentic Chat concurrency cannot exceed the reviewed bound of ${MAX_AGENTIC_CHAT_CONCURRENCY}`
		);
	}
	if (config.pollIntervalMs < 1_000) {
		throw new Error('Agentic Chat durable polling cannot be below 1000ms');
	}
	validateAgenticChatLeaseTiming(config);
}

/**
 * The lease model replaces "stalled timeout > worker timeout". The rules live
 * in one place, `validateAgenticChatTurnLeaseTimingV1`, which the lease keeper
 * and the drift test use too.
 */
export function validateAgenticChatLeaseTiming(
	config: Pick<
		AgenticChatConsumerConfig,
		| 'workerTimeoutMs'
		| 'leaseRenewIntervalMs'
		| 'leaseSelfFenceAfterMs'
		| 'recoverySweepIntervalMs'
	>
): void {
	validateAgenticChatTurnLeaseTimingV1({
		renewIntervalMs: config.leaseRenewIntervalMs,
		selfFenceAfterMs: config.leaseSelfFenceAfterMs,
		rpcTimeoutMs: AGENTIC_CHAT_TURN_LEASE_POLICY_V1.rpcTimeoutMs,
		recoverySweepIntervalMs: config.recoverySweepIntervalMs,
		workerTimeoutMs: config.workerTimeoutMs,
		terminalBudgetMs: AGENTIC_CHAT_TURN_LEASE_POLICY_V1.terminalBudgetMs
	});
}

export function validateAgenticChatDrainTimeout(drainTimeoutMs: number): void {
	if (drainTimeoutMs > MAX_QUEUE_DRAIN_TIMEOUT_MS) {
		throw new Error(
			`Agentic Chat drain timeout cannot exceed ${MAX_QUEUE_DRAIN_TIMEOUT_MS}ms process budget`
		);
	}
}
