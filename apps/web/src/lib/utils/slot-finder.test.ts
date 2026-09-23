// apps/web/src/lib/utils/slot-finder.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calculateAvailableSlots } from './slot-finder';

const config = {
	enabled: true,
	bufferTime: 0 as const,
	minDuration: 60,
	maxDuration: 120,
	earliestStart: 9,
	latestEnd: 17
};

describe('calculateAvailableSlots all-day events', () => {
	const originalTz = process.env.TZ;

	beforeAll(() => {
		// West of UTC: an all-day date read as UTC midnight lands on the previous evening.
		process.env.TZ = 'America/New_York';
	});

	afterAll(() => {
		if (originalTz === undefined) delete process.env.TZ;
		else process.env.TZ = originalTz;
	});

	it('blocks the all-day event day itself, not the day before', () => {
		const tuesday = new Date(2026, 8, 22);
		const wednesday = new Date(2026, 8, 23);
		const slots = calculateAvailableSlots(
			[],
			[
				{
					id: 'offsite',
					summary: 'Offsite',
					start: { date: '2026-09-23' },
					end: { date: '2026-09-24' }
				} as any
			],
			config,
			[tuesday, wednesday]
		);

		expect(slots.filter((slot) => slot.dayIndex === 0)).toHaveLength(8);
		expect(slots.filter((slot) => slot.dayIndex === 1)).toHaveLength(0);
	});

	it('blocks every day a multi-day all-day event spans', () => {
		const days = [new Date(2026, 8, 23), new Date(2026, 8, 24), new Date(2026, 8, 25)];
		const slots = calculateAvailableSlots(
			[],
			[
				{
					id: 'conference',
					summary: 'Conference',
					start: { date: '2026-09-23' },
					end: { date: '2026-09-25' }
				} as any
			],
			config,
			days
		);

		expect(slots.filter((slot) => slot.dayIndex === 0)).toHaveLength(0);
		expect(slots.filter((slot) => slot.dayIndex === 1)).toHaveLength(0);
		expect(slots.filter((slot) => slot.dayIndex === 2)).toHaveLength(8);
	});
});
