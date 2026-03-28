import { beforeEach, describe, expect, it, vi } from 'vitest';

const { logServerErrorMock, shouldPersistGenericErrorEventMock } = vi.hoisted(() => ({
	logServerErrorMock: vi.fn(),
	shouldPersistGenericErrorEventMock: vi.fn()
}));

vi.mock('$lib/server/error-tracking', () => ({
	getRequestIdFromHeaders: vi.fn(() => 'req-1'),
	logServerError: logServerErrorMock
}));

vi.mock('$lib/utils/error-observability', () => ({
	shouldPersistGenericErrorEvent: shouldPersistGenericErrorEventMock
}));

import { POST } from './+server';

describe('/api/error-tracking/client', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		shouldPersistGenericErrorEventMock.mockReturnValue(true);
	});

	it('uses an HTTP-specific fallback message for fetch_http reports without an error payload', async () => {
		const response = await POST({
			request: new Request('http://localhost/api/error-tracking/client', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					kind: 'fetch_http',
					endpoint: '/api/agent/v2/stream',
					method: 'GET',
					status: 502
				})
			}),
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(204);
		expect(logServerErrorMock).toHaveBeenCalledWith(
			expect.objectContaining({
				error: expect.objectContaining({
					message: 'Client HTTP request failed'
				}),
				operation: 'client_fetch_http'
			})
		);
	});
});
