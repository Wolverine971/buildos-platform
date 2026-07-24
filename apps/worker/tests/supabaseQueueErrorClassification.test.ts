// apps/worker/tests/supabaseQueueErrorClassification.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PermanentQueueError,
	TransientQueueError,
	classifyQueueError
} from '../src/lib/queueErrors';
import { SupabaseQueue } from '../src/lib/supabaseQueue';
import { supabase } from '../src/lib/supabase';
import { validateBriefJobData } from '../src/workers/shared/queueUtils';

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		rpc: vi.fn(),
		from: vi.fn()
	}
}));

function claimedJob(attempts = 0, maxAttempts = 3) {
	const timestamp = new Date(2026, 6, 23, 12, 0, attempts).toISOString();
	return {
		attempts,
		completed_at: null,
		created_at: timestamp,
		dedup_key: 'error-classification-test',
		error_message: null,
		id: 'row-1',
		job_type: 'send_notification',
		max_attempts: maxAttempts,
		metadata: {},
		priority: 10,
		processed_at: null,
		processing_token: null,
		queue_job_id: 'job-1',
		result: null,
		scheduled_for: timestamp,
		started_at: timestamp,
		status: 'processing',
		updated_at: timestamp,
		user_id: 'user-1'
	};
}

async function captureFailArgs(error: unknown, attempts = 0, maxAttempts = 3) {
	let claimCount = 0;
	vi.mocked(supabase.rpc).mockImplementation(async (functionName) => {
		if (functionName === 'claim_pending_jobs') {
			claimCount++;
			return {
				data: claimCount === 1 ? [claimedJob(attempts, maxAttempts)] : [],
				error: null
			} as never;
		}
		if (functionName === 'fail_queue_job') {
			return { data: true, error: null } as never;
		}
		return { data: true, error: null } as never;
	});

	const queue = new SupabaseQueue({ batchSize: 1, pollInterval: 60_000 });
	queue.process('send_notification', async () => {
		throw error;
	});
	await queue.start();

	await vi.waitFor(() => {
		expect(supabase.rpc).toHaveBeenCalledWith('fail_queue_job', expect.any(Object));
	});

	const failCall = vi
		.mocked(supabase.rpc)
		.mock.calls.find(([functionName]) => functionName === 'fail_queue_job');
	await queue.stop();
	return failCall?.[1] as { p_error_message: string; p_retry: boolean };
}

describe('queue processor error classification', () => {
	beforeEach(() => {
		vi.mocked(supabase.rpc).mockReset();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('does not retry a permanent processor failure', async () => {
		const args = await captureFailArgs(
			new PermanentQueueError('invalid_job_payload', 'Malformed metadata')
		);

		expect(args).toMatchObject({
			p_error_message: 'Malformed metadata',
			p_retry: false
		});
	});

	it('retries explicit transient and unclassified failures while attempts remain', async () => {
		const explicit = await captureFailArgs(
			new TransientQueueError('provider_timeout', 'Provider timed out')
		);
		vi.mocked(supabase.rpc).mockReset();
		const unclassified = await captureFailArgs(new Error('Connection reset'));

		expect(explicit.p_retry).toBe(true);
		expect(unclassified.p_retry).toBe(true);
		expect(classifyQueueError(new Error('Connection reset'))).toMatchObject({
			kind: 'transient',
			code: 'unclassified'
		});
	});

	it('does not retry a transient failure after attempts are exhausted', async () => {
		const args = await captureFailArgs(
			new TransientQueueError('provider_timeout', 'Provider timed out'),
			2,
			3
		);

		expect(args.p_retry).toBe(false);
	});

	it('marks shared payload validation failures as permanent', () => {
		expect(() => validateBriefJobData(null)).toThrow(PermanentQueueError);
		expect(classifyQueueError(catchValidationError())).toMatchObject({
			kind: 'permanent',
			code: 'invalid_job_payload'
		});
	});
});

function catchValidationError(): unknown {
	try {
		validateBriefJobData({ userId: 'user-1', timezone: 'Mars/Olympus_Mons' });
	} catch (error) {
		return error;
	}
	throw new Error('Expected validation to fail');
}
