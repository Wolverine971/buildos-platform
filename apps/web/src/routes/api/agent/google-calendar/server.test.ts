import { beforeEach, describe, expect, it, vi } from 'vitest';

const { legacyHasStoredConnectionMock, legacyHasValidConnectionMock } = vi.hoisted(() => ({
	legacyHasStoredConnectionMock: vi.fn(),
	legacyHasValidConnectionMock: vi.fn()
}));

vi.mock('$lib/services/calendar-service', () => {
	const CalendarService = vi.fn().mockImplementation(() => ({
		hasStoredConnection: legacyHasStoredConnectionMock,
		hasValidConnection: legacyHasValidConnectionMock
	}));
	(CalendarService as any).getToolDefinitions = vi.fn(() => []);
	return {
		CalendarService,
		CalendarConnectionError: class CalendarConnectionError extends Error {
			requiresReconnection = false;
		}
	};
});

vi.mock('$lib/server/route-error', () => ({
	logRouteError: vi.fn()
}));

import { GET } from './+server';

describe('GET /api/agent/google-calendar', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		legacyHasStoredConnectionMock.mockResolvedValue(true);
	});

	it('checks stored gateway state without validating or deleting it', async () => {
		const response = await GET({
			locals: {
				supabase: { authority: 'authenticated' },
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data.connected).toBe(true);
		expect(legacyHasStoredConnectionMock).toHaveBeenCalledWith('user-1');
		expect(legacyHasValidConnectionMock).not.toHaveBeenCalled();
	});
});
