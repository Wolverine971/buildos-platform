// apps/worker/src/workers/agentic-chat/consumer.ts

import type { AgenticChatTurnJobV1 } from '@buildos/shared-types';
import { type ProcessingJob, SupabaseQueue } from '../../lib/supabaseQueue';

export const DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG = {
	concurrency: 1,
	pollIntervalMs: 1_000,
	workerTimeoutMs: 360_000,
	stalledTimeoutMs: 420_000,
	drainTimeoutMs: 25_000
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

export class AgenticChatInternalCohortError extends Error {
	readonly code = 'internal_cohort_rejected';

	constructor() {
		super('Agentic Chat turn is outside the configured internal cohort');
		this.name = 'AgenticChatInternalCohortError';
	}
}

export type AgenticChatConsumerOptions = {
	internalUserIds: readonly string[];
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
	const internalUserIds = normalizeInternalUserIds(options.internalUserIds);
	const internalUsers = new Set(internalUserIds);

	const queue = new SupabaseQueue({
		batchSize: resolved.concurrency,
		pollInterval: resolved.pollIntervalMs,
		stalledTimeout: resolved.stalledTimeoutMs,
		drainTimeout: resolved.drainTimeoutMs,
		genericStalledRecovery: false
	});
	queue.process<AgenticChatTurnJobV1>(
		'agentic_chat_turn',
		(job) => {
			if (!internalUsers.has(job.userId.toLowerCase())) {
				throw new AgenticChatInternalCohortError();
			}
			return executor.execute(job);
		},
		{
			queueLifecycle: 'processor_managed',
			workerTimeoutMs: resolved.workerTimeoutMs
		}
	);

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
	if (config.concurrency !== 1) {
		throw new Error('Phase 3 Agentic Chat concurrency must remain 1 until the load-smoke gate');
	}
	if (config.pollIntervalMs < 1_000) {
		throw new Error('Agentic Chat durable polling cannot be below 1000ms');
	}
	if (config.stalledTimeoutMs <= config.workerTimeoutMs) {
		throw new Error('Agentic Chat stalled timeout must exceed its worker timeout');
	}
}

export function normalizeInternalUserIds(userIds: readonly string[]): string[] {
	if (userIds.length === 0) {
		throw new Error('Agentic Chat consumer requires at least one internal user UUID');
	}
	const normalized = userIds.map((userId) => userId.toLowerCase());
	if (normalized.some((userId) => !UUID_PATTERN.test(userId))) {
		throw new Error('Agentic Chat internal user cohort must contain canonical UUIDs');
	}
	if (new Set(normalized).size !== normalized.length) {
		throw new Error('Agentic Chat internal user cohort must not contain duplicates');
	}
	return normalized.sort();
}

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
