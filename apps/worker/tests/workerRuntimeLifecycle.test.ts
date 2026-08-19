// apps/worker/tests/workerRuntimeLifecycle.test.ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatPhase3BootstrapHealth } from '../src/workers/agentic-chat/phase3Bootstrap';
import {
	WorkerRuntimeLifecycle,
	type WorkerRuntimeLifecyclePorts
} from '../src/lib/workerRuntimeLifecycle';
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

function chatHealth(
	overrides: Partial<AgenticChatPhase3BootstrapHealth> = {}
): AgenticChatPhase3BootstrapHealth {
	return {
		enabled: false,
		healthy: true,
		state: 'disabled',
		reason: 'disabled',
		runtime: null,
		...overrides
	};
}

function ports(): WorkerRuntimeLifecyclePorts & {
	queue: WorkerRuntimeLifecyclePorts['queue'] & {
		start: ReturnType<typeof vi.fn>;
		stop: ReturnType<typeof vi.fn>;
		getHealth: ReturnType<typeof vi.fn>;
	};
	agenticChat: WorkerRuntimeLifecyclePorts['agenticChat'] & {
		start: ReturnType<typeof vi.fn>;
		stop: ReturnType<typeof vi.fn>;
		getHealth: ReturnType<typeof vi.fn>;
	};
} {
	return {
		queue: {
			start: vi.fn(async () => undefined),
			stop: vi.fn(async () => undefined),
			getHealth: vi.fn(() => queueHealth())
		},
		agenticChat: {
			start: vi.fn(async () => 'disabled' as const),
			stop: vi.fn(async () => undefined),
			getHealth: vi.fn(() => chatHealth())
		}
	};
}

describe('WorkerRuntimeLifecycle', () => {
	it('keeps the production mount, composite health, and crash cleanup wired', () => {
		const workerSource = readFileSync(join(WORKER_SRC, 'worker.ts'), 'utf8');
		const indexSource = readFileSync(join(WORKER_SRC, 'index.ts'), 'utf8');

		expect(workerSource).toContain('createAgenticChatPhase3Bootstrap({ client: supabase })');
		expect(workerSource).toContain('await lifecycle.start()');
		expect(workerSource).toContain('await workerRuntimeLifecycle.stop()');
		expect(workerSource).not.toContain("queue.process('agentic_chat_turn'");
		expect(workerSource).toContain('agenticChatBootstrap.collectCapacityEvidence().finally');
		expect(indexSource).toContain('const workerHealth = getWorkerHealth()');
		expect(indexSource).toContain('buildWorkerOperationalHealthChecks(');
		expect(indexSource).toContain('agenticChat: workerHealth.agenticChat');
		expect(indexSource).toContain('app.get(AGENTIC_CHAT_CAPACITY_PATH');
		expect(indexSource).toContain('Promise.race([shutdownWorker(), timer])');
		expect(indexSource).toContain('const workerShutdown: Promise<{ error: unknown | null }>');
		expect(
			indexSource.indexOf('const workerShutdown: Promise<{ error: unknown | null }>')
		).toBeLessThan(indexSource.indexOf('server.closeIdleConnections()'));
		expect(indexSource).toContain("await crashExit('startup')");
		expect(indexSource).not.toContain('Promise.race([queue.stop(), timer])');
	});

	it('caps default queue drains inside the process shutdown budget', () => {
		expect(MAX_QUEUE_DRAIN_TIMEOUT_MS).toBe(22_000);
		expect(resolveDefaultQueueDrainTimeout(undefined)).toBe(22_000);
		expect(resolveDefaultQueueDrainTimeout('5000')).toBe(5_000);
		expect(resolveDefaultQueueDrainTimeout('25000')).toBe(22_000);
		expect(resolveDefaultQueueDrainTimeout('-1')).toBe(22_000);
		expect(resolveDefaultQueueDrainTimeout('not-a-number')).toBe(22_000);
	});

	it('preserves disabled chat behavior while reporting explicit composite health', async () => {
		const owned = ports();
		const lifecycle = new WorkerRuntimeLifecycle(owned);

		await lifecycle.start();
		expect(owned.queue.start).toHaveBeenCalledOnce();
		expect(owned.agenticChat.start).toHaveBeenCalledOnce();
		expect(lifecycle.getHealth()).toEqual({
			healthy: true,
			state: 'running',
			queue: queueHealth(),
			agenticChat: chatHealth()
		});
		await lifecycle.stop();
		expect(owned.queue.stop).toHaveBeenCalledOnce();
		expect(owned.agenticChat.stop).toHaveBeenCalledOnce();
	});

	it('rolls back both runtimes when enabled chat startup fails', async () => {
		const owned = ports();
		owned.agenticChat.start.mockRejectedValueOnce(new Error('chat startup failed'));
		const lifecycle = new WorkerRuntimeLifecycle(owned);

		await expect(lifecycle.start()).rejects.toThrow('chat startup failed');
		expect(owned.queue.stop).toHaveBeenCalledOnce();
		expect(owned.agenticChat.stop).toHaveBeenCalledOnce();
		expect(lifecycle.getHealth()).toMatchObject({
			healthy: false,
			state: 'failed',
			reason: 'chat startup failed'
		});
	});

	it('attempts both startup rollback paths even when one stop throws synchronously', async () => {
		const owned = ports();
		owned.queue.start.mockRejectedValueOnce(new Error('general startup failed'));
		owned.queue.stop.mockImplementationOnce(() => {
			throw new Error('general rollback failed');
		});
		const lifecycle = new WorkerRuntimeLifecycle(owned);

		await expect(lifecycle.start()).rejects.toMatchObject({
			name: 'AggregateError',
			message: 'Worker runtime startup failed and rollback was incomplete'
		});
		expect(owned.agenticChat.stop).toHaveBeenCalledOnce();
	});

	it('starts both bounded drains concurrently and aggregates shutdown failures', async () => {
		const owned = ports();
		let resolveQueue!: () => void;
		let rejectChat!: (error: Error) => void;
		owned.queue.stop.mockImplementationOnce(
			() => new Promise<void>((resolve) => (resolveQueue = resolve))
		);
		owned.agenticChat.stop.mockImplementationOnce(
			() => new Promise<void>((_resolve, reject) => (rejectChat = reject))
		);
		const lifecycle = new WorkerRuntimeLifecycle(owned);
		await lifecycle.start();

		const stopping = lifecycle.stop();
		expect(lifecycle.getHealth()).toMatchObject({
			healthy: false,
			state: 'stopping',
			reason: 'stopping'
		});
		await vi.waitFor(() => {
			expect(owned.queue.stop).toHaveBeenCalledOnce();
			expect(owned.agenticChat.stop).toHaveBeenCalledOnce();
		});
		resolveQueue();
		rejectChat(new Error('chat drain failed'));
		await expect(stopping).rejects.toMatchObject({
			name: 'AggregateError',
			message: 'Worker runtime shutdown was incomplete'
		});
		expect(lifecycle.getHealth()).toMatchObject({
			healthy: false,
			state: 'failed',
			reason: 'chat drain failed'
		});
	});

	it('fails composite health when enabled chat health is unavailable', async () => {
		const owned = ports();
		owned.agenticChat.getHealth.mockReturnValue(
			chatHealth({
				enabled: true,
				healthy: false,
				state: 'failed',
				reason: 'provider unavailable'
			})
		);
		const lifecycle = new WorkerRuntimeLifecycle(owned);
		await lifecycle.start();

		expect(lifecycle.getHealth()).toMatchObject({
			healthy: false,
			state: 'running',
			reason: 'provider unavailable',
			agenticChat: { enabled: true, healthy: false }
		});
	});
});
