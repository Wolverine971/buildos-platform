// apps/worker/tests/agenticChatSafetyPolling.test.ts
// Free, deterministic queue/transport boundary checks. No hosted clients or models.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseQueue } from '../src/lib/supabaseQueue';
import {
	createAgenticChatConsumer,
	type AgenticChatTurnExecutorPort
} from '../src/workers/agentic-chat/host/consumer';
import { AgenticChatConsumerRuntime } from '../src/workers/agentic-chat/host/consumer-runtime';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc, from: vi.fn() } }));

const queues: SupabaseQueue[] = [];
const empty = { data: [], error: null };
const job = {
	id: 'row-1',
	queue_job_id: 'job-1',
	job_type: 'agentic_chat_turn',
	user_id: 'test-user',
	processing_token: 'token',
	metadata: {},
	attempts: 0,
	max_attempts: 3
};
const claims = () => rpc.mock.calls.filter(([name]) => name === 'claim_pending_jobs');
async function settle() {
	for (let i = 0; i < 30; i++) await Promise.resolve();
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
function consumer(
	execute: AgenticChatTurnExecutorPort['execute'] = vi.fn(async () => undefined),
	concurrency = 1
) {
	const result = createAgenticChatConsumer(
		{ execute },
		{ config: { drainTimeoutMs: 1, concurrency } }
	);
	queues.push(result.queue);
	return result;
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-09-24T00:00:00Z'));
	vi.spyOn(Math, 'random').mockReturnValue(0);
	rpc.mockReset().mockResolvedValue(empty);
	vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(async () => {
	const stopping = queues.splice(0).map((queue) => queue.stop());
	await vi.advanceTimersByTimeAsync(2);
	await Promise.all(stopping);
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('wake-aware chat safety polling', () => {
	it('starts immediately, uses one second while connecting, and five seconds when subscribed', async () => {
		const { queue } = consumer();
		await queue.start();
		expect(claims()).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1000);
		expect(claims()).toHaveLength(2);
		queue.setWakeChannelHealthy(true);
		await vi.advanceTimersByTimeAsync(4999);
		expect(claims()).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(claims()).toHaveLength(3);
		expect(queue.getHealth().polling).toMatchObject({
			intervalMs: 5000,
			wakeChannelHealthy: true,
			emptyClaims: 3,
			claimsByReason: { startup: 1, timer: 2, wake: 0, refill: 0 }
		});
	});

	it('bounds healthy jitter at 250ms and falls back promptly after a disconnect', async () => {
		vi.mocked(Math.random).mockReturnValue(0.999);
		const { queue } = consumer();
		queue.setWakeChannelHealthy(true);
		await queue.start();
		await vi.advanceTimersByTimeAsync(5249);
		expect(claims()).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(claims()).toHaveLength(2);
		queue.setWakeChannelHealthy(false);
		await vi.advanceTimersByTimeAsync(999);
		expect(claims()).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(claims()).toHaveLength(3);
		expect(queue.getHealth().polling).toMatchObject({ intervalMs: 1000, jitterMaxMs: 0 });
	});

	it('claims on a wake and resets the deadline instead of following it with the old timer', async () => {
		const { queue, wake } = consumer();
		queue.setWakeChannelHealthy(true);
		await queue.start();
		await vi.advanceTimersByTimeAsync(4500);
		await wake();
		expect(claims()).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(4999);
		expect(claims()).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(claims()).toHaveLength(3);
	});

	it('coalesces wakes during a timer claim into one follow-up and never overlaps claims', async () => {
		const slowClaim = deferred<typeof empty>();
		rpc.mockResolvedValueOnce(empty).mockImplementationOnce(() => slowClaim.promise);
		const { queue, wake } = consumer();
		queue.setWakeChannelHealthy(true);
		await queue.start();
		await vi.advanceTimersByTimeAsync(5000);
		const wakes = Array.from({ length: 25 }, () => wake());
		await vi.advanceTimersByTimeAsync(20_000);
		expect(claims()).toHaveLength(2);
		slowClaim.resolve(empty);
		await Promise.all(wakes);
		expect(claims()).toHaveLength(3);
		await vi.advanceTimersByTimeAsync(5000);
		expect(claims()).toHaveLength(4);
	});

	it.each([
		['missed admission wake', 1],
		['recovery requeue without a wake', 3500],
		['future scheduled job', 9000]
	])('eventually discovers a %s through durable polling', async (_label, dueMs) => {
		const epoch = Date.now();
		let delivered = false;
		rpc.mockImplementation(async () => {
			if (!delivered && Date.now() >= epoch + Number(dueMs)) {
				delivered = true;
				return { data: [job], error: null };
			}
			return empty;
		});
		const execute = vi.fn(async () => undefined);
		const { queue } = consumer(execute);
		queue.setWakeChannelHealthy(true);
		await queue.start();
		await vi.advanceTimersByTimeAsync(Number(dueMs) > 5000 ? 9999 : 4999);
		expect(execute).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(execute).toHaveBeenCalledOnce();
	});

	it('does no claims at full capacity and refills immediately when the slot opens', async () => {
		const running = deferred<void>();
		rpc.mockResolvedValueOnce({ data: [job], error: null });
		const { queue, wake } = consumer(vi.fn(() => running.promise));
		queue.setWakeChannelHealthy(true);
		await queue.start();
		await wake();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(claims()).toHaveLength(1);
		expect(queue.getHealth().polling?.nextPollAt).toBeNull();
		running.resolve();
		await settle();
		expect(claims()).toHaveLength(2);
		expect(queue.getHealth().polling?.claimsByReason.refill).toBe(1);
	});

	it('refills a slot that opens while another claim is already in flight', async () => {
		const first = deferred<void>();
		const second = deferred<void>();
		const claim = deferred<{ data: (typeof job)[]; error: null }>();
		rpc.mockResolvedValueOnce({ data: [job], error: null }).mockImplementationOnce(
			() => claim.promise
		);
		let executed = 0;
		const { queue } = consumer(
			vi.fn(() => (++executed === 1 ? first.promise : second.promise)),
			2
		);
		queue.setWakeChannelHealthy(true);
		await queue.start();
		await vi.advanceTimersByTimeAsync(5000);
		expect(claims()).toHaveLength(2);
		first.resolve();
		await settle();
		claim.resolve({ data: [{ ...job, id: 'row-2', queue_job_id: 'job-2' }], error: null });
		await settle();
		expect(claims()).toHaveLength(3);
		expect(claims()[2]?.[1]).toMatchObject({ p_batch_size: 1 });
		second.resolve();
		await settle();
	});

	it('keeps polling after a claim failure and stops timers and late wakes on shutdown', async () => {
		rpc.mockResolvedValueOnce({ data: null, error: { message: 'unavailable' } });
		const { queue, wake } = consumer();
		queue.setWakeChannelHealthy(true);
		await queue.start();
		await vi.advanceTimersByTimeAsync(5000);
		expect(claims()).toHaveLength(2);
		expect(queue.getHealth().consecutiveClaimFailures).toBe(0);
		await queue.stop();
		queue.setWakeChannelHealthy(false);
		await wake();
		await vi.advanceTimersByTimeAsync(20_000);
		expect(claims()).toHaveLength(2);
		expect(queue.getHealth().polling?.nextPollAt).toBeNull();
	});

	it('forwards wake health from the runtime into the real consumer', () => {
		const { queue } = consumer();
		const runtime = new AgenticChatConsumerRuntime(queue, {} as never);
		runtime.setWakeChannelHealthy(true);
		expect(queue.getHealth().polling?.intervalMs).toBe(5000);
		runtime.setWakeChannelHealthy(false);
		expect(queue.getHealth().polling?.intervalMs).toBe(1000);
	});

	it('leaves general consumers on their existing fixed polling interval', async () => {
		const queue = new SupabaseQueue({ pollInterval: 5000, genericStalledRecovery: false });
		queues.push(queue);
		queue.process('send_notification', async () => undefined);
		await queue.start();
		queue.setWakeChannelHealthy(true);
		await vi.advanceTimersByTimeAsync(4000);
		await queue.wake();
		await vi.advanceTimersByTimeAsync(1000);
		expect(claims()).toHaveLength(3);
		expect(queue.getHealth().polling).toBeUndefined();
	});
});
