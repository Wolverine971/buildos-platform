import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	loadOnboardingNotifications,
	saveOnboardingNotifications,
	type OnboardingNotifications
} from './onboarding-notifications';

const initial: OnboardingNotifications = {
	emailEnabled: false,
	smsEnabled: false,
	smsBriefEnabled: false,
	smsRemindersEnabled: false,
	phoneVerified: true
};
const ok = (preferences: Record<string, unknown>, singular = false) =>
	Response.json({
		success: true,
		data: { [singular ? 'preference' : 'preferences']: preferences }
	});

describe('onboarding notification persistence', () => {
	afterEach(() => vi.unstubAllGlobals());
	it('hydrates existing preferences and respects an opted-out phone', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) =>
				url.startsWith('/api/notification')
					? ok({ should_email_daily_brief: true, should_sms_daily_brief: true })
					: ok({ phone_verified: true, opted_out: true, event_reminders_enabled: true })
			)
		);
		expect(await loadOnboardingNotifications()).toMatchObject({
			emailEnabled: true,
			smsEnabled: false,
			phoneVerified: false
		});
	});
	it('activates brief generation before enabling delivery and confirms singular PUT responses', async () => {
		const calls: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, options?: RequestInit) => {
				calls.push(`${options?.method ?? 'GET'} ${url}`);
				const body = options?.body ? JSON.parse(String(options.body)) : {};
				if (url === '/api/brief-preferences')
					return ok({
						frequency: 'weekly',
						day_of_week: 2,
						time_of_day: '10:00:00',
						timezone: 'America/New_York',
						is_active: options?.method === 'POST'
					});
				return ok(body, url === '/api/notification-preferences');
			})
		);
		const result = await saveOnboardingNotifications({ email: true, sms: true }, initial);
		expect(result.errors).toEqual([]);
		expect(result.saved).toMatchObject({
			emailEnabled: true,
			smsEnabled: true,
			smsBriefEnabled: true,
			smsRemindersEnabled: true
		});
		expect(calls.slice(0, 2)).toEqual([
			'GET /api/brief-preferences',
			'POST /api/brief-preferences'
		]);
	});
	it('keeps a successful email setting visible when SMS delivery fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, options?: RequestInit) => {
				const body = options?.body ? JSON.parse(String(options.body)) : {};
				if (url === '/api/brief-preferences') return ok({ is_active: true });
				if (body.should_sms_daily_brief)
					return Response.json({ success: false, error: 'Unavailable' }, { status: 500 });
				if (!options?.method && url.startsWith('/api/notification'))
					return ok({ should_email_daily_brief: true, should_sms_daily_brief: false });
				if (!options?.method)
					return ok({ phone_verified: true, event_reminders_enabled: true });
				return ok(body, url === '/api/notification-preferences');
			})
		);
		const result = await saveOnboardingNotifications({ email: true, sms: true }, initial);
		expect(result.errors).toContain('Your daily brief text preference was not saved.');
		expect(result.saved).toMatchObject({
			emailEnabled: true,
			smsRemindersEnabled: true,
			smsBriefEnabled: false
		});
	});
	it('can turn previously enabled channels off', async () => {
		const fetchMock = vi.fn(async (url: string, options?: RequestInit) =>
			ok(JSON.parse(String(options?.body)), url === '/api/notification-preferences')
		);
		vi.stubGlobal('fetch', fetchMock);
		const result = await saveOnboardingNotifications(
			{ email: false, sms: false },
			{
				...initial,
				emailEnabled: true,
				smsEnabled: true,
				smsBriefEnabled: true,
				smsRemindersEnabled: true
			}
		);
		expect(result.saved).toMatchObject({ emailEnabled: false, smsEnabled: false });
		expect(fetchMock.mock.calls.some(([url]) => url === '/api/brief-preferences')).toBe(false);
	});
	it('marks settings unconfirmed when both saving and the recovery read fail', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
		const result = await saveOnboardingNotifications({ email: false, sms: false }, initial);
		expect(result.confirmed).toBe(false);
		expect(result.errors).toContain(
			'Saved settings could not be refreshed. Retry before continuing.'
		);
	});
});
