// apps/web/src/lib/utils/auth-redirect.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeRedirectPath } from './auth-redirect';

describe('normalizeRedirectPath', () => {
	it('keeps same-origin paths with their query and hash', () => {
		expect(normalizeRedirectPath('/invites/invite-token')).toBe('/invites/invite-token');
		expect(normalizeRedirectPath('/profile?tab=calendar')).toBe('/profile?tab=calendar');
		expect(normalizeRedirectPath('  /today#top ')).toBe('/today#top');
		expect(normalizeRedirectPath('/search?q=a%20b')).toBe('/search?q=a%20b');
	});

	it('returns null for empty input', () => {
		expect(normalizeRedirectPath(null)).toBeNull();
		expect(normalizeRedirectPath(undefined)).toBeNull();
		expect(normalizeRedirectPath('')).toBeNull();
	});

	it.each([
		'https://evil.com',
		'evil.com',
		'javascript:alert(1)',
		'//evil.com',
		'/\\evil.com',
		'/\\/evil.com',
		'\\\\evil.com',
		'/\t/evil.com',
		'/\n/evil.com',
		'/%09/evil.com',
		'/%0a/evil.com',
		'/%5Cevil.com',
		'/%2F/evil.com',
		'/.//evil.com',
		'/./..//evil.com',
		'/path with space',
		'/bad%zzencoding'
	])('rejects %j', (candidate) => {
		expect(normalizeRedirectPath(candidate)).toBeNull();
	});
});
