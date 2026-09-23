// apps/web/src/lib/utils/auth-status.test.ts
import { describe, expect, it } from 'vitest';
import {
	AUTH_ERROR_COPY,
	AUTH_NOTICE_COPY,
	GENERIC_AUTH_ERROR,
	authErrorCodeForGoogleError,
	authErrorMessage,
	authErrorPath,
	authNoticeMessage,
	authNoticePath
} from './auth-status';

const PHISHING_TEXT = 'Your account is locked. Verify at evil.co';

describe('auth status codes', () => {
	it('maps known codes to fixed copy', () => {
		expect(authErrorMessage('state_mismatch')).toBe(AUTH_ERROR_COPY.state_mismatch);
		expect(authNoticeMessage('password_updated')).toBe(AUTH_NOTICE_COPY.password_updated);
	});

	it('shows a generic line for an unknown error and never the URL text', () => {
		expect(authErrorMessage(PHISHING_TEXT)).toBe(GENERIC_AUTH_ERROR);
		expect(authErrorMessage('constructor')).toBe(GENERIC_AUTH_ERROR);
		expect(authErrorMessage('__proto__')).toBe(GENERIC_AUTH_ERROR);
	});

	it('shows nothing for an unknown notice', () => {
		expect(authNoticeMessage(PHISHING_TEXT)).toBeNull();
		expect(authNoticeMessage('toString')).toBeNull();
		expect(authNoticeMessage(null)).toBeNull();
		expect(authErrorMessage('')).toBeNull();
	});

	it('builds code-only URLs', () => {
		expect(authErrorPath('/auth/register', 'policy_unverified')).toBe(
			'/auth/register?error=policy_unverified'
		);
		expect(authNoticePath('/auth/login', 'account_exists')).toBe(
			'/auth/login?notice=account_exists'
		);
	});

	it('maps Google OAuth protocol errors to our codes', () => {
		expect(authErrorCodeForGoogleError('access_denied')).toBe('google_cancelled');
		expect(authErrorCodeForGoogleError('server_error')).toBe('google_unavailable');
		expect(authErrorCodeForGoogleError('temporarily_unavailable')).toBe('google_unavailable');
		expect(authErrorCodeForGoogleError('invalid_scope')).toBe('google_failed');
		expect(authErrorCodeForGoogleError(PHISHING_TEXT)).toBe('google_failed');
	});
});
