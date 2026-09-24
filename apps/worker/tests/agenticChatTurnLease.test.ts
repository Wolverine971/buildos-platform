// apps/worker/tests/agenticChatTurnLease.test.ts
//
// Worker side of turn leases (docs/architecture/AGENTIC_CHAT_TURN_LEASES_2026-09-23.md):
// renewal cadence, abort on `lost`, self-fence 60 s after the SEND time of the last
// acknowledged renewal (never before the first one), per-renewal timeouts, the
// hard-cap stop, the synchronous freshness check, and the pre-migration fallback.
// The database side is covered by
// supabase/tests/20260924000100_agentic_chat_turn_leases.test.sql.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AGENTIC_CHAT_TURN_LEASE_POLICY_V1 } from '@buildos/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AgenticChatTurnLeaseKeeper,
	AgenticChatTurnLeaseLostError,
	AgenticChatTurnLeaseRenewTimeoutError,
	AgenticChatTurnLeaseRpcError,
	type AgenticChatTurnLeaseConfigV1,
	type AgenticChatTurnLeaseEventV1,
	type AgenticChatTurnLeasePortV1,
	type AgenticChatTurnLeaseRenewalV1,
	SupabaseAgenticChatTurnLeaseAdapter,
	validateAgenticChatTurnLeaseTimingV1
} from '../src/workers/agentic-chat/turn/turn-lease';
import type { AgenticChatGenerationWriteFenceV1 } from '../src/workers/agentic-chat/turn/write-fence';

const FENCE = {
	turnRunId: '10000000-0000-4000-8000-000000000001',
	queueJobId: '20000000-0000-4000-8000-000000000002',
	processingToken: '30000000-0000-4000-8000-000000000003',
	executionGeneration: 2
} as const;

type Pending = {
	resolve: (value: AgenticChatTurnLeaseRenewalV1) => void;
	reject: (error: unknown) => void;
	signal: AbortSignal;
	sentAtMs: number;
};

/** A lease port whose renewals the test answers by hand (or never). */
function manualPort() {
	const calls: Pending[] = [];
	const renew = vi.fn(
		(_fence: AgenticChatGenerationWriteFenceV1, signal: AbortSignal) =>
			new Promise<AgenticChatTurnLeaseRenewalV1>((resolve, reject) => {
				calls.push({ resolve, reject, signal, sentAtMs: Date.now() });
			})
	);
	return {
		port: { renew },
		renew,
		calls,
		async answer(index: number, value: AgenticChatTurnLeaseRenewalV1 | Error) {
			const call = calls[index];
			if (!call) throw new Error(`No renewal #${index}`);
			if (value instanceof Error) call.reject(value);
			else call.resolve(value);
			await flush();
		}
	};
}

function immediatePort(outcome: () => AgenticChatTurnLeaseRenewalV1 | Error) {
	const renew = vi.fn(async (_fence: AgenticChatGenerationWriteFenceV1, _signal: AbortSignal) => {
		const value = outcome();
		if (value instanceof Error) throw value;
		return value;
	});
	return { renew };
}

async function flush() {
	for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

async function advance(ms: number) {
	await vi.advanceTimersByTimeAsync(ms);
	await flush();
}

function keeper(port: AgenticChatTurnLeasePortV1, config?: Partial<AgenticChatTurnLeaseConfigV1>) {
	const events: AgenticChatTurnLeaseEventV1[] = [];
	const instance = new AgenticChatTurnLeaseKeeper(
		{
			lease: port,
			onEvent: (event) => events.push(event),
			// Fake timers move Date; the keeper's monotonic clock is injected from it.
			now: () => Date.now()
		},
		config
	);
	return { keeper: instance, events };
}

const eventTypes = (events: AgenticChatTurnLeaseEventV1[]) => events.map((event) => event.type);

beforeEach(() => {
	vi.useFakeTimers({ now: new Date('2026-09-23T12:00:00.000Z') });
});

afterEach(() => {
	vi.useRealTimers();
});

describe('AgenticChatTurnLeaseKeeper', () => {
	it('renews immediately on claim and then every 15 s while acknowledged', async () => {
		const port = immediatePort(() => ({ outcome: 'renewed' }));
		const { keeper: lease, events } = keeper(port);

		const handle = lease.hold(FENCE);
		await flush();
		expect(port.renew).toHaveBeenCalledTimes(1);
		expect(port.renew).toHaveBeenCalledWith(FENCE, expect.any(AbortSignal));

		await advance(14_999);
		expect(port.renew).toHaveBeenCalledTimes(1);
		await advance(1);
		expect(port.renew).toHaveBeenCalledTimes(2);
		// A healthy worker renews for the whole 360 s hard cap without fencing.
		await advance(345_000);
		expect(port.renew).toHaveBeenCalledTimes(25);
		expect(handle.signal.aborted).toBe(false);
		expect(handle.isFresh()).toBe(true);
		expect(events).toEqual([]);
		handle.release();
	});

	it('aborts the turn the moment the database reports the lease lost', async () => {
		const port = manualPort();
		const { keeper: lease, events } = keeper(port.port);
		const handle = lease.hold(FENCE);

		await port.answer(0, { outcome: 'renewed' });
		await advance(15_000);
		await port.answer(1, { outcome: 'lost', reason: 'generation_changed' });

		expect(handle.signal.aborted).toBe(true);
		expect(handle.signal.reason).toBeInstanceOf(AgenticChatTurnLeaseLostError);
		expect(handle.signal.reason).toMatchObject({
			code: 'worker_lease_lost',
			turnRunId: FENCE.turnRunId,
			executionGeneration: FENCE.executionGeneration,
			detail: { kind: 'lost', reason: 'generation_changed' }
		});
		expect(events).toEqual([
			{
				type: 'lease_lost',
				turnRunId: FENCE.turnRunId,
				executionGeneration: FENCE.executionGeneration,
				reason: 'generation_changed'
			}
		]);
		expect(handle.isFresh()).toBe(false);
		// Nothing renews a lease this worker no longer holds.
		await advance(60_000);
		expect(port.renew).toHaveBeenCalledTimes(2);
		handle.release();
	});

	it('never self-fences a generation that has not renewed once (the unleased rule governs it)', async () => {
		const port = immediatePort(() => new Error('connection reset'));
		const { keeper: lease, events } = keeper(port);
		const handle = lease.hold(FENCE);

		await advance(300_000);

		expect(handle.signal.aborted).toBe(false);
		expect(handle.isFresh()).toBe(true);
		const failures = events.filter((event) => event.type === 'renew_failed');
		expect(failures).toHaveLength(21);
		expect(failures.at(-1)).toMatchObject({ consecutiveFailures: 21 });
		handle.release();
	});

	it('self-fences 60 s after sending its last acknowledged renewal', async () => {
		let first = true;
		const port = immediatePort(() => {
			if (first) {
				first = false;
				return { outcome: 'renewed' };
			}
			return new Error('connection reset');
		});
		const { keeper: lease, events } = keeper(port);
		const handle = lease.hold(FENCE);

		await advance(59_999);
		expect(handle.signal.aborted).toBe(false);
		await advance(1);

		expect(handle.signal.aborted).toBe(true);
		expect(handle.signal.reason).toMatchObject({
			detail: { kind: 'unacknowledged', unacknowledgedForMs: 60_000 }
		});
		expect(events.at(-1)).toEqual({
			type: 'self_fenced',
			turnRunId: FENCE.turnRunId,
			executionGeneration: FENCE.executionGeneration,
			unacknowledgedForMs: 60_000
		});
		handle.release();
	});

	it('measures the fence from when the acknowledged renewal was SENT, not answered', async () => {
		const port = manualPort();
		const { keeper: lease } = keeper(port.port);
		const handle = lease.hold(FENCE);
		const claimAt = Date.now();

		await port.answer(0, { outcome: 'renewed' }); // sent at +0
		await advance(15_000); // #1 sent at +15 s
		expect(port.calls[1]?.sentAtMs).toBe(claimAt + 15_000);
		await advance(5_000);
		await port.answer(1, { outcome: 'renewed' }); // answered at +20 s

		// The database stamped #1 no earlier than +15 s, so the worker's deadline is
		// +75 s, strictly ahead of the database's +105 s takeover. Later renewals hang.
		await advance(54_999);
		expect(handle.signal.aborted).toBe(false);
		await advance(1);
		expect(handle.signal.aborted).toBe(true);
		handle.release();
	});

	it('abandons a renewal that never settles, so the next tick still renews', async () => {
		const port = manualPort();
		const { keeper: lease, events } = keeper(port.port);
		const handle = lease.hold(FENCE);
		await port.answer(0, { outcome: 'renewed' });

		await advance(15_000); // #1 hangs forever
		await advance(10_000);
		expect(port.calls[1]?.signal.aborted).toBe(true);
		expect(events).toEqual([
			expect.objectContaining({
				type: 'renew_failed',
				consecutiveFailures: 1,
				error: expect.any(AgenticChatTurnLeaseRenewTimeoutError)
			})
		]);

		await advance(5_000); // #2 at +30 s is sent despite #1 never settling
		expect(port.renew).toHaveBeenCalledTimes(3);
		await port.answer(2, { outcome: 'renewed' });
		// #3.. hang too, but #2's acknowledgement moved the fence: no false abort
		// before +90 s, then the honest self-fence at +90 s.
		await advance(59_999);
		expect(handle.signal.aborted).toBe(false);
		await advance(1);
		expect(handle.signal.aborted).toBe(true);
		expect(handle.signal.reason).toMatchObject({
			detail: { kind: 'unacknowledged', unacknowledgedForMs: 60_000 }
		});
		handle.release();
	});

	it('still takes a late acknowledgement from an abandoned renewal', async () => {
		const port = manualPort();
		const { keeper: lease } = keeper(port.port);
		const handle = lease.hold(FENCE);
		await port.answer(0, { outcome: 'renewed' }); // sent +0
		await advance(15_000); // #1 sent +15 s
		await advance(10_000); // abandoned at +25 s
		await port.answer(1, { outcome: 'renewed' }); // late, but truthful

		// Fence is +75 s (from #1's send), not +60 s.
		await advance(49_999);
		expect(handle.signal.aborted).toBe(false);
		await advance(1);
		expect(handle.signal.aborted).toBe(true);
		handle.release();
	});

	it('keeps pre-lease behavior when the database has no lease function yet', async () => {
		const port = immediatePort(() => ({ outcome: 'unsupported' }));
		const { keeper: lease, events } = keeper(port);
		const handle = lease.hold(FENCE);

		await advance(300_000);
		expect(port.renew).toHaveBeenCalledOnce();
		expect(handle.signal.aborted).toBe(false);
		expect(handle.isFresh()).toBe(true);
		expect(eventTypes(events)).toEqual(['unsupported']);
		handle.release();
	});

	it('treats "unsupported" after a successful renewal as weather, not a downgrade', async () => {
		let calls = 0;
		const port = immediatePort(() =>
			calls++ === 0 ? { outcome: 'renewed' } : { outcome: 'unsupported' }
		);
		const { keeper: lease, events } = keeper(port);
		const handle = lease.hold(FENCE);

		await advance(45_000);
		expect(port.renew).toHaveBeenCalledTimes(4);
		expect(eventTypes(events)).toEqual(['renew_failed', 'renew_failed', 'renew_failed']);
		await advance(15_000);
		expect(handle.signal.aborted).toBe(true);
		handle.release();
	});

	it('stops renewing (without aborting) a terminal budget after the hard cap', async () => {
		const port = immediatePort(() => ({ outcome: 'renewed' }));
		const { keeper: lease, events } = keeper(port);
		const hardCap = new AbortController();
		const handle = lease.hold(FENCE, { deadlineSignal: hardCap.signal });

		await advance(100_000);
		hardCap.abort(new Error('Queue processing deadline exceeded'));
		const callsAtCap = port.renew.mock.calls.length;
		await advance(29_999);
		expect(port.renew.mock.calls.length).toBe(callsAtCap + 2); // +105 s, +120 s
		expect(handle.signal.aborted).toBe(false);
		await advance(1);
		expect(events).toContainEqual({
			type: 'renewal_stopped',
			turnRunId: FENCE.turnRunId,
			executionGeneration: FENCE.executionGeneration,
			reason: 'hard_cap'
		});
		await advance(49_999);
		// No renewal after the budget; the lease now expires in the database, and
		// a turn still stuck is fenced by its own timer 60 s after +120 s.
		expect(port.renew.mock.calls.length).toBe(callsAtCap + 2);
		expect(handle.signal.aborted).toBe(false);
		await advance(1);
		expect(handle.signal.aborted).toBe(true);
		handle.release();
	});

	it('caps the whole hold at maxHoldMs even if the hard-cap signal never fires', async () => {
		const port = immediatePort(() => ({ outcome: 'renewed' }));
		const { keeper: lease, events } = keeper(port, { maxHoldMs: 390_000 });
		const handle = lease.hold(FENCE);

		await advance(390_000);
		const calls = port.renew.mock.calls.length;
		expect(eventTypes(events)).toEqual(['renewal_stopped']);
		await advance(30_000);
		expect(port.renew.mock.calls.length).toBe(calls);
		handle.release();
	});

	it('reports a stalled event loop as not fresh before any timer has run', async () => {
		const port = immediatePort(() => ({ outcome: 'renewed' }));
		const { keeper: lease } = keeper(port);
		const handle = lease.hold(FENCE);
		await flush();
		expect(handle.isFresh()).toBe(true);

		// The clock jumps (a synchronous stall); no timer has had a chance to run.
		vi.setSystemTime(Date.now() + 61_000);
		expect(handle.isFresh()).toBe(false);
		expect(handle.signal.aborted).toBe(false);
		handle.release();
		expect(handle.isFresh()).toBe(false);
	});

	it('stops renewing on release without aborting the turn, idempotently', async () => {
		const port = immediatePort(() => ({ outcome: 'renewed' }));
		const { keeper: lease } = keeper(port);
		const hardCap = new AbortController();
		const first = lease.hold(FENCE, { deadlineSignal: hardCap.signal });
		const second = lease.hold({ ...FENCE, executionGeneration: 3 });
		await flush();

		first.release();
		first.release();
		await advance(120_000);
		expect(first.signal.aborted).toBe(false);
		expect(
			port.renew.mock.calls.filter(([fence]) => fence.executionGeneration === 2)
		).toHaveLength(1);
		expect(second.signal.aborted).toBe(false);
		second.release();
		expect(vi.getTimerCount()).toBe(0);
		// A released hold ignores the hard cap.
		hardCap.abort();
		expect(vi.getTimerCount()).toBe(0);
	});

	it('ignores an answer that arrives after release', async () => {
		const port = manualPort();
		const { keeper: lease, events } = keeper(port.port);
		const handle = lease.hold(FENCE);
		handle.release();
		await port.answer(0, { outcome: 'lost', reason: 'turn_terminal' });
		expect(handle.signal.aborted).toBe(false);
		expect(events).toEqual([]);
	});

	it('keeps telemetry failures from changing the lease decision', async () => {
		let first = true;
		const port = immediatePort(() => {
			if (first) {
				first = false;
				return { outcome: 'renewed' };
			}
			return new Error('blip');
		});
		const lease = new AgenticChatTurnLeaseKeeper({
			lease: port,
			now: () => Date.now(),
			onEvent: () => {
				throw new Error('logger down');
			}
		});
		const handle = lease.hold(FENCE);
		await advance(60_000);
		expect(handle.signal.aborted).toBe(true);
		handle.release();
	});

	it('refuses an unclaimed fence', () => {
		const { keeper: lease } = keeper(immediatePort(() => ({ outcome: 'renewed' })));
		expect(() => lease.hold({ ...FENCE, processingToken: '' })).toThrow('claimed turn fence');
		expect(() => lease.hold({ ...FENCE, executionGeneration: 0 })).toThrow(
			'claimed turn fence'
		);
	});
});

describe('validateAgenticChatTurnLeaseTimingV1', () => {
	const valid = { renewIntervalMs: 15_000, selfFenceAfterMs: 60_000 };

	it('accepts the shipped policy and states each margin', () => {
		const policy = AGENTIC_CHAT_TURN_LEASE_POLICY_V1;
		expect(() =>
			validateAgenticChatTurnLeaseTimingV1({
				renewIntervalMs: policy.renewIntervalMs,
				selfFenceAfterMs: policy.selfFenceAfterMs,
				rpcTimeoutMs: policy.rpcTimeoutMs,
				recoverySweepIntervalMs: policy.recoverySweepIntervalMs,
				workerTimeoutMs: 360_000,
				terminalBudgetMs: policy.terminalBudgetMs
			})
		).not.toThrow();
		expect(() =>
			validateAgenticChatTurnLeaseTimingV1({ ...valid, renewIntervalMs: 999 })
		).toThrow('below 1000ms');
		expect(() =>
			validateAgenticChatTurnLeaseTimingV1({ ...valid, rpcTimeoutMs: 15_000 })
		).toThrow('must end before the next renewal');
		expect(() =>
			validateAgenticChatTurnLeaseTimingV1({
				renewIntervalMs: 15_000,
				selfFenceAfterMs: 29_999
			})
		).toThrow('tolerate one missed renewal');
		expect(() =>
			validateAgenticChatTurnLeaseTimingV1({ ...valid, selfFenceAfterMs: 60_001 })
		).toThrow('two renewals before the 90000ms database expiry');
		expect(() =>
			validateAgenticChatTurnLeaseTimingV1({
				renewIntervalMs: 15_001,
				selfFenceAfterMs: 30_002
			})
		).toThrow('too slow for the Stop threshold');
		expect(() =>
			validateAgenticChatTurnLeaseTimingV1({ ...valid, recoverySweepIntervalMs: 90_001 })
		).toThrow('between 1000ms and 90000ms');
		expect(() =>
			validateAgenticChatTurnLeaseTimingV1({ ...valid, workerTimeoutMs: 390_000 })
		).toThrow('below the 420000ms unleased recovery threshold');
	});

	it('is the check the keeper itself runs', () => {
		const port = immediatePort(() => ({ outcome: 'renewed' }));
		expect(() => keeper(port, { renewIntervalMs: 15_000, selfFenceAfterMs: 29_999 })).toThrow(
			'tolerate one missed renewal'
		);
		expect(() => keeper(port, { rpcTimeoutMs: 20_000 })).toThrow(
			'must end before the next renewal'
		);
	});
});

describe('SupabaseAgenticChatTurnLeaseAdapter', () => {
	function adapter(result: { data: unknown; error: { code?: string; message: string } | null }) {
		const abortSignal = vi.fn(async (_signal: AbortSignal) => result);
		const rpc = vi.fn(() => ({ abortSignal }));
		return { rpc, abortSignal, adapter: new SupabaseAgenticChatTurnLeaseAdapter({ rpc }) };
	}
	const receipt = (overrides: Record<string, unknown>) => ({
		turn_run_id: FENCE.turnRunId,
		execution_generation: FENCE.executionGeneration,
		...overrides
	});
	const signal = new AbortController().signal;

	it('renews through the fenced RPC with token, generation, and an abort signal', async () => {
		const {
			rpc,
			abortSignal,
			adapter: port
		} = adapter({
			data: receipt({ outcome: 'renewed', renewed_at: '2026-09-23T12:00:00Z' }),
			error: null
		});
		await expect(port.renew(FENCE, signal)).resolves.toEqual({ outcome: 'renewed' });
		expect(rpc).toHaveBeenCalledWith('renew_agentic_chat_turn_lease', {
			p_turn_run_id: FENCE.turnRunId,
			p_queue_job_id: FENCE.queueJobId,
			p_processing_token: FENCE.processingToken,
			p_execution_generation: FENCE.executionGeneration
		});
		expect(abortSignal).toHaveBeenCalledWith(signal);
	});

	it.each([
		'relationship_mismatch',
		'turn_terminal',
		'generation_changed',
		'not_running',
		'ownership_lost',
		'lease_expired'
	] as const)('maps lost(%s)', async (reason) => {
		const { adapter: port } = adapter({
			data: receipt({ outcome: 'lost', reason }),
			error: null
		});
		await expect(port.renew(FENCE, signal)).resolves.toEqual({ outcome: 'lost', reason });
	});

	it('treats a missing function as unsupported so a worker deployed first keeps working', async () => {
		for (const code of ['PGRST202', '42883']) {
			const { adapter: port } = adapter({ data: null, error: { code, message: 'missing' } });
			await expect(port.renew(FENCE, signal)).resolves.toEqual({ outcome: 'unsupported' });
		}
	});

	it('throws on transport errors and on receipts it cannot trust', async () => {
		await expect(
			adapter({ data: null, error: { code: '57014', message: 'timeout' } }).adapter.renew(
				FENCE,
				signal
			)
		).rejects.toBeInstanceOf(AgenticChatTurnLeaseRpcError);
		await expect(
			adapter({
				data: receipt({ outcome: 'renewed', execution_generation: 3 }),
				error: null
			}).adapter.renew(FENCE, signal)
		).rejects.toThrow('receipt identity is invalid');
		await expect(
			adapter({
				data: receipt({ outcome: 'lost', reason: 'vibes' }),
				error: null
			}).adapter.renew(FENCE, signal)
		).rejects.toThrow('receipt outcome is invalid');
		await expect(
			adapter({ data: [], error: null }).adapter.renew(FENCE, signal)
		).rejects.toThrow('receipt identity is invalid');
	});
});

describe('lease policy drift', () => {
	/** The newest migration that (re)defines the lease-state function wins. */
	function latestLeaseStateDefinition(): string {
		const directory = resolve(__dirname, '../../../supabase/migrations');
		const files = readdirSync(directory)
			.filter((name) => name.endsWith('.sql'))
			.sort();
		for (const name of files.reverse()) {
			const sql = readFileSync(resolve(directory, name), 'utf8');
			const start = sql.lastIndexOf(
				'CREATE OR REPLACE FUNCTION public.agentic_chat_turn_lease_state_v1('
			);
			if (start >= 0) return sql.slice(start, sql.indexOf('$function$;', start));
		}
		throw new Error('No migration defines agentic_chat_turn_lease_state_v1');
	}

	it('keeps the worker constants equal to the database thresholds', () => {
		const definition = latestLeaseStateDefinition();
		const seconds = (name: string) => {
			const match = new RegExp(`${name} CONSTANT interval := interval '(\\d+) seconds'`).exec(
				definition
			);
			if (!match) throw new Error(`${name} missing from the lease-state function`);
			return Number(match[1]) * 1_000;
		};
		const policy = AGENTIC_CHAT_TURN_LEASE_POLICY_V1;

		expect(seconds('c_lease_stale_after')).toBe(policy.staleAfterMs);
		expect(seconds('c_lease_expired_after')).toBe(policy.expiredAfterMs);
		expect(seconds('c_unleased_expired_after')).toBe(policy.unleasedExpiredAfterMs);
		// The same rule set the keeper and the consumer config enforce.
		expect(() =>
			validateAgenticChatTurnLeaseTimingV1({
				renewIntervalMs: policy.renewIntervalMs,
				selfFenceAfterMs: policy.selfFenceAfterMs,
				rpcTimeoutMs: policy.rpcTimeoutMs,
				recoverySweepIntervalMs: policy.recoverySweepIntervalMs,
				terminalBudgetMs: policy.terminalBudgetMs
			})
		).not.toThrow();
	});
});
