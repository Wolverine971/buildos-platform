// apps/web/src/lib/server/expensive-operation-limiter.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	ExpensiveOperationLimiter,
	type ExpensiveOperationPolicy
} from './expensive-operation-limiter';

const testPolicies: Record<'agent_fastchat', ExpensiveOperationPolicy> = {
	agent_fastchat: {
		key: 'agent_fastchat',
		startWindowMs: 60_000,
		maxStartsPerWindow: 3,
		budgetWindowMs: 60_000,
		maxBudgetPerWindow: 100,
		maxConcurrent: 2,
		defaultEstimatedCost: 10,
		budgetMetric: 'tokens',
		activeTtlMs: 5 * 60_000
	}
};

describe('ExpensiveOperationLimiter', () => {
	let limiter: ExpensiveOperationLimiter;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-04-08T12:00:00.000Z'));
		limiter = new ExpensiveOperationLimiter(testPolicies);
	});

	afterEach(() => {
		limiter.destroy();
		vi.useRealTimers();
	});

	it('blocks when concurrency is exhausted and releases when a lease ends', () => {
		const first = limiter.acquire({ userId: 'user-1', policyKey: 'agent_fastchat' });
		const second = limiter.acquire({ userId: 'user-1', policyKey: 'agent_fastchat' });
		const third = limiter.acquire({ userId: 'user-1', policyKey: 'agent_fastchat' });

		expect(first.allowed).toBe(true);
		expect(second.allowed).toBe(true);
		expect(third.allowed).toBe(false);
		if (!third.allowed) {
			expect(third.reason).toBe('concurrency');
		}

		if (first.allowed) {
			first.lease.release();
		}

		const retry = limiter.acquire({ userId: 'user-1', policyKey: 'agent_fastchat' });
		expect(retry.allowed).toBe(true);
		if (second.allowed) second.lease.release();
		if (retry.allowed) retry.lease.release();
	});

	it('blocks after too many starts inside the rolling start window', () => {
		for (let index = 0; index < 3; index += 1) {
			const decision = limiter.acquire({ userId: 'user-2', policyKey: 'agent_fastchat' });
			expect(decision.allowed).toBe(true);
			if (decision.allowed) {
				decision.lease.release();
			}
		}

		const blocked = limiter.acquire({ userId: 'user-2', policyKey: 'agent_fastchat' });
		expect(blocked.allowed).toBe(false);
		if (!blocked.allowed) {
			expect(blocked.reason).toBe('starts');
		}

		vi.advanceTimersByTime(61_000);

		const allowedAgain = limiter.acquire({ userId: 'user-2', policyKey: 'agent_fastchat' });
		expect(allowedAgain.allowed).toBe(true);
		if (allowedAgain.allowed) {
			allowedAgain.lease.release();
		}
	});

	it('uses recorded cost for the rolling budget instead of the initial estimate', () => {
		const first = limiter.acquire({
			userId: 'user-3',
			policyKey: 'agent_fastchat',
			estimatedCost: 10
		});
		expect(first.allowed).toBe(true);
		if (!first.allowed) return;

		first.lease.recordCost(60);
		first.lease.release();

		const snapshot = limiter.getSnapshot('user-3', 'agent_fastchat');
		expect(snapshot.budgetUsed).toBe(60);
		expect(snapshot.budgetRemaining).toBe(40);

		const second = limiter.acquire({
			userId: 'user-3',
			policyKey: 'agent_fastchat',
			estimatedCost: 50
		});
		expect(second.allowed).toBe(false);
		if (!second.allowed) {
			expect(second.reason).toBe('budget');
		}
	});

	it('can cancel a reservation before the expensive work starts', () => {
		const reservation = limiter.acquire({
			userId: 'user-4',
			policyKey: 'agent_fastchat',
			estimatedCost: 25
		});
		expect(reservation.allowed).toBe(true);
		if (!reservation.allowed) return;

		reservation.lease.cancel();

		const snapshot = limiter.getSnapshot('user-4', 'agent_fastchat');
		expect(snapshot.active).toBe(0);
		expect(snapshot.budgetUsed).toBe(0);
	});
});
