// apps/web/src/lib/utils/overdue-reschedule.test.ts
import { describe, expect, it } from 'vitest';
import {
	assignNonOverlappingBatchSlots,
	buildRescheduleWindow,
	debugLocalDateTime,
	isImportantTaskPriority,
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

	it('uses the BuildOS priority scale when identifying important tasks', () => {
		expect(isImportantTaskPriority(1)).toBe(true);
		expect(isImportantTaskPriority(2)).toBe(true);
		expect(isImportantTaskPriority(3)).toBe(false);
		expect(isImportantTaskPriority(5)).toBe(false);
		expect(isImportantTaskPriority(0)).toBe(false);
		expect(isImportantTaskPriority(null)).toBe(false);
	});

	it('assigns a distinct non-overlapping slot to every batch task', () => {
		const slot = (start: string, end: string) => ({
			start: new Date(start),
			end: new Date(end)
		});
		const sharedCandidates = [
			slot('2026-03-16T09:00:00Z', '2026-03-16T10:00:00Z'),
			slot('2026-03-16T09:30:00Z', '2026-03-16T10:30:00Z'),
			slot('2026-03-16T10:00:00Z', '2026-03-16T11:00:00Z'),
			slot('2026-03-16T11:00:00Z', '2026-03-16T12:00:00Z')
		];

		const result = assignNonOverlappingBatchSlots([
			{ taskId: 'task-1', candidateSlots: sharedCandidates },
			{ taskId: 'task-2', candidateSlots: sharedCandidates },
			{ taskId: 'task-3', candidateSlots: sharedCandidates }
		]);

		expect(result.unscheduledTaskIds).toEqual([]);
		expect(
			result.assignments.map((assignment) => [
				assignment.taskId,
				assignment.start.toISOString(),
				assignment.end.toISOString()
			])
		).toEqual([
			['task-1', '2026-03-16T09:00:00.000Z', '2026-03-16T10:00:00.000Z'],
			['task-2', '2026-03-16T10:00:00.000Z', '2026-03-16T11:00:00.000Z'],
			['task-3', '2026-03-16T11:00:00.000Z', '2026-03-16T12:00:00.000Z']
		]);
	});

	it('leaves overflow tasks unscheduled instead of stacking them into one slot', () => {
		const onlySlot = {
			start: new Date('2026-03-16T09:00:00Z'),
			end: new Date('2026-03-16T10:00:00Z')
		};

		const result = assignNonOverlappingBatchSlots([
			{ taskId: 'task-1', candidateSlots: [onlySlot] },
			{ taskId: 'task-2', candidateSlots: [onlySlot] }
		]);

		expect(result.assignments).toHaveLength(1);
		expect(result.unscheduledTaskIds).toEqual(['task-2']);
	});
});
