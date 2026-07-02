// apps/worker/tests/supabaseQueueDrain.test.ts
// Graceful-shutdown drain behavior for SupabaseQueue.stop(). These exercise the
// drain primitive directly (via the in-flight batch handle) so no Supabase RPC
// or job-processing mocks are required.
import { describe, expect, it } from 'vitest';
import { SupabaseQueue } from '../src/lib/supabaseQueue';

type DrainInternals = {
	inFlightBatch: Promise<void> | null;
	inFlightJobTypes: string[];
	stopping: Promise<void> | null;
};

function asInternals(queue: SupabaseQueue): DrainInternals {
	return queue as unknown as DrainInternals;
}

describe('SupabaseQueue.stop() drain', () => {
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
});
