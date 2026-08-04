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

		capacity.markTemporarilyUnavailable(2_000);
		expect(capacity.getSnapshot()).toMatchObject({
			available: false,
			degradedUntilMs: 4_000
		});
		nowMs = 3_999;
		expect(capacity.getSnapshot().available).toBe(false);
		nowMs = 4_000;
		expect(capacity.getSnapshot()).toMatchObject({
			available: true,
			degradedUntilMs: null
		});
	});

	it('rejects configuration outside the initial Phase 3 envelope', () => {
		expect(() => new AgenticChatProviderCapacity({ configured: true, concurrency: 2 })).toThrow(
			'must remain 1 until the load-smoke gate'
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
		expect(() => capacity.markTemporarilyUnavailable(0)).toThrow('between 1ms and 60000ms');
	});
});
