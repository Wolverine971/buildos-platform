// apps/worker/tests/supabaseQueueDrain.test.ts
// Graceful-shutdown drain behavior for SupabaseQueue.stop(). These exercise the
// drain primitive directly plus one real claimed processor to prove the abort
// and reclaimability boundary.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseQueue, type ProcessingJob } from '../src/lib/supabaseQueue';
import { supabase } from '../src/lib/supabase';

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		rpc: vi.fn(),
		from: vi.fn()
	}
}));

type DrainInternals = {
	inFlightBatch: Promise<void> | null;
	inFlightJobTypes: string[];
	stopping: Promise<void> | null;
};

function asInternals(queue: SupabaseQueue): DrainInternals {
	return queue as unknown as DrainInternals;
}

describe('SupabaseQueue.stop() drain', () => {
	beforeEach(() => {
		vi.mocked(supabase.rpc).mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('waits for the in-flight batch to settle before resolving', async () => {
		const queue = new SupabaseQueue({ drainTimeout: 1000 });
		const internals = asInternals(queue);

		let settled = false;
		internals.inFlightJobTypes = ['generate_daily_brief'];
		internals.inFlightBatch = new Promise<void>((resolve) => {
			setTimeout(() => {
				settled = true;
				resolve();
			}, 50);
		});

		await queue.stop();
		expect(settled).toBe(true);
	});

	it('returns after the bounded drain timeout if the batch never settles', async () => {
		const queue = new SupabaseQueue({ drainTimeout: 50 });
		const internals = asInternals(queue);

		internals.inFlightJobTypes = ['agent_run'];
		// Never resolves — drain must give up after drainTimeout and return anyway.
		internals.inFlightBatch = new Promise<void>(() => {});

		const start = Date.now();
		await queue.stop();
		const elapsed = Date.now() - start;

		expect(elapsed).toBeGreaterThanOrEqual(40);
		expect(elapsed).toBeLessThan(1000);
	});

	it('is idempotent — repeat calls return the same drain promise', async () => {
		const queue = new SupabaseQueue({ drainTimeout: 100 });
		const internals = asInternals(queue);

		internals.inFlightBatch = Promise.resolve();

		const first = queue.stop();
		const second = queue.stop();
		expect(first).toBe(second);

		await first;
	});

	it('resolves immediately when there is no in-flight batch', async () => {
		const queue = new SupabaseQueue({ drainTimeout: 5000 });

		const start = Date.now();
		await queue.stop();
		const elapsed = Date.now() - start;

		expect(elapsed).toBeLessThan(1000);
	});

	it('aborts an over-budget chat executor and leaves its queue row for fenced recovery', async () => {
		const job = claimedChatJob();
		let claimCount = 0;
		vi.mocked(supabase.rpc).mockImplementation(async (name) => {
			if (name === 'claim_pending_jobs') {
				claimCount += 1;
				return { data: claimCount === 1 ? [job] : [], error: null } as never;
			}
			return { data: true, error: null } as never;
		});

		const started = Promise.withResolvers<void>();
		const aborted = Promise.withResolvers<unknown>();
		const release = Promise.withResolvers<void>();
		const queue = new SupabaseQueue({
			batchSize: 1,
			pollInterval: 60_000,
			drainTimeout: 20,
			genericStalledRecovery: false
		});
		queue.process<Record<string, never>>(
			'agentic_chat_turn',
			async (processingJob: ProcessingJob<Record<string, never>>) => {
				started.resolve();
				processingJob.signal.addEventListener(
					'abort',
					() => aborted.resolve(processingJob.signal.reason),
					{ once: true }
				);
				await release.promise;
			},
			{ queueLifecycle: 'processor_managed', workerTimeoutMs: 60_000 }
		);

		await queue.start();
		await started.promise;
		await queue.stop();

		await expect(aborted.promise).resolves.toMatchObject({
			message: 'Queue shutdown: drain timeout reached'
		});
		expect(queue.getHealth()).toMatchObject({
			healthy: true,
			reason: 'draining',
			processingBatch: true,
			draining: true
		});
		expect(
			vi
				.mocked(supabase.rpc)
				.mock.calls.some(
					([name]) => name === 'complete_queue_job' || name === 'fail_queue_job'
				)
		).toBe(false);
		expect(claimCount).toBe(1);

		release.resolve();
		await vi.waitFor(() => expect(queue.getHealth().processingBatch).toBe(false));
	});
});

function claimedChatJob() {
	const timestamp = '2026-08-19T12:00:00.000Z';
	return {
		attempts: 0,
		completed_at: null,
		created_at: timestamp,
		dedup_key: 'agentic-chat-drain-test',
		error_message: null,
		id: 'd5000000-0000-4000-8000-000000000001',
		job_type: 'agentic_chat_turn',
		max_attempts: 1,
		metadata: {},
		priority: 10,
		processed_at: null,
		processing_token: 'd7000000-0000-4000-8000-000000000001',
		queue_job_id: 'agentic-chat-drain-job',
		result: null,
		scheduled_for: timestamp,
		started_at: timestamp,
		status: 'processing',
		updated_at: timestamp,
		user_id: 'd1000000-0000-4000-8000-000000000001'
	};
}
