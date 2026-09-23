// apps/web/src/lib/services/calendar-service-authority.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	activityMock,
	adminDisconnectMock,
	adminSupabase,
	googleOAuthConstructorCalls,
	userDisconnectMock,
	userHasValidConnectionMock,
	userSupabase
} = vi.hoisted(() => ({
	activityMock: vi.fn(),
	adminDisconnectMock: vi.fn(),
	adminSupabase: { authority: 'service_role' },
	googleOAuthConstructorCalls: [] as Array<{
		client: unknown;
		runtimeOptions: unknown;
	}>,
	userDisconnectMock: vi.fn(),
	userHasValidConnectionMock: vi.fn(),
	userSupabase: { authority: 'authenticated' }
}));

vi.mock('googleapis', () => ({
	google: { calendar: vi.fn() }
}));

vi.mock('$lib/utils/activityLogger', () => ({
	ActivityLogger: vi.fn().mockImplementation(function () {
		return { logActivity: activityMock };
	})
}));

vi.mock('./google-oauth-service', () => {
	class GoogleOAuthConnectionError extends Error {
		requiresReconnection = false;
	}

	return {
		GoogleOAuthConnectionError,
		GoogleOAuthService: vi
			.fn()
			.mockImplementation(function (client, _credentials, runtimeOptions) {
				googleOAuthConstructorCalls.push({ client, runtimeOptions });
				return client === adminSupabase
					? { disconnectCalendar: adminDisconnectMock }
					: {
							disconnectCalendar: userDisconnectMock,
							hasValidConnection: userHasValidConnectionMock
						};
			})
	};
});

vi.mock('./errorLogger.service', () => ({
	ErrorLoggerService: {
		getInstance: vi.fn(function () {
			return { logCalendarError: vi.fn() };
		})
	}
}));

vi.mock('./recurrence-pattern.service', () => ({
	recurrencePatternBuilder: { buildRRule: vi.fn() }
}));

import { CalendarService } from './calendar-service';

describe('CalendarService disconnect authority', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		googleOAuthConstructorCalls.length = 0;
	});

	it('wires protected cleanup authority separately from the user client', () => {
		new CalendarService(userSupabase as any, {
			privilegedSupabase: adminSupabase as any
		});

		expect(googleOAuthConstructorCalls).toEqual([
			{
				client: userSupabase,
				runtimeOptions: { protectedCleanupSupabase: adminSupabase }
			},
			{ client: adminSupabase, runtimeOptions: undefined }
		]);
	});

	it('keeps legacy connection validation read-only when the grant is invalid', async () => {
		userHasValidConnectionMock.mockResolvedValue(false);
		const service = new CalendarService(userSupabase as any, {
			privilegedSupabase: adminSupabase as any
		});

		await expect(service.hasValidConnection('user-1')).resolves.toBe(false);

		expect(activityMock).not.toHaveBeenCalled();
		expect(adminDisconnectMock).not.toHaveBeenCalled();
		expect(userDisconnectMock).not.toHaveBeenCalled();
	});

	it('records provider connection failures without deleting calendar state', async () => {
		const service = new CalendarService(userSupabase as any, {
			privilegedSupabase: adminSupabase as any
		});

		await (service as any).handleConnectionFailure('user-1', 'Reconnect Google Calendar');

		expect(activityMock).toHaveBeenCalledWith(
			'user-1',
			'admin_action',
			expect.objectContaining({
				action: 'calendar_connection_failed',
				reason: 'Reconnect Google Calendar'
			})
		);
		expect(adminDisconnectMock).not.toHaveBeenCalled();
		expect(userDisconnectMock).not.toHaveBeenCalled();
	});

	it('uses only the privileged client for an explicit disconnect', async () => {
		adminDisconnectMock.mockResolvedValue(undefined);
		const service = new CalendarService(userSupabase as any, {
			privilegedSupabase: adminSupabase as any
		});

		await expect(service.disconnectCalendar('user-1')).resolves.toBeUndefined();

		expect(activityMock).toHaveBeenCalledWith(
			'user-1',
			'admin_action',
			expect.objectContaining({ action: 'calendar_disconnected' })
		);
		expect(adminDisconnectMock).toHaveBeenCalledWith('user-1');
		expect(userDisconnectMock).not.toHaveBeenCalled();
	});

	it('does not record a successful disconnect when privileged cleanup fails', async () => {
		const cleanupError = new Error('cleanup failed');
		adminDisconnectMock.mockRejectedValue(cleanupError);
		const service = new CalendarService(userSupabase as any, {
			privilegedSupabase: adminSupabase as any
		});

		await expect(service.disconnectCalendar('user-1')).rejects.toBe(cleanupError);

		expect(activityMock).not.toHaveBeenCalled();
		expect(userDisconnectMock).not.toHaveBeenCalled();
	});
});

describe('CalendarService.findAvailableSlots preferred hours', () => {
	it("filters preferred hours in the user's timezone rather than the server's", async () => {
		const originalTz = process.env.TZ;
		process.env.TZ = 'UTC'; // Production servers run in UTC.
		try {
			const { google } = await import('googleapis');
			vi.mocked(google.calendar).mockReturnValue({
				freebusy: {
					query: vi.fn().mockResolvedValue({
						data: { calendars: { primary: { busy: [] } } }
					})
				}
			} as any);
			const service = new CalendarService(userSupabase as any);
			(service as any).oAuthService = {
				getAuthenticatedClient: vi.fn().mockResolvedValue({})
			};

			const result = await service.findAvailableSlots('user-1', {
				// 9:00-11:00 in New York.
				timeMin: '2026-09-22T13:00:00.000Z',
				timeMax: '2026-09-22T15:00:00.000Z',
				duration_minutes: 30,
				preferred_hours: [9],
				timeZone: 'America/New_York'
			} as any);

			expect(result.total_available).toBe(2);
		} finally {
			if (originalTz === undefined) delete process.env.TZ;
			else process.env.TZ = originalTz;
		}
	});
});
