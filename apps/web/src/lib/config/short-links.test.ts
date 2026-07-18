// apps/web/src/lib/config/short-links.test.ts
import { describe, expect, it } from 'vitest';
import { SHORT_LINKS, resolveShortLink } from './short-links';

describe('SHORT_LINKS registry', () => {
	it('only contains kebab-case slugs', () => {
		for (const slug of Object.keys(SHORT_LINKS)) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
		}
	});

	it('only contains same-origin relative destinations', () => {
		for (const destination of Object.values(SHORT_LINKS)) {
			expect(destination.startsWith('/')).toBe(true);
			expect(destination.startsWith('//')).toBe(false);
			expect(() => new URL(destination, 'https://build-os.com')).not.toThrow();
		}
	});
});

describe('resolveShortLink', () => {
	it('resolves a known slug to its full destination', () => {
		expect(resolveShortLink('welcome-back')).toBe(
			'/welcome-back?utm_source=founder_email&utm_medium=email&utm_campaign=beta-reactivation-tailored-2026-07'
		);
	});

	it('returns null for unknown slugs', () => {
		expect(resolveShortLink('nope-not-real')).toBeNull();
	});

	it('returns null for malformed slugs', () => {
		expect(resolveShortLink('Welcome-Back')).toBeNull();
		expect(resolveShortLink('a/b')).toBeNull();
		expect(resolveShortLink('..')).toBeNull();
		expect(resolveShortLink('')).toBeNull();
	});

	it('lets incoming params override destination defaults', () => {
		const result = resolveShortLink('welcome-back', new URLSearchParams('utm_source=twitter'));
		expect(result).toContain('utm_source=twitter');
		expect(result).not.toContain('utm_source=founder_email');
		expect(result).toContain('utm_campaign=beta-reactivation-tailored-2026-07');
	});

	it('appends novel incoming params', () => {
		const result = resolveShortLink('start', new URLSearchParams('ref=abc'));
		expect(result).toContain('ref=abc');
		expect(result).toContain('utm_medium=email');
	});

	it('ignores an empty param bag', () => {
		expect(resolveShortLink('start', new URLSearchParams())).toBe(SHORT_LINKS['start']);
	});
});
