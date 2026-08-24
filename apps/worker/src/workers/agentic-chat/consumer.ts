// apps/worker/src/workers/agentic-chat/consumer.ts

import type { AgenticChatTurnJobV1 } from '@buildos/shared-types';
import { type ProcessingJob, SupabaseQueue } from '../../lib/supabaseQueue';
import { MAX_QUEUE_DRAIN_TIMEOUT_MS } from '../../config/shutdownBudget';
import { MAX_AGENTIC_CHAT_CONCURRENCY } from './concurrencyBounds';

export { MAX_AGENTIC_CHAT_CONCURRENCY };

export const DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG = {
	concurrency: 1,
	pollIntervalMs: 1_000,
	workerTimeoutMs: 360_000,
	stalledTimeoutMs: 420_000,
	drainTimeoutMs: MAX_QUEUE_DRAIN_TIMEOUT_MS
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
	/** Low-latency hint; the configured one-second poll remains the fallback. */
	wake(): Promise<void>;
};

export type AgenticChatConsumerOptions = {
	config?: Partial<AgenticChatConsumerConfig>;
};

/**
 * Construct the Phase 3 logical chat pool without enabling it.
 *
 * The caller must inject a reviewed real executor and explicitly start the
 * returned queue. Keeping construction separate from startup prevents this
 * production-shaped boundary from silently falling back to the Phase 2 fixture
 * executor or registering chat work on the general queue.
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
		stalledTimeout: resolved.stalledTimeoutMs,
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
	if (config.stalledTimeoutMs <= config.workerTimeoutMs) {
		throw new Error('Agentic Chat stalled timeout must exceed its worker timeout');
	}
}

export function validateAgenticChatDrainTimeout(drainTimeoutMs: number): void {
	if (drainTimeoutMs > MAX_QUEUE_DRAIN_TIMEOUT_MS) {
		throw new Error(
			`Agentic Chat drain timeout cannot exceed ${MAX_QUEUE_DRAIN_TIMEOUT_MS}ms process budget`
		);
	}
}
