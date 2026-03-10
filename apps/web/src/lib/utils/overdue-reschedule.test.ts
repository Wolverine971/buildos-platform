// apps/web/src/lib/utils/overdue-reschedule.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildRescheduleWindow,
	debugLocalDateTime,
	isWorkingDay,
	resolveDurationMinutes
} from './overdue-reschedule';

describe('overdue reschedule helpers', () => {
	it('treats working days as JavaScript 0-6 weekdays', () => {
		expect(isWorkingDay(new Date('2026-03-15T10:00:00Z'), [0])).toBe(true);
		expect(isWorkingDay(new Date('2026-03-16T10:00:00Z'), [0])).toBe(false);
	});

	it('pushes next-week scheduling later when the week would start too soon', () => {
		const window = buildRescheduleWindow({
			preset: 'nextWeek',
			now: new Date('2026-03-14T10:00:00Z'),
			timezone: 'UTC',
			workingDays: [1, 2, 3, 4, 5]
		});

		expect(debugLocalDateTime(window.startLocal)).toBe('2026-03-19 10:00');
		expect(debugLocalDateTime(window.endLocal)).toBe('2026-03-22 23:59');
		expect(window.note).toContain('five-day buffer');
	});

	it('rolls non-working future presets onto the next working day', () => {
		const window = buildRescheduleWindow({
			preset: 'tomorrow',
			now: new Date('2026-03-13T10:00:00Z'),
			timezone: 'UTC',
			workingDays: [1, 2, 3, 4, 5]
		});

		expect(debugLocalDateTime(window.startLocal)).toBe('2026-03-16 00:00');
		expect(window.note).toContain('next working day');
	});

	it('clamps task duration to the user preference bounds', () => {
		const duration = resolveDurationMinutes(10, {
			default_task_duration_minutes: 60,
			min_task_duration_minutes: 30,
			max_task_duration_minutes: 120
		});

		expect(duration).toBe(30);
	});
});
