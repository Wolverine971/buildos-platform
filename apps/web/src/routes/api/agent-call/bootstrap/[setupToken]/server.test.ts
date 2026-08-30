// apps/web/src/routes/api/agent-call/bootstrap/[setupToken]/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadBootstrapDocumentMock, consumeRateLimitMock, logRouteErrorMock } = vi.hoisted(() => ({
	loadBootstrapDocumentMock: vi.fn(),
	consumeRateLimitMock: vi.fn(),
	logRouteErrorMock: vi.fn()
}));

vi.mock('$lib/server/agent-call/bootstrap-link.service', () => {
	class AgentCallBootstrapError extends Error {
		constructor(
			message: string,
			public readonly status = 400
		) {
			super(message);
		}
	}

	return {
		AgentCallBootstrapError,
		AgentCallBootstrapLinkService: class {
			loadBootstrapDocument = loadBootstrapDocumentMock;
		},
		serializeBootstrapDocumentAsText: () => 'bootstrap instructions'
	};
});

vi.mock('$lib/server/agent-call/oauth-rate-limit', () => ({
	consumePublicEndpointRateLimit: consumeRateLimitMock,
	OAUTH_RATE_LIMITS: {
		bootstrap: { requests: 30, windowMs: 60_000 }
	}
}));

vi.mock('$lib/server/route-error', () => ({
	logRouteError: logRouteErrorMock
}));

import { GET } from './+server';

describe('GET /api/agent-call/bootstrap/[setupToken]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		consumeRateLimitMock.mockReturnValue({
			allowed: true,
			headers: {
				'X-RateLimit-Limit': '30',
				'X-RateLimit-Remaining': '29',
				'X-RateLimit-Reset': '123'
			}
		});
		loadBootstrapDocumentMock.mockResolvedValue({ instructions_version: 'test' });
	});

	it('returns no-store, no-referrer instructions after consuming the IP limit', async () => {
		const response = await GET({
			params: { setupToken: 'bocs_test' },
			url: new URL('https://build-os.com/api/agent-call/bootstrap/bocs_test'),
			getClientAddress: () => '203.0.113.10'
		} as any);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('bootstrap instructions');
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('X-RateLimit-Remaining')).toBe('29');
		expect(consumeRateLimitMock).toHaveBeenCalledWith('agent-call:bootstrap:203.0.113.10', {
			requests: 30,
			windowMs: 60_000
		});
		expect(loadBootstrapDocumentMock).toHaveBeenCalledWith({
			setupToken: 'bocs_test',
			baseUrl: 'https://build-os.com'
		});
	});

	it('rejects abusive clients before attempting token redemption', async () => {
		consumeRateLimitMock.mockReturnValue({
			allowed: false,
			headers: {
				'X-RateLimit-Limit': '30',
				'X-RateLimit-Remaining': '0',
				'X-RateLimit-Reset': '123'
			},
			retryAfterSeconds: 60
		});

		const response = await GET({
			params: { setupToken: 'bocs_test' },
			url: new URL('https://build-os.com/api/agent-call/bootstrap/bocs_test?format=json'),
			getClientAddress: () => '203.0.113.10'
		} as any);

		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('60');
		expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
		expect(await response.json()).toEqual({
			error: 'Too many bootstrap requests. Try again shortly.'
		});
		expect(loadBootstrapDocumentMock).not.toHaveBeenCalled();
	});
});
