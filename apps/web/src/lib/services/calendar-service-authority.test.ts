// apps/web/src/lib/services/calendar-service-authority.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	activityMock,
	adminDisconnectMock,
	adminSupabase,
	userDisconnectMock,
	userHasValidConnectionMock,
	userSupabase
} = vi.hoisted(() => ({
	activityMock: vi.fn(),
	adminDisconnectMock: vi.fn(),
	adminSupabase: { authority: 'service_role' },
	userDisconnectMock: vi.fn(),
	userHasValidConnectionMock: vi.fn(),
	userSupabase: { authority: 'authenticated' }
}));

vi.mock('googleapis', () => ({
	google: { calendar: vi.fn() }
}));

vi.mock('$lib/utils/activityLogger', () => ({
	ActivityLogger: vi.fn().mockImplementation(() => ({ logActivity: activityMock }))
}));

vi.mock('./google-oauth-service', () => {
	class GoogleOAuthConnectionError extends Error {
		requiresReconnection = false;
	}

	return {
		GoogleOAuthConnectionError,
		GoogleOAuthService: vi.fn().mockImplementation((client) =>
			client === adminSupabase
				? { disconnectCalendar: adminDisconnectMock }
				: {
						disconnectCalendar: userDisconnectMock,
						hasValidConnection: userHasValidConnectionMock
					}
		)
	};
});

vi.mock('./errorLogger.service', () => ({
	ErrorLoggerService: {
		getInstance: vi.fn(() => ({ logCalendarError: vi.fn() }))
	}
}));

vi.mock('./recurrence-pattern.service', () => ({
	recurrencePatternBuilder: { buildRRule: vi.fn() }
}));

import { CalendarService } from './calendar-service';

describe('CalendarService disconnect authority', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('uses only the privileged client when an invalid connection is auto-disconnected', async () => {
		userHasValidConnectionMock.mockResolvedValue(false);
		adminDisconnectMock.mockResolvedValue(undefined);
		const service = new CalendarService(userSupabase as any, {
			privilegedSupabase: adminSupabase as any
		});

		await expect(service.hasValidConnection('user-1')).resolves.toBe(false);

		expect(activityMock).toHaveBeenCalledWith(
			'user-1',
			'admin_action',
			expect.objectContaining({ action: 'calendar_auto_disconnected' })
		);
		expect(adminDisconnectMock).toHaveBeenCalledWith('user-1');
		expect(userDisconnectMock).not.toHaveBeenCalled();
	});
});
