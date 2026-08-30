// apps/web/src/lib/server/agentic-chat-turn-rate-limit.test.ts
import { describe, expect, it } from 'vitest';
import { AgenticChatTurnTokenBucket } from './agentic-chat-turn-rate-limit';

describe('AgenticChatTurnTokenBucket', () => {
	it('rejects bursts after capacity and refills over time', () => {
		const bucket = new AgenticChatTurnTokenBucket(2, 60_000);

		expect(bucket.consume('user-1', 0).allowed).toBe(true);
		expect(bucket.consume('user-1', 0).allowed).toBe(true);
		const denied = bucket.consume('user-1', 0);
		expect(denied).toMatchObject({ allowed: false, retryAfterSeconds: 30 });
		expect(bucket.consume('user-1', 30_000).allowed).toBe(true);
	});

	it('keeps user budgets independent', () => {
		const bucket = new AgenticChatTurnTokenBucket(1, 60_000);

		expect(bucket.consume('user-1', 0).allowed).toBe(true);
		expect(bucket.consume('user-1', 0).allowed).toBe(false);
		expect(bucket.consume('user-2', 0).allowed).toBe(true);
	});
});
