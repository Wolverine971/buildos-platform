// apps/web/src/lib/server/today-attention.service.test.ts
import { describe, expect, it } from 'vitest';
import { repeatedActionStreaks } from './today-attention.service';

describe('repeatedActionStreaks', () => {
	const briefs = [
		{ brief_date: '2026-11-04', priority_actions: ['Trash to the Curb', 'Send invites'] },
		{ brief_date: '2026-11-03', priority_actions: ['Trash to the Curb', 'Send invites'] },
		{ brief_date: '2026-11-02', priority_actions: ['Trash to the Curb'] },
		// Nov 1 missing: the run ends there.
		{ brief_date: '2026-10-31', priority_actions: ['Trash to the Curb'] }
	];

	it('counts consecutive briefs ending with the newest one', () => {
		const streaks = repeatedActionStreaks(briefs, '2026-11-04');
		expect(streaks.get('Trash to the Curb')).toBe(3);
		expect(streaks.get('Send invites')).toBe(2);
	});

	it("uses yesterday's brief before today's is written", () => {
		expect(repeatedActionStreaks(briefs, '2026-11-05').get('Trash to the Curb')).toBe(3);
	});

	it('returns nothing when the newest brief is older than yesterday', () => {
		expect(repeatedActionStreaks(briefs, '2026-11-08').size).toBe(0);
	});
});
