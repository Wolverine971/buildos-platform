// apps/worker/src/lib/active-accounts.test.ts
import { describe, expect, it } from 'vitest';
import { activeAccountsFromSignals, parseSince, type AccountRow } from './active-accounts';

const now = new Date('2026-11-17T12:00:00Z');

describe('parseSince', () => {
	it('reads spans back from now and ISO dates', () => {
		expect(parseSince('3mo', now).toISOString()).toBe('2026-08-17T12:00:00.000Z');
		expect(parseSince('90d', now).toISOString()).toBe('2026-08-19T12:00:00.000Z');
		expect(parseSince('2w', now).toISOString()).toBe('2026-11-03T12:00:00.000Z');
		expect(parseSince('2026-09-01', now).toISOString()).toBe('2026-09-01T00:00:00.000Z');
	});

	it('refuses anything else', () => {
		expect(() => parseSince('3 months', now)).toThrow();
		expect(() => parseSince('', now)).toThrow();
	});
});

describe('activeAccountsFromSignals', () => {
	const since = new Date('2026-10-18T12:00:00Z');
	const account = (id: string, extra: Partial<AccountRow> = {}): AccountRow => ({
		id,
		last_visit: null,
		deletion_status: null,
		access_restricted: false,
		...extra
	});

	it('counts any recent signal and keeps the latest time', () => {
		const active = activeAccountsFromSignals(
			[
				account('visitor', { last_visit: '2026-11-15T00:00:00Z' }),
				account('writer', { last_visit: '2026-01-01T00:00:00Z' }),
				account('gone', { last_visit: '2026-09-01T00:00:00Z' })
			],
			[
				{ userId: 'writer', signal: 'document', at: '2026-11-01T00:00:00Z' },
				{ userId: 'writer', signal: 'chat', at: '2026-11-10T00:00:00Z' },
				{ userId: 'gone', signal: 'task', at: '2026-10-01T00:00:00Z' }
			],
			since
		);
		expect([...active.keys()].sort()).toEqual(['visitor', 'writer']);
		expect(active.get('writer')).toEqual({
			userId: 'writer',
			signals: ['document', 'chat'],
			lastActiveAt: '2026-11-10T00:00:00Z'
		});
	});

	it('never counts accounts pending deletion or restricted, or unknown users', () => {
		const active = activeAccountsFromSignals(
			[
				account('leaving', {
					deletion_status: 'pending',
					last_visit: '2026-11-15T00:00:00Z'
				}),
				account('locked', { access_restricted: true, last_visit: '2026-11-15T00:00:00Z' })
			],
			[{ userId: 'stranger', signal: 'sign_in', at: '2026-11-15T00:00:00Z' }],
			since
		);
		expect(active.size).toBe(0);
	});
});
