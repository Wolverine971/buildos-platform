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

	it('redacts content keys (email, calendar, documents, voice, search)', () => {
		const sanitized = sanitizeLogData({
			subject: 'Maya updated Acme rebrand',
			title: 'Acme rebrand',
			name: 'Launch plan',
			text: 'call the lawyer',
			body: 'draft body',
			snippet: 'inbox snippet',
			query: 'divorce lawyer',
			description: 'event description',
			summary: 'Therapy with Dr. Lee',
			transcript: 'voice note words',
			instruction: 'rewrite this paragraph',
			input: 'tool input',
			output: 'tool output',
			response: { text: 'provider body' },
			details: 'Failing row contains (Acme rebrand)',
			taskCount: 3,
			status: 'failed'
		}) as Record<string, unknown>;

		expect(sanitized).toMatchObject({ taskCount: 3, status: 'failed' });
		for (const key of Object.keys(sanitized).filter(
			(k) => !['taskCount', 'status'].includes(k)
		)) {
			expect(sanitized[key], key).toBe('[redacted]');
		}
	});

	it('keeps bare UUIDs and ISO dates intact instead of phone-redacting their digits', () => {
		const sanitized = sanitizeLogData({
			jobId: '123e4567-e89b-12d3-a456-426614174000',
			briefDate: '2026-09-24',
			scheduledFor: '2026-09-24T13:00:00.000Z',
			note: 'call +1 (410) 555-0199'
		}) as Record<string, unknown>;

		expect(sanitized.jobId).toBe('123e4567-e89b-12d3-a456-426614174000');
		expect(sanitized.briefDate).toBe('2026-09-24');
		expect(sanitized.scheduledFor).toBe('2026-09-24T13:00:00.000Z');
		expect(sanitized.note).toBe('call [redacted-phone]');
	});
});
