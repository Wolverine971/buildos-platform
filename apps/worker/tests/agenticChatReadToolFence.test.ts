// apps/worker/tests/agenticChatReadToolFence.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_READ_TOOL_FENCE_SHARE_WINDOW_MS,
	AgenticChatReadToolFenceTimeoutError,
	AgenticChatSharedReadToolFenceV1
} from '../src/workers/agentic-chat/readToolFence';
import type { AgenticChatReadToolFenceClaimPortV1 } from '../src/workers/agentic-chat/readToolFence';

const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const PROCESSING_TOKEN = '60000000-0000-4000-8000-000000000006';
const OTHER_PROCESSING_TOKEN = '61000000-0000-4000-8000-000000000016';

const identity = {
	turnRunId: TURN_RUN_ID,
	queueJobId: QUEUE_JOB_ID,
	processingToken: PROCESSING_TOKEN
};

const receipt = {
	outcome: 'matching_current_claim' as const,
	executionMayStart: false as const,
	turnRunId: TURN_RUN_ID,
	queueJobId: QUEUE_JOB_ID,
	sessionId: '20000000-0000-4000-8000-000000000002',
	userId: '10000000-0000-4000-8000-000000000001',
	correlationId: '50000000-0000-4000-8000-000000000005',
	executionGeneration: 2,
	status: 'running' as const,
	inputArtifactId: '70000000-0000-4000-8000-000000000007',
	userMessageId: '80000000-0000-4000-8000-000000000008'
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('AgenticChatSharedReadToolFenceV1', () => {
	it('shares one in-flight ownership check across a burst of identical callers', async () => {
		const pending = deferred<typeof receipt>();
		const port = {
			claim: vi.fn<AgenticChatReadToolFenceClaimPortV1['claim']>(() => pending.promise)
		};
		const fence = new AgenticChatSharedReadToolFenceV1(port);
		const controllers = Array.from({ length: 4 }, () => new AbortController());

		const claims = controllers.map((controller) => fence.claim(identity, controller.signal));
		expect(port.claim).toHaveBeenCalledTimes(1);
		expect(port.claim.mock.calls[0]?.[0]).toEqual(identity);
		expect(port.claim.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
		expect(fence.inFlightCount).toBe(1);

		pending.resolve(receipt);
		await expect(Promise.all(claims)).resolves.toEqual([receipt, receipt, receipt, receipt]);
		expect(fence.inFlightCount).toBe(0);
	});

	it('never reuses a settled check and never joins another identity', async () => {
		const port = { claim: vi.fn(async () => receipt) };
		const fence = new AgenticChatSharedReadToolFenceV1(port);

		await fence.claim(identity, new AbortController().signal);
		await fence.claim(identity, new AbortController().signal);
		expect(port.claim).toHaveBeenCalledTimes(2);

		const pending = deferred<typeof receipt>();
		port.claim.mockImplementation(() => pending.promise);
		const first = fence.claim(identity, new AbortController().signal);
		const other = fence.claim(
			{ ...identity, processingToken: OTHER_PROCESSING_TOKEN },
			new AbortController().signal
		);
		expect(port.claim).toHaveBeenCalledTimes(4);
		expect(fence.inFlightCount).toBe(2);
		pending.resolve(receipt);
		await expect(Promise.all([first, other])).resolves.toEqual([receipt, receipt]);
		expect(fence.inFlightCount).toBe(0);
	});

	it('does not join a check that started before the share window', async () => {
		let now = 1_000;
		const pending = deferred<typeof receipt>();
		const port = { claim: vi.fn(() => pending.promise) };
		const fence = new AgenticChatSharedReadToolFenceV1(port, {
			shareWindowMs: 100,
			now: () => now
		});

		const first = fence.claim(identity, new AbortController().signal);
		now = 1_100;
		const joined = fence.claim(identity, new AbortController().signal);
		expect(port.claim).toHaveBeenCalledTimes(1);
		now = 1_101;
		const fresh = fence.claim(identity, new AbortController().signal);
		expect(port.claim).toHaveBeenCalledTimes(2);

		pending.resolve(receipt);
		await expect(Promise.all([first, joined, fresh])).resolves.toEqual([
			receipt,
			receipt,
			receipt
		]);
		expect(AGENTIC_CHAT_READ_TOOL_FENCE_SHARE_WINDOW_MS).toBeLessThan(2_000);
	});

	it('rejects an aborted caller at once without cancelling the shared check for the others', async () => {
		const pending = deferred<typeof receipt>();
		let sharedSignal: AbortSignal | undefined;
		const port = {
			claim: vi.fn((_input: unknown, signal?: AbortSignal) => {
				sharedSignal = signal;
				return pending.promise;
			})
		};
		const fence = new AgenticChatSharedReadToolFenceV1(port);
		const first = new AbortController();
		const second = new AbortController();
		const firstClaim = fence.claim(identity, first.signal);
		const secondClaim = fence.claim(identity, second.signal);

		const reason = new AgenticChatReadToolFenceTimeoutError(100);
		first.abort(reason);
		await expect(firstClaim).rejects.toBe(reason);
		expect(sharedSignal?.aborted).toBe(false);
		expect(fence.inFlightCount).toBe(1);

		pending.resolve(receipt);
		await expect(secondClaim).resolves.toEqual(receipt);
		expect(port.claim).toHaveBeenCalledTimes(1);
	});

	it('aborts the shared check when its last subscriber leaves and delivers a late receipt to no one', async () => {
		const pending = deferred<typeof receipt>();
		let sharedSignal: AbortSignal | undefined;
		const port = {
			claim: vi.fn((_input: unknown, signal?: AbortSignal) => {
				sharedSignal = signal;
				return pending.promise;
			})
		};
		const fence = new AgenticChatSharedReadToolFenceV1(port);
		const only = new AbortController();
		const claim = fence.claim(identity, only.signal);

		const reason = new AgenticChatReadToolFenceTimeoutError(100);
		only.abort(reason);
		await expect(claim).rejects.toBe(reason);
		expect(sharedSignal?.aborted).toBe(true);
		expect(sharedSignal?.reason).toBe(reason);

		// A caller arriving after the abort never joins the abandoned check.
		const late = deferred<typeof receipt>();
		port.claim.mockImplementationOnce(() => late.promise);
		const fresh = fence.claim(identity, new AbortController().signal);
		expect(port.claim).toHaveBeenCalledTimes(2);

		// The abandoned request resolving late reaches nobody and is forgotten.
		pending.resolve(receipt);
		await settle();
		late.resolve(receipt);
		await expect(fresh).resolves.toEqual(receipt);
		expect(fence.inFlightCount).toBe(0);
	});

	it('never joins a check that another subscriber has already abandoned', async () => {
		const pending = deferred<typeof receipt>();
		const port = { claim: vi.fn(() => pending.promise) };
		const fence = new AgenticChatSharedReadToolFenceV1(port);
		const first = new AbortController();
		const firstClaim = fence.claim(identity, first.signal);
		const secondClaim = fence.claim(identity, new AbortController().signal);
		expect(port.claim).toHaveBeenCalledTimes(1);

		const reason = new AgenticChatReadToolFenceTimeoutError(100);
		first.abort(reason);
		await expect(firstClaim).rejects.toBe(reason);

		// The queued fifth read of case 14 arrives after a deadline fired: it must
		// not inherit the wait the first caller gave up on.
		const fresh = deferred<typeof receipt>();
		port.claim.mockImplementationOnce(() => fresh.promise);
		const thirdClaim = fence.claim(identity, new AbortController().signal);
		expect(port.claim).toHaveBeenCalledTimes(2);

		fresh.resolve(receipt);
		await expect(thirdClaim).resolves.toEqual(receipt);
		pending.resolve(receipt);
		await expect(secondClaim).resolves.toEqual(receipt);
		expect(fence.inFlightCount).toBe(0);
	});

	it('rejects a caller whose signal is already aborted before issuing any check', async () => {
		const port = { claim: vi.fn(async () => receipt) };
		const fence = new AgenticChatSharedReadToolFenceV1(port);
		const controller = new AbortController();
		const reason = new Error('already cancelled');
		controller.abort(reason);

		await expect(fence.claim(identity, controller.signal)).rejects.toBe(reason);
		expect(port.claim).not.toHaveBeenCalled();
		expect(fence.inFlightCount).toBe(0);
	});

	it('surfaces the port failure to every subscriber and forgets the check', async () => {
		const pending = deferred<typeof receipt>();
		const port = { claim: vi.fn(() => pending.promise) };
		const fence = new AgenticChatSharedReadToolFenceV1(port);
		const claims = [
			fence.claim(identity, new AbortController().signal),
			fence.claim(identity, new AbortController().signal)
		];
		const failure = new Error('claim_agentic_chat_turn failed (PGRST301): unavailable');
		pending.reject(failure);

		await expect(claims[0]).rejects.toBe(failure);
		await expect(claims[1]).rejects.toBe(failure);
		expect(fence.inFlightCount).toBe(0);
		await expect(fence.claim(identity, new AbortController().signal)).rejects.toBe(failure);
		expect(port.claim).toHaveBeenCalledTimes(2);
	});

	it('classifies a fence deadline as retryable infrastructure with a specific code', () => {
		const error = new AgenticChatReadToolFenceTimeoutError(10_000);
		expect(error.code).toBe('read_tool_fence_timeout');
		expect(error.failureClass).toBe('transient_infra');
		expect(error.message).toContain('10000ms overhead deadline');
	});
});
