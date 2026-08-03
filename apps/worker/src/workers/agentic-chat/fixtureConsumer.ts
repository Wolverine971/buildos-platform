// apps/worker/src/workers/agentic-chat/fixtureConsumer.ts
import type { AgenticChatTurnJobV1 } from '@buildos/shared-types';
import { type ProcessingJob, SupabaseQueue } from '../../lib/supabaseQueue';
import type {
	AgenticChatFixtureExecutionResultV1,
	AgenticChatFixtureTurnExecutor
} from './fixtureTurnExecutor';

export const DEFAULT_AGENTIC_CHAT_FIXTURE_CONSUMER_CONFIG = {
	concurrency: 1,
	pollIntervalMs: 1_000,
	workerTimeoutMs: 360_000,
	stalledTimeoutMs: 420_000,
	drainTimeoutMs: 25_000
} as const;

export type AgenticChatFixtureConsumerConfig = {
	[key in keyof typeof DEFAULT_AGENTIC_CHAT_FIXTURE_CONSUMER_CONFIG]: number;
};

type FixtureExecutorPort = Pick<AgenticChatFixtureTurnExecutor, 'execute'>;

export type AgenticChatFixtureConsumer = {
	/** Dedicated queue instance; the factory never starts it. */
	queue: SupabaseQueue;
	config: AgenticChatFixtureConsumerConfig;
};

/**
 * Constructs an inert, chat-only consumer for Phase 2D fixtures. Production
 * worker entrypoints intentionally do not import or call this factory.
 */
export function createAgenticChatFixtureConsumer(
	executor: FixtureExecutorPort,
	config: Partial<AgenticChatFixtureConsumerConfig> = {}
): AgenticChatFixtureConsumer {
	const resolved = {
		...DEFAULT_AGENTIC_CHAT_FIXTURE_CONSUMER_CONFIG,
		...config
	};
	validateConfig(resolved);

	const queue = new SupabaseQueue({
		batchSize: resolved.concurrency,
		pollInterval: resolved.pollIntervalMs,
		stalledTimeout: resolved.stalledTimeoutMs,
		drainTimeout: resolved.drainTimeoutMs,
		genericStalledRecovery: false
	});
	queue.process<AgenticChatTurnJobV1>(
		'agentic_chat_turn',
		(job: ProcessingJob<AgenticChatTurnJobV1>): Promise<AgenticChatFixtureExecutionResultV1> =>
			executor.execute(job),
		{
			queueLifecycle: 'processor_managed',
			workerTimeoutMs: resolved.workerTimeoutMs
		}
	);
	if (
		queue.getRegisteredJobTypes().length !== 1 ||
		queue.getRegisteredJobTypes()[0] !== 'agentic_chat_turn'
	) {
		throw new Error('Agentic Chat fixture consumer registration is not isolated');
	}
	return { queue, config: resolved };
}

function validateConfig(config: AgenticChatFixtureConsumerConfig): void {
	for (const [name, value] of Object.entries(config)) {
		if (!Number.isSafeInteger(value) || value < 1) {
			throw new Error(`${name} must be a positive safe integer`);
		}
	}
	if (config.concurrency > 8) throw new Error('Fixture chat concurrency cannot exceed 8');
	if (config.pollIntervalMs < 250) throw new Error('Fixture chat polling cannot be below 250ms');
	if (config.stalledTimeoutMs <= config.workerTimeoutMs) {
		throw new Error('Fixture stalled timeout must exceed its worker timeout');
	}
}
