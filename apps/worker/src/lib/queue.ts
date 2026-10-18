// apps/worker/src/lib/queue.ts
import { getEnvironmentConfig } from '../config/queueConfig';
import { resolveDefaultQueueDrainTimeout } from '../config/shutdownBudget';
import { SupabaseQueue } from './supabaseQueue';

export const queueRuntimeConfig = getEnvironmentConfig();

export const queue = new SupabaseQueue({
	pollInterval: queueRuntimeConfig.pollInterval,
	batchSize: queueRuntimeConfig.batchSize,
	stalledTimeout: queueRuntimeConfig.stalledTimeout,
	// Let aborted processors persist their retryable state before shutdown exits.
	abortGraceMs: 3000,
	drainTimeout: Math.max(
		0,
		resolveDefaultQueueDrainTimeout(process.env.QUEUE_DRAIN_TIMEOUT_MS) - 3000
	)
});
