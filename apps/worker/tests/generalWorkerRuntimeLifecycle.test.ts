// apps/worker/tests/generalWorkerRuntimeLifecycle.test.ts

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
	GeneralWorkerRuntimeLifecycle,
	type GeneralWorkerRuntimeLifecyclePort
} from '../src/lib/generalWorkerRuntimeLifecycle';
import {
	MAX_QUEUE_DRAIN_TIMEOUT_MS,
	resolveDefaultQueueDrainTimeout
} from '../src/config/shutdownBudget';

const WORKER_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function queueHealth(healthy = true) {
	return {
		healthy,
		...(healthy ? {} : { reason: 'queue_unhealthy' }),
		startedAt: healthy ? new Date(0).toISOString() : null,
		lastSuccessfulClaimAt: healthy ? new Date(0).toISOString() : null,
		lastPollSuccessAt: healthy ? new Date(0).toISOString() : null,
		consecutiveClaimFailures: healthy ? 0 : 3,
		processingBatch: false,
		draining: false
	};
}

function queuePort(): GeneralWorkerRuntimeLifecyclePort & {
	start: ReturnType<typeof vi.fn>;
	stop: ReturnType<typeof vi.fn>;
	getHealth: ReturnType<typeof vi.fn>;
} {
	return {
		start: vi.fn(async () => undefined),
		stop: vi.fn(async () => undefined),
		getHealth: vi.fn(() => queueHealth())
	};
}

describe('GeneralWorkerRuntimeLifecycle', () => {
	it('keeps Agentic Chat out of the general process and dedicated to chat-worker.ts', () => {
		const workerSource = readFileSync(join(WORKER_SRC, 'worker.ts'), 'utf8');
		const indexSource = readFileSync(join(WORKER_SRC, 'index.ts'), 'utf8');
		const dedicatedSource = readFileSync(join(WORKER_SRC, 'chat-worker.ts'), 'utf8');
		const generalSource = `${workerSource}\n${indexSource}`;

		expect(generalSource).not.toContain('createAgenticChatBootstrap');
		expect(generalSource).not.toContain('collectAgenticChatWorkerCapacityEvidence');
		expect(generalSource).not.toContain('AGENTIC_CHAT_CAPACITY_PATH');
		expect(generalSource).not.toContain("queue.process('agentic_chat_turn'");
		expect(dedicatedSource).toContain("from './workers/agentic-chat/bootstrap'");
	});

	it('starts and stops only the general queue exactly once', async () => {
		const queue = queuePort();
		const lifecycle = new GeneralWorkerRuntimeLifecycle(queue);

		await Promise.all([lifecycle.start(), lifecycle.start()]);
		expect(queue.start).toHaveBeenCalledOnce();
		expect(lifecycle.getHealth()).toEqual({
			healthy: true,
			state: 'running',
			queue: queueHealth()
		});
		await Promise.all([lifecycle.stop(), lifecycle.stop()]);
		expect(queue.stop).toHaveBeenCalledOnce();
		expect(lifecycle.getHealth()).toMatchObject({
			healthy: false,
			state: 'stopped',
			reason: 'stopped'
		});
	});

	it('reports queue health without manufacturing chat health', async () => {
		const queue = queuePort();
		queue.getHealth.mockReturnValue(queueHealth(false));
		const lifecycle = new GeneralWorkerRuntimeLifecycle(queue);

		await lifecycle.start();
		expect(lifecycle.getHealth()).toMatchObject({
			healthy: false,
			state: 'running',
			reason: 'queue_unhealthy',
			queue: { healthy: false }
		});
		expect(lifecycle.getHealth()).not.toHaveProperty('agenticChat');
	});

	it('rolls the queue back when startup fails', async () => {
		const queue = queuePort();
		queue.start.mockRejectedValueOnce(new Error('general startup failed'));
		const lifecycle = new GeneralWorkerRuntimeLifecycle(queue);

		await expect(lifecycle.start()).rejects.toThrow('general startup failed');
		expect(queue.stop).toHaveBeenCalledOnce();
		expect(lifecycle.getHealth()).toMatchObject({
			healthy: false,
			state: 'failed',
			reason: 'general startup failed'
		});
	});

	it('reports both startup and rollback failures', async () => {
		const queue = queuePort();
		queue.start.mockRejectedValueOnce(new Error('general startup failed'));
		queue.stop.mockRejectedValueOnce(new Error('general rollback failed'));
		const lifecycle = new GeneralWorkerRuntimeLifecycle(queue);

		await expect(lifecycle.start()).rejects.toMatchObject({
			name: 'AggregateError',
			message: 'General worker startup failed and queue rollback was incomplete'
		});
	});

	it('caps default queue drains inside the process shutdown budget', () => {
		expect(MAX_QUEUE_DRAIN_TIMEOUT_MS).toBe(22_000);
		expect(resolveDefaultQueueDrainTimeout(undefined)).toBe(22_000);
		expect(resolveDefaultQueueDrainTimeout('5000')).toBe(5_000);
		expect(resolveDefaultQueueDrainTimeout('25000')).toBe(22_000);
		expect(resolveDefaultQueueDrainTimeout('-1')).toBe(22_000);
		expect(resolveDefaultQueueDrainTimeout('not-a-number')).toBe(22_000);
	});
});
