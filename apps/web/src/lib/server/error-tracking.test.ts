import { describe, expect, it } from 'vitest';
import {
	getClientIpFromHeaders,
	getRequestIdFromHeaders,
	getUserAgentFromHeaders
} from './error-tracking';

describe('server error tracking header extraction', () => {
	it('extracts stable request and user-agent headers', () => {
		const headers = new Headers({
			'x-vercel-id': 'iad1::abc123',
			'user-agent': 'Mozilla/5.0 test'
		});

		expect(getRequestIdFromHeaders(headers)).toBe('iad1::abc123');
		expect(getUserAgentFromHeaders(headers)).toBe('Mozilla/5.0 test');
	});

	it('normalizes the first forwarded client IP and ignores malformed values', () => {
		expect(
			getClientIpFromHeaders(
				new Headers({
					'x-forwarded-for': '203.0.113.10, 10.0.0.1'
				})
			)
		).toBe('203.0.113.10');

		expect(
			getClientIpFromHeaders(
				new Headers({
					'x-forwarded-for': 'not an ip'
				})
			)
		).toBeUndefined();
	});
});
