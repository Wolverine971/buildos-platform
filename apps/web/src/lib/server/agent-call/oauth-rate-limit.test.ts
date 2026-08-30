// apps/web/src/lib/server/agent-call/oauth-rate-limit.test.ts
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { consumePublicEndpointRateLimit } from './oauth-rate-limit';

describe('consumePublicEndpointRateLimit', () => {
	it('returns headers and rejects requests after the configured IP budget is spent', () => {
		const identifier = `bootstrap-test:${randomUUID()}`;
		const rule = { requests: 2, windowMs: 60_000 };

		const first = consumePublicEndpointRateLimit(identifier, rule);
		const second = consumePublicEndpointRateLimit(identifier, rule);
		const denied = consumePublicEndpointRateLimit(identifier, rule);

		expect(first).toMatchObject({
			allowed: true,
			headers: { 'X-RateLimit-Remaining': '1' }
		});
		expect(second).toMatchObject({
			allowed: true,
			headers: { 'X-RateLimit-Remaining': '0' }
		});
		expect(denied).toMatchObject({
			allowed: false,
			headers: { 'X-RateLimit-Remaining': '0' },
			retryAfterSeconds: expect.any(Number)
		});
	});
});
