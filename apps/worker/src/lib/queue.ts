// apps/worker/src/lib/queue.ts
import { getEnvironmentConfig } from '../config/queueConfig';
import { SupabaseQueue } from './supabaseQueue';

export const queueRuntimeConfig = getEnvironmentConfig();

export const queue = new SupabaseQueue({
	pollInterval: queueRuntimeConfig.pollInterval,
	batchSize: queueRuntimeConfig.batchSize,
	stalledTimeout: queueRuntimeConfig.stalledTimeout
});
