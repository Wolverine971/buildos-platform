// packages/shared-agent-ops/src/calendar/google-calendar-scopes.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	GOOGLE_CALENDAR_LEGACY_FULL_SCOPE,
	GOOGLE_CALENDAR_SCOPES,
	applyGoogleCalendarPropertyChange,
	getMissingGoogleCalendarScopes,
	hasRequiredGoogleCalendarScopes,
	isGoogleCalendarUnmanagedCalendarError
} from './google-calendar-scopes';

describe('Google Calendar scope policy', () => {
	it('accepts an existing full-scope grant without reconnecting', () => {
		expect(hasRequiredGoogleCalendarScopes([GOOGLE_CALENDAR_LEGACY_FULL_SCOPE])).toBe(true);
		expect(hasRequiredGoogleCalendarScopes(`openid ${GOOGLE_CALENDAR_LEGACY_FULL_SCOPE}`)).toBe(
			true
		);
	});

	it('accepts the complete narrow set and names what a partial grant is missing', () => {
		expect(
			hasRequiredGoogleCalendarScopes(['openid', 'email', ...GOOGLE_CALENDAR_SCOPES])
		).toBe(true);
		expect(getMissingGoogleCalendarScopes(GOOGLE_CALENDAR_SCOPES.slice(1).join(' '))).toEqual([
			'https://www.googleapis.com/auth/calendar.events'
		]);
		expect(hasRequiredGoogleCalendarScopes(null)).toBe(false);
		expect(hasRequiredGoogleCalendarScopes(['openid', 'email'])).toBe(false);
	});

	it('recognizes the provider refusals that mean BuildOS does not manage a calendar', () => {
		expect(
			isGoogleCalendarUnmanagedCalendarError({
				response: {
					status: 403,
					data: { error: { errors: [{ reason: 'insufficientPermissions' }] } }
				}
			})
		).toBe(true);
		expect(
			isGoogleCalendarUnmanagedCalendarError({
				code: 403,
				response: {
					status: 403,
					data: { error: { details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] } }
				}
			})
		).toBe(true);
		expect(isGoogleCalendarUnmanagedCalendarError({ response: { status: 404 } })).toBe(true);
		expect(
			isGoogleCalendarUnmanagedCalendarError({
				response: {
					status: 403,
					data: { error: { errors: [{ reason: 'rateLimitExceeded' }] } }
				}
			})
		).toBe(false);
		expect(isGoogleCalendarUnmanagedCalendarError({ response: { status: 500 } })).toBe(false);
	});

	it('skips an unmanaged calendar change and rethrows every other failure', async () => {
		await expect(
			applyGoogleCalendarPropertyChange(
				vi.fn().mockRejectedValue({
					response: {
						status: 403,
						data: { error: { errors: [{ reason: 'insufficientPermissions' }] } }
					}
				})
			)
		).resolves.toBe(false);
		await expect(
			applyGoogleCalendarPropertyChange(vi.fn().mockResolvedValue({}))
		).resolves.toBe(true);
		await expect(
			applyGoogleCalendarPropertyChange(
				vi.fn().mockRejectedValue({ response: { status: 503 } })
			)
		).rejects.toEqual({ response: { status: 503 } });
	});
});
