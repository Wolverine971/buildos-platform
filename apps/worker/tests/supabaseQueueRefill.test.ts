// apps/worker/tests/supabaseQueueRefill.test.ts
// Per-slot refill regression from the 2026-07-23 queue audit: a fast job
// finishing must make room for the next pending job even while a slow sibling
// from the original claim remains active.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseQueue, type ProcessingJob } from '../src/lib/supabaseQueue';
import { supabase } from '../src/lib/supabase';

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		rpc: vi.fn(),
		from: vi.fn()
	}
}));

type TestMetadata = { label: 'slow' | 'fast-1' | 'fast-2' };

function claimedJob(sequence: number, label: TestMetadata['label']) {
	const timestamp = new Date(2026, 6, 23, 12, 0, sequence).toISOString();
	return {
		attempts: 0,
		completed_at: null,
		created_at: timestamp,
		dedup_key: `dedup-${sequence}`,
		error_message: null,
		id: `row-${sequence}`,
		job_type: 'send_notification',
		max_attempts: 3,
		metadata: { label },
		priority: 10,
		processed_at: null,
		processing_token: null,
		queue_job_id: `job-${sequence}`,
		result: null,
		scheduled_for: timestamp,
		started_at: timestamp,
		status: 'processing',
		updated_at: timestamp,
		user_id: 'user-1'
	};
}

describe('SupabaseQueue per-slot refill', () => {
	beforeEach(() => {
		vi.mocked(supabase.rpc).mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('claims one replacement as soon as a fast job frees its slot', async () => {
		const claims = [
			[claimedJob(1, 'slow'), claimedJob(2, 'fast-1')],
			[claimedJob(3, 'fast-2')],
			[]
		];
		const claimedBatchSizes: number[] = [];

		vi.mocked(supabase.rpc).mockImplementation(async (functionName, args) => {
			if (functionName === 'claim_pending_jobs') {
				claimedBatchSizes.push((args as { p_batch_size: number }).p_batch_size);
				return { data: claims.shift() ?? [], error: null } as never;
			}
			if (functionName === 'complete_queue_job') {
				return { data: true, error: null } as never;
			}
			return { data: false, error: null } as never;
		});

		let releaseSlow!: () => void;
		const slowGate = new Promise<void>((resolve) => {
			releaseSlow = resolve;
		});
		const started: string[] = [];
		const finished: string[] = [];
		let running = 0;
		let maxRunning = 0;

		const queue = new SupabaseQueue({ batchSize: 2, pollInterval: 60_000 });
		queue.process<TestMetadata>(
			'send_notification',
			async (job: ProcessingJob<TestMetadata>) => {
				started.push(job.data.label);
				running++;
				maxRunning = Math.max(maxRunning, running);
				if (job.data.label === 'slow') {
					await slowGate;
				}
				finished.push(job.data.label);
				running--;
			}
		);

		await queue.start();

		await vi.waitFor(() => {
			expect(started).toContain('fast-2');
		});
		expect(finished).toEqual(['fast-1', 'fast-2']);
		expect(started).toEqual(['slow', 'fast-1', 'fast-2']);
		expect(claimedBatchSizes.slice(0, 2)).toEqual([2, 1]);
		expect(maxRunning).toBe(2);

		releaseSlow();
		await vi.waitFor(() => {
			expect(finished).toContain('slow');
		});
		await queue.stop();
	});

	it('drains jobs returned by a claim that was already in flight at shutdown', async () => {
		let finishClaim!: (value: { data: unknown[]; error: null }) => void;
		const claimGate = new Promise<{ data: unknown[]; error: null }>((resolve) => {
			finishClaim = resolve;
		});
		let releaseJob!: () => void;
		const jobGate = new Promise<void>((resolve) => {
			releaseJob = resolve;
		});

		vi.mocked(supabase.rpc).mockImplementation(async (functionName) => {
			if (functionName === 'claim_pending_jobs') {
				return (await claimGate) as never;
			}
			if (functionName === 'complete_queue_job') {
				return { data: true, error: null } as never;
			}
			return { data: false, error: null } as never;
		});

		let processorStarted = false;
		const queue = new SupabaseQueue({ batchSize: 1, pollInterval: 10 });
		queue.process<TestMetadata>(
			'send_notification',
			async (_job: ProcessingJob<TestMetadata>) => {
				processorStarted = true;
				await jobGate;
			}
		);

		const start = queue.start();
		await vi.waitFor(() => {
			expect(supabase.rpc).toHaveBeenCalledWith(
				'claim_pending_jobs',
				expect.objectContaining({ p_batch_size: 1 })
			);
		});

		let stopped = false;
		const stop = queue.stop().then(() => {
			stopped = true;
		});
		finishClaim({ data: [claimedJob(4, 'slow')], error: null });

		await vi.waitFor(() => {
			expect(processorStarted).toBe(true);
		});
		expect(stopped).toBe(false);

		releaseJob();
		await Promise.all([start, stop]);
		expect(stopped).toBe(true);

		const claimCalls = vi
			.mocked(supabase.rpc)
			.mock.calls.filter(([functionName]) => functionName === 'claim_pending_jobs');
		expect(claimCalls).toHaveLength(1);
	});
});
