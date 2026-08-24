// apps/worker/tests/agenticChatProviderCapacity.test.ts
import { describe, expect, it } from 'vitest';
import {
	AgenticChatProviderCapacity,
	AgenticChatProviderCapacityError
} from '../src/workers/agentic-chat/providerCapacity';

describe('AgenticChatProviderCapacity', () => {
	it('reserves the only provider slot and releases it idempotently', () => {
		const capacity = new AgenticChatProviderCapacity({
			configured: true,
			concurrency: 1,
			now: () => 1_000
		});

		expect(capacity.getSnapshot()).toEqual({
			observedAtMs: 1_000,
			configured: true,
			available: true,
			activeRequests: 0,
			concurrency: 1,
			degradedUntilMs: null
		});
		const lease = capacity.acquire();
		expect(capacity.getSnapshot()).toMatchObject({ available: false, activeRequests: 1 });
		expect(() => capacity.acquire()).toThrow(AgenticChatProviderCapacityError);

		lease.release();
		lease.release();
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('fails closed when credentials are absent', () => {
		const capacity = new AgenticChatProviderCapacity({
			configured: false,
			concurrency: 1
		});

		expect(capacity.getSnapshot()).toMatchObject({ configured: false, available: false });
		expect(() => capacity.acquire()).toThrow('credentials are not configured');
	});

	it('latches retryable provider degradation for a bounded cooldown', () => {
		let nowMs = 2_000;
		const capacity = new AgenticChatProviderCapacity({
			configured: true,
			concurrency: 1,
			now: () => nowMs
		});

		capacity.markTemporarilyUnavailable('turn-a', 2_000);
		expect(capacity.getSnapshot('turn-a')).toMatchObject({
			available: false,
			degradedUntilMs: 4_000
		});
		expect(capacity.getSnapshot()).toMatchObject({ available: true, degradedUntilMs: null });
		expect(capacity.getSnapshot('turn-b')).toMatchObject({
			available: true,
			degradedUntilMs: null
		});
		nowMs = 3_999;
		expect(capacity.getSnapshot('turn-a').available).toBe(false);
		nowMs = 4_000;
		expect(capacity.getSnapshot('turn-a')).toMatchObject({
			available: true,
			degradedUntilMs: null
		});
	});

	it('accepts the reviewed second slot and rejects configuration outside that bound', () => {
		const bounded = new AgenticChatProviderCapacity({ configured: true, concurrency: 2 });
		const first = bounded.acquire();
		const second = bounded.acquire();
		expect(bounded.getSnapshot()).toMatchObject({ available: false, activeRequests: 2 });
		expect(() => bounded.acquire()).toThrow(AgenticChatProviderCapacityError);
		first.release();
		second.release();
		expect(() => new AgenticChatProviderCapacity({ configured: true, concurrency: 3 })).toThrow(
			'must be between 1 and 2'
		);
		expect(
			() =>
				new AgenticChatProviderCapacity({
					configured: 'yes' as never,
					concurrency: 1
				})
		).toThrow('configured state must be boolean');
		const capacity = new AgenticChatProviderCapacity({
			configured: true,
			concurrency: 1
		});
		expect(() => capacity.markTemporarilyUnavailable('turn-a', 0)).toThrow(
			'between 1ms and 60000ms'
		);
	});
});
