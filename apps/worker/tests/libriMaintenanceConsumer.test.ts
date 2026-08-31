import { describe, expect, it, vi } from 'vitest';
import type { ClaimedLibriStep, LibriLifecyclePort } from '../src/workers/libri/lifecycle';
import {
	LibriMaintenanceConsumer,
	LibriMaintenanceProcessorError,
	createSyntheticLibriMaintenanceProcessor
} from '../src/workers/libri/maintenanceConsumer';

const CLAIM: ClaimedLibriStep = {
	kind: 'claimed',
	queueJobId: 'libri_maintenance_test',
	queueRowId: '10000000-0000-4000-8000-000000000001',
	processingToken: '20000000-0000-4000-8000-000000000001',
	stepId: '30000000-0000-4000-8000-000000000001',
	runId: '40000000-0000-4000-8000-000000000001',
	libraryId: '50000000-0000-4000-8000-000000000001',
	queueType: 'libri_maintenance',
	executionGeneration: 1,
	leaseToken: '60000000-0000-4000-8000-000000000001',
	leaseExpiresAt: '2026-08-30T20:00:30.000Z',
	payload: { version: 1, kind: 'synthetic_smoke', nonce: 'phase-3c' }
};

describe('Libri synthetic maintenance processor', () => {
	it('accepts only the bounded versioned smoke payload', async () => {
		const processor = createSyntheticLibriMaintenanceProcessor();

		await expect(processor.execute(CLAIM, new AbortController().signal)).resolves.toEqual({
			result: { kind: 'synthetic_smoke', version: 1, ok: true, nonce: 'phase-3c' },
			provider: 'synthetic',
			model: 'none',
			promptTokens: 0,
			completionTokens: 0,
			estimatedCostMicrousd: 0
		});

		await expect(
			processor.execute(
				{ ...CLAIM, payload: { version: 2, kind: 'synthetic_smoke' } },
				new AbortController().signal
			)
		).rejects.toMatchObject({
			name: 'LibriMaintenanceProcessorError',
			code: 'unsupported_payload',
			retryable: false
		});
		await expect(
			processor.execute(
				{
					...CLAIM,
					payload: { version: 1, kind: 'synthetic_smoke', instructions: 'ignored' }
				},
				new AbortController().signal
			)
		).rejects.toMatchObject({ code: 'invalid_payload', retryable: false });
	});
});

describe('Libri maintenance consumer', () => {
	it('claims only maintenance work and completes through the fenced lifecycle', async () => {
		const lifecycle = fakeLifecycle();
		lifecycle.claimNextStep.mockResolvedValueOnce(CLAIM).mockResolvedValue(null);
		const consumer = new LibriMaintenanceConsumer({
			lifecycle,
			processor: createSyntheticLibriMaintenanceProcessor(),
			workerId: 'libri-worker:test',
			claimStepIds: [CLAIM.stepId]
		});

		await consumer.start();
		await consumer.wake();
		await vi.waitFor(() => expect(lifecycle.completeStep).toHaveBeenCalledOnce());

		expect(lifecycle.claimNextStep).toHaveBeenCalledWith({
			workerId: 'libri-worker:test',
			leaseDurationMs: 30_000,
			queueTypes: ['libri_maintenance'],
			stepIds: [CLAIM.stepId]
		});
		expect(lifecycle.completeStep).toHaveBeenCalledWith(
			expect.objectContaining({
				queueRowId: CLAIM.queueRowId,
				stepId: CLAIM.stepId,
				processingToken: CLAIM.processingToken,
				leaseToken: CLAIM.leaseToken,
				executionGeneration: 1,
				result: { kind: 'synthetic_smoke', version: 1, ok: true, nonce: 'phase-3c' }
			})
		);
		expect(consumer.getHealth()).toMatchObject({
			healthy: true,
			state: 'running',
			activeJobs: 0,
			completedJobs: 1,
			failedJobs: 0
		});

		await consumer.stop();
		expect(consumer.getHealth()).toMatchObject({ healthy: true, state: 'stopped' });
	});

	it('terminally rejects an unsupported maintenance payload without retrying', async () => {
		const lifecycle = fakeLifecycle();
		lifecycle.claimNextStep
			.mockResolvedValueOnce({ ...CLAIM, payload: { version: 1, kind: 'unknown' } })
			.mockResolvedValue(null);
		const consumer = new LibriMaintenanceConsumer({
			lifecycle,
			processor: createSyntheticLibriMaintenanceProcessor(),
			workerId: 'libri-worker:test'
		});

		await consumer.start();
		await consumer.wake();
		await vi.waitFor(() => expect(lifecycle.failStep).toHaveBeenCalledOnce());

		expect(lifecycle.failStep).toHaveBeenCalledWith(
			expect.objectContaining({
				errorClass: 'unsupported_payload',
				retry: false
			})
		);
		expect(lifecycle.completeStep).not.toHaveBeenCalled();
		expect(consumer.getHealth()).toMatchObject({ failedJobs: 1 });
		await consumer.stop();
	});

	it('aborts active work during drain and returns the fenced step for retry', async () => {
		const lifecycle = fakeLifecycle();
		lifecycle.claimNextStep.mockResolvedValueOnce(CLAIM).mockResolvedValue(null);
		const processor = {
			execute: vi.fn(
				(_claim: ClaimedLibriStep, signal: AbortSignal) =>
					new Promise<never>((_resolve, reject) => {
						signal.addEventListener(
							'abort',
							() =>
								reject(
									new LibriMaintenanceProcessorError(
										'worker_interrupted',
										'interrupted',
										true
									)
								),
							{ once: true }
						);
					})
			)
		};
		const consumer = new LibriMaintenanceConsumer({
			lifecycle,
			processor,
			workerId: 'libri-worker:test'
		});

		await consumer.start();
		await consumer.wake();
		await vi.waitFor(() => expect(processor.execute).toHaveBeenCalledOnce());
		await consumer.stop();

		expect(lifecycle.failStep).toHaveBeenCalledWith(
			expect.objectContaining({
				errorClass: 'worker_interrupted',
				retry: true,
				retryDelayMs: 0
			})
		);
		expect(consumer.getHealth()).toMatchObject({
			state: 'stopped',
			activeJobs: 0,
			failedJobs: 1
		});
	});

	it('returns a claim that arrives after drain begins through the interrupted retry path', async () => {
		const lifecycle = fakeLifecycle();
		let resolveClaim: ((claim: ClaimedLibriStep) => void) | undefined;
		lifecycle.claimNextStep.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveClaim = resolve;
			})
		);
		const processor = createSyntheticLibriMaintenanceProcessor();
		const execute = vi.spyOn(processor, 'execute');
		const consumer = new LibriMaintenanceConsumer({
			lifecycle,
			processor,
			workerId: 'libri-worker:test'
		});

		await consumer.start();
		await vi.waitFor(() => expect(lifecycle.claimNextStep).toHaveBeenCalledOnce());
		const stop = consumer.stop();
		resolveClaim?.(CLAIM);
		await stop;

		expect(execute).toHaveBeenCalledOnce();
		expect(lifecycle.completeStep).not.toHaveBeenCalled();
		expect(lifecycle.failStep).toHaveBeenCalledWith(
			expect.objectContaining({
				errorClass: 'worker_interrupted',
				retry: true,
				retryDelayMs: 0
			})
		);
		expect(consumer.getHealth()).toMatchObject({ state: 'stopped', activeJobs: 0 });
	});

	it('contains claim failures in health and keeps the service drainable', async () => {
		const lifecycle = fakeLifecycle();
		lifecycle.claimNextStep.mockRejectedValueOnce(new Error('database offline'));
		const consumer = new LibriMaintenanceConsumer({
			lifecycle,
			processor: createSyntheticLibriMaintenanceProcessor(),
			workerId: 'libri-worker:test'
		});

		await consumer.start();
		await consumer.wake();

		expect(consumer.getHealth()).toMatchObject({
			healthy: false,
			state: 'running',
			reason: 'database offline',
			consecutiveClaimFailures: 1
		});
		await consumer.stop();
	});

	it('fails closed without claiming after the synthetic canary deadline', async () => {
		const lifecycle = fakeLifecycle();
		const consumer = new LibriMaintenanceConsumer({
			lifecycle,
			processor: createSyntheticLibriMaintenanceProcessor(),
			workerId: 'libri-worker:test',
			claimStepIds: [CLAIM.stepId],
			claimDeadlineMs: Date.now() - 1
		});

		await consumer.start();
		await consumer.wake();

		expect(lifecycle.claimNextStep).not.toHaveBeenCalled();
		expect(consumer.getHealth()).toMatchObject({
			healthy: false,
			state: 'failed',
			reason: 'synthetic_canary_expired'
		});
		await expect(consumer.stop()).rejects.toThrow('synthetic_canary_expired');
	});

	it('returns a claim that arrives after the canary deadline through the interrupted path', async () => {
		const lifecycle = fakeLifecycle();
		let resolveClaim: ((claim: ClaimedLibriStep) => void) | undefined;
		lifecycle.claimNextStep.mockReturnValueOnce(
			new Promise((resolve) => {
				resolveClaim = resolve;
			})
		);
		const processor = createSyntheticLibriMaintenanceProcessor();
		const execute = vi.spyOn(processor, 'execute');
		const nowMs = Date.now();
		const now = vi.spyOn(Date, 'now').mockReturnValue(nowMs);
		const consumer = new LibriMaintenanceConsumer({
			lifecycle,
			processor,
			workerId: 'libri-worker:test',
			claimStepIds: [CLAIM.stepId],
			claimDeadlineMs: nowMs + 1_000
		});

		try {
			await consumer.start();
			const poll = consumer.wake();
			await vi.waitFor(() => expect(lifecycle.claimNextStep).toHaveBeenCalledOnce());
			now.mockReturnValue(nowMs + 1_001);
			resolveClaim?.(CLAIM);
			await poll;
			await vi.waitFor(() => expect(lifecycle.failStep).toHaveBeenCalledOnce());

			expect(execute).toHaveBeenCalledOnce();
			expect(lifecycle.completeStep).not.toHaveBeenCalled();
			expect(lifecycle.failStep).toHaveBeenCalledWith(
				expect.objectContaining({ errorClass: 'worker_interrupted', retry: true })
			);
			expect(consumer.getHealth()).toMatchObject({
				healthy: false,
				state: 'failed',
				reason: 'synthetic_canary_expired'
			});
			await expect(consumer.stop()).rejects.toThrow('synthetic_canary_expired');
		} finally {
			now.mockRestore();
		}
	});

	it('fails closed when both terminal lifecycle writes are unavailable', async () => {
		const lifecycle = fakeLifecycle();
		lifecycle.claimNextStep.mockResolvedValueOnce(CLAIM);
		lifecycle.completeStep.mockRejectedValueOnce(new Error('completion write offline'));
		lifecycle.failStep.mockRejectedValueOnce(new Error('failure write offline'));
		const consumer = new LibriMaintenanceConsumer({
			lifecycle,
			processor: createSyntheticLibriMaintenanceProcessor(),
			workerId: 'libri-worker:test'
		});

		await consumer.start();
		await consumer.wake();
		await vi.waitFor(() => expect(consumer.getHealth().state).toBe('failed'));

		expect(consumer.getHealth()).toMatchObject({
			healthy: false,
			state: 'failed',
			reason: 'failure write offline'
		});
		await expect(consumer.stop()).rejects.toThrow('failure write offline');
		expect(consumer.getHealth()).toMatchObject({ state: 'failed', healthy: false });
	});
});

function fakeLifecycle() {
	return {
		claimNextStep: vi.fn<LibriLifecyclePort['claimNextStep']>(),
		heartbeatStep: vi.fn<LibriLifecyclePort['heartbeatStep']>().mockResolvedValue(true),
		completeStep: vi.fn<LibriLifecyclePort['completeStep']>().mockResolvedValue(true),
		failStep: vi
			.fn<LibriLifecyclePort['failStep']>()
			.mockResolvedValue({ accepted: true, outcome: 'retry_scheduled' })
	};
}
