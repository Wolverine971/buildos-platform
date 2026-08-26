// apps/web/src/lib/server/cycles/cycle-schedule.test.ts
import { describe, expect, it } from 'vitest';
import { calculateNextCycleScheduleAt, materializeCycleTriggers } from './cycle-schedule';

describe('calculateNextCycleScheduleAt', () => {
	it('projects a daily wall-clock schedule in its own timezone', () => {
		expect(
			calculateNextCycleScheduleAt(
				{ type: 'daily', time_of_day: '09:00', timezone: 'America/New_York' },
				new Date('2026-08-25T14:00:00.000Z')
			).toISOString()
		).toBe('2026-08-26T13:00:00.000Z');
	});

	it('selects the next configured weekday without skipping today before its due time', () => {
		expect(
			calculateNextCycleScheduleAt(
				{
					type: 'weekly',
					days_of_week: [2, 4],
					time_of_day: '09:00',
					timezone: 'America/New_York'
				},
				new Date('2026-08-25T12:00:00.000Z')
			).toISOString()
		).toBe('2026-08-25T13:00:00.000Z');
	});

	it('keeps interval schedules anchored instead of drifting from the current time', () => {
		expect(
			calculateNextCycleScheduleAt(
				{ type: 'interval', every_minutes: 30, anchor_at: '2026-08-25T10:05:00.000Z' },
				new Date('2026-08-25T11:06:00.000Z')
			).toISOString()
		).toBe('2026-08-25T11:35:00.000Z');
	});

	it('advances a nonexistent spring-forward wall time by the DST offset', () => {
		expect(
			calculateNextCycleScheduleAt(
				{ type: 'daily', time_of_day: '02:30', timezone: 'America/New_York' },
				new Date('2026-03-08T06:00:00.000Z')
			).toISOString()
		).toBe('2026-03-08T07:30:00.000Z');
	});

	it('emits one earlier-offset occurrence during a repeated fall-back hour', () => {
		expect(
			calculateNextCycleScheduleAt(
				{ type: 'daily', time_of_day: '01:30', timezone: 'America/New_York' },
				new Date('2026-11-01T04:00:00.000Z')
			).toISOString()
		).toBe('2026-11-01T05:30:00.000Z');
	});
});

describe('materializeCycleTriggers', () => {
	it('owns next_run_at and leaves non-time and paused triggers undated', () => {
		const triggers = materializeCycleTriggers(
			[
				{
					type: 'schedule',
					schedule: { type: 'daily', time_of_day: '09:00', timezone: 'UTC' }
				},
				{ type: 'event', event_types: ['project.changed'] },
				{
					type: 'schedule',
					state: 'paused',
					schedule: { type: 'daily', time_of_day: '17:00', timezone: 'UTC' }
				}
			],
			new Date('2026-08-25T08:00:00.000Z')
		);

		expect(triggers.map((trigger) => trigger.next_run_at)).toEqual([
			'2026-08-25T09:00:00.000Z',
			null,
			null
		]);
	});
});
