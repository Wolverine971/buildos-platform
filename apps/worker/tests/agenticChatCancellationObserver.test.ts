// apps/worker/tests/agenticChatCancellationObserver.test.ts

import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
	AgenticChatCancellationObservationInputV1,
	AgenticChatCancellationObservationRpcResultV1,
	AgenticChatCancellationObservationV1
} from '@buildos/shared-types';
import {
	AgenticChatCancellationError,
	AgenticChatCancellationObserver,
	type AgenticChatCancellationObservationPortV1
} from '../src/workers/agentic-chat/cancellationObserver';
import {
	AgenticChatCancellationObservationRpcError,
	SupabaseAgenticChatCancellationObservationAdapter
} from '../src/workers/agentic-chat/supabaseCancellationObserverAdapter';

function observation(
	turnRunId: string,
	executionGeneration = 1
): AgenticChatCancellationObservationV1 {
	return {
		turn_run_id: turnRunId,
		execution_generation: executionGeneration,
		signal_id: `signal-${turnRunId}`,
		cancel_reason: 'user_cancelled',
		cancel_source: 'browser',
		cancel_requested_at: '2026-08-02T21:30:00.000Z',
		consumed_at: '2026-08-02T21:30:00.500Z'
	};
}

function port(
	observe: (
		inputs: AgenticChatCancellationObservationInputV1[]
	) => Promise<AgenticChatCancellationObservationRpcResultV1>
): AgenticChatCancellationObservationPortV1 {
	return { observe };
}

afterEach(() => {
	vi.useRealTimers();
});

describe('AgenticChatCancellationObserver', () => {
	it('observes multiple active turns in one call and aborts only exact returned generations', async () => {
		const calls: AgenticChatCancellationObservationInputV1[][] = [];
		const observer = new AgenticChatCancellationObserver(
			{
				observation: port(async (inputs) => {
					calls.push(inputs);
					return [observation('turn-a', 2)];
				})
			},
			{ consumerConcurrency: 2 }
		);
		const first = observer.registerTurn({ turnRunId: 'turn-a', executionGeneration: 2 });
		const second = observer.registerTurn({ turnRunId: 'turn-b', executionGeneration: 4 });

		await expect(observer.pollNow()).resolves.toBe(1);
		expect(calls).toEqual([
			[
				{ turn_run_id: 'turn-a', execution_generation: 2 },
				{ turn_run_id: 'turn-b', execution_generation: 4 }
			]
		]);
		expect(first.aborted).toBe(true);
		expect(first.reason).toBeInstanceOf(AgenticChatCancellationError);
		expect(first.reason).toMatchObject({
			turnRunId: 'turn-a',
			executionGeneration: 2,
			cancelReason: 'user_cancelled'
		});
		expect(second.aborted).toBe(false);
		await observer.stop();
	});

	it('ignores unknown, stale-generation, malformed, and duplicate response rows', async () => {
		const metrics: Array<[string, string | undefined]> = [];
		const observer = new AgenticChatCancellationObserver(
			{
				observation: port(
					async () =>
						[
							observation('unknown', 1),
							observation('tracked', 1),
							{ ...observation('tracked', 2), cancel_reason: 'invalid' },
							observation('tracked', 2)
						] as AgenticChatCancellationObservationRpcResultV1
				),
				onMetric: (metric, turnRunId) => metrics.push([metric, turnRunId])
			},
			{ consumerConcurrency: 2 }
		);
		const signal = observer.registerTurn({ turnRunId: 'tracked', executionGeneration: 2 });

		await expect(observer.pollNow()).resolves.toBe(1);
		expect(signal.aborted).toBe(true);
		expect(metrics.filter(([metric]) => metric === 'invalid_receipt')).toHaveLength(3);
		await observer.stop();
	});

	it('retries after a failed interval without aborting the registered turn', async () => {
		let calls = 0;
		const metrics: string[] = [];
		const observer = new AgenticChatCancellationObserver({
			observation: port(async () => {
				calls += 1;
				if (calls === 1) throw new Error('temporary database failure');
				return [observation('turn-retry')];
			}),
			onMetric: (metric) => metrics.push(metric)
		});
		const signal = observer.registerTurn({
			turnRunId: 'turn-retry',
			executionGeneration: 1
		});

		await expect(observer.pollNow()).resolves.toBe(0);
		expect(signal.aborted).toBe(false);
		await expect(observer.pollNow()).resolves.toBe(1);
		expect(signal.aborted).toBe(true);
		expect(metrics).toContain('poll_failed');
		await observer.stop();
	});

	it('keeps cancellation authoritative when optional metric hooks throw', async () => {
		const observer = new AgenticChatCancellationObserver({
			observation: port(async () => [observation('turn-metric')]),
			onMetric: () => {
				throw new Error('metric sink unavailable');
			}
		});
		const signal = observer.registerTurn({
			turnRunId: 'turn-metric',
			executionGeneration: 1
		});

		await expect(observer.pollNow()).resolves.toBe(1);
		expect(signal.aborted).toBe(true);
		await observer.stop();
	});

	it('shares one in-flight poll instead of issuing overlapping queries', async () => {
		let resolvePoll: ((value: AgenticChatCancellationObservationRpcResultV1) => void) | null =
			null;
		let calls = 0;
		const observer = new AgenticChatCancellationObserver({
			observation: port(
				() =>
					new Promise((resolve) => {
						calls += 1;
						resolvePoll = resolve;
					})
			)
		});
		observer.registerTurn({ turnRunId: 'turn-overlap', executionGeneration: 1 });

		const first = observer.pollNow();
		const second = observer.pollNow();
		expect(second).toBe(first);
		expect(calls).toBe(1);
		resolvePoll?.([]);
		await expect(first).resolves.toBe(0);
		await observer.stop();
	});

	it('bounds and deduplicates shutdown while an observation RPC is stuck', async () => {
		vi.useFakeTimers();
		const observer = new AgenticChatCancellationObserver(
			{
				observation: port(() => new Promise(() => undefined))
			},
			{ shutdownWaitMs: 25 }
		);
		observer.registerTurn({ turnRunId: 'turn-stuck', executionGeneration: 1 });
		void observer.pollNow();

		const firstStop = observer.stop();
		expect(observer.stop()).toBe(firstStop);
		let stopped = false;
		void firstStop.then(() => {
			stopped = true;
		});
		await vi.advanceTimersByTimeAsync(24);
		expect(stopped).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await expect(firstStop).resolves.toBeUndefined();
		expect(observer.activeTurnCount).toBe(0);
	});

	it('uses one worker-level 500 ms timer for every registered turn', async () => {
		vi.useFakeTimers();
		const calls: AgenticChatCancellationObservationInputV1[][] = [];
		const observer = new AgenticChatCancellationObserver(
			{
				observation: port(async (inputs) => {
					calls.push(inputs);
					return [];
				})
			},
			{ consumerConcurrency: 2 }
		);
		observer.registerTurn({ turnRunId: 'turn-timer-a', executionGeneration: 1 });
		observer.registerTurn({ turnRunId: 'turn-timer-b', executionGeneration: 1 });
		observer.start();

		await vi.advanceTimersByTimeAsync(1_500);
		expect(calls).toHaveLength(3);
		expect(calls.every((inputs) => inputs.length === 2)).toBe(true);
		await observer.stop();
	});

	it('enforces exact-generation registration, capacity, and safe unregistration', async () => {
		const observer = new AgenticChatCancellationObserver(
			{ observation: port(async () => []) },
			{ consumerConcurrency: 2 }
		);
		const signal = observer.registerTurn({ turnRunId: 'turn-a', executionGeneration: 1 });
		expect(observer.registerTurn({ turnRunId: 'turn-a', executionGeneration: 1 })).toBe(signal);
		expect(() =>
			observer.registerTurn({ turnRunId: 'turn-a', executionGeneration: 2 })
		).toThrow(/different generation/);
		observer.registerTurn({ turnRunId: 'turn-b', executionGeneration: 1 });
		expect(() =>
			observer.registerTurn({ turnRunId: 'turn-c', executionGeneration: 1 })
		).toThrow(/capacity 2 exceeded/);
		expect(observer.unregisterTurn('turn-a', 2)).toBe(false);
		expect(observer.unregisterTurn('turn-a', 1)).toBe(true);
		expect(observer.activeTurnCount).toBe(1);
		await observer.stop();
	});

	it('fails startup configuration when the RPC bound cannot cover concurrency', () => {
		expect(
			() =>
				new AgenticChatCancellationObserver(
					{ observation: port(async () => []) },
					{ consumerConcurrency: 3, rpcMaxPairs: 2 }
				)
		).toThrow(/at least consumerConcurrency/);
		expect(
			() =>
				new AgenticChatCancellationObserver(
					{ observation: port(async () => []) },
					{ rpcMaxPairs: 129 }
				)
		).toThrow(/cannot exceed 128/);
	});
});

describe('SupabaseAgenticChatCancellationObservationAdapter', () => {
	it('calls the one bounded RPC with the complete active-turn batch', async () => {
		const calls: Array<[string, Record<string, unknown>]> = [];
		const receipt = [observation('turn-adapter')];
		const adapter = new SupabaseAgenticChatCancellationObservationAdapter({
			async rpc(name, args) {
				calls.push([name, args]);
				return { data: receipt, error: null };
			}
		});
		const inputs = [{ turn_run_id: 'turn-adapter', execution_generation: 1 }];

		await expect(adapter.observe(inputs)).resolves.toEqual(receipt);
		expect(calls).toEqual([['observe_agentic_chat_turn_cancellations', { p_turns: inputs }]]);
	});

	it('surfaces RPC errors and rejects non-array receipts', async () => {
		const failed = new SupabaseAgenticChatCancellationObservationAdapter({
			async rpc() {
				return { data: null, error: { code: 'P0001', message: 'observer failed' } };
			}
		});
		await expect(failed.observe([])).rejects.toBeInstanceOf(
			AgenticChatCancellationObservationRpcError
		);

		const invalid = new SupabaseAgenticChatCancellationObservationAdapter({
			async rpc() {
				return { data: {}, error: null };
			}
		});
		await expect(invalid.observe([])).rejects.toThrow(/non-array receipt/);
	});
});
