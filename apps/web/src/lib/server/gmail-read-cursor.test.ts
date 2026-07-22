// apps/web/src/lib/server/gmail-read-cursor.test.ts
import { describe, expect, it } from 'vitest';
import {
	consumeGmailReadCursor,
	GmailReadCursorError,
	issueGmailReadCursor
} from './gmail-read-cursor';

const secret = 'cursor-test-secret-with-at-least-thirty-two-bytes';
const now = new Date('2026-07-22T20:00:00.000Z');
const context = {
	userId: '11111111-1111-4111-8111-111111111111',
	connectionId: '22222222-2222-4222-8222-222222222222',
	query: 'newer_than:7d'
};

describe('Gmail read pagination cursor', () => {
	it('round-trips an encrypted provider cursor for the same user, connection, and query', () => {
		const cursor = issueGmailReadCursor(
			{ ...context, pageToken: 'provider-page-2', page: 1, now },
			{ secret }
		);

		expect(cursor).toMatch(/^enc:gmail-cursor:v1\./);
		expect(cursor).not.toContain('provider-page-2');
		expect(
			consumeGmailReadCursor(
				{ ...context, cursor, now: new Date(now.getTime() + 1_000) },
				{ secret }
			)
		).toEqual({ pageToken: 'provider-page-2', page: 1 });
	});

	it.each([
		['another user', { userId: '33333333-3333-4333-8333-333333333333' }],
		['another connection', { connectionId: '44444444-4444-4444-8444-444444444444' }],
		['another query', { query: 'from:someone@example.com' }]
	])('rejects a cursor bound to %s', (_label, override) => {
		const cursor = issueGmailReadCursor(
			{ ...context, pageToken: 'provider-page-2', page: 1, now },
			{ secret }
		);

		expect(() =>
			consumeGmailReadCursor(
				{ ...context, ...override, cursor, now: new Date(now.getTime() + 1_000) },
				{ secret }
			)
		).toThrow(GmailReadCursorError);
	});

	it('rejects tampered and expired cursors', () => {
		const cursor = issueGmailReadCursor(
			{ ...context, pageToken: 'provider-page-2', page: 1, now },
			{ secret }
		);
		const tampered = `${cursor.slice(0, -1)}${cursor.endsWith('A') ? 'B' : 'A'}`;

		expect(() =>
			consumeGmailReadCursor({ ...context, cursor: tampered, now }, { secret })
		).toThrow(GmailReadCursorError);
		expect(() =>
			consumeGmailReadCursor(
				{ ...context, cursor, now: new Date(now.getTime() + 15 * 60 * 1_000) },
				{ secret }
			)
		).toThrow(GmailReadCursorError);
	});

	it('refuses to issue a cursor beyond the bounded per-account page ceiling', () => {
		expect(() =>
			issueGmailReadCursor(
				{ ...context, pageToken: 'provider-page-11', page: 10, now },
				{ secret }
			)
		).toThrow(GmailReadCursorError);
	});
});
