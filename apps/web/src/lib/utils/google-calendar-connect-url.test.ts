// apps/web/src/lib/utils/google-calendar-connect-url.test.ts
import { describe, expect, it, vi } from 'vitest';
import { getGoogleCalendarConnectUrl } from './google-calendar-connect-url';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('getGoogleCalendarConnectUrl', () => {
	it('returns the legacy auth URL when /profile/calendar provides one', async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse({
				success: true,
				data: { calendarAuthUrl: 'https://legacy', multiCalendar: null }
			})
		);

		await expect(getGoogleCalendarConnectUrl('/onboarding', fetchImpl)).resolves.toBe(
			'https://legacy'
		);
		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(fetchImpl.mock.calls[0][0]).toBe('/profile/calendar?redirect=%2Fonboarding');
	});

	it('starts the dedicated flow for multi-account users', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse({
					success: true,
					data: { calendarAuthUrl: null, multiCalendar: { connections: [] } }
				})
			)
			.mockResolvedValueOnce(
				jsonResponse({ success: true, data: { authorizationUrl: 'https://dedicated' } })
			);

		await expect(getGoogleCalendarConnectUrl('/time-blocks', fetchImpl)).resolves.toBe(
			'https://dedicated'
		);
		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'/api/integrations/google-calendar/connections',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ redirectPath: '/time-blocks' })
			})
		);
	});

	it('surfaces the connections API error, such as the account limit', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse({ success: true, data: { calendarAuthUrl: null, multiCalendar: {} } })
			)
			.mockResolvedValueOnce(
				jsonResponse({ success: false, error: 'You can connect up to 5 accounts' }, 400)
			);

		await expect(getGoogleCalendarConnectUrl('/onboarding', fetchImpl)).rejects.toThrow(
			'You can connect up to 5 accounts'
		);
	});

	it('fails clearly when neither flow is available', async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse({ success: true, data: { calendarAuthUrl: null, multiCalendar: null } })
		);

		await expect(getGoogleCalendarConnectUrl('/onboarding', fetchImpl)).rejects.toThrow(
			'No auth URL returned'
		);
	});
});
