// apps/web/src/lib/utils/logging-helpers.test.ts
import { describe, expect, it } from 'vitest';
import { sanitizeLogData, sanitizeLogText } from './logging-helpers';

describe('logging helpers', () => {
	it('redacts structured credential fields, including naming variants', () => {
		const sanitized = sanitizeLogData({
			authorization: 'Bearer top-secret',
			access_token: 'access-secret',
			refreshToken: 'refresh-secret',
			prompt_tokens: 42,
			nested: { client_secret: 'client-secret' }
		}) as Record<string, unknown>;

		expect(sanitized.authorization).toBe('[redacted]');
		expect(sanitized.access_token).toBe('[redacted]');
		expect(sanitized.refreshToken).toBe('[redacted]');
		expect(sanitized.prompt_tokens).toBe(42);
		expect(sanitized.nested).toEqual({ client_secret: '[redacted]' });
	});

	it('redacts credentials embedded in error text and stack traces', () => {
		const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue123';
		const text = sanitizeLogText(
			`Authorization: Bearer bearer-secret access_token=query-secret jwt=${jwt}`,
			1000
		);

		expect(text).not.toContain('bearer-secret');
		expect(text).not.toContain('query-secret');
		expect(text).not.toContain(jwt);
		expect(text).toContain('[redacted]');
	});
});
