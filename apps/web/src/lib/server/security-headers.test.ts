// apps/web/src/lib/server/security-headers.test.ts

import { describe, expect, it } from 'vitest';
import { applyBaselineSecurityHeaders } from './security-headers';

const BASELINE = {
	'X-Frame-Options': 'DENY',
	'Referrer-Policy': 'strict-origin-when-cross-origin'
};

describe('applyBaselineSecurityHeaders', () => {
	it('preserves an explicitly stricter no-referrer policy', () => {
		const response = new Response(null, { headers: { 'Referrer-Policy': 'no-referrer' } });

		applyBaselineSecurityHeaders(response, BASELINE);

		expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
	});

	it('replaces weaker route policies and still enforces non-referrer security headers', () => {
		const response = new Response(null, {
			headers: { 'Referrer-Policy': 'unsafe-url', 'X-Frame-Options': 'SAMEORIGIN' }
		});

		applyBaselineSecurityHeaders(response, BASELINE);

		expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
	});
});
