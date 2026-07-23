// apps/web/src/lib/server/safe-redirect.test.ts
import { describe, expect, it } from 'vitest';
import { getSafeLocalRedirect } from './safe-redirect';

describe('getSafeLocalRedirect', () => {
	const origin = 'https://build-os.com';
	const fallback = '/auth/login';

	it('keeps local paths and normalizes same-origin absolute URLs', () => {
		expect(getSafeLocalRedirect('/today?from=logout#top', origin, fallback)).toBe(
			'/today?from=logout#top'
		);
		expect(getSafeLocalRedirect('https://build-os.com/projects/123', origin, fallback)).toBe(
			'/projects/123'
		);
	});

	it('rejects external, scheme-relative, and backslash redirects', () => {
		for (const candidate of [
			'https://attacker.example/phish',
			'//attacker.example/phish',
			'\\\\attacker.example\\phish'
		]) {
			expect(getSafeLocalRedirect(candidate, origin, fallback)).toBe(fallback);
		}
	});
});
