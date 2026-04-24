// apps/web/src/lib/utils/dashboard-greeting.test.ts

import { describe, expect, it } from 'vitest';
import {
	getDashboardDateContext,
	getDashboardGreeting,
	getDashboardSpecialDays
} from './dashboard-greeting';

describe('dashboard greeting', () => {
	it('detects special days in the supplied timezone', () => {
		const context = getDashboardDateContext(
			new Date('2026-05-05T02:00:00.000Z'),
			'America/New_York'
		);

		expect(context.dateKey).toBe('2026-05-04');
		expect(context.hour).toBe(22);
		expect(context.timeOfDay).toBe('late_night');
		expect(context.specialDays).toContain('Star Wars Day');
	});

	it('classifies the local hour into dashboard time-of-day periods', () => {
		expect(getDashboardDateContext(new Date('2026-04-24T03:00:00.000Z'), 'UTC').timeOfDay).toBe(
			'late_night'
		);
		expect(getDashboardDateContext(new Date('2026-04-24T06:00:00.000Z'), 'UTC').timeOfDay).toBe(
			'early_morning'
		);
		expect(getDashboardDateContext(new Date('2026-04-24T10:00:00.000Z'), 'UTC').timeOfDay).toBe(
			'morning'
		);
		expect(getDashboardDateContext(new Date('2026-04-24T12:00:00.000Z'), 'UTC').timeOfDay).toBe(
			'midday'
		);
		expect(getDashboardDateContext(new Date('2026-04-24T15:00:00.000Z'), 'UTC').timeOfDay).toBe(
			'afternoon'
		);
		expect(getDashboardDateContext(new Date('2026-04-24T19:00:00.000Z'), 'UTC').timeOfDay).toBe(
			'evening'
		);
		expect(getDashboardDateContext(new Date('2026-04-24T23:00:00.000Z'), 'UTC').timeOfDay).toBe(
			'late_night'
		);
	});

	it('includes movable daily-brief holidays', () => {
		const specialDays = getDashboardSpecialDays(new Date('2026-11-26T12:00:00.000Z'), 'UTC');

		expect(specialDays).toContain('Thanksgiving');
	});

	it('uses holiday-specific copy when a known holiday is active', () => {
		const greeting = getDashboardGreeting({
			displayName: 'Alex',
			date: new Date('2026-05-04T12:00:00.000Z'),
			timezone: 'UTC',
			seed: 'user-123'
		});

		expect(greeting).toContain('Alex');
		expect(greeting).toMatch(/May the 4th|Star Wars Day/);
	});

	it('lets time of day influence the greeting on the same calendar date', () => {
		const morning = getDashboardGreeting({
			displayName: 'Alex',
			date: new Date('2026-04-28T10:00:00.000Z'),
			timezone: 'UTC',
			seed: 'user-123'
		});
		const evening = getDashboardGreeting({
			displayName: 'Alex',
			date: new Date('2026-04-28T19:00:00.000Z'),
			timezone: 'UTC',
			seed: 'user-123'
		});

		expect(morning).not.toBe(evening);
	});

	it('includes user-focused product humor in the rotating bank', () => {
		const greetings = Array.from({ length: 40 }, (_, index) =>
			getDashboardGreeting({
				displayName: 'Alex',
				date: new Date('2026-04-28T15:00:00.000Z'),
				timezone: 'UTC',
				seed: `user-${index}`
			})
		);

		expect(
			greetings.some((greeting) =>
				/brain dump|brain-dump|Project Lens|ontology|project graph|daily brief|context graph/.test(
					greeting
				)
			)
		).toBe(true);
		expect(greetings.join('\n')).not.toMatch(
			/BuildOS (found|swept|recommends|agrees|dimmed|lowered|turned|brought)/
		);
	});

	it('is deterministic for the same user and date but changes across days', () => {
		const first = getDashboardGreeting({
			displayName: 'Alex',
			date: new Date('2026-04-24T12:00:00.000Z'),
			timezone: 'UTC',
			seed: 'user-123'
		});
		const repeat = getDashboardGreeting({
			displayName: 'Alex',
			date: new Date('2026-04-24T12:00:00.000Z'),
			timezone: 'UTC',
			seed: 'user-123'
		});
		const nextDay = getDashboardGreeting({
			displayName: 'Alex',
			date: new Date('2026-04-25T12:00:00.000Z'),
			timezone: 'UTC',
			seed: 'user-123'
		});

		expect(first).toBe(repeat);
		expect(nextDay).not.toBe(first);
		expect(first).not.toBe('Hi, Alex');
	});

	it('falls back safely when timezone data is missing or invalid', () => {
		expect(() =>
			getDashboardGreeting({
				displayName: '',
				date: new Date('2026-04-24T12:00:00.000Z'),
				timezone: 'Nope/Not_A_Timezone'
			})
		).not.toThrow();
	});
});
