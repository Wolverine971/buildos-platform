// apps/web/src/routes/api/agent-call/buildos/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	consumeRateLimit: vi.fn(),
	serviceConstructor: vi.fn()
}));

vi.mock('$lib/server/agent-call/oauth-rate-limit', () => ({
	OAUTH_RATE_LIMITS: { gateway: { requests: 120, windowMs: 60_000 } },
	consumePublicEndpointRateLimit: mocks.consumeRateLimit
}));
vi.mock('$lib/server/agent-call/agent-call-service', () => ({
	AgentCallServiceError: class AgentCallServiceError extends Error {},
	BuildosAgentCallService: class BuildosAgentCallService {
		constructor(...args: unknown[]) {
			mocks.serviceConstructor(...args);
		}
	},
	toBuildosAgentErrorResponse: vi.fn()
}));
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: vi.fn() }));
vi.mock('$lib/server/security-event-logger', () => ({
	getSecurityEventLogOptions: vi.fn()
}));
vi.mock('$lib/server/route-error', () => ({ logRouteError: vi.fn() }));

import { POST } from './+server';

describe('/api/agent-call/buildos', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('rate-limits by client address before parsing or constructing the gateway service', async () => {
		mocks.consumeRateLimit.mockReturnValue({
			allowed: false,
			retryAfterSeconds: 12,
			headers: {
				'X-RateLimit-Limit': '120',
				'X-RateLimit-Remaining': '0',
				'X-RateLimit-Reset': '123'
			}
		});

		const response = await POST({
			request: new Request('http://localhost/api/agent-call/buildos', {
				method: 'POST',
				body: 'not-json'
			}),
			platform: undefined,
			getClientAddress: () => '203.0.113.10'
		} as never);

		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('12');
		expect(await response.json()).toMatchObject({ error: { code: -32029 } });
		expect(mocks.consumeRateLimit).toHaveBeenCalledWith('agent-call:gateway:203.0.113.10', {
			requests: 120,
			windowMs: 60_000
		});
		expect(mocks.serviceConstructor).not.toHaveBeenCalled();
	});
});
