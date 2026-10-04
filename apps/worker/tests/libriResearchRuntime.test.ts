import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	loadLibriResearchRuntimeConfig,
	loadLibriWorkerConfig,
	requireDedicatedLibriWorkerProductionProfile
} from '../src/config/libriWorkerProfile';
import { LibriResearchRuntime } from '../src/workers/libri/researchRuntime';
import type { LibriMaintenanceConsumerHealth } from '../src/workers/libri/maintenanceConsumer';

const environment = {
	NODE_ENV: 'production',
	LIBRI_WORKER_PROFILE: 'production',
	LIBRI_WORKER_ENABLED: 'true',
	LIBRI_WORKER_ACTIVATION_MODE: 'research',
	PRIVATE_OPENROUTER_API_KEY: 'offline-key',
	LIBRI_RESEARCH_MODEL: 'offline/synthesis',
	LIBRI_RESEARCH_RESERVED_MICROUSD: '1000'
};
const deferred = () => {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
};
function setup() {
	const consumer = {
		start: vi.fn(async (): Promise<void> => undefined),
		stop: vi.fn(async (): Promise<void> => undefined),
		wake: vi.fn(async (): Promise<void> => undefined),
		getHealth: () =>
			({
				healthy: true,
				state: 'running',
				activeJobs: 0,
				availableConcurrency: 2,
				concurrency: 2,
				lastSuccessfulClaimAt: null,
				consecutiveClaimFailures: 0,
				completedJobs: 0,
				failedJobs: 0,
				staleOwnershipJobs: 0,
				quarantinedJobs: 0
			}) as LibriMaintenanceConsumerHealth
	};
	const options = {
		consumer,
		assertReady: vi.fn(async (): Promise<void> => undefined),
		recover: vi.fn(async (): Promise<void> => undefined),
		dispatch: vi.fn(async (_signal: AbortSignal): Promise<void> => undefined),
		maintenanceIntervalMs: 1000
	};
	return { ...options, runtime: new LibriResearchRuntime(options) };
}
afterEach(() => vi.useRealTimers());
describe('explicit research profile', () => {
	it('stays disabled by default and requires a model, key and reservation only when enabled', () => {
		expect(loadLibriWorkerConfig({}).queueEnabled).toBe(false);
		expect(() => requireDedicatedLibriWorkerProductionProfile(environment)).not.toThrow();
		expect(loadLibriResearchRuntimeConfig(environment)).toMatchObject({
			reservedMicrousd: 1000n,
			model: 'offline/synthesis'
		});
		for (const key of [
			'PRIVATE_OPENROUTER_API_KEY',
			'LIBRI_RESEARCH_MODEL',
			'LIBRI_RESEARCH_RESERVED_MICROUSD'
		]) {
			expect(() => loadLibriWorkerConfig({ ...environment, [key]: '' })).toThrow();
		}
	});
	it.each([
		{ LIBRI_WORKER_ADMISSION_DISPATCH_ENABLED: 'true' },
		{ LIBRI_WORKER_CANARY_STEP_ID: 'a0000000-0000-4000-8000-000000000001' },
		{ LIBRI_WORKER_CANARY_ADMISSION_ID: 'a0000000-0000-4000-8000-000000000001' },
		{ LIBRI_WORKER_CANARY_EXPIRES_AT: '2099-01-01T00:00:00Z' },
		{ LIBRI_RESEARCH_RESERVED_MICROUSD: '0' },
		{ LIBRI_RESEARCH_RESERVED_MICROUSD: '10000001' },
		{ LIBRI_RESEARCH_MODEL: 'https://untrusted.example/model' },
		{ LIBRI_RESEARCH_MAINTENANCE_INTERVAL_MS: '0' },
		{ LIBRI_WORKER_CONCURRENCY: '3' }
	])('rejects unsafe configuration %j', (overrides) => {
		expect(() => loadLibriWorkerConfig({ ...environment, ...overrides })).toThrow();
	});
});
describe('owned research dispatch and recovery loop', () => {
	it('recovers and dispatches before consumption, then polls without overlapping cycles', async () => {
		vi.useFakeTimers();
		const s = setup();
		await s.runtime.start();
		expect(s.assertReady.mock.invocationCallOrder[0]).toBeLessThan(
			s.recover.mock.invocationCallOrder[0]
		);
		expect(s.recover.mock.invocationCallOrder[0]).toBeLessThan(
			s.dispatch.mock.invocationCallOrder[0]
		);
		expect(s.dispatch.mock.invocationCallOrder[0]).toBeLessThan(
			s.consumer.start.mock.invocationCallOrder[0]
		);
		const gate = deferred();
		s.dispatch.mockImplementationOnce(() => gate.promise);
		const first = s.runtime.wake();
		expect(s.runtime.wake()).toBe(first);
		await vi.advanceTimersByTimeAsync(10000);
		expect(s.dispatch).toHaveBeenCalledTimes(2);
		gate.resolve();
		await first;
		await vi.advanceTimersByTimeAsync(1000);
		expect(s.dispatch).toHaveBeenCalledTimes(3);
		expect(s.runtime.getHealth().healthy).toBe(true);
		await s.runtime.stop();
		await vi.advanceTimersByTimeAsync(10000);
		expect(s.dispatch).toHaveBeenCalledTimes(3);
	});
	it('refuses startup before any queue changes when readiness fails', async () => {
		const s = setup();
		s.assertReady.mockRejectedValueOnce(new Error('missing capabilities'));
		await expect(s.runtime.start()).rejects.toThrow('missing capabilities');
		expect(s.recover).not.toHaveBeenCalled();
		expect(s.dispatch).not.toHaveBeenCalled();
		expect(s.consumer.start).not.toHaveBeenCalled();
		expect(s.runtime.getHealth()).toMatchObject({ healthy: false, state: 'failed' });
		await expect(s.runtime.stop()).rejects.toThrow('missing capabilities');
		expect(s.consumer.stop).toHaveBeenCalledOnce();
	});
	it('reports maintenance failures without leaking errors and recovers on a successful poll', async () => {
		const s = setup();
		await s.runtime.start();
		s.dispatch.mockRejectedValueOnce(new Error('sensitive DB details'));
		await s.runtime.wake();
		expect(s.runtime.getHealth()).toMatchObject({
			healthy: false,
			reason: 'research_maintenance_failed'
		});
		expect(JSON.stringify(s.runtime.getHealth())).not.toContain('sensitive');
		await s.runtime.wake();
		expect(s.runtime.getHealth().healthy).toBe(true);
		await s.runtime.stop();
	});
	it('aborts and drains immediately but waits for active dispatch before shutdown returns', async () => {
		const s = setup();
		await s.runtime.start();
		const gate = deferred(),
			entered = deferred();
		let signal: AbortSignal | undefined;
		s.dispatch.mockImplementationOnce(async (current) => {
			signal = current;
			entered.resolve();
			await gate.promise;
		});
		const tick = s.runtime.wake();
		await entered.promise;
		let stopped = false;
		const stop = s.runtime.stop().then(() => {
			stopped = true;
		});
		expect(signal?.aborted).toBe(true);
		expect(s.consumer.stop).toHaveBeenCalledOnce();
		await Promise.resolve();
		expect(stopped).toBe(false);
		gate.resolve();
		await Promise.all([tick, stop]);
		expect(s.consumer.wake).not.toHaveBeenCalled();
		expect(s.runtime.getHealth().state).toBe('stopped');
		await s.runtime.stop();
		expect(s.consumer.stop).toHaveBeenCalledOnce();
	});
	it('cannot activate consumption after shutdown interrupts startup', async () => {
		const s = setup(),
			gate = deferred();
		s.assertReady.mockImplementationOnce(() => gate.promise);
		const start = s.runtime.start();
		const stop = s.runtime.stop();
		gate.resolve();
		await Promise.all([start, stop]);
		expect(s.consumer.start).not.toHaveBeenCalled();
		expect(s.recover).not.toHaveBeenCalled();
		await expect(s.runtime.start()).rejects.toThrow('already started or stopped');
	});
});
