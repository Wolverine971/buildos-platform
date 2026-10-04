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

	it('keeps a skill launch whose drafted prompt carries encoded newlines', () => {
		const launch = `/?${new URLSearchParams({
			open: 'agent-chat',
			skill: 'going_viral',
			prompt: 'Use the Going Viral skill.\n\nStarting ask: a\\b'
		})}`;
		const normalized = normalizeRedirectPath(launch);

		expect(normalized).toBe(launch);
		const params = new URL(normalized!, 'https://build-os.com').searchParams;
		expect(params.get('prompt')).toBe('Use the Going Viral skill.\n\nStarting ask: a\\b');
		expect(normalizeRedirectPath('/today#note%0Aline')).toBe('/today#note%0Aline');
	});

	it('still refuses encoded control characters and backslashes in the path', () => {
		expect(normalizeRedirectPath('/%0a/evil.com?prompt=ok')).toBeNull();
		expect(normalizeRedirectPath('/%5Cevil.com?open=agent-chat')).toBeNull();
		expect(normalizeRedirectPath('/?prompt=%zz')).toBeNull();
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
