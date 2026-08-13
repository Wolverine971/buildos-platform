// apps/web/src/lib/components/inbox/inbox-presentation.test.ts
import { describe, expect, it } from 'vitest';
import { formatInboxAttentionSummary } from './inbox-presentation';

describe('formatInboxAttentionSummary', () => {
	it('states the visible and held workload separately', () => {
		expect(formatInboxAttentionSummary({ loaded: 19, total: 19, held: 41 })).toBe(
			'19 items need attention · 41 held for later'
		);
	});

	it('keeps bounded-page context without hiding held items', () => {
		expect(formatInboxAttentionSummary({ loaded: 25, total: 60, held: 12 })).toBe(
			'Showing 25 of 60 needing attention · 12 held for later'
		);
	});

	it('uses singular grammar and omits an empty held queue', () => {
		expect(formatInboxAttentionSummary({ loaded: 1, total: 1, held: 0 })).toBe(
			'1 item needs attention'
		);
	});

	it('still discloses held work when no item is currently admitted', () => {
		expect(formatInboxAttentionSummary({ loaded: 0, total: 0, held: 3 })).toBe(
			'No items need attention · 3 held for later'
		);
	});
});
