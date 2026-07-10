// apps/web/src/lib/services/overdue-task-reschedule.service.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverdueTaskRescheduleService } from './overdue-task-reschedule.service';

describe('OverdueTaskRescheduleService batch planning', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('reserves separate slots and carries overflow into the next working day', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-16T08:00:00Z'));

		const planner = new OverdueTaskRescheduleService({} as any);
		vi.spyOn(planner as any, 'loadBatchContext').mockResolvedValue({
			timezone: 'UTC',
			preferences: {
				work_start_time: '09:00',
				work_end_time: '12:00',
				working_days: [1, 2, 3, 4, 5],
				default_task_duration_minutes: 60,
				min_task_duration_minutes: 30,
				max_task_duration_minutes: 240,
				prefer_morning_for_important_tasks: true
			},
			tasks: ['task-1', 'task-2', 'task-3', 'task-4'].map((id, index) => ({
				id,
				project_id: 'project-1',
				title: id,
				priority: index + 1,
				props: { duration_minutes: 60 }
			}))
		});
		vi.spyOn(planner as any, 'loadBusyIntervals').mockResolvedValue({
			intervals: [],
			calendarConnected: true
		});

		const result = await planner.planBatchReschedule({
			userId: 'user-1',
			taskIds: ['task-1', 'task-2', 'task-3', 'task-4'],
			preset: 'today'
		});

		expect(
			result.assignments.map((assignment) => [
				assignment.task_id,
				assignment.start_at,
				assignment.due_at
			])
		).toEqual([
			['task-1', '2026-03-16T09:00:00.000Z', '2026-03-16T10:00:00.000Z'],
			['task-2', '2026-03-16T10:00:00.000Z', '2026-03-16T11:00:00.000Z'],
			['task-3', '2026-03-16T11:00:00.000Z', '2026-03-16T12:00:00.000Z'],
			['task-4', '2026-03-17T09:00:00.000Z', '2026-03-17T10:00:00.000Z']
		]);
		expect(result.overflow_count).toBe(1);
		expect(result.scheduled_day_count).toBe(2);
		expect(result.unscheduled_task_ids).toEqual([]);
		expect(result.note).toContain('placed in later working days');
	});

	it('keeps batch assignments out of existing busy calendar time', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-16T08:00:00Z'));

		const planner = new OverdueTaskRescheduleService({} as any);
		vi.spyOn(planner as any, 'loadBatchContext').mockResolvedValue({
			timezone: 'UTC',
			preferences: {
				work_start_time: '09:00',
				work_end_time: '12:00',
				working_days: [1, 2, 3, 4, 5],
				default_task_duration_minutes: 60,
				min_task_duration_minutes: 30,
				max_task_duration_minutes: 240,
				prefer_morning_for_important_tasks: false
			},
			tasks: ['task-1', 'task-2'].map((id) => ({
				id,
				project_id: 'project-1',
				title: id,
				priority: 3,
				props: { duration_minutes: 60 }
			}))
		});
		vi.spyOn(planner as any, 'loadBusyIntervals').mockResolvedValue({
			intervals: [
				{
					start: new Date('2026-03-16T10:00:00Z'),
					end: new Date('2026-03-16T11:00:00Z')
				}
			],
			calendarConnected: true
		});

		const result = await planner.planBatchReschedule({
			userId: 'user-1',
			taskIds: ['task-1', 'task-2'],
			preset: 'today'
		});

		expect(result.assignments.map((assignment) => assignment.start_at)).toEqual([
			'2026-03-16T09:00:00.000Z',
			'2026-03-16T11:00:00.000Z'
		]);
	});
});
