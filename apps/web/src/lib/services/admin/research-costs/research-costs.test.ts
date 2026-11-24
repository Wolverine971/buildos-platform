// apps/web/src/lib/services/admin/research-costs/research-costs.test.ts
import { describe, expect, it } from 'vitest';
import {
	RESEARCH_LOOKUP_CAP_USD,
	formatResearchUsd,
	researchCostAnswer,
	researchCostDaysFromParam,
	summarizeResearchCosts,
	type ResearchLookupRow
} from './research-costs';

const NOW = new Date('2026-11-23T12:00:00.000Z');

let nextId = 0;
function lookup(overrides: Partial<ResearchLookupRow> = {}): ResearchLookupRow {
	nextId += 1;
	return {
		id: `t${nextId}`,
		userId: 'dj',
		entityName: 'The Cadre',
		entityKind: 'org',
		status: 'done',
		costUsd: 0.007,
		factsAdded: 4,
		at: '2026-11-22T15:00:00.000Z',
		trigger: 'ui',
		split: null,
		...overrides
	};
}

describe('summarizeResearchCosts', () => {
	it('prices a lookup: usual, average, worst, total', () => {
		const summary = summarizeResearchCosts(
			[
				lookup({ costUsd: 0.002 }),
				lookup({ costUsd: 0.004 }),
				lookup({ costUsd: 0.018 }) // over half of the $0.03 limit
			],
			{ days: 30, now: NOW }
		);
		expect(summary.lookups).toBe(3);
		expect(summary.totalUsd).toBeCloseTo(0.024, 6);
		expect(summary.typicalUsd).toBeCloseTo(0.004, 6);
		expect(summary.averageUsd).toBeCloseTo(0.008, 6);
		expect(summary.worstUsd).toBeCloseTo(0.018, 6);
		expect(summary.capUsd).toBe(RESEARCH_LOOKUP_CAP_USD);
		expect(summary.nearCap).toBe(1);
	});

	it('leaves out lookups outside the window and ones that never ran', () => {
		const summary = summarizeResearchCosts(
			[
				lookup(),
				lookup({ at: '2026-11-10T00:00:00.000Z' }), // 13 days ago
				lookup({ status: 'queued', costUsd: 0 }),
				lookup({ status: 'skipped', costUsd: 0 }),
				// Cancelled part-way still cost money.
				lookup({ status: 'cancelled', costUsd: 0.003, factsAdded: 0 })
			],
			{ days: 7, now: NOW }
		);
		expect(summary.lookups).toBe(2);
		expect(summary.totalUsd).toBeCloseTo(0.01, 6);
		expect(summary.foundNothing).toEqual({ lookups: 1, usd: 0.003 });
	});

	it('compares people with companies by what the entry was researched as', () => {
		const summary = summarizeResearchCosts(
			[
				lookup({ entityKind: 'person', costUsd: 0.006, factsAdded: 3 }),
				lookup({ entityKind: 'person', costUsd: 0.002, factsAdded: 0 }),
				lookup({ entityKind: 'org', costUsd: 0.008, factsAdded: 8 }),
				// Filed as a company, researched as the person it really is.
				lookup({
					entityKind: 'org',
					costUsd: 0.007,
					factsAdded: 5,
					split: {
						searchUsd: 0.005,
						modelUsd: 0.002,
						searches: 5,
						rounds: 2,
						kind: 'person'
					}
				}),
				lookup({ entityKind: 'website', costUsd: 0.001, factsAdded: 1 })
			],
			{ days: 30, now: NOW }
		);
		const byKey = Object.fromEntries(summary.groups.map((group) => [group.key, group]));
		expect(byKey.person).toMatchObject({
			label: 'People',
			lookups: 3,
			details: 8,
			foundNothing: 1
		});
		expect(byKey.person!.totalUsd).toBeCloseTo(0.015, 6);
		expect(byKey.person!.usdPerDetail).toBeCloseTo(0.015 / 8, 8);
		expect(byKey.org).toMatchObject({ label: 'Companies', lookups: 1, details: 8 });
		expect(byKey.other).toMatchObject({ lookups: 1 });
	});

	it('splits spend into searches and model calls only for lookups that recorded it', () => {
		const summary = summarizeResearchCosts(
			[
				lookup({ costUsd: 0.003 }), // before recording started
				lookup({
					split: {
						searchUsd: 0.005,
						modelUsd: 0.002,
						searches: 5,
						rounds: 2,
						kind: 'org'
					}
				}),
				lookup({
					costUsd: 0.004,
					split: {
						searchUsd: 0.003,
						modelUsd: 0.001,
						searches: 3,
						rounds: 1,
						kind: 'org'
					}
				})
			],
			{ days: 30, now: NOW }
		);
		expect(summary.split).toMatchObject({
			lookups: 2,
			searchesPerLookup: 4,
			roundsPerLookup: 1.5
		});
		expect(summary.split!.searchUsd).toBeCloseTo(0.008, 6);
		expect(summary.split!.modelUsd).toBeCloseTo(0.003, 6);
		expect(summary.split!.searchShare).toBeCloseTo(0.008 / 0.011, 6);

		expect(summarizeResearchCosts([lookup()], { days: 30, now: NOW }).split).toBeNull();
	});

	it('counts exactly the days it draws: whole UTC days, today included', () => {
		const summary = summarizeResearchCosts(
			[
				lookup({ at: '2026-11-17T00:00:00.000Z' }), // first drawn day
				lookup({ at: '2026-11-16T23:59:59.000Z' }), // the day before it
				lookup({ at: '2026-11-23T11:00:00.000Z' }) // today
			],
			{ days: 7, now: NOW }
		);
		expect(summary.lookups).toBe(2);
		expect(summary.daily.reduce((total, day) => total + day.lookups, 0)).toBe(2);
	});

	it('gives every day of the window a bar, oldest first', () => {
		const summary = summarizeResearchCosts(
			[
				lookup({ at: '2026-11-22T23:59:00.000Z' }),
				lookup({ at: '2026-11-22T00:01:00.000Z' }),
				lookup({ at: '2026-11-20T10:00:00.000Z', costUsd: 0.001 })
			],
			{ days: 7, now: NOW }
		);
		expect(summary.daily.map((day) => day.date)).toEqual([
			'2026-11-17',
			'2026-11-18',
			'2026-11-19',
			'2026-11-20',
			'2026-11-21',
			'2026-11-22',
			'2026-11-23'
		]);
		expect(summary.daily[3]).toMatchObject({ lookups: 1, usd: 0.001 });
		expect(summary.daily[5]!.lookups).toBe(2);
		expect(summary.daily[5]!.usd).toBeCloseTo(0.014, 6);
		expect(summary.daily[6]).toMatchObject({ lookups: 0, usd: 0 });
	});

	it('projects a month from the pace and from what a lookup costs now', () => {
		// 14 lookups in a 7-day window: 60 a month. The 20 newest set the price.
		const rows = Array.from({ length: 14 }, (_, i) =>
			lookup({ at: `2026-11-2${i % 3}T0${i % 9}:00:00.000Z`, costUsd: 0.007 })
		);
		const summary = summarizeResearchCosts(rows, { days: 7, now: NOW });
		expect(summary.pace.overDays).toBe(7);
		expect(summary.pace.lookupsPerMonth).toBeCloseTo(60, 6);
		expect(summary.pace.usdPerMonth).toBeCloseTo(0.42, 6);
		expect(summary.projection[0]).toMatchObject({ lookupsPerMonth: 100 });
		expect(summary.projection[0]!.expectedUsd).toBeCloseTo(0.7, 6);
		expect(summary.projection[1]!.expectedUsd).toBeCloseTo(7, 6);
		expect(summary.projection[1]!.worstCaseUsd).toBeCloseTo(30, 6);
	});

	it('prices "now" from the newest lookups, not the whole window', () => {
		const old = Array.from({ length: 30 }, () =>
			lookup({ at: '2026-11-01T00:00:00.000Z', costUsd: 0.002 })
		);
		const recent = Array.from({ length: 20 }, () =>
			lookup({ at: '2026-11-22T00:00:00.000Z', costUsd: 0.007 })
		);
		const summary = summarizeResearchCosts([...old, ...recent], { days: 30, now: NOW });
		expect(summary.recent).toMatchObject({ lookups: 20 });
		expect(summary.recent.averageUsd).toBeCloseTo(0.007, 6);
		expect(summary.averageUsd).toBeCloseTo(0.004, 6);
	});

	it('counts who ran research and how it was started', () => {
		const summary = summarizeResearchCosts(
			[
				lookup({ userId: 'dj', trigger: 'ui' }),
				lookup({ userId: 'dj', trigger: 'chat' }),
				lookup({ userId: 'sam', trigger: 'chat', costUsd: 0.02 }),
				lookup({ userId: 'sam', trigger: 'something-new', costUsd: 0.001 })
			],
			{ days: 30, now: NOW }
		);
		expect(summary.byUser[0]).toMatchObject({ userId: 'sam', lookups: 2 });
		expect(summary.byTrigger.map((row) => [row.label, row.lookups])).toEqual([
			['Chat', 2],
			['Find more button', 1],
			['Not recorded', 1]
		]);
		expect(summary.costliest[0]).toMatchObject({ userId: 'sam', costUsd: 0.02 });
	});
});

describe('page wording and inputs', () => {
	it('answers in one sentence', () => {
		const empty = summarizeResearchCosts([], { days: 7, now: NOW });
		expect(researchCostAnswer(empty).headline).toBe('No research in the last 7 days.');

		const summary = summarizeResearchCosts([lookup(), lookup()], { days: 30, now: NOW });
		const answer = researchCostAnswer(summary);
		expect(answer.headline).toBe('A lookup costs about $0.007 right now.');
		expect(answer.detail).toBe(
			'2 lookups in the last 30 days cost $0.014 in total. At this pace that is about 2 lookups and $0.014 a month.'
		);
	});

	it('formats fractions of a cent so they are not rounded to nothing', () => {
		expect(formatResearchUsd(0)).toBe('$0');
		expect(formatResearchUsd(0.00229)).toBe('$0.0023');
		expect(formatResearchUsd(0.178)).toBe('$0.178');
		expect(formatResearchUsd(0.007)).toBe('$0.007');
		expect(formatResearchUsd(0.03)).toBe('$0.03');
		expect(formatResearchUsd(0.3)).toBe('$0.30');
		expect(formatResearchUsd(7)).toBe('$7.00');
		expect(formatResearchUsd(300)).toBe('$300.00');
	});

	it('accepts only the offered windows', () => {
		expect(researchCostDaysFromParam('7')).toBe(7);
		expect(researchCostDaysFromParam('90')).toBe(90);
		expect(researchCostDaysFromParam('365')).toBe(30);
		expect(researchCostDaysFromParam(null)).toBe(30);
	});
});
